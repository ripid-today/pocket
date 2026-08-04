"use client";

import { useState, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { hashFile } from "@/lib/hashFile";

type Status = "idle" | "hashing" | "uploading" | "finalizing" | "success" | "error";

export default function ImportDialog({ onClose }: { onClose: () => void }) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [progress, setProgress] = useState(0); // 0..100 for upload

  const handleFile = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (!file) return;
      setFileName(file.name);
      setError(null);

      try {
        // 1. Hash client-side for dedup.
        setStatus("hashing");
        const contentHash = await hashFile(file);

        // 2. Request a presigned PUT URL.
        setStatus("uploading");
        setProgress(0);
        const urlRes = await fetch("/api/upload-url", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: file.name,
            fileSize: file.size,
            contentHash,
          }),
        });
        const urlData = await urlRes.json();
        if (!urlRes.ok) {
          throw new Error(urlData.error || "Could not start upload.");
        }

        // 3. PUT the file directly to R2 with upload progress (XHR for progress).
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.upload.onprogress = (ev) => {
            if (ev.lengthComputable) {
              setProgress(Math.round((ev.loaded / ev.total) * 100));
            }
          };
          xhr.onload = () =>
            xhr.status >= 200 && xhr.status < 300
              ? resolve()
              : reject(new Error(xhr.status === 403 ? "Upload URL expired. Try again." : "Upload failed."));
          xhr.onerror = () => reject(new Error("Network error during upload."));
          xhr.open("PUT", urlData.presignedUrl);
          xhr.setRequestHeader("Content-Type", file.type || (urlData.format === "epub" ? "application/epub+zip" : "application/pdf"));
          xhr.send(file);
        });

        // 4. Finalize: probe metadata + insert book row.
        setStatus("finalizing");
        const impRes = await fetch("/api/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            r2Key: urlData.r2Key,
            contentHash,
            fileName: file.name,
            format: urlData.format,
          }),
        });
        const impData = await impRes.json();
        if (!impRes.ok) {
          throw new Error(impData.error || "Could not finalize import.");
        }

        setStatus("success");
        setTimeout(() => {
          router.refresh();
          onClose();
        }, 900);
      } catch (err) {
        setStatus("error");
        setError(err instanceof Error ? err.message : "Import failed.");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [router, onClose]
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <div className="bg-neutral-900 border border-white/10 rounded-2xl shadow-lg p-6 w-full max-w-sm">
        <input
          ref={fileInputRef}
          type="file"
          accept=".epub,.pdf"
          onChange={handleFile}
          className="hidden"
          id="import-file-input"
        />

        {status === "idle" && (
          <div className="text-center">
            <p className="text-white font-medium mb-1">Import a book</p>
            <p className="text-sm text-white/50 mb-4">EPUB or PDF, up to 1 GB</p>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="w-full px-4 py-3 bg-white text-black rounded-lg font-medium hover:bg-white/90 min-h-[44px]"
            >
              Choose file
            </button>
            <button
              onClick={onClose}
              className="mt-3 text-sm text-white/50 hover:text-white"
            >
              Cancel
            </button>
          </div>
        )}

        {(status === "hashing" || status === "uploading" || status === "finalizing") && (
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <p className="text-sm text-white">
              {status === "hashing" && "Reading file…"}
              {status === "uploading" && "Uploading…"}
              {status === "finalizing" && "Processing…"}
            </p>
            <p className="text-xs text-white/40 mt-1 truncate">{fileName}</p>
            {status === "uploading" && (
              <div className="mt-4 h-2 w-full rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full bg-white transition-all duration-150"
                  style={{ width: `${progress}%` }}
                />
              </div>
            )}
          </div>
        )}

        {status === "success" && (
          <div className="text-center">
            <div className="w-10 h-10 mx-auto mb-3 rounded-full bg-green-500/20 flex items-center justify-center">
              <svg className="w-5 h-5 text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </div>
            <p className="text-sm text-white">Book imported.</p>
          </div>
        )}

        {status === "error" && (
          <div className="text-center">
            <p className="text-sm text-red-400 mb-2">Import failed</p>
            <p className="text-xs text-white/60 mb-4">{error}</p>
            <div className="flex gap-2 justify-center">
              <button
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-2 bg-white text-black rounded-lg text-sm font-medium hover:bg-white/90 min-h-[44px]"
              >
                Try again
              </button>
              <button
                onClick={() => {
                  setStatus("idle");
                  setError(null);
                }}
                className="px-4 py-2 text-white/60 hover:text-white text-sm min-h-[44px]"
              >
                Dismiss
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
