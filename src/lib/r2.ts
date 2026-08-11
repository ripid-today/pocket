import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Cloudflare R2 is fully S3-compatible. The bucket stays PRIVATE. Books are
// uploaded browser->R2 via presigned PUT and read browser<-R2 via short-lived
// presigned GET; the app server never proxies object bytes (Railway's egress
// to r2.cloudflarestorage.com is blocked).
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
    // Railway's first connection to R2 can be slow (cold TCP handshake / proxy
    // egress). The SDK's default requestTimeout can throw TimeoutError on a
    // short-lived connection, which we were treating as "not found". Use
    // generous explicit timeouts so a slow-but-successful R2 call completes.
    requestHandler: {
      requestTimeout: 30_000,
      connectionTimeout: 20_000,
    } as never,
    // Don't auto-add a zero CRC32 checksum to presigned PUT/GET URLs. The SDK's
    // default requestChecksumCalculation="WHEN_SUPPORTED" bakes a bogus
    // `x-amz-checksum-crc32=AAAAAA==` (and x-amz-sdk-checksum-algorithm=CRC32)
    // into signed URLs because there is no payload at signing time. Harmless but
    // confusing; WHEN_REQUIRED omits it (R2 accepts unsigned checksums).
    requestChecksumCalculation: "WHEN_REQUIRED",
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
// server body limit). Content-Type is intentionally NOT pinned in the signed
// request: R2's signature check only covers the fields it was signed with, and
// a browser may send a different/low-level Content-Type for an .epub than the
// server requested, causing a 403 SignatureDoesNotMatch. Omit it so any
// Content-Type (or none) is accepted; the object picks up its type from
// headObject at finalize time.
export async function presignPut(
  key: string,
  contentType: string,
  expiresIn = 600
): Promise<string> {
  void contentType; // intentionally not part of the signature (see above)
  const cmd = new PutObjectCommand({
    Bucket: bucket(),
    Key: key,
  });
  return getSignedUrl(client(), cmd, { expiresIn });
}

// Presigned GET URL so the browser can fetch a book's bytes DIRECTLY from R2,
// bypassing the app server. Railway's egress to r2.cloudflarestorage.com is
// blocked/failing, so the server cannot proxy book bytes. GET URLs are issued
// short-lived (default 120s) so a leaked URL is useless almost immediately;
// the bucket itself stays private.
export async function presignGet(key: string, expiresIn = 120): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket(), Key: key });
  return getSignedUrl(client(), cmd, { expiresIn });
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

