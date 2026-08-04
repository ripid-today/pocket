// Drive the full import flow against the live site with an authenticated
// session, exactly like the browser does: request OTP -> verify -> session
// cookie -> upload-url -> presign -> PUT to R2 -> import.
import { readFileSync } from "fs";
import { createOtp } from "../src/lib/db/otp";
import { hashBuffer } from "../src/lib/hash";

async function main() {
  const email = "ripid.today@gmail.com";
  const base = "https://pocket.ripid.vn";

  // 1. Generate an OTP in the DB and verify it to get a session cookie.
  const code = await createOtp(email);
  const jar: string[] = [];
  const ver = await fetch(base + "/api/otp/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, code }),
  });
  const setCookies = ver.headers.getSetCookie();
  setCookies.forEach((c) => jar.push(c.split(";")[0]));
  console.log("verify status:", ver.status, "| cookies:", jar.map((c)=>c.split("=")[0]));
  if (!ver.ok) { console.log(await ver.text()); process.exit(1); }

  const cookie = jar.join("; ");

  // 2. upload-url with the real file's name/size/hash.
  const file =
    "C:/Users/uyenl/Downloads/Wyckoff 2.0 Structures, Volume Profile and Order Flow Combining the Logic of the Wyckoff Methodolgy and the Objectivity of… (Rubén Villahermosa Chaves) (z-library.sk, 1lib.sk, z-lib.sk).epub";
  const fileName = file.split(/[\\/]/).pop()!;
  const content = readFileSync(file);
  const contentHash = hashBuffer(content);
  console.log("\nrequesting upload-url for", fileName.slice(0, 40), "... size", content.length);

  const up = await fetch(base + "/api/upload-url", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ fileName, fileSize: content.length, contentHash }),
  });
  console.log("upload-url status:", up.status);
  const upJ = await up.json();
  if (!up.ok) { console.log("upload-url body:", JSON.stringify(upJ)); process.exit(1); }
  console.log("got presigned URL + r2Key:", upJ.r2Key);

  // 3. PUT to R2 (no Content-Type, like the browser).
  console.log("\nPUT to R2...");
  const put = await fetch(upJ.presignedUrl, { method: "PUT", body: content });
  console.log("PUT status:", put.status);
  if (!put.ok) { console.log(await put.text()); process.exit(1); }

  // 4. finalize import.
  console.log("\nfinalizing import...");
  const imp = await fetch(base + "/api/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", Cookie: cookie },
    body: JSON.stringify({ r2Key: upJ.r2Key, contentHash, fileName, format: upJ.format }),
  });
  console.log("import status:", imp.status);
  const impT = await imp.text();
  console.log("import body:", impT);
}
main().catch((e) => { console.error("✗", e.message); process.exit(1); });
