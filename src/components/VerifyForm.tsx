"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function VerifyForm({ email }: { email: string }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/otp/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, code }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || "Invalid code.");
        setLoading(false);
        return;
      }
      router.push("/library");
    } catch {
      setError("Network error. Please try again.");
      setLoading(false);
    }
  }

  return (
    <main className="flex-1 flex items-center justify-center px-4 sm:px-6 py-8 bg-black">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-semibold text-white">Check your email</h1>
          <p className="text-sm text-white/50 mt-1">
            We sent a 6-digit code to{" "}
            <span className="text-white/80">{email}</span>
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="code" className="block text-sm font-medium text-white/70 mb-1.5">
              Code
            </label>
            <input
              id="code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
              className="w-full h-12 rounded-xl bg-white/5 border border-white/15 px-4 text-white text-center text-2xl tracking-[0.6em] placeholder-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 focus:border-white/30 transition-colors"
              placeholder="000000"
            />
          </div>

          {error && (
            <p className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full h-12 rounded-xl bg-white text-black font-semibold hover:bg-white/90 active:bg-white/80 transition-colors disabled:opacity-50 disabled:pointer-events-none"
          >
            {loading ? "Verifying…" : "Verify"}
          </button>
        </form>
      </div>
    </main>
  );
}
