// lib/auth.js
// ─────────────────────────────────────────────────────────────────────────
// Helper xác thực token, DÙNG CHUNG cho login.js / generate.js / generate-image.js.
//
// ⚠️ ĐỂ Ở /lib (NGOÀI thư mục /api). Với project Vite, Vercel coi MỌI file trong
//    /api là một serverless function — nếu để helper ở /api nó sẽ cố build file
//    này thành function và lỗi ("Unhandled type"). Helper phải nằm ngoài /api;
//    Vercel vẫn tự bundle nó khi các function import vào.
//
// Cơ chế token (giống JWT tối giản, không cần thư viện ngoài):
//   token = base64url(payloadJSON) + "." + base64url( HMAC_SHA256(payloadJSON, AUTH_SECRET) )
//   payload = { iat, exp }   // exp: epoch GIÂY
//
// ENV cần có trên Vercel:
//   AUTH_SECRET  - chuỗi bí mật ngẫu nhiên (vd: `openssl rand -hex 32`)
// ─────────────────────────────────────────────────────────────────────────

import crypto from "crypto";

const SECRET = process.env.AUTH_SECRET || "";

function b64url(buf) {
  return Buffer.from(buf)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

function b64urlToBuf(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return Buffer.from(s, "base64");
}

// Tạo token mới, sống `days` ngày.
export function signToken(days = 7) {
  if (!SECRET) throw new Error("AUTH_SECRET chưa được cấu hình");
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = b64url(JSON.stringify({ iat: now, exp: now + days * 86400 }));
  const sig = crypto.createHmac("sha256", SECRET).update(payloadB64).digest();
  return payloadB64 + "." + b64url(sig);
}

// Trả true nếu token hợp lệ: chữ ký đúng VÀ chưa hết hạn.
export function verifyToken(token) {
  if (!SECRET || !token) return false;
  const parts = String(token).split(".");
  if (parts.length !== 2) return false;
  const [payloadB64, sigB64] = parts;

  // So chữ ký kiểu timing-safe (chống side-channel qua thời gian so sánh).
  const expected = crypto.createHmac("sha256", SECRET).update(payloadB64).digest();
  const got = b64urlToBuf(sigB64);
  if (got.length !== expected.length) return false;
  if (!crypto.timingSafeEqual(got, expected)) return false;

  try {
    const payload = JSON.parse(b64urlToBuf(payloadB64).toString("utf8"));
    if (typeof payload.exp !== "number") return false;
    return Math.floor(Date.now() / 1000) < payload.exp;
  } catch {
    return false;
  }
}

// Bóc token từ header "Authorization: Bearer <token>".
export function tokenFromReq(req) {
  const h = req.headers["authorization"] || req.headers["Authorization"] || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  return m ? m[1].trim() : "";
}

// Gác cổng tiện dụng: hợp lệ -> trả true; không -> tự gửi 401 và trả false.
// Dùng ở đầu handler:   if (!requireAuth(req, res)) return;
export function requireAuth(req, res) {
  if (verifyToken(tokenFromReq(req))) return true;
  res.status(401).json({ error: { message: "Unauthorized" } });
  return false;
}
