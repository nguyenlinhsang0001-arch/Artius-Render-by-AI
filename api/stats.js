// =============================================================
// api/stats.js — Thống kê usage theo tài khoản. CHỈ admin (token.adm) xem được.
//   GET -> { users: [{ user, prompts, images, logins, lastLogin, lastIp }] }
// Zero-import. Đọc danh sách user từ APP_USERS, lấy số liệu từ Upstash Redis.
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
// Pipeline nhiều lệnh GET, trả mảng {result} đúng thứ tự.
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
  if (!auth.adm) return res.status(403).json({ error: { message: "Chỉ admin xem được thống kê" } });

  const users = parseUsers().map((x) => String(x.u));

  // 5 key mỗi user, theo đúng thứ tự để map lại.
  const cmds = [];
  for (const u of users) {
    cmds.push(["GET", `usage:${u}:prompts`]);
    cmds.push(["GET", `usage:${u}:images`]);
    cmds.push(["GET", `usage:${u}:logins`]);
    cmds.push(["GET", `usage:${u}:last_login`]);
    cmds.push(["GET", `usage:${u}:last_ip`]);
  }

  let out = [];
  try {
    const r = await redisPipe(cmds);
    out = users.map((u, idx) => {
      const base = idx * 5;
      const num = (v) => { const n = parseInt(v?.result ?? "0", 10); return Number.isFinite(n) ? n : 0; };
      return {
        user: u,
        prompts: num(r[base]),
        images: num(r[base + 1]),
        logins: num(r[base + 2]),
        lastLogin: r[base + 3]?.result || null,
        lastIp: r[base + 4]?.result || null,
      };
    });
  } catch (e) {
    return res.status(502).json({ error: { message: "Không đọc được Redis", detail: String(e && e.message || e) } });
  }

  return res.status(200).json({ users: out });
}
