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
// INCR nhiều key cùng lúc trên Upstash (im lặng nếu chưa cấu hình / lỗi).
async function redisIncrMany(keys) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || !keys.length) return;
  await fetch(url.replace(/\/+$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(keys.map((k) => ["INCR", k])),
  });
}

// ---- IP limit: tối đa 2 IP / account, TTL 12h. Atomic qua Redis EVAL (ZSET).
//      Key ipset:<user>: member=IP, score=last_seen(epoch s). Fail-open nếu Redis
//      chưa cấu hình / lỗi (nhất quán với cách app im lặng khi Redis lỗi).
const IP_TTL = 12 * 3600, IP_LIMIT = 2;
const IP_LUA =
  "local k=KEYS[1] local now=tonumber(ARGV[1]) local ttl=tonumber(ARGV[2]) " +
  "local lim=tonumber(ARGV[3]) local ip=ARGV[4] " +
  "redis.call('ZREMRANGEBYSCORE',k,0,now-ttl) " +
  "if redis.call('ZSCORE',k,ip) then redis.call('ZADD',k,now,ip) redis.call('EXPIRE',k,ttl) return 1 end " +
  "if redis.call('ZCARD',k)>=lim then return 0 end " +
  "redis.call('ZADD',k,now,ip) redis.call('EXPIRE',k,ttl) return 1";
function clientIp(req) {
  return String(req.headers["x-forwarded-for"] || "").split(",")[0].trim()
    || String(req.headers["x-real-ip"] || "") || "unknown";
}
async function checkIpLimit(user, ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return true;                 // chưa cấu hình -> không chặn
  try {
    const now = Math.floor(Date.now() / 1000);
    const r = await fetch(url.replace(/\/+$/, "") + "/", {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(["EVAL", IP_LUA, "1", `ipset:${user}`, String(now), String(IP_TTL), String(IP_LIMIT), ip]),
    });
    const j = await r.json().catch(() => null);
    return !(j && j.result === 0);                 // result===0 -> block; còn lại fail-open
  } catch { return true; }
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

  // Chặn nếu account đã dùng ở >2 IP (giới hạn 2 mạng/thiết bị, TTL 12h).
  if (!(await checkIpLimit(auth.sub, clientIp(req))))
    return res.status(403).json({ error: "IP_LIMIT_EXCEEDED" });

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

    // Chỉ đếm khi Anthropic trả thành công. +1 cho user VÀ +1 cho tổng (__all__).
    if (upstream.ok) {
      try { await redisIncrMany([`usage:${auth.sub}:prompts`, "usage:__all__:prompts"]); } catch { /* ignore */ }
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
