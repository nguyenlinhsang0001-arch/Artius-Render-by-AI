// =============================================================
// api/reset-ip.js — Gỡ giới hạn IP cho 1 account (hoặc tất cả). CHỈ admin.
//   POST { user:"an" } -> xóa ipset:an  (nhả toàn bộ IP slot của user "an")
//   POST {}            -> xóa ipset của MỌI user trong APP_USERS
// Dùng khi user thật bị kẹt do IP nhà đổi (dynamic IP). Zero-import.
// Cặp đôi với check trong generate.js / generate-image.js / login.js
// (key ipset:<user> là ZSET: member=IP, score=last_seen, TTL slot 12h).
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
function parseUsers() {
  try { const a = JSON.parse(process.env.APP_USERS || "[]"); return Array.isArray(a) ? a : []; }
  catch { return []; }
}
async function redisPipe(cmds) {
  const url = process.env.UPSTASH_REDIS_REST_URL, token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !token || cmds.length === 0) return [];
  const r = await fetch(url.replace(/\/+$/, "") + "/pipeline", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(cmds),
  });
  const j = await r.json().catch(() => []);
  return Array.isArray(j) ? j : [];
}

export default async function handler(req, res) {
  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: { message: "Unauthorized" } });
  if (!auth.adm) return res.status(403).json({ error: { message: "Chỉ admin được reset IP" } });
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method Not Allowed" } });

  let body = req.body;
  if (typeof body === "string") { try { body = JSON.parse(body); } catch { body = {}; } }
  const target = body && body.user ? String(body.user) : null;

  const all = parseUsers().map((x) => String(x.u));
  const users = target ? all.filter((u) => u === target) : all;
  if (target && users.length === 0) {
    return res.status(404).json({ error: { message: "Không có user này trong APP_USERS" } });
  }

  const cmds = users.map((u) => ["DEL", `ipset:${u}`]);
  try {
    if (cmds.length) await redisPipe(cmds);
  } catch (e) {
    return res.status(502).json({ error: { message: "Reset IP thất bại (Redis)", detail: String(e && e.message || e) } });
  }

  return res.status(200).json({ ok: true, resetIp: users });
}
