import crypto from "crypto";

export function hashBuffer(buffer: Buffer | Uint8Array): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
