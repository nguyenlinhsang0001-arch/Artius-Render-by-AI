// api/login.js
// ─────────────────────────────────────────────────────────────────────────
// Đăng nhập bằng MẬT KHẨU CHUNG cho cả team.
//   POST { password }  ->  200 { token }   nếu đúng
//                          401              nếu sai
//
// ENV cần đặt trên Vercel (Project Settings > Environment Variables):
//   APP_PASSWORD  - mật khẩu chung của team
//   AUTH_SECRET   - chuỗi bí mật ngẫu nhiên để ký token (vd: openssl rand -hex 32)
// ─────────────────────────────────────────────────────────────────────────

import crypto from "crypto";
import { signToken } from "./_auth.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: { message: "Method Not Allowed" } });
    return;
  }

  const APP_PASSWORD = process.env.APP_PASSWORD || "";
  if (!APP_PASSWORD || !process.env.AUTH_SECRET) {
    res.status(500).json({ error: { message: "Server chưa cấu hình APP_PASSWORD / AUTH_SECRET" } });
    return;
  }

  // req.body có thể là object (Vercel tự parse JSON) hoặc string -> xử lý cả hai.
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  const password = body && body.password ? String(body.password) : "";

  // So sánh timing-safe. timingSafeEqual đòi 2 buffer cùng độ dài nên chặn
  // bằng so độ dài trước (chỉ lộ thông tin về ĐỘ DÀI mật khẩu — chấp nhận được).
  const a = Buffer.from(password);
  const b = Buffer.from(APP_PASSWORD);
  const ok = a.length === b.length && crypto.timingSafeEqual(a, b);

  if (!ok) {
    res.status(401).json({ error: { message: "Sai mật khẩu" } });
    return;
  }

  res.status(200).json({ token: signToken(7) }); // token sống 7 ngày
}
