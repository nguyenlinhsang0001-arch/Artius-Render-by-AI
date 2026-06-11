// =============================================================
// api/generate-image.js — Vercel serverless proxy cho gpt-image.
//
// Hỗ trợ HAI endpoint OpenAI tùy theo `mode` từ client:
//   • mode === "generate" (hoặc không có ảnh) -> POST /v1/images/generations
//       (text-to-image, KHÔNG ảnh đầu vào). Dùng cho GEOMETRY mức 3
//       ("Lấy cảm hứng"): cho phép đổi góc máy & phối cảnh.
//   • mode === "edit" (mặc định) -> POST /v1/images/edits
//       (gửi MODEL [+ STYLE] làm pixel base). Dùng cho mức 0-2: giữ camera/geometry.
//
// Contract với client (App.jsx -> renderImage):
//   body = { model, prompt, size, mode, images: [{ data, mediaType }] }
//     - data: base64 THÔ (không có tiền tố "data:..."), mediaType: "image/jpeg"...
//     - images RỖNG khi mode === "generate".
//   Trả về: { b64 } (b64_json của ảnh đầu tiên) — khớp `data?.b64` ở client.
//
// YÊU CẦU TRIỂN KHAI:
//   - ENV: OPENAI_API_KEY trên Vercel.
//   - OpenAI Organization Verification đã bật (bắt buộc cho gpt-image).
//   - Bật Fluid Compute để tránh timeout khi sinh ảnh (ảnh chậm hơn text nhiều).
//   - Node 18+ runtime: có sẵn global fetch / FormData / Blob.
// =============================================================

export const config = {
  // Sinh ảnh có thể lâu; nâng trần thời gian chạy. Cần Fluid Compute để hiệu lực.
  maxDuration: 60,
};

const OPENAI_BASE = "https://api.openai.com/v1";

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: "Thiếu OPENAI_API_KEY trên Vercel." });
    return;
  }

  // ---- Đọc & parse body (Vercel thường tự parse JSON; vẫn phòng trường hợp string) ----
  let body = req.body;
  if (typeof body === "string") {
    try { body = JSON.parse(body); } catch { body = {}; }
  }
  if (!body || typeof body !== "object") body = {};

  const {
    model = "gpt-image-2",
    prompt,
    size = "auto",
    mode = "edit",
    images = [],
  } = body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Thiếu 'prompt'." });
    return;
  }

  // Quyết định endpoint: generate khi mode=generate HOẶC không có ảnh đầu vào.
  const useGenerate = mode === "generate" || !Array.isArray(images) || images.length === 0;

  try {
    let openaiRes;

    if (useGenerate) {
      // ---------- images/generations: text-to-image, KHÔNG ảnh ----------
      openaiRes = await fetch(`${OPENAI_BASE}/images/generations`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({ model, prompt, size, n: 1 }),
      });
    } else {
      // ---------- images/edits: multipart, gửi MODEL (+STYLE) làm pixel base ----------
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("n", "1");

      // gpt-image nhận nhiều ảnh qua field lặp "image[]". Ảnh đầu = MODEL (nền),
      // các ảnh sau = tham chiếu (STYLE).
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
        // KHÔNG tự set Content-Type: để fetch tự thêm boundary cho multipart.
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
      });
    }

    const raw = await openaiRes.text();
    if (!openaiRes.ok) {
      // Chuyển nguyên trạng lỗi của OpenAI để client hiển thị/đọc được.
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

    // Khớp với client: ưu tiên đọc data.b64.
    res.status(200).json({ b64 });
  } catch (err) {
    res.status(500).json({ error: "Lỗi gọi OpenAI image API.", detail: String(err && err.message || err) });
  }
}
