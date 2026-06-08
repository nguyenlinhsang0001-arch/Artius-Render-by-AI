// =============================================================
// api/generate.js — VERCEL SERVERLESS FUNCTION (proxy)
//
// Vì sao cần file này:
//   Trong Claude artifact, frontend gọi thẳng api.anthropic.com được là nhờ
//   một proxy ẩn tự đính API key. Khi deploy ra Vercel, proxy đó không còn,
//   nên gọi thẳng sẽ bị 401 (thiếu key) + CORS chặn. File này đứng giữa:
//   frontend gọi "/api/generate" -> hàm này đính x-api-key (đọc từ biến môi
//   trường, KHÔNG lộ ra browser) rồi forward nguyên payload sang Anthropic.
//
// Cách hoạt động:
//   - Chạy trên server Vercel (Node runtime), không phải trên browser.
//   - process.env.ANTHROPIC_API_KEY lấy từ Vercel > Settings > Environment
//     Variables (xem DEPLOY.md).
// =============================================================

export default async function handler(req, res) {
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
    // Vercel thường đã parse sẵn req.body thành object khi Content-Type là
    // application/json; phòng trường hợp là string thì stringify lại cho chắc.
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

    // Trả nguyên status + JSON của Anthropic về cho frontend. App đang đọc
    // data.content / data.usage / data.error đúng như format gốc nên không cần
    // sửa gì thêm phía client.
    const data = await upstream.json();
    return res.status(upstream.status).json(data);
  } catch (err) {
    console.error("Proxy error:", err);
    return res.status(502).json({
      error: "Proxy lỗi khi gọi Anthropic API.",
      detail: String(err && err.message ? err.message : err),
    });
  }
}
