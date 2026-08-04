"use client";

// Compute SHA-256 of a File using SubtleCrypto, reading in chunks to bound
// memory use, then concatenate into a single buffer for the digest.
//
// IMPORTANT: crypto.subtle.digest() expects a single BufferSource, not an
// array of ArrayBuffers — passing an ArrayBuffer[] throws on some browsers
// (notably Android Chrome), which made the hash fail silently and the import
// dialog report an error. Concatenating to one TypedArray is the portable fix.
export async function hashFile(file: File): Promise<string> {
  const CHUNK = 8 * 1024 * 1024;
  const chunkBuffers: ArrayBuffer[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const slice = file.slice(offset, offset + CHUNK);
    chunkBuffers.push(await slice.arrayBuffer());
  }

  // Concatenate into one contiguous Uint8Array (avoids the array-passing bug).
  const total = chunkBuffers.reduce((n, c) => n + c.byteLength, 0);
  const merged = new Uint8Array(total);
  let pos = 0;
  for (const c of chunkBuffers) {
    merged.set(new Uint8Array(c), pos);
    pos += c.byteLength;
  }

  const digest = await crypto.subtle.digest("SHA-256", merged);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
