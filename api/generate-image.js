// =============================================================
// api/generate-image.js  —  PROXY render ảnh bằng gpt-image-2 (OpenAI)
// -------------------------------------------------------------
// Đặt file này tại: api/generate-image.js trong repo (cùng cấp api/generate.js).
// Vai trò: giữ OPENAI_API_KEY ở server-side (KHÔNG bao giờ lộ ra client) và
// gọi endpoint images/edits của OpenAI.
//
// SETUP TRÊN VERCEL:
//   Settings → Environment Variables → thêm  OPENAI_API_KEY = sk-...
//   (Phải hoàn tất Organization Verification trên OpenAI dev console trước,
//    nếu không các model dòng gpt-image sẽ bị từ chối.)
//
// CLIENT gửi JSON: { model, prompt, images: [{data(base64), mediaType}], size }
// PROXY trả JSON:  { b64 }  (ảnh PNG base64, không kèm tiền tố data:)
//
// LƯU Ý CHI PHÍ: gpt-image tính phí theo token trên tài khoản OpenAI — KHÔNG
// liên quan token Anthropic. Mỗi request tạo n=1 ảnh.
// =============================================================

// Nâng giới hạn body (2 ảnh base64 có thể ~3–4MB). Cú pháp config của Vercel.
export const config = { api: { bodyParser: { sizeLimit: "8mb" } } };

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const key = process.env.OPENAI_API_KEY;
  if (!key) {
    res.status(500).json({ error: "Thiếu OPENAI_API_KEY trong Environment Variables." });
    return;
  }

  try {
    // Vercel auto-parse JSON body; phòng trường hợp body là string thì parse lại.
    const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : (req.body || {});
    const { prompt, images, model, size } = body;

    if (!prompt || !Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: "Cần 'prompt' và ít nhất 1 ảnh trong 'images'." });
      return;
    }

    // Dựng multipart/form-data cho endpoint images/edits.
    // (FormData / Blob là global trong Node 18+ — runtime mặc định của Vercel.)
    const form = new FormData();
    form.append("model", model || "gpt-image-2");
    form.append("prompt", prompt);
    form.append("n", "1");
    if (size) form.append("size", size);

    // image[] = nhiều ảnh tham chiếu: MODEL (nền/geometry) trước, STYLE sau.
    images.forEach((img, i) => {
      const mime = img.mediaType || "image/png";
      const ext = (mime.split("/")[1] || "png").replace("jpeg", "jpg");
      const buf = Buffer.from(img.data, "base64");
      const blob = new Blob([buf], { type: mime });
      form.append("image[]", blob, `ref_${i}.${ext}`);
    });

    const r = await fetch("https://api.openai.com/v1/images/edits", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}` },
      body: form,
    });

    const text = await r.text();
    if (!r.ok) {
      // Chuyển nguyên thông điệp lỗi của OpenAI về client để dễ debug.
      res.status(r.status).send(text);
      return;
    }

    const data = JSON.parse(text);
    const b64 = data?.data?.[0]?.b64_json || null;
    if (!b64) {
      res.status(502).json({ error: "OpenAI không trả về b64_json.", raw: data });
      return;
    }

    res.status(200).json({ b64 });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: String((e && e.message) || e) });
  }
}
