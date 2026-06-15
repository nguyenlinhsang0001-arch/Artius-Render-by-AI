// =============================================================
// api/generate-image.js — proxy gpt-image + đếm ảnh theo tài khoản.
// Zero-import (global Node 18+). Verify token -> lấy username -> khi tạo
// ảnh thành công thì INCR usage:<user>:images trên Upstash Redis.
//
// mode "edit" (mặc định): /v1/images/edits (gửi MODEL[+STYLE] làm pixel base).
// mode "generate"/không ảnh: /v1/images/generations (text-to-image).
// Chống 504: quality mặc định "medium"; AbortController cắt trước maxDuration.
// Yêu cầu: OPENAI_API_KEY; OpenAI Org Verification; Fluid Compute (maxDuration).
// =============================================================

export const config = {
  // Hobby: tối đa 60. Pro: có thể nâng 300. Cần Fluid Compute mới hiệu lực.
  maxDuration: 240,
};

const OPENAI_BASE = "https://api.openai.com/v1";
const ABORT_MS = 230_000;

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
async function redisIncrMany(keys) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !keys.length) return;
  await fetch(url.replace(/\/+$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(keys.map((k) => ["INCR", k])),
  });
}

export default async function handler(req, res) {
  const auth = await verifyAuth(req);
  if (!auth) {
    res.status(401).json({ error: { message: "Unauthorized" } });
    return;
  }

  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Thiếu OPENAI_API_KEY trên Vercel." });
    return;
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  if (!body || typeof body !== "object") body = {};

  const {
    model = "gpt-image-2",
    prompt,
    size = "auto",
    mode = "edit",
    quality = "medium",
    images = [],
  } = body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Thiếu 'prompt'." });
    return;
  }

  const useGenerate = mode === "generate" || !Array.isArray(images) || images.length === 0;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ABORT_MS);

  try {
    let openaiRes;

    if (useGenerate) {
      openaiRes = await fetch(`${OPENAI_BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
        signal: controller.signal,
      });
    } else {
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      form.append("n", "1");

      images.forEach((img, i) => {
        const b64 = (img && img.data) || "";
        if (!b64) return;
        const buf = Buffer.from(b64, "base64");
        const type = (img && img.mediaType) || "image/png";
        const ext = type.split("/")[1] || "png";
        const blob = new Blob([buf], { type });
        form.append("image[]", blob, `image_${i}.${ext}`);
      });

      openaiRes = await fetch(`${OPENAI_BASE}/images/edits`, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: controller.signal,
      });
    }

    const raw = await openaiRes.text();
    if (!openaiRes.ok) {
      res.status(openaiRes.status).send(raw);
      return;
    }

    let data = null;
    try { data = JSON.parse(raw); } catch {
      res.status(502).json({ error: "OpenAI trả về phản hồi không phải JSON." });
      return;
    }

    const b64 = data?.data?.[0]?.b64_json || null;
    if (!b64) {
      res.status(502).json({ error: "OpenAI không trả về ảnh (b64_json).", detail: data });
      return;
    }

    // Tạo ảnh thành công -> +1 cho user VÀ +1 cho tổng (__all__).
    try { await redisIncrMany([`usage:${auth.sub}:images`, "usage:__all__:images"]); } catch { /* ignore */ }

    res.status(200).json({ b64 });
  } catch (err) {
    if (err && err.name === "AbortError") {
      res.status(504).json({
        error: "Tạo ảnh quá lâu (đã hủy trước trần thời gian). Hạ 'quality' xuống 'low', giảm 'size', hoặc nâng maxDuration (cần Fluid Compute / plan Pro).",
      });
      return;
    }
    res.status(500).json({ error: "Lỗi gọi OpenAI image API.", detail: String((err && err.message) || err) });
  } finally {
    clearTimeout(timer);
  }
}
