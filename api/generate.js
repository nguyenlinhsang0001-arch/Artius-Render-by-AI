// =============================================================
// api/generate.js — proxy Anthropic + đếm prompt theo tài khoản.
// Zero-import (global Node 18+). Verify token -> lấy username -> sau khi
// Anthropic trả 2xx thì INCR usage:<user>:prompts trên Upstash Redis.
// =============================================================

function _b64urlToStr(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}
async function _hmacB64url(data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(process.env.AUTH_SECRET || ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  let bin = ""; for (const b of new Uint8Array(sig)) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
// Trả PAYLOAD {sub, adm, exp} nếu token hợp lệ, ngược lại null.
async function verifyAuth(req) {
  if (!process.env.AUTH_SECRET) return null;
  const h = (req.headers && (req.headers["authorization"] || req.headers["Authorization"])) || "";
  const m = /^Bearer\s+(.+)$/i.exec(String(h));
  const token = m ? m[1].trim() : "";
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sigB64] = parts;
  const expected = await _hmacB64url(payloadB64);
  if (sigB64.length !== expected.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= sigB64.charCodeAt(i) ^ expected.charCodeAt(i);
  if (diff !== 0) return null;
  try {
    const j = JSON.parse(_b64urlToStr(payloadB64));
    if (typeof j.exp !== "number" || Math.floor(Date.now() / 1000) >= j.exp) return null;
    return j;
  } catch { return null; }
}
// INCR 1 key trên Upstash (im lặng nếu chưa cấu hình / lỗi).
async function redisIncr(key) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  await fetch(url.replace(/\/+$/, ""), {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(["INCR", key]),
  });
}

export default async function handler(req, res) {
  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: { message: "Unauthorized" } });

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Chỉ chấp nhận POST" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({
      error:
        "Thiếu ANTHROPIC_API_KEY. Thêm biến này trong Vercel > Settings > " +
        "Environment Variables rồi redeploy.",
    });
  }

  try {
    const payload =
      typeof req.body === "string" ? req.body : JSON.stringify(req.body);

    const upstream = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: payload,
    });

    const data = await upstream.json();

    // Chỉ đếm khi Anthropic trả thành công. Không để lỗi Redis làm hỏng response.
    if (upstream.ok) {
      try { await redisIncr(`usage:${auth.sub}:prompts`); } catch { /* ignore */ }
    }

    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(502).json({
      error: "Proxy lỗi khi gọi Anthropic API.",
      detail: String(err && err.message ? err.message : err),
    });
  }
}
