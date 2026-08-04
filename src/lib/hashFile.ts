"use client";

// Compute SHA-256 of a File using SubtleCrypto, reading in 8MB chunks to avoid
// holding the whole file in memory at once. The digest accepts an array of
// BufferSources, so we feed the chunks directly — no full concatenation.
export async function hashFile(file: File): Promise<string> {
  const CHUNK = 8 * 1024 * 1024;
  const chunks: ArrayBuffer[] = [];
  for (let offset = 0; offset < file.size; offset += CHUNK) {
    const slice = file.slice(offset, offset + CHUNK);
    chunks.push(await slice.arrayBuffer());
  }
  const digest = await crypto.subtle.digest("SHA-256", chunks as unknown as BufferSource);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
