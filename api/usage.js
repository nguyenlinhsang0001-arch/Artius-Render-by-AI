// =============================================================
// api/usage.js — Số liệu cho BADGE ở header.
//   GET -> { adm, prompts, images, totalPrompts, totalImages }
//   · user thường: dùng prompts/images (của chính mình)
//   · admin: dùng totalPrompts/totalImages (tổng tất cả users)
// Zero-import.
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
const num = (v) => { const n = parseInt(v?.result ?? "0", 10); return Number.isFinite(n) ? n : 0; };

export default async function handler(req, res) {
  const auth = await verifyAuth(req);
  if (!auth) return res.status(401).json({ error: { message: "Unauthorized" } });

  let prompts = 0, images = 0, totalPrompts = 0, totalImages = 0;

  try {
    if (auth.adm) {
      const users = parseUsers().map((x) => String(x.u));
      const cmds = [
        ["GET", "usage:__all__:prompts"],
        ["GET", "usage:__all__:images"],
      ];
      for (const u of users) {
        cmds.push(["GET", `usage:${u}:prompts`]);
        cmds.push(["GET", `usage:${u}:images`]);
      }
      const r = await redisPipe(cmds);
      const grandP = num(r[0]), grandI = num(r[1]);
      let sumP = 0, sumI = 0;
      users.forEach((u, i) => {
        const p = num(r[2 + i * 2]), im = num(r[2 + i * 2 + 1]);
        sumP += p; sumI += im;
        if (u === auth.sub) { prompts = p; images = im; }
      });
      // Tổng = max(bộ đếm tổng cộng dồn, tổng hiện tại của các user).
      // max() để: (1) seed lần đầu từ dữ liệu cũ; (2) reset CÁ NHÂN về sau
      // không kéo tổng xuống (vì grand không bị xoá khi reset 1 user).
      totalPrompts = Math.max(grandP, sumP);
      totalImages = Math.max(grandI, sumI);
      const fix = [];
      if (totalPrompts !== grandP) fix.push(["SET", "usage:__all__:prompts", String(totalPrompts)]);
      if (totalImages !== grandI) fix.push(["SET", "usage:__all__:images", String(totalImages)]);
      if (fix.length) { try { await redisPipe(fix); } catch { /* ignore */ } }
    } else {
      const r = await redisPipe([
        ["GET", `usage:${auth.sub}:prompts`],
        ["GET", `usage:${auth.sub}:images`],
      ]);
      prompts = num(r[0]); images = num(r[1]);
    }
  } catch (e) {
    return res.status(502).json({ error: { message: "Không đọc được Redis", detail: String(e && e.message || e) } });
  }

  return res.status(200).json({ adm: auth.adm ? 1 : 0, prompts, images, totalPrompts, totalImages });
}
