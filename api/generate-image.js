// =============================================================
// api/generate-image.js — Vercel serverless proxy cho gpt-image.
//
// Hỗ trợ HAI endpoint OpenAI tùy theo `mode` từ client:
//   • mode === "generate" (hoặc không có ảnh) -> POST /v1/images/generations
//       (text-to-image, KHÔNG ảnh đầu vào). Client hiện KHÔNG dùng cho render
//       thường: mọi mức 0-3 đi "edit" để giữ camera bằng pixel.
//   • mode === "edit" (mặc định) -> POST /v1/images/edits
//       (gửi MODEL [+ STYLE] làm pixel base). Dùng cho MỌI mức 0-3: giữ camera.
//       (v31.1) RIÊNG mức Mở (geometry 3): client gửi thêm input_fidelity="low"
//       để nới bám pixel -> AI tái thiết kế vỏ phòng/kiến trúc mạnh hơn.
//
// Contract với client (App.jsx -> renderImage):
//   body = { model, prompt, size, mode, quality?, input_fidelity?, images: [{ data, mediaType }] }
//     - data: base64 THÔ (không có tiền tố "data:..."), mediaType: "image/jpeg"...
//     - images RỖNG khi mode === "generate".
//   Trả về: { b64 } (b64_json của ảnh đầu tiên) — khớp `data?.b64` ở client.
//
// CHỐNG 504 FUNCTION_INVOCATION_TIMEOUT:
//   - quality MẶC ĐỊNH "medium" (gpt-image mặc định high/auto -> rất chậm).
//     Vẫn 504 thì hạ "low". Cần đẹp hơn & có ngân sách thời gian thì "high".
//   - maxDuration: Hobby tối đa 60s, Pro tối đa 300s. Chỉ hiệu lực khi đã bật
//     Fluid Compute (Project → Settings → Functions).
//   - AbortController cắt trước trần để trả lỗi JSON sạch thay vì 504 trống.
//
// YÊU CẦU TRIỂN KHAI:
//   - ENV: OPENAI_API_KEY trên Vercel.
//   - OpenAI Organization Verification đã bật (bắt buộc cho gpt-image).
//   - Bật Fluid Compute để maxDuration có hiệu lực.
//   - Node 18+ runtime: có sẵn global fetch / FormData / Blob / AbortController.
// =============================================================

export const config = {
  // Hobby: tối đa 60. Pro: có thể nâng 300. Cần Fluid Compute mới hiệu lực.
  maxDuration: 240,
};

const OPENAI_BASE = "https://api.openai.com/v1";

// Cắt request tới OpenAI sớm hơn maxDuration vài giây để kịp trả lỗi JSON
// (thay vì để Vercel giết hàm -> 504 trống không đọc được).
const ABORT_MS = 230_000;

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

  // ---- Parse body (Vercel thường tự parse JSON; phòng trường hợp string) ----
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
    quality = "medium", // "low" | "medium" | "high" | "auto"  -> đòn bẩy chống timeout
    input_fidelity, // (v31.1) client chỉ gửi ở mức Mở (geometry 3): "low" nới bám pixel
    images = [],
  } = body;

  if (!prompt || typeof prompt !== "string") {
    res.status(400).json({ error: "Thiếu 'prompt'." });
    return;
  }

  // generate khi mode=generate HOẶC không có ảnh đầu vào.
  const useGenerate = mode === "generate" || !Array.isArray(images) || images.length === 0;

  // AbortController: hủy fetch nếu OpenAI quá chậm.
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ABORT_MS);

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
        body: JSON.stringify({ model, prompt, size, quality, n: 1 }),
        signal: controller.signal,
      });
    } else {
      // ---------- images/edits: multipart, gửi MODEL (+STYLE) làm pixel base ----------
      const form = new FormData();
      form.append("model", model);
      form.append("prompt", prompt);
      form.append("size", size);
      form.append("quality", quality);
      form.append("n", "1");
      // (v31.1) input_fidelity (nếu client gửi): "low" cho mức Mở -> AI thoát pixel
      // base nhiều hơn để tái thiết kế kiến trúc, vẫn giữ camera nhờ prompt khóa.
      if (input_fidelity) form.append("input_fidelity", input_fidelity);

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
        signal: controller.signal,
      });
    }

    const raw = await openaiRes.text();
    if (!openaiRes.ok) {
      res.status(openaiRes.status).send(raw); // chuyển nguyên lỗi OpenAI
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

    res.status(200).json({ b64 }); // khớp client: đọc data.b64
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
