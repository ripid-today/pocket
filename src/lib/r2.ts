import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is fully S3-compatible. The bucket stays PRIVATE — no public
// access. All reads go through authenticated Next.js routes that proxy R2.
const R2_ENDPOINT =
  process.env.R2_ENDPOINT ||
  `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`;

function client(): S3Client {
  if (!process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY) {
    throw new Error("R2 credentials are not configured.");
  }
  return new S3Client({
    region: "auto",
    endpoint: R2_ENDPOINT,
    credentials: {
      accessKeyId: process.env.R2_ACCESS_KEY_ID,
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
  });
}

export function bucket(): string {
  const b = process.env.R2_BUCKET;
  if (!b) throw new Error("R2_BUCKET is not set.");
  return b;
}

// Derive a per-user R2 key. The userId prefix is enforced server-side so one
// user can never reference another user's object (K3). Leading dots and path
// separators are stripped to avoid traversal-like fragments.
export function r2KeyFor(userId: number, fileName: string): string {
  const safe = fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/^\.+/, "")
    .replace(/\.\./g, "_");
  return `u${userId}/${Date.now()}-${safe || "book"}`;
}

// Presigned PUT URL the browser uploads the file to directly (bypasses any
// server body limit). Content-Type is locked so the upload can't mismatch.
export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 600
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}

// Stream a byte range [start, end] (inclusive) from R2. Returns the readable
// body plus the total object size (from Content-Range) so the proxy can set
// response headers.
export async function getObjectRange(
  key: string,
  start: number,
  end: number
): Promise<{ body: ReadableStream<Uint8Array>; total: number; contentLength: number }> {
  const cmd = new GetObjectCommand({
    Bucket: bucket(),
    Key: key,
    Range: `bytes=${start}-${end}`,
  });
  const out = await client().send(cmd);
  const rangeHeader = out.ContentRange || ""; // e.g. "bytes 0-65535/1234567"
  const total = parseInt(rangeHeader.split("/")[1] || "0", 10);
  const contentLength = parseInt(out.ContentLength?.toString() || "0", 10);
  // AWS SDK v3 returns a SdkStream that can be converted to a web ReadableStream.
  const body = (out.Body as unknown as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  return { body, total, contentLength };
}

// Fetch the full object into a Buffer. Used at import-finalize time to probe
// metadata and re-hash for dedup. EPUBs are small; for very large PDFs this
// holds the file in memory briefly during the one-time import probe.
export async function getObjectBuffer(key: string): Promise<Buffer> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  const out = await client().send(cmd);
  const stream = (out.Body as unknown as { transformToWebStream: () => ReadableStream<Uint8Array> }).transformToWebStream();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    total += value.byteLength;
  }
  const merged = new Uint8Array(total);
  let pos = 0;
  for (const c of chunks) {
    merged.set(c, pos);
    pos += c.byteLength;
  }
  return Buffer.from(merged);
}

// Idempotent delete — a missing object is not an error.
export async function deleteObject(key: string): Promise<void> {
  try {
    await client().send(new DeleteObjectCommand({ Bucket: bucket(), Key: key }));
  } catch (err) {
    // Transient failures are logged but not fatal (H6: DB row still deleted).
    console.error("[r2] delete failed for", key, err);
  }
}

// Verify an object exists and return its size + type (used at finalize time).
export async function headObject(
  key: string
): Promise<{ contentLength: number; contentType: string } | null> {
  try {
    const out = await client().send(
      new HeadObjectCommand({ Bucket: bucket(), Key: key })
    );
    return {
      contentLength: parseInt(out.ContentLength?.toString() || "0", 10),
      contentType: out.ContentType || "application/octet-stream",
    };
  } catch {
    return null;
  }
}
