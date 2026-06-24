// =============================================================
// api/login.js — Đăng nhập theo TỪNG TÀI KHOẢN (username + password).
//   POST { username, password } -> 200 { token } | 401
//
// ENV trên Vercel:
//   APP_USERS   - JSON danh sách user, vd:
//                 [{"u":"sang","p":"matkhau1","admin":true},
//                  {"u":"an","p":"matkhau2"},
//                  {"u":"binh","p":"matkhau3"}]
//                 (admin:true => được xem trang Thống kê)
//   AUTH_SECRET - chuỗi bí mật ký token (openssl rand -hex 32)
//   UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN - ghi log đăng nhập
//
// Zero-import: chỉ dùng global Node 18+ (crypto.subtle, atob/btoa, fetch...).
// Token: base64url(payload).base64url(HMAC). payload = { sub, adm, iat, exp }.
// =============================================================

function _b64urlFromBytes(bytes) {
  let bin = ""; for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
async function _hmacB64url(data) {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(process.env.AUTH_SECRET || ""),
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(data));
  return _b64urlFromBytes(new Uint8Array(sig));
}
async function signToken(sub, adm, days = 7) {
  const now = Math.floor(Date.now() / 1000);
  const payloadB64 = _b64urlFromBytes(
    new TextEncoder().encode(JSON.stringify({ sub, adm: adm ? 1 : 0, iat: now, exp: now + days * 86400 }))
  );
  return payloadB64 + "." + (await _hmacB64url(payloadB64));
}
function parseUsers() {
  try { const a = JSON.parse(process.env.APP_USERS || "[]"); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
// So sánh chuỗi hằng-thời-gian (không lộ qua thời gian phản hồi).
function constEq(a, b) {
  a = String(a); b = String(b);
  let diff = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) diff |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return diff === 0;
}
// Ghi log đăng nhập vào Redis (không chặn request nếu lỗi).
async function recordLogin(username, ip) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token) return;
  const cmds = [
    ["SET", `usage:${username}:last_ip`, ip],
    ["SET", `usage:${username}:last_login`, new Date().toISOString()],
    ["INCR", `usage:${username}:logins`],
  ];
  await fetch(url.replace(/\/+$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
}

// ---- IP limit: tối đa 2 IP / account, TTL 12h. Atomic qua Redis EVAL (ZSET).
//      Key ipset:<user>: member=IP, score=last_seen(epoch s). Fail-open nếu Redis
//      chưa cấu hình / lỗi (nhất quán với cách app im lặng khi Redis lỗi).
const IP_TTL = 24 * 3600, IP_LIMIT = 2;
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
  if (req.method !== "POST") {
    return res.status(405).json({ error: { message: "Method Not Allowed" } });
  }
  if (!process.env.AUTH_SECRET) {
    return res.status(500).json({ error: { message: "Server chưa cấu hình AUTH_SECRET" } });
  }

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const username = body && body.username ? String(body.username).trim() : "";
  const password = body && body.password ? String(body.password) : "";

  const users = parseUsers();
  const found = users.find((x) => x && String(x.u) === username);
  const ok = !!found && constEq(password, found.p);

  if (!ok) {
    return res.status(401).json({ error: { message: "Sai tài khoản hoặc mật khẩu" } });
  }

  // IP người đăng nhập (Vercel set x-forwarded-for).
  const ip =
    String(req.headers["x-forwarded-for"] || "").split(",")[0].trim() ||
    String(req.headers["x-real-ip"] || "") || "unknown";

  // B2: chặn ngay tại đăng nhập nếu account đã dùng ở >2 IP. Login bị chặn
  // KHÔNG ghi recordLogin và KHÔNG cấp token.
  if (!(await checkIpLimit(username, ip))) {
    return res.status(403).json({ error: { message: "IP_LIMIT_EXCEEDED" } });
  }

  try { await recordLogin(username, ip); } catch { /* không chặn login nếu Redis lỗi */ }

  const token = await signToken(username, !!found.admin, 7);
  return res.status(200).json({ token });
}
