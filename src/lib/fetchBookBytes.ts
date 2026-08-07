"use client";

// Shared helper for fetching a book's raw bytes in the browser.
//
// Direct-to-R2 read path: the app server only signs a short-lived (120s)
// presigned GET URL via /api/book/:id; the BROWSER then fetches the object
// directly from R2 (bypassing the app server, whose egress to R2 is blocked).
//
// Why retry/re-sign: a 120s URL can expire if the first fetch is slow — very
// common for large EPUB/PDF textbooks (tens of MB) on slow connections, or when
// the browser stalls before the initial connection lands. The S3 presigned GET
// then returns 403 SignatureDoesNotMatch (R2 calls it "AccessDenied" for an
// expired URL) rather than the object. We detect a non-2xx from R2 (or a thrown
// fetch) and re-request a *fresh* URL once, then retry.
//
// It also distinguishes two failure classes so the UI can show something useful:
//   - "auth"    -> the app signed URL is unreachable / storage denies access
//   - "network" -> transient browser/R2 connectivity failure
// Either way we retry once before giving up.

interface BookBytes {
  blob: Blob;
  fileName: string;
  format: string;
}

export async function fetchBookBytes(bookId: number): Promise<BookBytes> {
  const MAX_ATTEMPTS = 2;

  let lastErr: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const metaRes = await fetch(`/api/book/${bookId}`, { cache: "no-store" });
      if (!metaRes.ok) {
        throw new Error(`book meta HTTP ${metaRes.status}`);
      }
      const meta = await metaRes.json();
      if (!meta?.url) throw new Error("book meta missing url");

      let r2Res: Response;
      try {
        r2Res = await fetch(meta.url, { cache: "no-store" });
      } catch (netErr) {
        // Browser couldn't even complete the request (e.g. net::ERR_FAILED).
        // Re-sign once on a fresh URL before reporting a network failure.
        lastErr = new Error("network");
        if (attempt < MAX_ATTEMPTS) continue;
        throw new Error(
          "Could not reach the storage (network error). Check your connection and try again."
        );
      }

      if (!r2Res.ok) {
        // Forbidden/Signature expired -> the presigned URL is stale or the
        // storage denies access. Re-sign once and retry. Distinguish the
        // storage-denial case for the error message.
        lastErr = new Error(`storage HTTP ${r2Res.status}`);
        if (attempt < MAX_ATTEMPTS) continue;
        if (r2Res.status === 403) {
          throw new Error(
            "Storage access denied (403). The storage token/CORS may be misconfigured — please contact the administrator."
          );
        }
        throw new Error(`Storage returned HTTP ${r2Res.status}.`);
      }

      const blob = await r2Res.blob();
      return {
        blob,
        fileName: meta.fileName || "book",
        format: meta.format || "",
      };
    } catch (e) {
      lastErr = e as Error;
      // Re-sign and retry on a fresh URL unless it was a definitive client error.
      if (
        (e as Error).message.includes("book meta") &&
        !(e as Error).message.includes("HTTP 4")
      ) {
        // The meta endpoint itself failed non-HTTP; no point re-signing.
        throw e;
      }
      if (attempt < MAX_ATTEMPTS) continue;
      throw e;
    }
  }

  throw lastErr || new Error("Failed to fetch the book.");
}
