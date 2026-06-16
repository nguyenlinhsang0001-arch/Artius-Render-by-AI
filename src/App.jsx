import React, { useState, useRef, useCallback, useEffect } from "react";
import { Loader2, Copy, Check, Image as ImageIcon, Sparkles, AlertCircle, Palette, Box, Lock, Pencil, Move3d, Droplet, Layers, Maximize2, Ban, X, RefreshCw, Home, History, ChevronDown, ChevronLeft, ChevronRight, Shuffle, RotateCcw, Download, ZoomIn, Building2 } from "lucide-react";

const PLATFORMS = [
  { id: "nanobanana", label: "ChatGPT (gpt-image)", hint: "" },
];

// =============================================================
// ASPECT RATIO — tỷ lệ khung hình. Mọi tool render đều coi đây là tham số
// bắt buộc; với Midjourney nó còn ảnh hưởng cách model tư duy bố cục, không
// chỉ là cắt cúp. value = chuỗi "W:H" dùng cho --ar và mô tả câu chữ.
// =============================================================
const ASPECT_RATIOS = [
  { value: "21:9", label: "21:9", desc: "Điện ảnh siêu rộng — panorama nội thất" },
  { value: "2:1",  label: "2:1",  desc: "Panorama ngang" },
  { value: "16:9", label: "16:9", desc: "Ngang rộng — phối cảnh nội thất" },
  { value: "3:2",  label: "3:2",  desc: "Ngang cổ điển (ảnh DSLR)" },
  { value: "4:3",  label: "4:3",  desc: "Ngang vừa" },
  { value: "5:4",  label: "5:4",  desc: "Gần vuông (medium format)" },
  { value: "1:1",  label: "1:1",  desc: "Vuông — social/feed" },
  { value: "4:5",  label: "4:5",  desc: "Dọc nhẹ — Instagram" },
  { value: "3:4",  label: "3:4",  desc: "Dọc chuẩn" },
  { value: "2:3",  label: "2:3",  desc: "Dọc cổ điển (DSLR)" },
  { value: "9:16", label: "9:16", desc: "Dọc cao — story/reel" },
];

// Mô tả câu chữ cho aspect ratio (dùng cho nền tảng không nhận --ar như
// Nano Banana).
const ASPECT_PHRASE = {
  "21:9": "an ultra-wide 21:9 cinematic composition",
  "2:1":  "a wide 2:1 panoramic composition",
  "16:9": "a wide 16:9 landscape composition",
  "3:2":  "a 3:2 landscape composition",
  "4:3":  "a 4:3 landscape composition",
  "5:4":  "a 5:4 near-square composition",
  "1:1":  "a square 1:1 composition",
  "4:5":  "a 4:5 portrait composition",
  "3:4":  "a 3:4 portrait composition",
  "2:3":  "a 2:3 portrait composition",
  "9:16": "a tall 9:16 vertical composition",
};

// AR_TO_SIZE — map tỷ lệ -> chuỗi "WIDTHxHEIGHT" hợp lệ cho gpt-image-2.
// Ràng buộc của gpt-image-2: W & H đều chia hết cho 16, và tỷ lệ phải nằm
// trong khoảng 1:3..3:1. Đây mới là tham số THẬT ép khung hình khi render
// (ASPECT_PHRASE chỉ là mô tả câu chữ, model không dùng để định tỷ lệ).
// Các size dưới đây ~1.0–1.35MP để giữ chi phí ảnh OpenAI ở mức hợp lý.
const AR_TO_SIZE = {
  "21:9": "1568x672",   // 98×16, 42×16  (ratio 2.333)
  "2:1":  "1536x768",   // 96×16, 48×16
  "16:9": "1536x864",   // 96×16, 54×16
  "3:2":  "1536x1024",  // 96×16, 64×16
  "4:3":  "1344x1008",  // 84×16, 63×16
  "5:4":  "1280x1024",  // 80×16, 64×16
  "1:1":  "1024x1024",
  "4:5":  "1024x1280",
  "3:4":  "1008x1344",
  "2:3":  "1024x1536",
  "9:16": "864x1536",
};

// =============================================================
// NEGATIVE PROMPT mặc định — KHÔNG còn là một hằng số chung mà PHỤ THUỘC nền
// tảng. Mỗi nền tảng có cú pháp/độ "ăn" negative khác nhau, nên giá trị mặc
// định cũng khác:
//  - Nano Banana: không có cú pháp negative riêng -> liệt kê danh sách lỗi đầy
//    đủ (model sẽ được hướng dẫn diễn đạt khẳng định những điều cần TRÁNH).
//  - Midjourney: dùng tham số --no, nên giá trị mặc định ĐÃ gồm sẵn tiền tố
//    "--no " và ghép thẳng vào cuối dòng prompt (guide KHÔNG thêm --no nữa).
// Khi người dùng đổi nền tảng, ô negative tự nạp lại giá trị tương ứng.
// =============================================================
const NEGATIVE_BY_PLATFORM = {
  nanobanana:
    "people, extra doors, cluttered cables, watermark, text, signature, blurry, low resolution, grainy, oversaturated, cartoonish, 3d render, cgi, bad anatomy, poorly drawn, bad lighting, overexposed, underexposed, draft, amateur photo, warped walls, leaning vertical lines, fisheye distortion, lens distortion, curved straight edges, perspective drift",
  midjourney:
    "people, extra doors, cluttered cables, text, watermark, ceiling height",
};

// Fallback chung khi ô negative rỗng và chưa rõ nền tảng (mặc định Nano Banana).
const DEFAULT_NEGATIVE = NEGATIVE_BY_PLATFORM.nanobanana;

// =============================================================
// STYLE INTENSITY -> giá trị --s (stylize) của Midjourney.
// --s thấp = render sát mô tả (chính xác), --s cao = diễn giải sáng tạo
// (đẹp nhưng hy sinh độ chính xác). Hầu hết việc chuyên nghiệp ở 200–400.
// Map 4 mức của trục Style Intensity (0..3) sang dải này.
// =============================================================
const STYLE_INTENSITY_TO_S = [120, 250, 450, 750]; // Nhẹ / Vừa / Đậm / Max

// =============================================================
// GEOMETRY -> --iw (image weight) của Midjourney khi có ảnh MODEL làm
// image-prompt. --iw cao = bám ảnh tham chiếu chặt (giữ bố cục/hình khối);
// --iw thấp = ảnh chỉ là cảm hứng. Dải v7: 0–3, mặc định 1.
// Map 4 mức Geometry (0..3) = Khóa / Sát / Mềm / Mở.
// =============================================================
const GEOMETRY_TO_IW = [3, 2, 1, 0.5]; // Khóa / Sát / Mềm / Mở

// Các yếu tố STYLE bóc từ ảnh mẫu (KHÔNG gồm góc nhìn).
const STYLE_KEYS = [
  ["style", "Phong cách (Style)"],
  ["color_palette", "Bảng màu"],
  ["materials", "Vật liệu & hoàn thiện"],
  ["ceiling_floor_walls", "Trần / Sàn / Tường"],
  ["textures", "Texture & chất bề mặt"],
  ["furniture_style", "Phong cách nội thất"],
  ["lighting", "Ánh sáng (loại, hướng, nhiệt độ)"],
  ["fixtures", "Đèn & thiết bị (fixtures)"],
  ["decor", "Trang trí / chi tiết"],
  ["proportion_detailing", "Tỷ lệ & chi tiết kiến trúc"],
  ["mood", "Cảm xúc / atmosphere"],
];

// Các yếu tố lấy từ ảnh MODEL (góc nhìn + bố cục cần giữ).
const MODEL_KEYS = [
  ["camera", "Góc máy & phối cảnh (giữ theo model)"],
  ["layout", "Bố cục & hình khối không gian (giữ theo model)"],
];

// Hàng cho BẢNG MATRIX khóa/mở (UI): các yếu tố cấu trúc do trục geometry chi
// phối, thứ tự cấu trúc -> nội thất -> chi tiết. Label gọn để vừa ô bảng.
const GEO_ROWS = [
  ["camera", "Góc máy & phối cảnh"],
  ["ceiling_floor_walls", "Trần / Sàn / Tường"],
  ["proportion_detailing", "Tỷ lệ & chi tiết KT"],
  ["layout", "Bố cục / sắp đặt"],
  ["furniture_style", "Phong cách nội thất"],
  ["fixtures", "Đèn & thiết bị"],
  ["decor", "Trang trí / chi tiết"],
];

// (v32.1) Nhãn hiển thị (UI editor + bảng matrix) cho chế độ NGOẠI THẤT. Chỉ
// override các key đổi nghĩa; key không có ở đây giữ nhãn interior. Thuần
// display — KHÔNG ảnh hưởng prompt gửi model (prompt dùng English field + fld).
const EXT_LABELS = {
  ceiling_floor_walls: "Mái / Khối đế / Mặt tiền",
  furniture_style: "Phong cách kiến trúc",
  fixtures: "Đèn ngoài & hardware",
  decor: "Đồ trang trí / cảnh quan",
  proportion_detailing: "Hình khối & chi tiết KT",
  layout: "Bố cục Layout",
};

// 2 field PHỤ chỉ dùng cho case Midjourney + BLEND: giữ keyword của từng style
// TÁCH RIÊNG (không hòa) để dựng PART 2 / PART 3 của chuỗi multi-prompt (::).
// Nhờ nằm trong analysis (chỉnh tay được), chỉnh sửa của user chảy thẳng vào
// tail thay vì bị guide kéo về `brief` tĩnh khi rebuild.
const MJ_BLEND_KEYS = [
  ["blend_primary_keywords", "Blend · từ khóa style CHÍNH (MJ)"],
  ["blend_secondary_keywords", "Blend · từ khóa style PHỤ (MJ)"],
];

// (v31) Field PHỤ cho BLEND trên gpt-image-2: bộ phân tích ĐẦY ĐỦ của style PHỤ
// giữ RIÊNG (song song bộ chính, không hòa). Có đủ palette/lighting/mood nên
// ratio trộn được CÂN BẰNG thật; rebuild text-only re-mix mà không analyze lại.
const BLEND_SECONDARY_KEYS = [
  ["blend_secondary_palette",   "Blend · palette style PHỤ"],
  ["blend_secondary_materials", "Blend · vật liệu style PHỤ"],
  ["blend_secondary_lighting",  "Blend · ánh sáng style PHỤ"],
  ["blend_secondary_mood",      "Blend · mood style PHỤ"],
  ["blend_secondary_furniture", "Blend · nội thất & decor style PHỤ"],
  ["blend_secondary_textures",  "Blend · texture style PHỤ"],
];

// (v31) BLEND TIER cho gpt-image-2 — giờ có HAI bộ phân tích đối xứng (chính +
// "blend_secondary_*"). Map ratio (% style CHÍNH) -> mức nghiêng của CÁC TRỤC
// CHUNG (palette/materials/lighting/mood). Ngưỡng 80/65: <65 = cân, 65-79 =
// nghiêng A, >=80 = gần như toàn A. model KHÔNG hiểu %, nên diễn đạt định tính.
function blendTier(ratioA) {
  if (ratioA >= 80) return {
    id: "accent",
    compose: "keep the palette, materials, lighting and mood almost entirely from the PRIMARY set; bring in ONLY 1-2 signature furniture/decor pieces from the SECONDARY set as accents. The secondary must read as a light garnish on a primary-driven room.",
  };
  if (ratioA >= 65) return {
    id: "lean",
    compose: "lean the shared axes — palette, materials, lighting and mood — toward the PRIMARY set, but still clearly fold in the SECONDARY set's distinctive colours and materials, and pull several signature furniture/decor pieces from it. The secondary reads as a strong, clearly present layer, subordinate but not minor.",
  };
  return {
    id: "even",
    compose: "weave the two sets together EVENLY across every shared axis: co-mix their colour palettes, blend their materials, average their lighting character and merge their mood so neither dominates, and draw signature furniture/decor pieces from BOTH sets in equal measure. Aim for a true 50/50 fusion that still resolves into ONE cohesive, harmonious interior (never two competing zones).",
  };
}

// (v31) Câu chỉ dẫn COMPOSE chèn vào instruction cho sonnet. Cả analyze() lẫn
// rebuildPrompt() đều đi qua effectivePlatformGuide() nên dùng CHUNG 1 nguồn.
// KHÔNG còn neo "PRIMARY as foundation": hai bộ phân tích đối xứng, trộn theo tier.
function blendComposeClause(ratioA) {
  const t = blendTier(ratioA);
  return ` BLEND COMPOSITION (the target style is a fusion of TWO interior styles, each with its OWN full analysis — the PRIMARY style fields and the parallel "blend_secondary_*" fields): ${t.compose} The two MUST resolve into a single cohesive interior, never split into separate zones.`;
}

// Mô tả định dạng prompt mong muốn cho từng nền tảng.
// LƯU Ý: các placeholder {{AR}}, {{NEG}}, {{S}}, {{ARPHRASE}} sẽ được
// effectivePlatformGuide() thay bằng giá trị thực trước khi gửi cho model.
const PLATFORM_GUIDE = {
  nanobanana:
    "an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), NOT a scene-generation prompt and NOT using --params. Frame it explicitly as editing the MODEL image: open with a direct command such as 'Using the imported image (the 3D model) as the exact base, do NOT change the camera angle, perspective, framing, vanishing lines, room proportions, or the position of any walls, windows, doors, or furniture.' Then: 'Only restyle the surfaces and materials — apply the materials, colors, lighting mood and finishing style onto this exact scene.' Compose it as {{ARPHRASE}}. Because Nano Banana has no negative-prompt syntax, convert the avoid-list into positive phrasing woven into the sentence (e.g. keep vertical lines perfectly straight, accurate perspective, clean uncluttered surfaces). Avoid: {{NEG}}. End with: 'Preserve the original composition and geometry precisely; this is a re-render of the same room, only photorealistic and finished.'",
  // LƯU Ý: Midjourney KHÔNG dùng key ở đây — effectivePlatformGuide() luôn gọi
  // buildMidjourneyGuide() (hỗ trợ image-reference --iw/--sref) cho nền tảng này.
};

// =============================================================
// HAI TRỤC ĐIỀU KHIỂN ĐỘC LẬP (thay cho 1 thanh "Freedom %" cũ).
//
// Lý do tách: giữ hình học (geometry) và độ mạnh áp style là HAI quyết định
// khác nhau của designer. Ví dụ điển hình: khóa chặt khối/tường/góc máy
// NHƯNG vẫn cho AI diễn giải vật liệu & ánh sáng mạnh tay — một thanh trượt
// duy nhất không diễn đạt được tổ hợp này. Các tool chuyên dụng cũng tách
// "Respect Model Geometry" khỏi "Prompt Influence" / "Style intensity".
//
// TRỤC 1 — GEOMETRY LOCK: AI được phép động đến cấu trúc không gian tới mức nào.
//   Có ảnh MODEL: khóa cấu trúc theo model. KHÔNG có MODEL: trở thành "kỷ luật
//   không gian" cho cảnh sinh mới. 0 = chặt/khóa tuyệt đối, 3 = táo bạo/cảm hứng.
// TRỤC 2 — STYLE INTENSITY: áp phong cách (vật liệu/màu/ánh sáng/mood) nhẹ
//   hay mạnh. Luôn có ý nghĩa, kể cả khi không có ảnh MODEL.
// =============================================================

// idx 0..3 dùng để tra GEOMETRY_MATRIX bên dưới.
const GEOMETRY_LEVELS = [
  { value: 0, label: "Khóa tuyệt đối", short: "Khóa", shortNoModel: "Chặt",      labelNoModel: "Kỷ luật cao", desc: "Giữ y nguyên góc máy, tường, cửa, vị trí đồ đạc.", descExt: "Giữ y nguyên góc máy, khối nhà, mặt tiền, cửa, mái — chỉ đổi vật liệu & màu facade.",
    descNoModel: "Bố cục chặt: tỷ lệ chuẩn xác, đường thẳng đứng, một phòng nhất quán, góc máy ổn định.",
    descMJ: "--iw 3 · bám ảnh MODEL rất chặt (giữ bố cục & hình khối)." },
  { value: 1, label: "Bám sát",        short: "Sát",  shortNoModel: "Quy củ",     labelNoModel: "Khá chặt",    desc: "Giữ góc máy & bố cục, được đổi decor/fixture nhỏ.", descExt: "Giữ massing & bố cục cửa; đổi chi tiết trang trí, đèn ngoài & landscaping nhỏ.",
    descNoModel: "Bám sát: bố cục quy củ, hợp lý — cho phép vài điểm nhấn kiến trúc nhẹ.",
    descMJ: "--iw 2 · bám ảnh MODEL khá chặt, đổi nhẹ chi tiết." },
  { value: 2, label: "Linh hoạt",      short: "Mềm",  shortNoModel: "Linh hoạt",  labelNoModel: "Tự do",       desc: "Giữ góc máy, tỷ lệ phòng & chiều cao trần — được sắp xếp lại nội thất.", descExt: "Giữ khối tổng, số tầng & góc máy; đổi ngôn ngữ mặt tiền, vật liệu & chi tiết kiến trúc.",
    descNoModel: "Linh hoạt: tự do sắp đặt không gian & góc nhìn, vẫn giữ hợp lý.",
    descMJ: "--iw 1 · cân bằng giữa ảnh MODEL và mô tả." },
  { value: 3, label: "Lấy cảm hứng",   short: "Mở",   shortNoModel: "Táo bạo",    labelNoModel: "Phá cách",    desc: "Chỉ còn giữ góc máy & phối cảnh theo Model.", descExt: "Chỉ giữ góc máy; tái thiết kế cả massing, rooflines & toàn bộ mặt tiền.",
    descNoModel: "Táo bạo: kiến trúc điêu khắc/biomorphic, góc nhìn lạ, tái diễn giải mạnh.",
    descMJ: "--iw 0.5 · ảnh MODEL chỉ là cảm hứng, tự do diễn giải." },
];

const STYLE_INTENSITY_LEVELS = [
  { value: 0, label: "Tinh tế",   short: "Nhẹ",   desc: "Màu dịu, contrast nhẹ, sáng đều — render vẫn hoàn thiện.",
    affects: "Cường độ thấp nhất: màu desaturated, contrast phẳng & dịu, ánh sáng mềm đều bóng nông, vật liệu ít texture, mood điềm tĩnh trung tính. Vẫn là render hoàn thiện photorealistic — chỉ giảm cường độ style, không giảm độ hoàn thiện." },
  { value: 1, label: "Cân bằng",  short: "Vừa",   desc: "Saturation tự nhiên, ánh sáng directional thực tế, đời thường.",
    affects: "Saturation tự nhiên + contrast cân bằng, ánh sáng directional với bóng mềm hợp lý, vật liệu lộ texture đặc trưng rõ nhưng không phóng đại, mood dễ chịu đời thực. Style đọc ra rõ mà vẫn tự nhiên." },
  { value: 2, label: "Mạnh",      short: "Đậm",   desc: "Màu đậm, key light rõ, texture giàu — style chiếm ưu thế.",
    affects: "Saturation đầy + contrast cao hơn rõ, key light directional với highlight tách bạch & bóng sâu hơn, vật liệu giàu texture/grain/sheen/chi tiết bám sát tham chiếu, mood đậm & atmospheric. Style chi phối toàn bộ bề mặt." },
  { value: 3, label: "Tối đa",    short: "Max",   desc: "Cinematic, màu rực, tương phản mạnh.",
    affects: "Editorial/cinematic: màu rực & vivid nhất, contrast mạnh kịch tính, ánh sáng high-contrast directional với highlight nổi/bóng sâu + colour cast định mood, vật liệu chi tiết tối đa, không khí intense. CHỈ tác động bề mặt (vật liệu/màu/texture/sáng/mood) — KHÔNG đổi hình khối, tỷ lệ, chiều cao trần hay góc máy." },
];

// Ma trận khóa hình học: với mỗi yếu tố, ở mỗi mức GEOMETRY (0..3) yếu tố đó
// BỊ KHÓA (true = giữ theo MODEL) hay ĐƯỢC ĐỔI (false).
// LƯU Ý: chỉ các yếu tố liên quan cấu trúc/không gian nằm ở đây. Các yếu tố
// thuần style (style/color/materials/textures/lighting/mood) KHÔNG bao giờ bị
// trục geometry khóa — chúng do trục style intensity điều khiển.
const GEOMETRY_MATRIX = {
  // key:               [Khóa,  Sát,   Mềm,   Mở]
  style:               [false, false, false, false],
  color_palette:       [false, false, false, false],
  materials:           [false, false, false, false],
  textures:            [false, false, false, false],
  lighting:            [false, false, false, false],
  mood:                [false, false, false, false],
  ceiling_floor_walls: [true,  true,  true,  false],
  fixtures:            [true,  false, false, false],
  decor:               [true,  false, false, false],
  furniture_style:     [true,  true,  false, false],
  proportion_detailing:[true,  true,  true,  false],
  camera:              [true,  true,  true,  true ],
  layout:              [true,  true,  false, false],
};

function isLocked(key, geometryValue) {
  const row = GEOMETRY_MATRIX[key];
  if (!row) return false;
  return row[geometryValue] === true;
}

// EN clause cho từng mức STYLE INTENSITY (0..3) — NGUỒN DUY NHẤT,
// dùng chung cho styleIntensityClause() và buildAxisGuidance().
const STYLE_INTENSITY_CLAUSES = [
      // 4 mức điều khiển CƯỜNG ĐỘ STYLE bằng LỆNH CỤ THỂ trên 5 trục mà
      // gpt-image phân biệt rõ: saturation / contrast / lighting / texture /
      // mood. Bỏ tính từ trừu tượng ("muted/bold") vì gpt-image làm phẳng chúng;
      // dùng động từ + mô tả đo được, tăng dần đều qua 4 bậc.
      // ----- 0 — Nhẹ: cường độ thấp nhất, NHƯNG vẫn render hoàn thiện -----
      "Apply the target style at LOW strength. Reproduce the target palette but keep colours desaturated and contrast gentle and flat; use soft, even, ambient lighting with shallow shadows; render materials cleanly with minimal texture, grain or wear; keep the mood calm and neutral. The scene must still be a fully finished, photorealistic render — only the styling intensity is low, never the level of finish or realism.",
      // ----- 1 — Vừa: tự nhiên, đời thực -----
      "Apply the target style at MODERATE strength. Match the target palette at natural saturation with balanced contrast; use realistic directional lighting with believable soft shadows; render materials with their characteristic texture clearly visible but not exaggerated; give the scene a clear, comfortable, lifelike mood. The style reads plainly while everything stays natural and believable.",
      // ----- 2 — Đậm: style chiếm ưu thế bề mặt, đọc ra rõ -----
      "Apply the target style at HIGH strength. Push the palette to full, confident saturation and noticeably higher contrast; use defined directional key lighting with distinct highlights and deeper shadows; render materials with rich, tactile texture, grain, sheen and surface detail closely matched to the reference; make the mood pronounced and atmospheric. The style must dominate the surface treatment and read unmistakably.",
      // ----- 3 — Max: editorial/cinematic, nhưng CHỈ surface, KHÔNG đụng geometry -----
      "Apply the target style at MAXIMUM strength: an editorial, expressive interpretation. Drive the palette to its boldest, most vivid expression with strong dramatic contrast; use cinematic, high-contrast directional lighting with pronounced highlights, deep shadows and a clear mood-setting colour cast; render materials at their richest — maximal texture, sheen, depth and detail; make the atmosphere intense and emotionally charged. This maximum applies ONLY to surface styling (materials, colour, texture, lighting, mood) — it must NEVER reshape, distort, simplify or reinterpret the geometry, structure, proportions, ceiling height, camera or object positions; keep every form exactly as the geometry settings define — only the styling is dialled to maximum.",
    ];

// =============================================================
// CLAUSE BÁM NÉT (geometry fidelity) — bổ trợ cho input_fidelity (gpt-image-2
// luôn xử lý input ở high fidelity). GEO_PRESERVE_CLAUSE (ghim camera + tường +
// trần + chiều cao) chỉ áp các mức KHÓA (0/1/2). Mức 3 (Mở) dùng riêng
// GEO_CAMERA_LOCK_CLAUSE: chỉ ghim camera, để vỏ phòng được đổi.
// CONCISE_STYLE_CLAUSE áp MỌI mức: ép mô tả style cô đọng/keyword,
// bỏ filler, để geometry clause giữ trọng số ưu tiên (giảm prompt fatigue).
// =============================================================
const GEO_PRESERVE_CLAUSE = "Reinforce structural fidelity: treat this as a surface re-paint of the SAME photographed room, pixel-aligned to the input — keep the exact camera vantage, every wall position, each window and door opening, the ceiling height, the floor footprint and the original vanishing lines unchanged.";
const CONCISE_STYLE_CLAUSE = "Keep the style description compact and concrete: use specific material, finish, colour and lighting keywords (e.g. 'honed marble', 'brushed brass', 'warm 3000K cove light'), not subjective filler adjectives such as 'luxurious', 'elegant' or 'stunning'. Do not pad the prompt — keep it short so the geometry-preservation instruction keeps top priority.";

// Câu khóa RIÊNG camera (dùng cho mức 3/Mở): chỉ ghim vị trí/hướng/tiêu cự máy
// ảnh + khung hình tổng thể — KHÔNG ghim hình dạng tường/trần (mức 3 cho đổi vỏ
// phòng). Khác GEO_PRESERVE_CLAUSE (vốn ghim cả tường/trần/chiều cao).
const GEO_CAMERA_LOCK_CLAUSE = "Lock the camera only: keep the exact camera position, orientation, focal length and overall framing of the MODEL — the same shot from the same viewpoint, with no new angle, no reframe and no zoom. The room's surface forms and architectural detailing SHOULD be actively reinterpreted and visibly redesigned (a deliberate departure from the model, not a near-copy), but the scene must always be depicted from this one identical, fixed camera.";

// (v31.3) Bản EXTERIOR của 2 clause trên — dùng khi sceneType === "exterior".
// Đổi neo "room/walls/ceiling/floor" -> "building/facade/massing/rooflines".
const GEO_PRESERVE_CLAUSE_EXT = "Reinforce structural fidelity: treat this as a surface re-paint of the SAME photographed BUILDING, pixel-aligned to the input — keep the exact camera vantage, the building massing and storey count, every facade plane, each window and door opening, the rooflines and the original vanishing lines unchanged.";
const GEO_CAMERA_LOCK_CLAUSE_EXT = "Lock the camera only: keep the exact camera position, orientation, focal length and overall framing of the MODEL — the same shot from the same viewpoint, with no new angle, no reframe and no zoom. The building's facade treatment and architectural detailing SHOULD be actively reinterpreted and visibly redesigned (a deliberate departure from the model, not a near-copy), but the scene must always be depicted from this one identical, fixed camera.";

// ============================================================
// HELPER CHUNG HAI TRỤC (module-level). Sinh geometryGuidance +
// intensityGuidance từ MỘT nguồn duy nhất để analyze() và
// rebuildPrompt() luôn nhất quán (trước đây rebuild thiếu hai khối
// này -> prompt dựng-lại bị 'đông cứng', lệch trục so với analyze).
// ============================================================
function buildAxisGuidance(geometry, styleIntensity, hasModel, sceneType = "interior") {
    // ----- TRỤC 1: GEOMETRY — yếu tố nào bị khóa theo MODEL -----
    const lockedItems = [];
    const freeItems = [];
    Object.keys(GEOMETRY_MATRIX).forEach((k) => {
      const enLabel = k.replace(/_/g, " ");
      if (isLocked(k, geometry)) lockedItems.push(enLabel);
      else freeItems.push(enLabel);
    });
    const geometryLabel = GEOMETRY_LEVELS[geometry]?.label || "";
    // (v31.3) sceneType chỉ đổi TỪ VỰNG neo cho nhánh có-model; interior giữ nguyên.
    const _ext = sceneType === "exterior";
    const sceneNote = _ext
      ? `\n- NOTE: the MODEL is a building EXTERIOR, not an interior room — read "walls" as facade planes, "ceiling" as rooflines, "floor" as the ground/podium, and "room/space" as the building envelope and its site.`
      : "";
    const lockDescInterior = ["Strictly preserve the MODEL's geometry, camera, walls, openings and every element's position; only swap surface materials, colors and lighting.",
      "Keep the camera, walls, windows and overall composition fixed. You may swap out small decor and light fixtures.",
      "Keep the camera angle and room proportions. Furniture and its arrangement, decor and fixtures may be replaced to suit the target style.",
      "Keep the MODEL's camera vantage EXACTLY as shown — the same viewpoint, the same framing, the same perspective and vanishing lines. Do NOT introduce a new angle, a reframe, a focal-length change or any camera move. This is the MOST OPEN level and INCLUDES everything the moderate level permits: replace furniture and change its arrangement, swap decor and light fixtures, and rework wall/ceiling/floor surface treatments. ON TOP OF THAT, you SHOULD actively and noticeably reshape the FORMS and architectural detailing of the room shell — the shapes of walls, ceiling and floor, the proportion detailing and features such as arches, vaults, mouldings, coffers or panelling — so the architecture visibly departs from the model (a deliberate redesign, not a near-copy), provided the whole room is still depicted from that one identical, fixed camera. The camera never moves; the furnishings and the architectural surfaces and forms are substantially reimagined."];
    const lockDescExterior = ["Strictly preserve the MODEL's massing, camera, facade planes, openings and every element's position; only swap cladding materials, colours and lighting.",
      "Keep the camera, building massing, facade planes and openings fixed. You may swap out exterior light fixtures, signage and minor landscaping.",
      "Keep the camera angle, the building massing and storey heights. The facade material language, architectural detailing and ornament may be reworked to suit the target style.",
      "Keep the MODEL's camera vantage EXACTLY as shown — the same viewpoint, framing, perspective and vanishing lines. Do NOT introduce a new angle, reframe, focal-length change or any camera move. This is the MOST OPEN level: rework facade surface treatments, AND on top of that you SHOULD actively and noticeably reshape the building's massing, rooflines, facade composition and architectural detailing — storey rhythm, fenestration pattern, cornices, columns, ornament — so the architecture visibly departs from the model (a deliberate redesign, not a near-copy), provided the building is still seen from that one identical, fixed camera. The camera never moves; the facade and architectural forms are substantially reimagined."];
    const geometryGuidance = hasModel
      ? `\n\nGEOMETRY LOCK = "${geometryLabel}" (level ${geometry}/3).${sceneNote}
- LOCKED (must match the MODEL image, do not change): ${lockedItems.join(", ") || "(none)"}.
- MAY CHANGE (AI is allowed to restyle/replace): ${freeItems.join(", ") || "(none)"}.
- ${(_ext ? lockDescExterior : lockDescInterior)[geometry]}`
      : `\n\n${[
        "SPATIAL DISCIPLINE = strict (level 0/3): compose a single coherent, structurally plausible room with accurate real-world proportions, perfectly straight vertical lines, and a stable conventional eye-level camera. Do NOT invent dramatic, surreal or biomorphic geometry — prioritise architectural believability over visual drama.",
        "SPATIAL DISCIPLINE = mostly strict (level 1/3): keep a coherent single-room composition with accurate proportions and straight verticals; you may add mild architectural interest (an arch, a subtle level change) but keep the overall geometry conventional and believable.",
        "SPATIAL DISCIPLINE = flexible (level 2/3): you may freely arrange the spatial layout, camera angle and architectural features to best express the style, while keeping the result a plausible, structurally sound interior.",
        "SPATIAL DISCIPLINE = free / bold (level 3/3): reinterpret the space expressively — dramatic sculptural or biomorphic architecture, unusual camera angles and bold spatial geometry are encouraged, as long as it still reads as a real interior. Reflect this freedom explicitly in the prompt wording.",
      ][geometry]}`;

    // ----- TRỤC 2: STYLE INTENSITY — áp style mạnh/nhẹ -----
    const intensityLabel = STYLE_INTENSITY_LEVELS[styleIntensity]?.label || "";
    const intensityGuidance = `\n\nSTYLE INTENSITY = "${intensityLabel}" (level ${styleIntensity}/3). ${STYLE_INTENSITY_CLAUSES[styleIntensity]}`;
  // HARD-LOCK: ở mức Khóa tuyệt đối (geometry 0) khi CÓ ảnh MODEL, đặt luật
  // ưu tiên tuyệt đối đè lên trục Style Intensity — dù style để Max thì hình
  // dạng/khối/góc máy vẫn bất biến, intensity chỉ điều khiển vật liệu/màu/sáng.
  const hardLock = (hasModel && geometry === 0)
    ? `\n- HARD GEOMETRY LOCK OVERRIDE: this lock takes ABSOLUTE PRECEDENCE over style intensity. No matter how high the style intensity is set (including maximum), do NOT alter, reshape, distort or reinterpret any shape, proportion, ceiling height, wall, opening, camera angle or object position. Style intensity controls ONLY how strongly materials, colour, textures, lighting and mood are applied onto these fixed surfaces — it must never change the geometry.`
    : "";
  return { geometryGuidance: geometryGuidance + hardLock, intensityGuidance };
}


// =============================================================
// STYLE PRESETS — dùng khi KHÔNG nạp ảnh STYLE mẫu.
// Mỗi preset là một mô tả phong cách (English) để model bám theo thay cho
// việc phân tích ảnh tham chiếu. label = tên hiển thị, desc = mô tả NHẬN DIỆN
// (VI) đủ cụ thể để người dùng hiểu rõ phong cách, brief = mô tả kỹ thuật (EN)
// nhồi vào prompt. `group` = nhãn nhóm để gom chip trong UI.
//
// 30 preset, sắp theo 6 NHÓM (số lượng không đều — ưu tiên gom đúng "họ"
// phong cách). Bổ sung cho thị trường VN: Warm Minimalism, Quiet Luxury,
// Modern, Modern Classic, European Classic, Modern Indochine. "Scandinavian"
// đã được định nghĩa lại thành "Nordic / Scandi-Modern". Dark Academia nằm ở
// nhóm "Cá tính & Táo bạo" (không phải vùng miền).
// =============================================================
const STYLE_PRESETS = [
  // ── Nhóm 1: Tối giản & Á Đông ────────────────────────────
  { id: "minimal",       group: "Tối giản & Á Đông", label: "Minimalist",         desc: "Tối giản triệt để: ít chi tiết, tông trắng–xám đơn sắc, bề mặt liền mạch, lưu trữ giấu kín, ánh sáng dịu đều, đề cao khoảng trống và tỷ lệ chuẩn.",
    brief: "Minimalist style: clean uncluttered space, monochromatic white and grey palette, seamless surfaces, hidden storage, very few carefully chosen objects, soft even lighting, calm negative space, precise proportions" },
  { id: "warm_minimal",  group: "Tối giản & Á Đông", label: "Warm Minimalism",    desc: "Tối giản ấm (NEW): giữ sự gọn gàng của tối giản nhưng thay tông lạnh bằng tông đất ấm — trắng kem, be, nâu nhạt; gỗ tự nhiên, vải thô/len, đá mộc; ánh sáng vàng dịu, ít chi tiết nhưng giàu chất liệu — xu hướng chủ lực ở VN hiện nay.",
    brief: "Warm minimalism style: minimalist restraint with a warm earthy palette of cream, beige and soft taupe, natural wood and stone, linen and wool textures, soft warm diffuse lighting, very few but tactile objects, uncluttered yet cozy and inviting atmosphere" },
  { id: "quiet_lux",     group: "Tối giản & Á Đông", label: "Quiet Luxury",       desc: "Sang trọng tối giản / Quiet Luxury (NEW): xa xỉ kín đáo, không phô trương — bảng màu trung tính tinh tế (kem, taupe, xám đá), vật liệu cao cấp thật (đá travertine, gỗ óc chó, vải cashmere/len, da mộc), đường nét sạch, ít chi tiết nhưng hoàn thiện tỉ mỉ, ánh sáng ấm dịu — đẳng cấp nằm ở chất liệu chứ không ở trang trí.",
    brief: "Quiet luxury (minimalist luxury) style: understated refined elegance, sophisticated neutral palette of cream, taupe and stone grey, premium natural materials (travertine, walnut, cashmere, wool, full-grain leather), clean uncluttered lines, impeccable craftsmanship and detailing, soft warm ambient lighting, calm expensive restrained atmosphere" },
  { id: "japandi",       group: "Tối giản & Á Đông", label: "Japandi",            desc: "Lai giữa tối giản Nhật và ấm áp Bắc Âu: gỗ sồi/óc chó sáng, tông trắng ngà–be, gốm mộc, nội thất thấp, đề cao sự tĩnh và khoảng trống.",
    brief: "Japandi style: minimalist Japanese restraint blended with Scandinavian warmth; light oak and walnut wood, off-white and warm beige palette, matte ceramics, linen and wool textiles, low furniture, paper-lantern and warm diffuse lighting, clean lines, wabi-sabi imperfection, uncluttered calm atmosphere" },
  { id: "wabikan",       group: "Tối giản & Á Đông", label: "Wabi-sabi",          desc: "Vẻ đẹp mộc và không hoàn hảo: tường trát vữa/quét vôi thô, gỗ tự nhiên cũ, gốm thủ công, tông đất, chất bề mặt nhám, ánh sáng tự nhiên dịu, tĩnh tại.",
    brief: "Wabi-sabi style: organic imperfection, raw plaster and lime-wash walls, weathered natural wood, handmade ceramics, earthy muted tones, tactile rough textures, soft diffused natural light, serene grounded atmosphere" },
  { id: "scandi",        group: "Tối giản & Á Đông", label: "Nordic / Scandi-Modern", desc: "Bắc Âu hiện đại (NEW): kế thừa Scandinavian sáng sủa–hygge nhưng tinh gọn và 'modern' hơn — đường nét sắc, gỗ sồi/tần bì sáng, trắng và xám ấm, vài mảng tối tương phản, nội thất designer, ánh sáng tự nhiên dồi dào, gọn gàng và tinh tế.",
    brief: "Nordic / Scandi-modern style: evolved Scandinavian design, bright airy space with crisp clean lines, pale oak and ash wood, white and warm grey palette with subtle dark contrast accents, designer functional furniture, soft cozy textiles, abundant natural daylight, refined uncluttered atmosphere" },
  { id: "taiwanese",     group: "Tối giản & Á Đông", label: "Taiwanese",         desc: "Đài Loan hiện đại (NEW): tối giản ấm kiểu căn hộ Đài Bắc pha nét hoài cổ 'old Taiwan' — gỗ sồi sáng, tường micro-cement liền mảng tông be–xám ấm, bảng màu đất trung tính, nội thất thấp bọc linen, mây tre, mặt terrazzo, kính amber; điểm nhận diện bản địa: song sắt hoa văn (鐵窗花), gạch bông hoa cổ (花磚), mảng gạch đỏ, góc trà gốm; cây nhiệt đới, cửa lớn nhiều sáng tự nhiên, đèn ray/LED ấm — gọn gàng, tĩnh tại nhưng đậm chất Đài.",
    brief: "Modern Taiwanese style: warm contemporary minimalism rooted in Taipei apartment living, blending East-Asian calm with subtle nostalgic old-Taiwan character; light oak floors and millwork, smooth monolithic micro-cement walls in warm beige and soft grey, neutral earthy palette, low-profile linen and rattan furniture, polished terrazzo, amber fluted glass; signature local details such as black wrought-iron flower window grilles (tiehua chuang), vintage majolica flower tiles (huazhuan) accents, red-brick touches and a ceramic tea-set corner; tropical greenery (areca palm, money tree), large windows with soft natural daylight, minimal track and warm LED lighting, clean rectilinear composition, serene and uncluttered" },

  // ── Nhóm 2: Hiện đại ─────────────────────────────────────
  { id: "modern",        group: "Hiện đại", label: "Modern",             desc: "Hiện đại thuần (NEW): đường nét thẳng dứt khoát, mặt phẳng sạch, tông trắng–xám–đen cơ bản, vật liệu kính–kim loại–gỗ công nghiệp, ít trang trí, đề cao công năng — ngôn ngữ 'hiện đại' quen thuộc nhất với nhà phố và căn hộ Việt.",
    brief: "Modern style: clean straight lines, flat uncluttered surfaces, neutral white-grey-black palette, glass, metal and engineered wood, minimal ornamentation, functional built-in furniture, even bright lighting, sleek and orderly atmosphere" },
  { id: "contemporary",  group: "Hiện đại", label: "Contemporary",       desc: "Đương đại trung tính: đường nét gọn, tông xám–trắng–be cân bằng, vài điểm nhấn màu, vật liệu trộn (gỗ, kim loại, kính), linh hoạt và cập nhật xu hướng hiện tại.",
    brief: "Contemporary style: current trend-aware design, clean balanced lines, neutral grey-white-beige base with a few bold accent colors, mixed materials (wood, metal, glass), smooth surfaces, layered modern lighting, sophisticated and uncluttered" },
  { id: "organic_modern", group: "Hiện đại", label: "Organic Modern",     desc: "Hiện đại hữu cơ (NEW): hình khối bo cong mềm mại, vật liệu tự nhiên (gỗ, đá, vải bouclé), tông đất ấm trung tính, nhiều cây xanh, ánh sáng dịu — hiện đại nhưng gần gũi thiên nhiên.",
    brief: "Organic modern style: soft curved forms and rounded silhouettes, natural materials (wood, stone, boucle, linen, travertine), warm earthy neutral palette, sculptural furniture, abundant greenery, soft diffused lighting, modern yet grounded serene atmosphere" },
  { id: "midcentury",    group: "Hiện đại", label: "Mid-century Modern", desc: "Thẩm mỹ thập niên 1950–60: gỗ tếch/óc chó chân thon, hình khối cong hữu cơ, điểm vàng mù tạt–cam đất–ô liu, hoa văn hình học, đèn thả statement.",
    brief: "Mid-century modern style: 1950s-60s design language, teak and walnut furniture with tapered legs, organic curved forms, warm mustard, burnt orange and olive accents, geometric patterns, statement pendant lighting, retro-refined atmosphere" },
  { id: "transitional",  group: "Hiện đại", label: "Transitional",       desc: "Giao thoa cổ điển–hiện đại (NEW): đường nét sạch nhưng vẫn có chiều sâu cổ điển, tông trung tính ấm (beige–taupe–xám), vật liệu phối hợp, nội thất thanh lịch dễ chịu, cân bằng và dễ ứng dụng.",
    brief: "Transitional style: a balanced blend of classic and contemporary, clean lines softened by subtle traditional detailing, warm neutral palette of beige, taupe and grey, mixed textures, comfortable elegant furniture, layered soft lighting, timeless refined atmosphere" },

  // ── Nhóm 3: Sang trọng & Cổ điển ─────────────────────────
  { id: "modern_lux",    group: "Sang trọng & Cổ điển", label: "Modern Luxury",      desc: "Sang trọng hiện đại: mặt đá marble, điểm nhấn đồng/đồng thau, tông trung tính sâu (than chì–kem), bọc nhung/da, đèn statement, hoàn thiện cao cấp.",
    brief: "Modern luxury style: refined contemporary elegance, marble and natural stone surfaces, brushed brass and bronze accents, deep neutral palette with charcoal and cream, velvet and leather upholstery, statement lighting, layered warm ambient illumination, high-end finishes" },
  { id: "modern_classic", group: "Sang trọng & Cổ điển", label: "Modern Classic",    desc: "Tân cổ điển nhẹ / Modern Classic (NEW): cổ điển giản lược pha hiện đại — phào chỉ tinh giản và đối xứng nhẹ, tông trung tính sang (trắng kem, ghi, champagne), điểm nhấn kim loại mảnh, nội thất thanh lịch đường nét sạch, đèn chùm tiết chế — quý phái nhưng nhẹ nhàng, không rườm rà.",
    brief: "Modern classic style: lightly classical interior softened by modern restraint, simplified slim crown moldings and gentle symmetry, sophisticated neutral palette of cream-white, greige and champagne, slim metallic accents, elegant clean-lined furniture, understated chandelier or refined pendant, graceful airy yet refined atmosphere" },
  { id: "neoclassical",  group: "Sang trọng & Cổ điển", label: "Neoclassical",       desc: "Tân cổ điển sang trọng (NEW): phào chỉ và cột trang trí, bố cục đối xứng, tông kem–trắng–vàng nhạt, đèn chùm pha lê, nội thất bọc nhung, hoàn thiện tinh xảo, quý phái.",
    brief: "Neoclassical style: elegant classical proportions, decorative crown moldings, wainscoting and pilasters, symmetrical balanced layout, cream-white and soft champagne-gold palette, crystal chandeliers, velvet upholstered furniture, ornate refined detailing, graceful luxurious atmosphere" },
  { id: "euro_classic",  group: "Sang trọng & Cổ điển", label: "European Classic",   desc: "Cổ điển châu Âu sang trọng (NEW): phào chỉ cầu kỳ, đối xứng nghiêm ngặt, dát vàng và chi tiết chạm khắc, đèn chùm pha lê lớn, nội thất bọc nhung và gỗ chạm, sàn marble — quý phái, bề thế, đậm chất biệt thự cao cấp (nặng và cầu kỳ hơn Neoclassical).",
    brief: "European classic luxury style: ornate symmetrical layout, elaborate crown moldings and carved details, gilded gold accents, large crystal chandeliers, marble floors, tufted velvet and carved wood furniture, rich warm ambient lighting, opulent grand palatial atmosphere" },
  { id: "artdeco",       group: "Sang trọng & Cổ điển", label: "Art Deco",           desc: "Sang trọng cổ điển 1920–30: hình học mạnh, đối xứng, vàng đồng và đen, nhung đậm, gương và đá marble, hoa văn nan quạt, kịch tính và quyến rũ.",
    brief: "Art Deco style: 1920s-30s glamour, bold symmetrical geometric patterns, gold/brass and black palette with deep jewel tones, rich velvet, mirrored and marble surfaces, sunburst and fan motifs, dramatic luxurious atmosphere" },
  { id: "french_country", group: "Sang trọng & Cổ điển", label: "French Country",     desc: "Đồng quê Pháp / Provence (NEW): tường vữa kem, dầm gỗ lộ, đồ gỗ sơn phai màu, tông lavender–xanh ô liu–kem, gốm và vải hoa, sắt uốn — lãng mạn mộc mạc và ấm áp.",
    brief: "French country (Provence) style: cream plaster walls, exposed timber beams, distressed painted wood furniture, soft lavender, sage-green and cream palette, toile and floral textiles, wrought iron details, ceramic accents, romantic rustic-elegant warmth" },

  // ── Nhóm 4: Mộc & Tự nhiên ───────────────────────────────
  { id: "farmhouse",     group: "Mộc & Tự nhiên", label: "Rustic Farmhouse",   desc: "Đồng quê mộc mạc: dầm gỗ lộ, gỗ thô và đá, tông trắng kem–nâu gỗ, đồ nội thất chắc chắn, vải bố/cotton, chậu sứ, ấm cúng và gần gũi thiên nhiên.",
    brief: "Rustic farmhouse style: exposed wooden beams, rough-sawn wood and stone, cream-white and natural wood tones, sturdy chunky furniture, cotton and burlap textiles, ceramic and enamel accents, cozy warm country atmosphere" },
  { id: "coastal",       group: "Mộc & Tự nhiên", label: "Coastal",            desc: "Cảm hứng biển, thư thái: tông trắng và xanh dương dịu, gỗ sáng bạc màu, mây tre–đay tự nhiên, rèm linen, nhiều ánh sáng, thoáng đãng như nhà ven biển.",
    brief: "Coastal style: breezy relaxed space, white and soft blue palette, weathered light wood, natural rattan and jute, linen drapes, abundant bright natural light, airy beach-house atmosphere" },
  { id: "biophilic",     group: "Mộc & Tự nhiên", label: "Biophilic",          desc: "Thiết kế xanh kết nối thiên nhiên (NEW): cây xanh phủ khắp và mảng tường cây, vật liệu sống (gỗ, đá, mây, đất nung), tối đa ánh sáng tự nhiên, tông xanh lá–nâu đất, trong lành và thư giãn.",
    brief: "Biophilic design style: abundant integrated greenery and living green walls, maximized natural light, raw organic materials (wood, stone, rattan, clay), green and earthy palette, natural ventilation feel, water and plant features, fresh restorative connection to nature" },
  { id: "bohemian",      group: "Mộc & Tự nhiên", label: "Bohemian (Boho)",    desc: "Phóng khoáng, nhiều lớp: tông đất ấm và màu jewel, thảm/gối họa tiết dệt, mây tre, macramé, nhiều cây xanh, đồ vintage pha trộn tự do, ấm và cá tính.",
    brief: "Bohemian (boho) style: eclectic layered look, warm earthy tones with jewel accents, patterned woven rugs and cushions, rattan and macramé, abundant indoor plants, mixed vintage and global furniture, relaxed warm and personal atmosphere" },

  // ── Nhóm 5: Vùng miền ────────────────────────────────────
  { id: "mediterranean", group: "Vùng miền", label: "Mediterranean",      desc: "Nam Âu nắng ấm: tường vữa trắng kem, gạch terracotta, vòm cong, gỗ tối, sắt rèn, gạch hoa văn, tông đất và xanh biển, ấm áp và mời gọi.",
    brief: "Mediterranean style: warm sun-washed look, cream stucco walls, terracotta tiles, arched openings, dark wood and wrought iron, patterned ceramic tiles, earthy and sea-blue palette, inviting rustic-elegant atmosphere" },
  { id: "indochine",     group: "Vùng miền", label: "Indochine",          desc: "Đông Dương giao thoa Pháp–Việt: gạch bông họa tiết, gỗ tối, mây tre đan, tông vàng nghệ–xanh ngọc–trắng, quạt trần, hoa văn Á Đông, hoài cổ và tinh tế.",
    brief: "Indochine style: French-colonial Southeast Asian fusion, patterned encaustic cement floor tiles, dark tropical hardwood, rattan and cane furniture, mustard-yellow, jade-green and white palette, ceiling fans, oriental motifs, nostalgic refined atmosphere" },
  { id: "modern_indochine", group: "Vùng miền", label: "Modern Indochine",  desc: "Đông Dương hiện đại (NEW): tinh thần Indochine được tiết chế và hiện đại hóa — vẫn gạch bông, mây tre đan và gỗ ấm nhưng dùng có chọn lọc, đường nét sạch, bảng màu nhẹ (trắng–be–xanh ngọc dịu–nâu gỗ), ít hoài cổ, nhiều ánh sáng — giao thoa bản sắc Việt và sự gọn gàng đương đại.",
    brief: "Modern Indochine style: contemporary reinterpretation of French-colonial Vietnamese design, selective use of patterned encaustic tiles, rattan and cane detailing, warm wood, clean modern lines, light palette of white, beige, soft jade-green and natural wood, subtle oriental motifs, abundant natural light, refined fusion of local heritage and contemporary calm" },
  { id: "tropical",      group: "Vùng miền", label: "Tropical / Resort",  desc: "Nghỉ dưỡng nhiệt đới: nhiều cây xanh và lá lớn, gỗ và mây tre, tông xanh lá–trắng–nâu, vải nhẹ thoáng, ánh sáng tự nhiên, mát mẻ và thư giãn.",
    brief: "Tropical resort style: lush greenery and large-leaf plants, teak wood and rattan, green-white-brown palette, light breathable fabrics, woven textures, abundant natural light, open airy relaxed vacation atmosphere" },

  // ── Nhóm 6: Cá tính & Táo bạo ────────────────────────────
  { id: "industrial",    group: "Cá tính & Táo bạo", label: "Industrial",         desc: "Phong cách nhà xưởng/loft: bê tông trần, gạch đỏ thô, khung thép đen, gỗ tái chế, đèn bóng Edison, để lộ đường ống, tông đất trầm.",
    brief: "Industrial style: exposed concrete and red brick, black steel framing, reclaimed wood, Edison-bulb and track lighting, raw unfinished textures, open ductwork, muted earthy palette, urban loft atmosphere" },
  { id: "brutalist",     group: "Cá tính & Táo bạo", label: "Brutalist",          desc: "Brutalist điêu khắc (NEW): bê tông thô lộ khối nặng, hình khối monolithic, vân ván khuôn, tông xám lạnh đơn sắc, ít chi tiết, ánh sáng tương phản mạnh — mạnh mẽ và nghệ thuật.",
    brief: "Brutalist style: raw exposed board-formed concrete, heavy monolithic geometric forms, cool grey monochrome palette, minimal ornamentation, sculptural massing, strong directional light and deep shadow, bold austere artistic atmosphere" },
  { id: "maximalist",    group: "Cá tính & Táo bạo", label: "Maximalist",         desc: "Tối đa hóa, đậm chất: màu sắc táo bạo và tương phản, nhiều hoa văn chồng lớp, tranh và đồ trang trí dày đặc, vật liệu phong phú, cá tính mạnh và kịch tính.",
    brief: "Maximalist style: bold saturated colors and high contrast, layered clashing patterns, gallery walls and abundant decor, rich varied materials, statement furniture, dense curated abundance, expressive dramatic personality" },
  { id: "memphis",       group: "Cá tính & Táo bạo", label: "Memphis / Retro",    desc: "Memphis hậu hiện đại thập niên 80 (NEW): màu sắc rực rỡ tương phản, hình học táo bạo, họa tiết chấm bi–zigzag, terrazzo, nội thất hình khối vui nhộn — năng động và nổi loạn.",
    brief: "Memphis postmodern style: bold saturated primary colors, playful geometric shapes and squiggles, clashing patterns, terrazzo and laminate surfaces, asymmetric sculptural furniture, 1980s retro-futuristic energy, vibrant irreverent atmosphere" },
  { id: "dark_academia", group: "Cá tính & Táo bạo", label: "Dark Academia",      desc: "Học thuật cổ trầm mặc: gỗ sẫm và da nâu, tường xanh rêu–đỏ rượu, kệ sách kín tường, đèn vàng ấm, tranh cổ và đồ đồng — hoài cổ, trí thức và ấm cúng.",
    brief: "Dark academia style: dark stained wood and aged leather, deep moody palette of forest green, oxblood and brown, floor-to-ceiling bookshelves, vintage oil paintings, brass and amber task lighting, antique furnishings, scholarly nostalgic candlelit atmosphere" },
];

// =============================================================
// STYLE IMAGES — ẢNH VÍ DỤ ĐIỂN HÌNH cho từng preset (thumbnail trong grid).
// QUAN TRỌNG: artifact Claude.ai CHẶN ảnh từ link ngoài (Google Drive, CDN...).
// Trong sandbox, <img> chỉ nhận `data:` (base64), `blob:` và domain nội bộ.
// => Mỗi ảnh PHẢI là chuỗi base64 dán thẳng vào đây theo dạng:
//      minimal: "data:image/jpeg;base64,/9j/4AAQSkZJRg...",
// Mẹo: NÉN ảnh về thumbnail nhỏ (~200×130px, JPEG ~70%) trước khi convert,
// nếu không file sẽ phình rất to và lag. Để rỗng "" thì grid tự hiện
// placeholder (khung + icon). Key = đúng `id` của preset ở trên.
// =============================================================
const STYLE_IMAGES = {
  taiwanese: "/styles/taiwanese.webp",
  minimal: "/styles/minimal.webp",
  warm_minimal: "/styles/warm_minimal.webp",
  quiet_lux: "/styles/quiet_lux.webp",
  japandi: "/styles/japandi.webp",
  wabikan: "/styles/wabikan.webp",
  scandi: "/styles/scandi.webp",
  modern: "/styles/modern.webp",
  contemporary: "/styles/contemporary.webp",
  organic_modern: "/styles/organic_modern.webp",
  midcentury: "/styles/midcentury.webp",
  transitional: "/styles/transitional.webp",
  modern_lux: "/styles/modern_lux.webp",
  modern_classic: "/styles/modern_classic.webp",
  neoclassical: "/styles/neoclassical.webp",
  euro_classic: "/styles/euro_classic.webp",
  artdeco: "/styles/artdeco.webp",
  french_country: "/styles/french_country.webp",
  farmhouse: "/styles/farmhouse.webp",
  coastal: "/styles/coastal.webp",
  biophilic: "/styles/biophilic.webp",
  bohemian: "/styles/bohemian.webp",
  mediterranean: "/styles/mediterranean.webp",
  indochine: "/styles/indochine.webp",
  modern_indochine: "/styles/modern_indochine.webp",
  tropical: "/styles/tropical.webp",
  industrial: "/styles/industrial.webp",
  brutalist: "/styles/brutalist.webp",
  maximalist: "/styles/maximalist.webp",
  memphis: "/styles/memphis.webp",
  dark_academia: "/styles/dark_academia.webp",
};

// =============================================================
// ROOM TYPES — LOẠI KHÔNG GIAN của bối cảnh cần render.
// Mục đích: cho Agent biết đây là phòng/không gian chức năng gì, để chọn đúng
// bộ nội thất, fixture, decor và bố cục — đặc biệt hữu ích khi KHÔNG có ảnh
// MODEL (góc nhìn trung tính, model không có manh mối loại phòng) hoặc khi
// MODEL chỉ là sketch/clay thô chưa có đồ đạc.
//
// `value` = id nội bộ; `label` = tên hiển thị (VI); `en` = cụm tiếng Anh nhồi
// vào prompt. Trong UI, một option "Tự nhập" (value "__custom__") được đặt làm
// DÒNG ĐẦU của dropdown — khi chọn sẽ hiện ô text để gõ loại không gian bất kỳ.
// =============================================================
const ROOM_TYPES = [
  { value: "living",     label: "Phòng khách",                en: "living room" },
  { value: "bedroom",    label: "Phòng ngủ",                  en: "bedroom" },
  { value: "master",     label: "Phòng ngủ master",           en: "master bedroom" },
  { value: "kids",       label: "Phòng trẻ em",               en: "children's bedroom" },
  { value: "kitchen",    label: "Bếp",                        en: "kitchen" },
  { value: "kitchen_dining", label: "Bếp + bàn ăn (mở)",      en: "open-plan kitchen and dining area" },
  { value: "dining",     label: "Phòng ăn",                   en: "dining room" },
  { value: "bathroom",   label: "Phòng tắm / WC",             en: "bathroom" },
  { value: "office",     label: "Phòng làm việc / home office", en: "home office / study room" },
  { value: "media",      label: "Phòng giải trí / media",     en: "media / entertainment room" },
  { value: "hallway",    label: "Lối vào / hành lang",        en: "entryway / hallway" },
  { value: "lobby",      label: "Sảnh / lobby lễ tân",        en: "lobby / reception area" },
  { value: "cafe",       label: "Café / quán",                en: "café / coffee shop interior" },
  { value: "restaurant", label: "Nhà hàng",                   en: "restaurant interior" },
  { value: "retail",     label: "Cửa hàng / retail",          en: "retail store interior" },
  { value: "showroom",   label: "Showroom",                   en: "showroom" },
  { value: "workspace",  label: "Văn phòng làm việc",         en: "open office workspace" },
  { value: "meeting",    label: "Phòng họp",                  en: "meeting / conference room" },
  { value: "exterior",   label: "Ngoại thất / mặt tiền",      en: "building exterior / facade" },
  { value: "outdoor",    label: "Sân vườn / ban công",        en: "garden / balcony / outdoor living space" },
];

// Cụm tiếng Anh hiệu lực từ lựa chọn dropdown + ô tự nhập (thuần, không đụng
// state — dùng được cả cho giá trị hiện tại lẫn bản chụp trong snapshot).
function roomEnFrom(sel, custom) {
  if (sel === "__custom__") return (custom || "").trim();
  return ROOM_TYPES.find((r) => r.value === sel)?.en || "";
}
// Nhãn hiển thị (VI) tương ứng, để banner liệt kê "cũ → mới".
function roomLabelFrom(sel, custom) {
  if (sel === "__custom__") {
    const t = (custom || "").trim();
    return t ? `“${t}”` : "(không dùng)";
  }
  return ROOM_TYPES.find((r) => r.value === sel)?.label || "(không dùng)";
}

// =============================================================
// THEME — tối hiện đại (zinc/slate) + accent steel-blue DỊU.
// Đưa ra ngoài để mọi component dùng chung. Nút active dùng nền PHẲNG
// (accent) thay gradient vàng cũ -> tinh gọn, vào trọng tâm.
// pos = "AI được đổi" (sage), neg = "khóa theo MODEL" (terracotta dịu).
// =============================================================
const C = {
  bg:        "#0b0e13", // nền chính, zinc/slate gần đen
  bgGrad:    "#161c26", // điểm sáng radial trên nền
  panel:     "#141922", // panel
  panel2:    "#1a212c", // panel/nút nổi hơn
  inputBg:   "#0d1119", // nền input/textarea (sâu hơn panel)
  line:      "#28303d", // viền chính
  lineSoft:  "#202733", // viền nhạt
  accent:    "#7aa2c4", // steel-blue dịu — màu thương hiệu / active
  accentSoft:"#aac6e0", // text accent sáng
  accentDeep:"#5c84a8", // accent đậm (hover/điểm nhấn gradient nhẹ)
  onAccent:  "#0b0e13", // chữ đặt trên nền accent
  pos:       "#7cba9b", // sage — "AI có thể đổi"
  neg:       "#cf9a8d", // terracotta dịu — "khóa theo MODEL"
  text:      "#e9ecf1",
  textDim:   "#8b94a3",
  textFaint: "#767f8e",
};

// Font sans gọn, hiện đại, hỗ trợ tiếng Việt đầy đủ (dùng cho cả heading).
const FONT = "'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif";
const MONO = "'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace";

// =============================================================
// APP_VERSION — DẤU MỐC PHIÊN BẢN. Hiển thị ở footer để phân biệt bản mới /
// bản bị cache. Mỗi lần cập nhật code, tăng số này. Nếu giao diện vẫn hiện số
// cũ sau khi mở lại -> đang xem bản cache, cần hard-refresh / mở lại artifact.
// =============================================================
// Logo ARTIUS (nền đã xóa, chữ trắng PNG trong suốt) — nhúng base64 để không
// phụ thuộc file ngoài. Thay cho icon Sparkles ở header.
const ARTIUS_LOGO = "data:image/png;base64,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";

const APP_VERSION = "v33.2 · 17/06/2026";

// =============================================================
// API_URL — ĐIỂM GỌI API DUY NHẤT, đặt một chỗ để dễ đổi.
//  · Khi DEPLOY (Vercel / chạy local có proxy): trỏ "/api/generate" —
//    serverless function ở api/generate.js sẽ đính x-api-key (đọc từ
//    process.env.ANTHROPIC_API_KEY) rồi forward sang Anthropic. Key KHÔNG
//    lộ ra browser.
//  · LƯU Ý: sau khi đổi sang "/api/generate", file KHÔNG còn chạy trong
//    Claude artifact preview nữa (artifact chỉ proxy ngầm cho api.anthropic.com).
//    Muốn test phải deploy lên Vercel hoặc chạy `vercel dev` ở local.
// =============================================================
const API_URL = "/api/generate";
const IMAGE_API_URL = "/api/generate-image";

// =============================================================
// AUTH — đăng nhập bằng 1 mật khẩu chung cho cả team.
//  · /api/login : nhận { password }, so với APP_PASSWORD (env trên Vercel),
//    nếu đúng cấp 1 signed token (HMAC-SHA256, hết hạn ~7 ngày).
//  · Token lưu ở localStorage, đính kèm "Authorization: Bearer <token>" vào
//    MỌI lời gọi /api/generate và /api/generate-image.
//  · 2 endpoint đó verify chữ ký phía SERVER -> chặn lạm dụng thật sự, không
//    chỉ chặn UI. (Chi tiết: api/login.js, api/_auth.js.)
// =============================================================
const LOGIN_API_URL = "/api/login";
const STATS_API_URL = "/api/stats";
const USAGE_API_URL = "/api/usage";
const RESET_API_URL = "/api/reset";
const RESETIP_API_URL = "/api/reset-ip";
const AUTH_TOKEN_KEY = "artius_ipa_token"; // key localStorage

// Giải base64url -> chuỗi. atob() chỉ hiểu base64 chuẩn nên phải đổi -_ về +/
// và bù "=" cho đủ block 4 ký tự.
function b64urlDecode(s) {
  s = String(s).replace(/-/g, "+").replace(/_/g, "/");
  while (s.length % 4) s += "=";
  return atob(s);
}

// Đọc phần payload (đoạn TRƯỚC dấu ".") để lấy exp và tự logout sớm khi token
// hết hạn. KHÔNG xác thực chữ ký ở client — đó là việc của server ở mỗi call.
function isTokenExpired(token) {
  try {
    const payloadB64 = String(token).split(".")[0];
    const json = JSON.parse(b64urlDecode(payloadB64));
    if (!json || typeof json.exp !== "number") return true;
    return Date.now() >= json.exp * 1000; // exp là epoch giây
  } catch {
    return true; // token méo mó -> coi như hết hạn
  }
}

// Giải payload token -> { sub, adm, exp } để biết user hiện tại + có phải admin.
function decodeToken(token) {
  try { return JSON.parse(b64urlDecode(String(token).split(".")[0])); }
  catch { return null; }
}

// =============================================================
// UploadBox — ĐỊNH NGHĨA NGOÀI component chính để không bị recreate mỗi render.
// =============================================================
function UploadBox({ img, onClick, onDrop, inputRef, onChange, onClear, icon, title, subtitle, active }) {
  return (
    <div
      onClick={onClick}
      role="button"
      tabIndex={0}
      aria-label={`Tải lên ${title}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } }}
      onDragOver={(e) => e.preventDefault()}
      onDrop={onDrop}
      className="relative cursor-pointer rounded-2xl p-4 flex flex-col items-center justify-center text-center min-h-[168px] transition-all duration-200"
      style={{
        background: C.panel,
        border: `1.5px dashed ${active ? C.accent : C.line}`,
        boxShadow: img ? `inset 0 0 0 1px ${C.line}` : "none",
      }}
    >
      {/* Nút xóa ảnh — chỉ hiện khi đã có ảnh. stopPropagation để không
          kích hoạt onClick mở hộp chọn file của khối cha. */}
      {img && onClear && (
        <button
          onClick={(e) => { e.stopPropagation(); onClear(); }}
          title="Xóa ảnh"
          aria-label="Xóa ảnh"
          className="absolute top-2 right-2 z-10 inline-flex items-center justify-center w-7 h-7 rounded-full transition-colors"
          style={{ background: `${C.bg}cc`, border: `1px solid ${C.line}`, color: C.text }}
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      )}
      {img ? (
        <img src={img.preview} alt={title} className="max-h-36 rounded-lg object-contain" />
      ) : (
        <>
          {icon}
          <p className="font-semibold mt-2" style={{ color: C.text }}>{title}</p>
          <p className="text-xs mt-0.5" style={{ color: C.textDim }}>{subtitle}</p>
        </>
      )}
      <input ref={inputRef} type="file" accept="image/*" className="hidden" onChange={onChange} />
    </div>
  );
}

// =============================================================
// AnalysisRow — ĐỊNH NGHĨA NGOÀI component chính (giữ ổn định để textarea
// không mất focus khi gõ). Còn 2 cột: nhãn + English.
// =============================================================
function AnalysisRow({ k, label, i, enValue, onChangeEn }) {
  // Textarea tự co giãn theo nội dung để không che mất mô tả dài.
  const taRef = useRef(null);
  const autosize = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };
  useEffect(() => { autosize(taRef.current); }, [enValue]);
  return (
    <div
      className="grid grid-cols-1 md:grid-cols-[190px_1fr] gap-2 md:gap-4 px-4 py-3 items-start"
      style={{ background: i % 2 ? C.panel2 : C.panel, borderTop: i === 0 ? "none" : `1px solid ${C.lineSoft}` }}
    >
      {/* Cột 1: nhãn field */}
      <div className="text-sm font-semibold pt-1.5" style={{ color: C.accentSoft }}>{label}</div>

      {/* Cột 2: English (editable) — auto-grow theo nội dung */}
      <textarea
        ref={taRef}
        value={enValue}
        onChange={(e) => { onChangeEn(k, e.target.value); autosize(e.target); }}
        rows={2}
        className="w-full text-sm rounded-lg px-2.5 py-1.5 leading-relaxed outline-none focus:ring-1 resize-none overflow-hidden"
        style={{ background: C.inputBg, border: `1px solid ${C.line}`, color: C.text, fontFamily: FONT }}
      />
    </div>
  );
}

// =============================================================
// SectionLabel — nhãn bước (số tròn + tiêu đề) để chia 3 bước rõ ràng.
// =============================================================
function StepLabel({ n, children, tight }) {
  return (
    <div className={`flex items-center gap-2.5 mb-3 ${tight ? "mt-2" : "mt-8"}`}>
      <span
        className="inline-flex items-center justify-center w-6 h-6 rounded-full text-[12px] font-bold shrink-0"
        style={{ background: C.accent, color: C.onAccent }}
      >
        {n}
      </span>
      <h2 className="text-[15px] font-bold tracking-tight" style={{ color: C.text, fontFamily: FONT }}>
        {children}
      </h2>
      <div className="flex-1 h-px" style={{ background: C.lineSoft }} />
    </div>
  );
}

export default function InteriorPromptAgent() {
  // ===== AUTH (đăng nhập theo tài khoản) =====
  const [authed, setAuthed] = useState(false);
  const [authReady, setAuthReady] = useState(false); // đã đọc xong token từ localStorage (tránh nháy màn login)
  const [userInput, setUserInput] = useState("");
  const [pwInput, setPwInput] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [authErr, setAuthErr] = useState(null);
  const [me, setMe] = useState(null); // { sub, adm } giải mã từ token

  // Khi mở app: lấy token sẵn có, còn hạn thì vào thẳng; hết hạn/ méo -> bỏ.
  useEffect(() => {
    try {
      const t = localStorage.getItem(AUTH_TOKEN_KEY);
      if (t && !isTokenExpired(t)) { setAuthed(true); setMe(decodeToken(t)); }
      else if (t) localStorage.removeItem(AUTH_TOKEN_KEY);
    } catch { /* localStorage bị chặn (chế độ riêng tư...) */ }
    setAuthReady(true);
  }, []);

  // Lấy token để đính vào header Authorization của các API call.
  function authToken() {
    try { return localStorage.getItem(AUTH_TOKEN_KEY) || ""; } catch { return ""; }
  }
  // Đăng xuất: xóa token, quay lại màn login. Gọi cả khi server trả 401.
  function logout() {
    try { localStorage.removeItem(AUTH_TOKEN_KEY); } catch { /* noop */ }
    setAuthed(false); setMe(null); setPwInput("");
    setCounts({ prompts: 0, images: 0 });
  }
  // Đăng nhập: POST { username, password } -> nhận token -> lưu localStorage.
  async function doLogin() {
    const username = userInput.trim();
    const pw = pwInput;
    if (!username || !pw) { setAuthErr("Nhập tài khoản và mật khẩu."); return; }
    setAuthBusy(true); setAuthErr(null);
    try {
      const r = await fetch(LOGIN_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password: pw }),
      });
      if (r.status === 401) { setAuthErr("Sai tài khoản hoặc mật khẩu."); return; }
      if (r.status === 403) { setAuthErr("Tài khoản đang được dùng ở 2 nơi khác (giới hạn 2 mạng/thiết bị). Dừng ở một nơi rồi thử lại, hoặc báo admin reset IP."); return; }
      if (!r.ok) { setAuthErr(`Lỗi đăng nhập (HTTP ${r.status}).`); return; }
      const j = await r.json().catch(() => null);
      if (!j?.token) { setAuthErr("Server không trả token. Kiểm tra api/login.js."); return; }
      try { localStorage.setItem(AUTH_TOKEN_KEY, j.token); } catch { /* noop */ }
      setPwInput(""); setUserInput("");
      setMe(decodeToken(j.token));
      setAuthed(true);
    } catch {
      setAuthErr("Không gọi được /api/login. Kiểm tra mạng hoặc deploy.");
    } finally {
      setAuthBusy(false);
    }
  }

  // ===== THỐNG KÊ (chỉ admin) =====
  const [showStats, setShowStats] = useState(false);
  const [statsRows, setStatsRows] = useState(null);
  const [statsBusy, setStatsBusy] = useState(false);
  const [statsErr, setStatsErr] = useState(null);
  async function openStats() {
    setShowStats(true); setStatsBusy(true); setStatsErr(null); setStatsRows(null);
    fetchUsage(); // đồng bộ badge header (tổng) khi mở bảng
    try {
      const r = await fetch(STATS_API_URL, { headers: { "Authorization": `Bearer ${authToken()}` } });
      if (r.status === 401) { logout(); return; }
      if (r.status === 403) { setStatsErr("Tài khoản này không có quyền xem thống kê."); return; }
      if (!r.ok) { setStatsErr(`Lỗi tải thống kê (HTTP ${r.status}).`); return; }
      const j = await r.json().catch(() => null);
      setStatsRows(Array.isArray(j?.users) ? j.users : []);
    } catch {
      setStatsErr("Không gọi được /api/stats.");
    } finally {
      setStatsBusy(false);
    }
  }

  // Lấy số liệu badge theo tài khoản. User thường -> của mình; admin -> TỔNG.
  async function fetchUsage() {
    try {
      const r = await fetch(USAGE_API_URL, { headers: { "Authorization": `Bearer ${authToken()}` } });
      if (r.status === 401) { logout(); return; }
      if (!r.ok) return;
      const j = await r.json().catch(() => null);
      if (!j) return;
      if (j.adm) setCounts({ prompts: j.totalPrompts || 0, images: j.totalImages || 0 });
      else setCounts({ prompts: j.prompts || 0, images: j.images || 0 });
    } catch { /* để badge giữ giá trị optimistic */ }
  }

  // Đồng bộ badge mỗi khi đăng nhập (authed bật lên).
  useEffect(() => {
    if (authed) fetchUsage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authed]);

  // Reset bộ đếm (admin). user=null -> reset tất cả; user="x" -> chỉ user đó.
  const [resetBusy, setResetBusy] = useState(false);
  async function resetCounters(user) {
    const label = user ? `tài khoản @${user}` : "TẤT CẢ tài khoản";
    if (!window.confirm(`Reset bộ đếm prompt và ảnh của ${label}? Không thể hoàn tác.`)) return;
    setResetBusy(true); setStatsErr(null);
    try {
      const r = await fetch(RESET_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken()}` },
        body: JSON.stringify(user ? { user } : {}),
      });
      if (r.status === 401) { logout(); return; }
      if (r.status === 403) { setStatsErr("Chỉ admin được reset."); return; }
      if (!r.ok) { setStatsErr(`Reset lỗi (HTTP ${r.status}).`); return; }
      await openStats();   // tải lại bảng thống kê
      await fetchUsage();  // đồng bộ lại badge header
    } catch {
      setStatsErr("Không gọi được /api/reset.");
    } finally {
      setResetBusy(false);
    }
  }

  // Reset IP (admin): nhả toàn bộ IP slot của 1 user — gỡ kẹt khi IP nhà đổi
  // (dynamic IP) khiến user thật bị chặn dù không hề share account.
  async function resetIp(user) {
    if (!window.confirm(`Reset giới hạn IP của @${user}? Mọi IP đã ghi nhận sẽ được nhả, user đăng nhập lại bình thường.`)) return;
    setResetBusy(true); setStatsErr(null);
    try {
      const r = await fetch(RESETIP_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken()}` },
        body: JSON.stringify({ user }),
      });
      if (r.status === 401) { logout(); return; }
      if (r.status === 403) { setStatsErr("Chỉ admin được reset IP."); return; }
      if (!r.ok) { setStatsErr(`Reset IP lỗi (HTTP ${r.status}).`); return; }
      await openStats();
    } catch {
      setStatsErr("Không gọi được /api/reset-ip.");
    } finally {
      setResetBusy(false);
    }
  }

  // 2 ảnh đầu vào
  const [styleImg, setStyleImg] = useState(null);
  const [modelImg, setModelImg] = useState(null);
  // imgDirty: ảnh STYLE/MODEL đã được nạp/đổi kể từ lần tạo prompt gần nhất.
  // Bật khi nạp ảnh, tắt khi takeSnapshot / restoreHistory / resetResults. Dùng
  // để BUỘC phân tích lại (analyze, kèm ảnh) thay vì rebuild text-only.
  const [imgDirty, setImgDirty] = useState(false);

  const [status, setStatus] = useState("idle"); // idle | analyzing | done | error
  const [analysis, setAnalysis] = useState(null);     // field EN
  // Khối "Điều Chỉnh Nâng Cao" (13 field analysis) — collapsible, MẶC ĐỊNH THU GỌN.
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [prompts, setPrompts] = useState(null);
  const [promptOpen, setPromptOpen] = useState(false); // prompt sau khi tạo: thu gọn mặc định, bấm "Xem" mới mở
  const [activeTab, setActiveTab] = useState("src"); // 4 tab: "src" Nguồn & phong cách | "cfg" Thiết lập & điều chỉnh | "result" Kết quả
  const [armAnalyze, setArmAnalyze] = useState(false); // xác nhận 2 chạm cho "Phân tích" (tốn token)
  const [isDesktop, setIsDesktop] = useState(false);   // >=768px: split-view (Kết quả cột phải luôn hiện)
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const fn = () => setIsDesktop(mq.matches);
    fn(); mq.addEventListener("change", fn);
    return () => mq.removeEventListener("change", fn);
  }, []);
  // Tab controls hiệu lực: trên desktop nếu activeTab="result" (từ mobile sang) thì coi như "src".
  const effectiveControlTab = (isDesktop && activeTab === "result") ? "src" : activeTab;
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(null);
  const [platform, setPlatform] = useState("nanobanana");
  // HAI TRỤC ĐIỀU KHIỂN độc lập (thay cho freedom đơn trục cũ).
  const [geometry, setGeometry] = useState(1);       // 0..3 — có model: khóa hình học; không model: kỷ luật không gian
  const [styleIntensity, setStyleIntensity] = useState(1); // 0..3 — luôn áp dụng
  const [sceneType, setSceneType] = useState("interior"); // (v31.3) "interior" | "exterior" — chọn bộ neo khóa hình
  // (v32.1) Nhãn field hiển thị theo sceneType: exterior dùng EXT_LABELS nếu có.
  const exLabel = (key, label) => (sceneType === "exterior" && EXT_LABELS[key]) ? EXT_LABELS[key] : label;
  // Preset style dùng khi không có ảnh STYLE (null = chưa chọn).
  const [stylePreset, setStylePreset] = useState(null);
  // Preset đang hover (để hiện mô tả chi tiết ở panel bên dưới mà không
  // làm các nút chip dài ra). null = không hover.
  const [presetHover, setPresetHover] = useState(null);
  // Ảnh preset đang phóng to (lightbox). null = đóng. Giữ cả object preset để hiện tên.
  const [zoomStyle, setZoomStyle] = useState(null);
  // ── STYLE BLEND (Hướng A): trộn 2 preset với tỷ lệ ──────────────
  // blendMode bật → ngoài stylePreset (style A / primary) còn dùng styleB
  // (secondary) + blendRatio (% của style A, 50..90). CHỈ áp khi KHÔNG có ảnh
  // STYLE (ảnh STYLE luôn ưu tiên & thay mọi preset). Blend được diễn đạt bằng
  // NGÔN NGỮ TRỌNG SỐ trong styleSourceNote → tự chảy vào cả Nano Banana lẫn MJ
  // và giữ kết quả là MỘT không gian thống nhất.
  const [blendMode, setBlendMode] = useState(false);
  const [styleB, setStyleB] = useState(null);        // id preset phụ (secondary)
  const [blendRatio, setBlendRatio] = useState(70);  // % của style A (primary)
  // 3 cải thiện: tỷ lệ khung + danh sách tránh.
  const [aspectRatio, setAspectRatio] = useState("16:9");
  const [negativePrompt, setNegativePrompt] = useState(DEFAULT_NEGATIVE);
  // Auto-grow ô Negative: chiều cao bám nội dung, cap 320px -> vượt mới scroll.
  const negRef = useRef(null);
  const fitNeg = (el) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px"; // giãn theo nội dung, không cap -> không bao giờ scroll
  };
  // Cập nhật chiều cao khi value đổi từ ngoài (đổi platform / khôi phục mặc định / gõ).
  useEffect(() => { fitNeg(negRef.current); }, [negativePrompt]);
  // LOẠI KHÔNG GIAN: roomSel = giá trị dropdown ("__custom__" = chế độ tự nhập,
  // là dòng đầu danh sách); customRoomText = nội dung khi tự nhập. Mặc định để
  // ở chế độ tự nhập với ô rỗng -> coi như KHÔNG áp loại không gian (tùy chọn).
  const [roomSel, setRoomSel] = useState("__custom__");
  const [customRoomText, setCustomRoomText] = useState("");
  // snapshot = giá trị các tham số render + BẢN CHỤP analysis TẠI THỜI ĐIỂM
  // prompt được tạo thành công. Banner so sánh state hiện tại với snapshot để
  // liệt kê CHÍNH XÁC field nào đã đổi (preset/trục1/trục2/tỉ lệ/nền tảng/
  // negative) kèm giá trị cũ→mới, VÀ những mục phân tích nào đã sửa tay.
  // Đây là so sánh client-side thuần, KHÔNG tốn token API. null = chưa có prompt.
  const [snapshot, setSnapshot] = useState(null);
  // rebuilding = true trong lúc gọi API sinh lại prompt từ analysis đã sửa.
  const [rebuilding, setRebuilding] = useState(false);
  // Bộ đếm số lần đã tạo prompt / tạo ảnh — lưu localStorage để tích lũy qua
  // nhiều phiên (B2). Đọc lazy lúc mount; ghi lại mỗi lần tăng (xem bumpCount).
  // Bộ đếm prompt/ảnh — lấy từ server theo TÀI KHOẢN (xem fetchUsage). Với
  // admin badge hiển thị TỔNG tất cả users. Khởi tạo 0, fetch sau khi đăng nhập.
  const [counts, setCounts] = useState({ prompts: 0, images: 0 });

  // Ảnh render từ gpt-image-2 (qua /api/generate-image). genImg = data URI
  // để review; genStatus = idle|generating|done|error. KHÔNG tốn token
  // Anthropic — đây là call OpenAI (tính phí trên tài khoản OpenAI riêng).
  const [genImg, setGenImg] = useState(null);
  const [genStatus, setGenStatus] = useState("idle");
  const [genError, setGenError] = useState(null);
  const [holdOrig, setHoldOrig] = useState(false); // hold-to-compare: giữ trên ảnh -> hiện ảnh MODEL gốc

  // =============================================================
  // THANH TIẾN TRÌNH (progress bar) — hiệu ứng "load game", CHẠY THUẦN
  // CLIENT, KHÔNG tốn token. Vì không biết trước API mất bao lâu, ta dùng kỹ
  // thuật ASYMPTOTIC: tăng nhanh lúc đầu rồi chậm dần, KẸT ở ~90% để chờ; khi
  // API thật trả về (hết busy) thì nhảy nốt lên 100% rồi ẩn. progress = 0..100.
  // =============================================================
  const [progress, setProgress] = useState(0);
  const [progressActive, setProgressActive] = useState(false);
  const progressTimer = useRef(null);
  const progressStart = useRef(0);

  // Agent đang gọi API? (phân tích ảnh HOẶC sinh lại prompt từ analysis)
  const agentBusy = status === "analyzing" || rebuilding;
  const genBusy = genStatus === "generating";          // tạo ảnh gpt-image đang chạy
  const anyBusy = agentBusy || genBusy;

  useEffect(() => {
    if (anyBusy) {
      // ETA (thời lượng kỳ vọng) khác nhau theo thao tác: PHÂN TÍCH ẢNH gửi kèm
      // ảnh + sinh nhiều field nên lâu hơn; CẬP NHẬT prompt là text-only nên
      // nhanh hơn. Thanh bò theo THỜI GIAN THỰC trôi qua so với ETA này -> khớp
      // tiến trình thật thay vì vọt nhanh. (Vẫn không phải % tuyệt đối.)
      const eta = status === "analyzing" ? 13000 : genBusy ? 22000 : 7000;
      progressStart.current = Date.now();
      setProgressActive(true);
      setProgress(4);
      if (progressTimer.current) clearInterval(progressTimer.current);
      progressTimer.current = setInterval(() => {
        const elapsed = Date.now() - progressStart.current;
        // Đường cong tiệm cận tới 90%: bò đều rồi chậm dần. Tại mốc ETA đạt
        // ~80%, sau đó tiến rất chậm về 90 và CHỜ API thật trả về.
        const pct = 90 * (1 - Math.exp((-2.2 * elapsed) / eta));
        setProgress(Math.min(90, Math.max(4, pct)));
      }, 100);
      return () => { if (progressTimer.current) clearInterval(progressTimer.current); };
    }
    // KẾT THÚC: dừng bơm, nhảy nốt 100% (chỉ khi đang có tiến trình) rồi ẩn.
    if (progressTimer.current) { clearInterval(progressTimer.current); progressTimer.current = null; }
    setProgress((p) => (p > 0 ? 100 : 0));
    const t = setTimeout(() => { setProgressActive(false); setProgress(0); }, 450);
    return () => clearTimeout(t);
  }, [anyBusy, status, genBusy]);

  // LỊCH SỬ PROMPT — lưu tối đa 8 phiên bản gần nhất (mới nhất ở đầu mảng).
  // Mỗi entry = { id, timeLabel, changes, prompts, analysis, params }:
  //  - changes: mảng pendingChanges đã áp dụng (rỗng ở lần tạo đầu tiên).
  //  - prompts: bản chụp { [platform]: promptString } để TÁI SỬ DỤNG.
  //  - analysis: bản chụp 13 field JSON tương ứng.
  //  - params: toàn bộ tham số render lúc đó (để khôi phục đầy đủ).
  // Tất cả là dữ liệu client-side thuần (không tốn token).
  const [history, setHistory] = useState([]);
  // entry id đang mở rộng để xem lại prompt + 13 field. null = không mở.
  const [expandedHistory, setExpandedHistory] = useState(null);
  const [histDetailOpen, setHistDetailOpen] = useState(null); // id item lịch sử đang mở phần prompt + analysis
  // Đẩy một bản ghi mới vào lịch sử; tự cắt còn 8 mục gần nhất. LƯU MỌI lần tạo
  // prompt thành công (kể cả lần đầu changes rỗng) miễn có prompt để dùng lại.
  function pushHistory(changes, record) {
    if (!record || !record.prompts) return;
    const entry = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      timeLabel: new Date().toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" }),
      dateLabel: (() => { const d = new Date(); return `${String(d.getDate()).padStart(2, "0")}-${d.getMonth() + 1}-${String(d.getFullYear()).slice(-2)}`; })(),
      changes: changes || [],
      prompts: record.prompts,
      analysis: record.analysis ? { ...record.analysis } : null,
      params: record.params || null,
      genImg: null, // ảnh gpt-image-2 (nếu có) được gắn sau qua renderImage()
    };
    setHistory((h) => [entry, ...h].slice(0, 8));
  }

  const styleRef = useRef(null);
  const modelRef = useRef(null);

  // Chụp snapshot tham số hiện tại + bản chụp analysis — gọi sau mỗi lần tạo
  // prompt thành công. analysisOverride dùng khi analysis vừa set chưa kịp
  // cập nhật vào closure (trường hợp analyze(): truyền parsed.analysis vào).
  function takeSnapshot(analysisOverride) {
    const a = analysisOverride ?? analysis;
    setSnapshot({ stylePreset, blendMode, styleB, blendRatio, geometry, styleIntensity, sceneType, aspectRatio, platform, negativePrompt, roomSel, customRoomText, analysis: a ? { ...a } : null });
    setImgDirty(false); // snapshot mới = ảnh hiện tại đã "khớp" với prompt vừa tạo.
  }

  // Gom toàn bộ tham số render hiện tại thành 1 object (dùng cho cả snapshot
  // lẫn lưu lịch sử). Giữ đúng bộ key mà snapshot/restore mong đợi.
  function currentParams() {
    return { stylePreset, blendMode, styleB, blendRatio, geometry, styleIntensity, sceneType, aspectRatio, platform, negativePrompt, roomSel, customRoomText };
  }

  // KHÔI PHỤC một mốc lịch sử: nạp lại prompt + 13 field analysis + toàn bộ
  // tham số render của phiên bản đó, rồi đồng bộ snapshot để banner "cần cập
  // nhật" không báo nhầm. => dùng lại dòng prompt cũ ngay lập tức.
  function restoreHistory(entry) {
    if (!entry) return;
    if (entry.prompts) setPrompts(entry.prompts);
    if (entry.analysis) setAnalysis({ ...entry.analysis });
    const pr = entry.params;
    if (pr) {
      setPlatform(pr.platform);
      setStylePreset(pr.stylePreset);
      setBlendMode(pr.blendMode);
      setStyleB(pr.styleB);
      setBlendRatio(pr.blendRatio);
      setGeometry(pr.geometry);
      setStyleIntensity(pr.styleIntensity);
      setSceneType(pr.sceneType ?? "interior");
      setAspectRatio(pr.aspectRatio);
      setNegativePrompt(pr.negativePrompt);
      setRoomSel(pr.roomSel);
      setCustomRoomText(pr.customRoomText);
      setSnapshot({ ...pr, analysis: entry.analysis ? { ...entry.analysis } : null });
    }
    setGenImg(entry.genImg || null);
    setGenStatus(entry.genImg ? "done" : "idle");
    setGenError(null);
    setImgDirty(false);
    setStatus("done");
  }

  // Handler cập nhật ô English. Bọc useCallback để giữ tham chiếu ổn định,
  // tránh AnalysisRow re-render thừa. Việc phát hiện "đã sửa" được derive khi
  // so sánh analysis với bản chụp trong snapshot (xem khối derive ở dưới).
  const handleChangeEn = useCallback((k, value) => {
    setAnalysis((prev) => ({ ...(prev || {}), [k]: value }));
  }, []);

  // Đổi các tham số render: chỉ cần set giá trị. Việc "có thay đổi cần cập nhật
  // hay không" được DERIVE bằng cách so sánh với snapshot lúc render (xem
  // pendingChanges bên dưới), nên KHÔNG cần đánh dấu cờ thủ công.
  function changePlatform(id) {
    setPlatform(id);
    // Đổi nền tảng -> nạp lại negative mặc định tương ứng (Nano Banana vs
    // Midjourney có cú pháp & nội dung negative khác nhau).
    if (NEGATIVE_BY_PLATFORM[id]) setNegativePrompt(NEGATIVE_BY_PLATFORM[id]);
  }
  function changeAspect(v) { setAspectRatio(v); }
  function changeNegative(v) { setNegativePrompt(v); }
  function changeGeometry(v) { setGeometry(v); }
  function changeStyleIntensity(v) { setStyleIntensity(v); }
  function changeRoomSel(v) { setRoomSel(v); }
  function changeRoomCustom(v) { setCustomRoomText(v); }

  // Đổi/bỏ STYLE PRESET. KHÔNG xóa kết quả đã tạo: prompt cũ vẫn có giá trị
  // (sinh từ preset của lần phân tích trước) và snapshot sẽ tự hiện chênh lệch
  // để user chủ động cập nhật.
  function changeStylePreset(id) {
    setStylePreset(id);
  }

  // ── Handlers blend ──
  function changeBlendMode(v) { setBlendMode(v); }
  function changeStyleB(id) { setStyleB(id); }
  function changeBlendRatio(v) { setBlendRatio(v); }

  // Tăng badge tại chỗ (optimistic) sau khi server đã +1. Server mới là nguồn
  // chuẩn; lần đăng nhập sau / mở Thống kê sẽ đồng bộ lại bằng fetchUsage.
  function bumpCount(key) {
    setCounts((c) => ({ ...c, [key]: (c[key] || 0) + 1 }));
  }

  // Diễn giải style intensity thành mô tả EN nhồi vào prompt.
  function styleIntensityClause() {
    return STYLE_INTENSITY_CLAUSES[styleIntensity];
  }

  // Thay các placeholder {{AR}} {{ARPHRASE}} {{NEG}} {{S}} bằng giá trị thực
  // (aspect ratio, mô tả AR câu chữ, negative prompt, giá trị --s của MJ).
  function fillPlaceholders(text) {
    const neg = (negativePrompt || "").trim() || NEGATIVE_BY_PLATFORM[platform] || DEFAULT_NEGATIVE;
    const sVal = STYLE_INTENSITY_TO_S[styleIntensity] ?? 250;
    return text
      .replaceAll("{{AR}}", aspectRatio)
      .replaceAll("{{ARPHRASE}}", ASPECT_PHRASE[aspectRatio] || `a ${aspectRatio} composition`)
      .replaceAll("{{NEG}}", neg)
      .replaceAll("{{S}}", String(sVal));
  }

  // Trọng số multi-prompt (::) cho style PHỤ khi blend trên Midjourney.
  // Primary luôn = 1 (mốc, ngang phần scene); secondary = ratioB / ratioA, làm
  // tròn 2 chữ số → dải 0.11 (90/10) … 1.0 (50/50). MJ chuẩn hóa theo TỶ LỆ
  // tương đối nên giữ primary ở 1 là đủ, không làm phần scene bị lép.
  function mjSecondaryWeight(ratioA) {
    const ratioB = 100 - ratioA;
    return Math.round((ratioB / ratioA) * 100) / 100;
  }

  // Sinh guide cho Midjourney có hỗ trợ IMAGE-REFERENCE:
  //  - Ảnh MODEL (nếu có) -> image-prompt đặt ĐẦU prompt (token <MODEL_IMAGE_URL>)
  //    + tham số --iw lấy từ Trục 1 (GEOMETRY_TO_IW) để chỉnh độ bám bố cục.
  //  - Ảnh STYLE (nếu có) -> --sref <STYLE_IMAGE_URL> (mượn phong cách).
  // Vì tool không host được ảnh, prompt chứa token placeholder để người dùng tự
  // thay bằng URL ảnh đã upload (kéo vào Discord/MJ web để lấy link).
  //  - BLEND 2 preset (không có ảnh STYLE) -> dùng MULTI-PROMPT WEIGHT (::) để
  //    MÃ HÓA tỷ lệ trộn THẬT thay vì chỉ tả bằng chữ (xem mjSecondaryWeight).
  function buildMidjourneyGuide() {
    const hasM = !!modelImg;
    const hasS = !!styleImg;
    const iw = GEOMETRY_TO_IW[geometry] ?? 1;

    const lead = hasM
      ? "BEGIN the prompt with the literal token <MODEL_IMAGE_URL> followed by a space — this is an image-prompt that anchors the composition and geometry (the user will paste their uploaded MODEL image URL there). "
      : "";
    let extraParams = "";
    if (hasM) extraParams += ` --iw ${iw}`;
    if (hasS) extraParams += " --sref <STYLE_IMAGE_URL>";
    const tokenNote = (hasM || hasS)
      ? " Output the placeholder token(s) (<MODEL_IMAGE_URL>, <STYLE_IMAGE_URL>) EXACTLY as written, do NOT fabricate real URLs."
      : "";

    // ── BLEND: mã hóa tỷ lệ bằng :: weight. Chỉ áp khi đang trộn 2 preset hợp
    // lệ và KHÔNG có ảnh STYLE (ảnh STYLE -> đã dùng --sref, không cần ::). ──
    const presetA = STYLE_PRESETS.find((p) => p.id === stylePreset) || null;
    const presetB = STYLE_PRESETS.find((p) => p.id === styleB) || null;
    const blendActive = blendMode && !hasS && !!presetA && !!presetB && presetB.id !== presetA.id;

    if (blendActive) {
      const wB = mjSecondaryWeight(blendRatio); // primary = 1, secondary = wB
      return `a Midjourney prompt that BLENDS TWO interior styles using MULTI-PROMPT WEIGHTING (the :: syntax), so the user's blend ratio is honoured by the renderer itself, not just described. ${lead}Build the prompt body as THREE :: parts on a SINGLE line, in this order:\n` +
        `• PART 1 — SCENE (weight 1): describe ONLY the subject, room type, spatial layout, camera angle, a lens cue suited to interiors such as '24mm wide-angle', and lighting direction/quality. Put NO style adjectives, materials or colour palette here. Close this part with a bare '::' (default weight 1).\n` +
        `• PART 2 — PRIMARY STYLE "${presetA.label}" (weight 1): use the exact comma-separated descriptors from the analysis field "blend_primary_keywords", then close it with '::1'.\n` +
        `• PART 3 — SECONDARY STYLE "${presetB.label}" (weight ${wB}): use the exact descriptors from the analysis field "blend_secondary_keywords", then close it with '::${wB}'.\n` +
        `The body therefore reads: <scene>:: <blend_primary_keywords>::1 <blend_secondary_keywords>::${wB}\n` +
        `Then append parameters in this exact order: --ar {{AR}} --style raw --s {{S}} --v 7${extraParams} --no {{NEG}}.${tokenNote} Output everything on ONE line. Every aesthetic descriptor MUST live in PART 2 or PART 3 (never PART 1) so the :: weights, not adjective counts, control the blend. The two keyword sets come from the analysis JSON, so any user edit to those fields must be reflected verbatim here.`;
    }

    return `a single-line Midjourney prompt written as a natural-language art-direction sentence (NOT a keyword list). ${lead}Lead the description with the primary subject, then style, materials, lighting, mood; add a lens cue suited to interiors such as '24mm wide-angle'. End the line with parameters in this exact order: --ar {{AR}} --style raw --s {{S}} --v 7${extraParams} --no {{NEG}}.${tokenNote}`;
  }

  // Sinh chỉ dẫn cho Nano Banana dựa trên TRỤC GEOMETRY kết hợp STYLE INTENSITY.
  // Các nền tảng khác dùng PLATFORM_GUIDE. Mọi nhánh đều đi qua fillPlaceholders
  // để chèn aspect ratio / negative / stylize đúng cú pháp từng nền tảng.
  function effectivePlatformGuide() {
    // Midjourney: luôn đi qua guide image-reference riêng.
    if (platform === "midjourney") {
      return fillPlaceholders(buildMidjourneyGuide());
    }
    // (v30) BLEND compose clause (gpt-image) — tính SỚM để dùng cho CẢ nhánh
    // không-model (PLATFORM_GUIDE) lẫn nhánh có-model. Gộp vào styleClause nên
    // cả 3 nhánh geometry tự mang directive trộn mà không phải sửa từng guide.
    const _pA = STYLE_PRESETS.find((p) => p.id === stylePreset) || null;
    const _pB = STYLE_PRESETS.find((p) => p.id === styleB) || null;
    const blendOn = blendMode && !styleImg && !!_pA && !!_pB && _pB.id !== _pA.id;
    const blendCl = blendOn ? blendComposeClause(blendRatio) : "";

    if (platform !== "nanobanana" || !modelImg) {
      return fillPlaceholders(PLATFORM_GUIDE[platform] + blendCl);
    }

    const styleClause = styleIntensityClause() + blendCl;
    // Nano Banana không có negative syntax -> luôn yêu cầu diễn đạt khẳng định.
    const negNote = "Compose it as {{ARPHRASE}}. Nano Banana has no negative-prompt syntax, so weave the avoid-list into positive phrasing (keep vertical lines perfectly straight and parallel, accurate undistorted perspective, no fisheye, no lens distortion, no perspective drift, no warped or leaning walls, clean uncluttered surfaces). Avoid: {{NEG}}.";

    const _extScene = sceneType === "exterior"; // (v31.3)
    let guide;
    if (geometry === 0) {
      guide = _extScene
        ? `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), NOT a scene-generation prompt and NOT using --params. Open with: 'Using the imported MODEL image (the building) as the exact base, do NOT change the camera angle, perspective, framing, vanishing lines, building massing, storey heights, rooflines, or the position of any facade plane, window or door.' Then state the styling goal: '${styleClause}' ${negNote} Keep the style description focused on cladding materials, palette, lighting and mood only. ${GEO_PRESERVE_CLAUSE_EXT} ${CONCISE_STYLE_CLAUSE} End with: 'Preserve the original composition and geometry precisely, including the exact massing and storey heights; this is a re-render of the same building, only photorealistic and finished.'`
        : `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), NOT a scene-generation prompt and NOT using --params. Open with: 'Using the imported image (the 3D model) as the exact base, do NOT change the camera angle, perspective, framing, vanishing lines, room proportions, ceiling height, wall heights, the overall vertical scale of the room, or the position of any walls, windows, doors, or furniture.' Then state the styling goal: '${styleClause}' ${negNote} Keep the style description focused on materials, palette, lighting and mood only. ${GEO_PRESERVE_CLAUSE} ${CONCISE_STYLE_CLAUSE} End with: 'Preserve the original composition and geometry precisely, including the exact ceiling height and vertical proportions; this is a re-render of the same room, only photorealistic and finished.'`;
    } else if (geometry === 3) {
      guide = _extScene
        ? `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), using the imported MODEL image (the building) as the base, NOT using --params. Open with: 'Using the imported MODEL image as the base, keep the camera vantage, perspective, framing and vanishing lines EXACTLY as in the MODEL — the same shot from the same viewpoint, no new angle, no reframe, no zoom.' This is the MOST OPEN level: rework facade surface treatments, AND on top of that you SHOULD actively and noticeably reshape the building's massing, rooflines, facade composition and architectural detailing — storey rhythm, fenestration pattern, cornices, columns, ornament — so the architecture visibly departs from the model (a deliberate redesign, not a near-copy), provided the building is always seen from that one identical fixed camera. Styling goal: '${styleClause}' ${negNote} ${GEO_CAMERA_LOCK_CLAUSE_EXT} ${CONCISE_STYLE_CLAUSE} End with: 'This is a re-render of the same building from the same fixed vantage, with its facade and architectural forms reimagined — photorealistic and finished.'`
        : `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), using the imported image (the 3D model) as the base, NOT using --params. Open with: 'Using the imported MODEL image as the base, keep the camera vantage, perspective, framing and vanishing lines EXACTLY as in the MODEL — the same shot from the same viewpoint, no new angle, no reframe, no zoom.' This is the MOST OPEN level: replace the furniture and rearrange it, swap decor and fixtures and rework surface treatments, AND on top of that you SHOULD actively and noticeably reshape the FORMS and architectural detailing of the room shell — wall, ceiling and floor shapes, proportion detailing and features such as arches, vaults, mouldings or panelling — so the architecture visibly departs from the model (a deliberate redesign, not a near-copy), provided the room is always seen from that one identical fixed camera. Styling goal: '${styleClause}' ${negNote} ${GEO_CAMERA_LOCK_CLAUSE} ${CONCISE_STYLE_CLAUSE} End with: 'This is a re-render of the same space from the same fixed vantage, with its furnishings and its architectural forms reimagined — photorealistic and finished.'`;
    } else {
      const allowed = (_extScene ? {
        1: "exterior light fixtures, signage and minor landscaping (keep the camera, facade planes, window and door openings, storey heights, and building massing fixed)",
        2: "the facade material language, architectural detailing and ornament (keep the camera angle, building massing, storey count and rooflines unchanged)",
      } : {
        1: "small decor items and light fixtures (keep the camera, walls, windows, ceiling height, room proportions, and overall composition fixed)",
        2: "furniture pieces, their arrangement, decor and fixtures (keep the camera angle, room proportions, and ceiling height unchanged)",
      })[geometry];
      guide = _extScene
        ? `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), NOT using --params. Open with: 'Using the imported MODEL image (the building) as the spatial base, keep its camera angle, perspective, building massing, storey heights, and overall composition.' Then specify what may change: 'You may replace ${allowed} so the building matches the target style.' Styling goal: '${styleClause}' ${negNote} ${GEO_PRESERVE_CLAUSE_EXT} ${CONCISE_STYLE_CLAUSE} End with: 'Produce a photorealistic, finished render of the same building reinterpreted with the target style, keeping the original massing and storey heights, with PBR materials and global illumination.'`
        : `an IMAGE EDITING / RESTYLE instruction for Nano Banana 2 (Gemini 3.1 Flash Image), NOT using --params. Open with: 'Using the imported image (the 3D model) as the spatial base, keep its camera angle, perspective, ceiling height, room proportions, and overall composition.' Then specify what may change: 'You may replace ${allowed} so the scene matches the target style.' Styling goal: '${styleClause}' ${negNote} ${GEO_PRESERVE_CLAUSE} ${CONCISE_STYLE_CLAUSE} End with: 'Produce a photorealistic, finished render of the same room reinterpreted with the target style, keeping the original ceiling height and vertical proportions, with PBR materials and global illumination.'`;
    }
    return fillPlaceholders(guide);
  }

  function readImage(file, setter) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError("Vui lòng chọn file ảnh (JPG, PNG, WEBP).");
      return;
    }
    setError(null);
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result;
      // Nén THÍCH ỨNG theo dung lượng: bắt đầu ở chất lượng cao nhất
      // (1568px / q0.92) và chỉ hạ dần khi base64 còn vượt mục tiêu ~1.5MB
      // mỗi ảnh. Nhờ vậy ảnh thường giữ chất lượng tối đa, còn ảnh quá nặng
      // được nén lại để tổng payload không vượt giới hạn API (tránh lỗi 413
      // → "không phải JSON" → "lỗi kết nối").
      const imgEl = new Image();
      imgEl.onload = () => {
        const TARGET = 1_500_000; // ~1.5MB base64 mỗi ảnh
        const configs = [
          { max: 1568, q: 0.92 },
          { max: 1568, q: 0.82 },
          { max: 1360, q: 0.80 },
          { max: 1200, q: 0.78 },
          { max: 1024, q: 0.75 },
          { max: 896,  q: 0.72 },
        ];
        let chosen = null;
        for (const cfg of configs) {
          let { width, height } = imgEl;
          if (Math.max(width, height) > cfg.max) {
            const r = cfg.max / Math.max(width, height);
            width = Math.round(width * r);
            height = Math.round(height * r);
          }
          const canvas = document.createElement("canvas");
          canvas.width = width;
          canvas.height = height;
          canvas.getContext("2d").drawImage(imgEl, 0, 0, width, height);
          const url = canvas.toDataURL("image/jpeg", cfg.q);
          const b64 = url.split(",")[1] || "";
          chosen = { url, b64, w: width, h: height }; // lưu kích thước để ước token ảnh
          if (b64.length <= TARGET) break; // đạt mục tiêu dung lượng -> dừng
        }
        const out = chosen.url;
        // w/h dùng để ước số token ảnh (Anthropic ≈ w*h/750) trong phần dự tính.
        setter({ data: chosen.b64, mediaType: "image/jpeg", preview: out, w: chosen.w, h: chosen.h });
        resetResults();
      };
      imgEl.onerror = () => {
        // Nếu không decode được qua canvas, dùng nguyên bản (kèm kích thước gốc nếu có).
        setter({ data: dataUrl.split(",")[1], mediaType: file.type, preview: dataUrl, w: imgEl.naturalWidth || 0, h: imgEl.naturalHeight || 0 });
        resetResults();
      };
      imgEl.src = dataUrl;
    };
    reader.readAsDataURL(file);
  }

  function resetResults() {
    setAnalysis(null);
    setPrompts(null);
    setSnapshot(null);
    setHistory([]);
    setExpandedHistory(null);
    setGenImg(null); setGenStatus("idle"); setGenError(null);
    setImgDirty(false);
    setStatus("idle");
  }

  // Setter dành riêng cho ô STYLE: khi nạp ảnh STYLE, tự xóa preset đang chọn
  // để tránh trạng thái "preset sống lại" sau này khi gỡ ảnh. Ảnh luôn ưu tiên.
  function setStyleImgClearPreset(img) {
    setStyleImg(img);
    if (img) { setStylePreset(null); setImgDirty(true); }
  }

  // Setter ảnh MODEL kèm đánh dấu imgDirty (ảnh MODEL nạp thẳng, không qua
  // wrapper xóa preset như STYLE). Dùng ở onChange/onDrop của ô MODEL.
  function setModelImgMark(img) {
    setModelImg(img);
    if (img) setImgDirty(true);
  }

  // Xóa ảnh STYLE -> mở khóa lại Style Preset. Reset input.value để có thể
  // chọn lại đúng file vừa xóa (trình duyệt không bắn onChange nếu value trùng).
  function clearStyleImg() {
    setStyleImg(null);
    if (styleRef.current) styleRef.current.value = "";
    resetResults();
  }
  function clearModelImg() {
    setModelImg(null);
    if (modelRef.current) modelRef.current.value = "";
    resetResults();
  }

  // Parse JSON bền: xử lý nhiều dạng output không hoàn hảo của model.
  // 1) parse thẳng. 2) bóc khối {...}. 3) bỏ trailing comma. 4) nếu JSON bị
  // CẮT CỤT (do chạm max_tokens) thì thử "vá": đóng chuỗi đang mở và bù các
  // ngoặc } ] còn thiếu rồi parse lại. Trả về object hoặc null.
  function parseJsonLoose(text) {
    if (!text) return null;
    const clean = text.replace(/```json|```/g, "").trim();

    const tryParse = (s) => { try { return JSON.parse(s); } catch { return undefined; } };

    // (1) parse thẳng
    let r = tryParse(clean);
    if (r !== undefined) return r;

    // (2) bóc từ { đầu tiên tới } cuối cùng
    const start = clean.indexOf("{");
    if (start === -1) return null;
    let body = clean.slice(start);
    const lastClose = body.lastIndexOf("}");
    if (lastClose !== -1) {
      r = tryParse(body.slice(0, lastClose + 1));
      if (r !== undefined) return r;
    }

    // (3) bỏ trailing comma trước } hoặc ]
    const noTrailing = body.replace(/,\s*([}\]])/g, "$1");
    r = tryParse(noTrailing);
    if (r !== undefined) return r;

    // (4) vá JSON bị cắt cụt: duyệt ký tự, theo dõi chuỗi/escape và stack
    // ngoặc. Thử HAI cách, ưu tiên cách ít can thiệp nhất.
    let inStr = false, esc = false;
    const stack = [];
    let lastSafe = -1; // vị trí sau một value/cặp hoàn chỉnh gần nhất
    for (let i = 0; i < body.length; i++) {
      const ch = body[i];
      if (esc) { esc = false; continue; }
      if (ch === "\\") { esc = true; continue; }
      if (ch === '"') { inStr = !inStr; if (!inStr) lastSafe = i; continue; }
      if (inStr) continue;
      if (ch === "{" || ch === "[") stack.push(ch === "{" ? "}" : "]");
      else if (ch === "}" || ch === "]") { stack.pop(); lastSafe = i; }
      else if (ch === ",") lastSafe = i - 1; // ngay trước dấu phẩy là an toàn
    }
    const closers = () => stack.slice().reverse().join("");

    // (4a) Đóng nguyên trạng: đóng chuỗi đang mở (nếu có) rồi bù ngoặc.
    // Xử lý được trường hợp cắt giữa một giá trị chuỗi.
    let asIs = body + (inStr ? '"' : "") + closers();
    r = tryParse(asIs);
    if (r !== undefined) return r;

    // (4b) Lùi về điểm an toàn, bỏ dấu phẩy/“key:” dở, rồi đóng ngoặc.
    if (lastSafe >= 0) {
      let cut = body.slice(0, lastSafe + 1).replace(/,\s*$/, "");
      r = tryParse(cut + closers());
      if (r !== undefined) return r;

      // (4c) Bỏ một "key" dở dang ở đuôi (vd ...,"mood": hoặc ...,"mood")
      // rồi bỏ dấu phẩy thừa và đóng ngoặc lại.
      const noDangling = cut.replace(/,?\s*"[^"]*"\s*:?\s*$/, "").replace(/,\s*$/, "");
      r = tryParse(noDangling + closers());
      if (r !== undefined) return r;
    }

    return null;
  }

  // Map lỗi tầng API -> thông báo tiếng Việt. Trả về true nếu có lỗi.
  function handleApiError(data) {
    if (!data || !data.error) return false;
    const t = data.error.type || "";
    if (t.includes("rate_limit")) {
      setError("Bị giới hạn tần suất (rate limit). Đợi ~30s rồi thử lại.");
    } else if (t.includes("overloaded")) {
      setError("Hệ thống đang quá tải. Thử lại sau giây lát.");
    } else {
      setError("Lỗi API: " + (data.error.message || t || "không xác định") + ". Thử lại.");
    }
    return true;
  }

  // Đọc response an toàn: đọc body MỘT lần dưới dạng text rồi mới parse JSON.
  // Trả về { data, errMsg }. Nhờ vậy lỗi "không phải JSON" (vd 413 payload quá
  // lớn trả HTML) không còn bị gộp nhầm thành "lỗi kết nối".
  async function readResponseSafe(response) {
    const status = response.status;
    let raw = "";
    try { raw = await response.text(); } catch { /* body rỗng */ }

    if (!response.ok) {
      // 401 = token thiếu/sai/hết hạn (do api/_auth.js từ chối). Đẩy về login.
      if (status === 401) {
        logout();
        return { data: null, errMsg: "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." };
      }
      if (status === 403) {
        return { data: null, errMsg: "Tài khoản đang được dùng ở 2 nơi khác (giới hạn 2 mạng/thiết bị). Dừng ở một nơi, hoặc báo admin reset IP." };
      }
      // Thử bóc JSON error chuẩn của Anthropic trước.
      try {
        const j = JSON.parse(raw);
        if (j && j.error) return { data: j, errMsg: null };
      } catch { /* không phải JSON */ }
      if (status === 413) return { data: null, errMsg: "Ảnh quá lớn so với giới hạn API (413). Thử ảnh nhẹ hơn — app đã tự nén nhưng ảnh này vẫn vượt mức." };
      if (status === 429) return { data: null, errMsg: "Bị giới hạn tần suất (429). Đợi ~30s rồi thử lại." };
      if (status >= 500) return { data: null, errMsg: `Máy chủ API đang lỗi (HTTP ${status}). Thử lại sau giây lát.` };
      return { data: null, errMsg: `Lỗi API (HTTP ${status}). Thử lại.` };
    }

    try {
      return { data: JSON.parse(raw), errMsg: null };
    } catch {
      return { data: null, errMsg: "API trả về dữ liệu không đọc được (không phải JSON). Thường do payload/ảnh quá lớn — thử lại hoặc dùng ảnh nhẹ hơn." };
    }
  }

  async function analyze(recordChanges) {
    const hasStyleImg = !!styleImg;
    const preset = STYLE_PRESETS.find((p) => p.id === stylePreset) || null;
    // Nguồn style hợp lệ: hoặc ảnh STYLE, hoặc preset đã chọn.
    if (!hasStyleImg && !preset) {
      setError("Cần nguồn phong cách: nạp ảnh STYLE mẫu hoặc chọn một preset bên dưới.");
      return;
    }
    setStatus("analyzing");
    setError(null);
    setAnalysis(null);
    setPrompts(null);
    setGenImg(null); setGenStatus("idle"); setGenError(null);

    const hasModel = !!modelImg;
    const isNano = platform === "nanobanana";

    // ----- HAI TRỤC: GEOMETRY LOCK + STYLE INTENSITY (helper chung) -----
    // geometryGuidance + intensityGuidance build từ buildAxisGuidance()
    // -> y hệt nguồn mà rebuildPrompt() dùng (hết cảnh "analyze có,
    // rebuild không").
    const { geometryGuidance, intensityGuidance } = buildAxisGuidance(geometry, styleIntensity, hasModel, sceneType);

    // ----- LOẠI KHÔNG GIAN (tùy chọn) -----
    // Neo chức năng phòng để model chọn đúng furniture/fixture/layout. Khi có
    // MODEL, ảnh vẫn được ưu tiên nếu nó rõ ràng là loại không gian khác.
    const roomEn = effectiveRoomTypeEn();
    const roomNote = roomEn
      ? (sceneType === "exterior"
        ? `\n\nBUILDING TYPE = "${roomEn}". Treat the subject as this kind of building and choose facade language, massing, exterior fixtures, ornament and landscaping appropriate to its function.${hasModel ? " However, if the MODEL image clearly depicts a different kind of building, the MODEL image takes priority." : ""}`
        : `\n\nSPACE TYPE = "${roomEn}". Treat the scene as this kind of space and choose furniture, fixtures, decor and layout appropriate to its function.${hasModel ? " However, if the MODEL image clearly depicts a different kind of space, the MODEL image takes priority." : ""}`)
      : "";

    // ----- NGUỒN STYLE: ảnh mẫu, preset đơn, hay BLEND 2 preset -----
    // Nếu dùng preset (không có ảnh STYLE), nhồi mô tả phong cách để model
    // "phân tích" như thể đó là ảnh tham chiếu. Khi bật blend & có style phụ
    // hợp lệ (khác style chính), nhồi mô tả TRỘN với trọng số rõ ràng.
    const presetB = STYLE_PRESETS.find((p) => p.id === styleB) || null;
    const blendActive = blendMode && !!preset && !!presetB && presetB.id !== preset.id;
    // MJ + blend: yêu cầu thêm 2 field keyword TÁCH RIÊNG để dựng PART 2/PART 3
    // của chuỗi ::. blendActive đã ngụ ý không có ảnh STYLE (nhánh ternary dưới).
    const mjBlend = platform === "midjourney" && blendActive && !hasStyleImg;
    const ratioB = 100 - blendRatio;
    // (v30) BLEND gpt-image active: 2 preset hợp lệ, KHÔNG ảnh STYLE, không MJ.
    // Quyết định việc thêm field kho accent vào JSON shape + rule.
    const blendAccentActive = blendActive && !hasStyleImg && !mjBlend;
    const styleSourceNote = hasStyleImg
      ? "The STYLE comes from the provided STYLE REFERENCE image."
      : blendActive
        ? `No STYLE image was provided. The TARGET STYLE is a deliberate fusion of TWO interior styles, but you MUST keep them SEPARATE in the analysis (the blend ratio is applied later at prompt-build time, not here):\n- PRIMARY style = "${preset.label} — ${preset.brief}"\n- SECONDARY style = "${presetB.label} — ${presetB.brief}"\nDerive the main analysis fields (style, color_palette, materials, lighting, mood, etc.) from the PRIMARY style. Then, SEPARATELY and in PARALLEL, derive a FULL secondary descriptor set from the SECONDARY style into the "blend_secondary_*" fields (palette, materials, lighting, mood, furniture, textures) — each a short comma-separated descriptor, NO subject/room/camera words. Keep the two sets SEPARATE (do NOT fuse the secondary into the main fields); the blend ratio later mixes the two symmetric sets at prompt-build time.`
        : `No STYLE image was provided. Use this TARGET STYLE description as the style source:\n"${preset.label} — ${preset.brief}"\nDerive every style-related analysis field from this description.`;

    // Vai trò ảnh, có xét tới việc có/không có ảnh STYLE.
    let roleNote;
    if (hasModel && hasStyleImg) {
      roleNote = `You are given TWO images:
- IMAGE 1 = STYLE REFERENCE. Use it ONLY to extract design style: materials, colors, lighting mood, finishes, decor, atmosphere. DO NOT copy its camera angle, framing, or room layout.
- IMAGE 2 = MODEL/BASE. Treat this as the spatial reference. How strictly you must follow it is set by the GEOMETRY LOCK below.${geometryGuidance}${intensityGuidance}`;
    } else if (hasModel && !hasStyleImg) {
      roleNote = `You are given ONE image = MODEL/BASE (the spatial reference). ${styleSourceNote} Apply that target style to the MODEL. How strictly you must follow the MODEL is set by the GEOMETRY LOCK below.${geometryGuidance}${intensityGuidance}`;
    } else if (!hasModel && hasStyleImg) {
      roleNote = `You are given ONE image = STYLE REFERENCE. Extract its design style. No model image is provided, so the spatial composition (camera, layout, proportions) is governed by the SPATIAL DISCIPLINE setting below.${geometryGuidance}${intensityGuidance}`;
    } else {
      roleNote = `No images are provided. ${styleSourceNote} The spatial composition (camera, layout, proportions) is governed by the SPATIAL DISCIPLINE setting below.${geometryGuidance}${intensityGuidance}`;
    }

    // (v32.0) Mô tả field analysis theo sceneType: exterior remap sang facade/massing.
    const _extScene = sceneType === "exterior";
    const fld = {
      ceiling_floor_walls: _extScene ? "roof, ground/podium and facade wall treatment" : "ceiling, flooring and wall treatment",
      materials: _extScene ? "key cladding & facade materials & finishes" : "key materials & finishes",
      furniture_style: _extScene ? "exterior elements (balconies, railings, pergolas, gates, outdoor furniture) and their stylistic language" : "furniture pieces & stylistic language",
      fixtures: _extScene ? "exterior fixtures: lanterns, wall sconces, signage and notable hardware" : "light fixtures & notable hardware",
      decor: _extScene ? "exterior ornament, reliefs, planters, landscaping and water features" : "decorative elements, art, textiles, plants",
      proportion_detailing: _extScene ? "massing proportions, storey rhythm, cornices, columns, mouldings and facade detailing" : "proportions, moldings, trims, detailing",
      lighting: _extScene ? "lighting type, direction, colour temperature, time of day and sky condition" : "lighting type, direction, color temperature",
      layout: hasModel ? (_extScene ? "site & massing layout from the MODEL image" : "spatial layout/geometry from the MODEL image") : "general suggested layout",
    };
    const instruction = `You are an expert ${_extScene ? "architecture & building-exterior" : "interior & architecture"} visualization analyst and an AI image-generation prompt engineer.

${roleNote}${roomNote}

${styleSourceNote}

Build ONE optimized RENDER prompt (in ENGLISH) for the target platform "${platform}", photorealistic, that (a) reproduces the TARGET STYLE and (b) ${hasModel ? "respects the GEOMETRY LOCK (locked items preserved, allowed items restyled) and STYLE INTENSITY" : "uses a neutral viewpoint and respects STYLE INTENSITY"}. The "prompt" field must use aspect ratio ${aspectRatio} and the avoid-list "${(negativePrompt || NEGATIVE_BY_PLATFORM[platform] || DEFAULT_NEGATIVE).trim()}", embedded exactly as the platform format below requires (do not drop them).

Return ONLY a valid JSON object, no markdown/backticks, with this exact shape:
{
  "analysis": {
    "style": "design style name + key descriptors",
    "color_palette": "dominant + accent colors",
    "materials": "${fld.materials}",
    "ceiling_floor_walls": "${fld.ceiling_floor_walls}",
    "textures": "surface textures",
    "furniture_style": "${fld.furniture_style}",
    "lighting": "${fld.lighting}",
    "fixtures": "${fld.fixtures}",
    "decor": "${fld.decor}",
    "proportion_detailing": "${fld.proportion_detailing}",
    "mood": "atmosphere & emotional tone",
    "camera": "${hasModel ? "camera/perspective/framing from the MODEL image" : "camera angle appropriate to the spatial discipline setting"}",
    "layout": "${fld.layout}"${mjBlend ? `,
    "blend_primary_keywords": "6-9 signature descriptors of the PRIMARY style ONLY (materials, palette, finishes, mood), comma-separated, NO subject/room/camera words",
    "blend_secondary_keywords": "5-7 signature descriptors of the SECONDARY style ONLY, comma-separated, NO subject/room/camera words"` : ""}${blendAccentActive ? `,
    "blend_secondary_palette": "dominant + accent colours of the SECONDARY style ONLY, comma-separated, NO subject/room/camera words",
    "blend_secondary_materials": "key materials & finishes of the SECONDARY style ONLY, comma-separated",
    "blend_secondary_lighting": "lighting type, direction & colour temperature characteristic of the SECONDARY style ONLY",
    "blend_secondary_mood": "atmosphere & emotional tone of the SECONDARY style ONLY",
    "blend_secondary_furniture": "signature furniture & decor pieces of the SECONDARY style ONLY, comma-separated",
    "blend_secondary_textures": "characteristic surface textures of the SECONDARY style ONLY, comma-separated"` : ""}
  },
  "prompt": "${effectivePlatformGuide()}"
}

Rules:
- "analysis" values and "prompt" MUST be in English. Fill EVERY analysis key shown above.${mjBlend ? " For \"blend_primary_keywords\" / \"blend_secondary_keywords\", keep each style's descriptors SEPARATE (do NOT merge them); these two sets feed the weighted :: parts of the Midjourney prompt." : ""}${blendAccentActive ? " Fill the \"blend_secondary_*\" fields as a COMPLETE parallel analysis of the SECONDARY style and keep them SEPARATE from the main fields (do NOT merge) — the two symmetric sets are mixed at prompt-build time per the BLEND COMPOSITION rule in the prompt instruction." : ""}
- ${hasModel ? "Viewpoint & layout come from the MODEL image." : "Viewpoint is neutral."} Style comes from the target style source above. Emphasize photorealistic quality (global illumination, PBR materials, accurate shadows). Do not invent elements off-style.
- Even if an image is low-res, blurry, dark, or a rough sketch/clay model, still infer the design and fill EVERY field with your best interpretation — never refuse or ask for a better image.
- Output the complete JSON only, nothing outside it.`;

    // Xây content. Chỉ đính kèm ảnh nào thực sự có.
    // Với Nano Banana + có cả 2 ảnh: MODEL trước (ảnh nền để edit), STYLE sau.
    let content = [];
    if (hasModel && hasStyleImg && isNano) {
      content.push({ type: "text", text: "IMAGE 1 (MODEL/BASE — this is the scene to edit; keep its geometry & camera per the GEOMETRY LOCK):" });
      content.push({ type: "image", source: { type: "base64", media_type: modelImg.mediaType, data: modelImg.data } });
      content.push({ type: "text", text: "IMAGE 2 (STYLE REFERENCE — borrow its materials, colors, lighting, mood):" });
      content.push({ type: "image", source: { type: "base64", media_type: styleImg.mediaType, data: styleImg.data } });
    } else {
      if (hasStyleImg) {
        content.push({ type: "text", text: hasModel ? "IMAGE (STYLE REFERENCE):" : "STYLE REFERENCE:" });
        content.push({ type: "image", source: { type: "base64", media_type: styleImg.mediaType, data: styleImg.data } });
      }
      if (hasModel) {
        content.push({ type: "text", text: hasStyleImg ? "IMAGE (MODEL/BASE — keep this viewpoint & layout):" : "IMAGE (MODEL/BASE — keep this viewpoint & layout; apply the target style described in the instruction):" });
        content.push({ type: "image", source: { type: "base64", media_type: modelImg.mediaType, data: modelImg.data } });
      }
    }
    content.push({ type: "text", text: instruction });

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken()}` },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 4096,
          messages: [{ role: "user", content }],
        }),
      });

      const { data, errMsg } = await readResponseSafe(response);
      if (errMsg) {
        setError(errMsg);
        setStatus("error");
        return;
      }

      if (handleApiError(data)) {
        setStatus("error");
        return;
      }

      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      if (!text) {
        setError("Model không trả về nội dung. Thử lại.");
        setStatus("error");
        return;
      }

      const parsed = parseJsonLoose(text);
      if (!parsed || !parsed.analysis) {
        setError("Kết quả trả về sai định dạng (không phải do ảnh). Bấm phân tích lại — thường lần 2 sẽ được.");
        setStatus("error");
        return;
      }

      setAnalysis(parsed.analysis);
      const builtPrompts = { [platform]: parsed.prompt || "" };
      setPrompts(builtPrompts);
      setPromptOpen(false); // tạo mới -> prompt thu gọn lại
      pushHistory(recordChanges, { prompts: builtPrompts, analysis: parsed.analysis, params: currentParams() });
      takeSnapshot(parsed.analysis);
      bumpCount("prompts"); // +1 mỗi lần tạo prompt (gồm cả analyze)
      setStatus("done");
    } catch (err) {
      console.error(err);
      setError("Lỗi kết nối khi gọi API. Kiểm tra mạng và thử lại.");
      setStatus("error");
    }
  }

  // Sinh lại PROMPT từ phần phân tích English mà user vừa chỉnh tay — KHÔNG
  // gửi lại ảnh, KHÔNG phân tích lại. Đây là API call text-only nên rất nhẹ.
  // Chỉ yêu cầu model trả về { "prompt": "..." } theo đúng format nền tảng.
  async function rebuildPrompt(recordChanges) {
    if (!analysis) return;
    setRebuilding(true);
    setError(null);
    setGenImg(null); setGenStatus("idle"); setGenError(null);

    const hasModel = !!modelImg;
    const allKeys = [...STYLE_KEYS.map(([k]) => k), ...MODEL_KEYS.map(([k]) => k)];
    // MJ + blend: kèm 2 field keyword riêng để PART 2/PART 3 của chuỗi :: lấy
    // đúng nguồn analysis (đã chỉnh tay), không bị kéo về brief tĩnh.
    const mjBlend = platform === "midjourney" && blendMode && !styleImg && !!stylePreset && !!styleB && styleB !== stylePreset;
    if (mjBlend) allKeys.push(...MJ_BLEND_KEYS.map(([k]) => k));
    // (v30) gpt-image BLEND: kho accent style PHỤ vào payload để compose theo
    // ratio HIỆN TẠI (effectivePlatformGuide đã chèn blendComposeClause). Pool
    // nằm trong analysis nên kéo slider rồi rebuild là re-allocate được ngay.
    const blendOn = blendMode && !styleImg && !!stylePreset && !!styleB && styleB !== stylePreset;
    if (blendOn && !mjBlend) allKeys.push(...BLEND_SECONDARY_KEYS.map(([k]) => k));
    const enPayload = {};
    allKeys.forEach((k) => { enPayload[k] = analysis[k] || ""; });

    // Loại không gian (nếu có) — neo lại chức năng phòng khi viết lại prompt.
    const roomEn = effectiveRoomTypeEn();
    const roomNote = roomEn
      ? ` The space is a ${roomEn}; keep furniture, fixtures and layout appropriate to that function.`
      : "";

    // Dùng CHUNG helper hai trục với analyze() -> rebuild cũng có đủ
    // GEOMETRY LOCK (LOCKED/MAY-CHANGE) + STYLE INTENSITY.
    const { geometryGuidance, intensityGuidance } = buildAxisGuidance(geometry, styleIntensity, hasModel, sceneType);

    // ƯU TIÊN FIELD SỬA TAY: các field người dùng tự sửa (lấy từ pendingChanges
    // qua recordChanges) phải giữ NGUYÊN VĂN, KHÔNG để STYLE INTENSITY co giãn.
    // Các field còn lại mới là style source được phép đẩy mạnh/nhẹ theo intensity.
    const editedKeys = (recordChanges || [])
      .map((c) => c && c.key)
      .filter((k) => typeof k === "string" && k.startsWith("analysis:"))
      .map((k) => k.slice(9)); // bỏ tiền tố "analysis:"
    const styleSourceDirective = editedKeys.length
      ? `Below is the ENGLISH analysis of an interior scene. The user HAND-EDITED these fields: ${editedKeys.join(", ")}. Treat those edited fields as USER-LOCKED: reproduce their content faithfully and exactly as written — do NOT soften, drop, merge or override them, whatever the STYLE INTENSITY is. Treat every OTHER field as the STYLE SOURCE: you may push its materials, colours, lighting and mood up or down to match the STYLE INTENSITY below instead of copying it literally.`
      : `Below is the (user-edited) ENGLISH analysis of an interior scene. Treat this analysis as the STYLE SOURCE, not a verbatim script: you SHOULD push its materials, colours, lighting and mood up or down to match the STYLE INTENSITY below instead of reproducing every field literally.`;

    // (v31) Khi blend: nhắc sonnet rằng các field "blend_secondary_*" là bộ phân
    // tích ĐẦY ĐỦ SONG SONG của style phụ -> trộn theo BLEND COMPOSITION trong format.
    const blendNote = (blendOn && !mjBlend)
      ? ` The "blend_secondary_*" fields are a COMPLETE parallel analysis of the SECONDARY style (its own palette, materials, lighting, mood, furniture, textures), kept separate from the main PRIMARY fields. Mix the two symmetric sets EXACTLY as directed by the BLEND COMPOSITION rule in the format instruction below.`
      : "";

    const instruction = `You are an AI image-generation prompt engineer for interior & architecture renders.

${styleSourceDirective}${blendNote} Whether the camera and spatial layout stay fixed or may be reinterpreted is decided ONLY by the GEOMETRY LOCK below — do NOT hard-lock the viewpoint on your own. Build ONE optimized ENGLISH render prompt for platform "${platform}". Format: ${effectivePlatformGuide()} Use aspect ratio ${aspectRatio} and avoid-list "${(negativePrompt || NEGATIVE_BY_PLATFORM[platform] || DEFAULT_NEGATIVE).trim()}", embedded as the format requires (do not drop them).${geometryGuidance}${intensityGuidance}${roomNote}

ANALYSIS (JSON):
${JSON.stringify(enPayload, null, 2)}

Return ONLY a valid JSON object (no markdown/backticks): {"prompt": "the English render prompt"}. Nothing outside the JSON.`;

    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken()}` },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 1500,
          messages: [{ role: "user", content: instruction }],
        }),
      });

      const { data, errMsg } = await readResponseSafe(response);
      if (errMsg) {
        setError(errMsg);
        setRebuilding(false);
        return;
      }

      if (handleApiError(data)) {
        setRebuilding(false);
        return;
      }

      const text = (data.content || [])
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("\n");

      const parsed = parseJsonLoose(text);
      if (!parsed || typeof parsed.prompt !== "string" || !parsed.prompt.trim()) {
        setError("Không lấy được prompt mới. Bấm 'Cập nhật prompt' lần nữa.");
        setRebuilding(false);
        return;
      }

      const builtPrompts = { [platform]: parsed.prompt };
      setPrompts(builtPrompts);
      setPromptOpen(false); // tạo mới -> prompt thu gọn lại
      pushHistory(recordChanges, { prompts: builtPrompts, analysis, params: currentParams() });
      takeSnapshot();
      bumpCount("prompts"); // +1 (A2: đếm cả lần "Cập nhật prompt")
      setRebuilding(false);
    } catch (err) {
      console.error(err);
      setError("Lỗi kết nối khi gọi API. Kiểm tra mạng và thử lại.");
      setRebuilding(false);
    }
  }

  // =============================================================
  // RENDER ẢNH bằng gpt-image-2 (OpenAI) qua proxy /api/generate-image.
  // Endpoint images/edits: gửi MODEL image làm ảnh nền (+ STYLE nếu có) kèm
  // CHÍNH prompt Nano Banana. Ảnh trả về base64 -> hiển thị bằng data URI.
  // LƯU Ý: 0 token Anthropic; chi phí tính trên tài khoản OpenAI (ảnh đắt hơn
  // text nhiều lần). Chỉ chạy khi có MODEL image (edits bắt buộc >=1 ảnh input).
  // =============================================================
  async function renderImage() {
    const prompt = prompts?.nanobanana;
    if (!prompt || !modelImg) return; // guard: cần prompt Nano Banana + MODEL
    setGenStatus("generating");
    setGenError(null);
    setHoldOrig(false); // tạo ảnh mới -> reset trạng thái so sánh

    // Mọi mức (0–3) đều render bằng images/edits: gửi MODEL (nền/geometry) + STYLE
    // làm pixel base, nên camera/perspective bị ghim cứng bằng pixel ảnh. Mức Mở
    // (geometry 3) giữ NGUYÊN camera, nới biến đổi vỏ phòng/kiến trúc bằng clause
    // chủ động trong prompt. (v31.2) Đã GỠ input_fidelity:"low" vì gpt-image-2
    // KHÔNG hỗ trợ param này (trả HTTP 400 invalid_input_fidelity_model).
    const generate = false;
    const images = [];
    if (!generate) {
      images.push({ data: modelImg.data, mediaType: modelImg.mediaType });
      if (styleImg) images.push({ data: styleImg.data, mediaType: styleImg.mediaType });
    }

    try {
      const response = await fetch(IMAGE_API_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${authToken()}` },
        // size: ép đúng tỷ lệ người dùng đã chọn (aspectRatio). Fallback "auto"
        // nếu tỷ lệ lạ không có trong map.
        // mode: "generate" -> proxy gọi images/generations; "edit" -> images/edits.
        body: JSON.stringify({ model: "gpt-image-2", prompt, images, size: AR_TO_SIZE[aspectRatio] || "auto", quality: "medium", mode: generate ? "generate" : "edit" }),
      });

      let raw = "";
      try { raw = await response.text(); } catch { /* body rỗng */ }
      if (response.status === 401) {
        logout();
        setGenError("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        setGenStatus("error");
        return;
      }
      if (response.status === 403) {
        setGenError("Tài khoản đang được dùng ở 2 nơi khác (giới hạn 2 mạng/thiết bị). Dừng ở một nơi, hoặc báo admin reset IP.");
        setGenStatus("error");
        return;
      }
      if (!response.ok) {
        setGenError(`Lỗi tạo ảnh (HTTP ${response.status}). ${raw.slice(0, 300)}`);
        setGenStatus("error");
        return;
      }
      let data = null;
      try { data = JSON.parse(raw); } catch { /* rơi xuống nhánh lỗi dưới */ }
      const b64 = data?.b64 || data?.data?.[0]?.b64_json || null;
      if (!b64) {
        setGenError("Proxy không trả về ảnh. Kiểm tra api/generate-image.js và OPENAI_API_KEY trên Vercel.");
        setGenStatus("error");
        return;
      }
      const dataUri = `data:image/png;base64,${b64}`;
      setGenImg(dataUri);
      setGenStatus("done");
      bumpCount("images"); // +1 mỗi lần tạo ảnh thành công
      // Gắn ảnh vào history entry mới nhất (entry tạo lúc sinh prompt hiện tại).
      setHistory((h) => (h.length ? [{ ...h[0], genImg: dataUri }, ...h.slice(1)] : h));
    } catch (err) {
      console.error(err);
      setGenError("Lỗi kết nối khi gọi API tạo ảnh. Kiểm tra mạng và thử lại.");
      setGenStatus("error");
    }
  }

  // Escape ký tự đặc biệt để chèn an toàn vào HTML (tránh vỡ layout / XSS).
  function escapeHtml(v) {
    return String(v ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // Tải xuống MỘT phiên bản history dưới dạng file HTML đẹp (.html).
  // 13 chủ đề analysis được TÔ MÀU accent + IN ĐẬM để dễ đọc; prompt nằm trong
  // khung mono dễ copy. File mở trực tiếp bằng browser, in ra giấy được luôn.
  function downloadHistoryItem(h, idx) {
    if (!h || !h.prompts) {
      setError("Phiên bản này chưa có prompt để tải.");
      setTimeout(() => setError(null), 2000);
      return;
    }

    const versionLabel = idx === 0 ? "Mới nhất" : `Lần ${history.length - idx}`;
    const platformLbl = h.params ? platformName(h.params.platform) : "—";
    const presetLbl = (() => {
      if (!h.params?.stylePreset) return h.params ? "Ảnh STYLE" : "—";
      const a = presetName(h.params.stylePreset);
      if (h.params.blendMode && h.params.styleB && h.params.styleB !== h.params.stylePreset) {
        const rA = h.params.blendRatio ?? 70;
        return `${a} × ${presetName(h.params.styleB)} (${rA}/${100 - rA})`;
      }
      return a;
    })();
    const geoLbl = h.params?.geometry != null ? (GEOMETRY_LEVELS[h.params.geometry]?.label || h.params.geometry) : "—";
    const intLbl = h.params?.styleIntensity != null ? (STYLE_INTENSITY_LEVELS[h.params.styleIntensity]?.short || h.params.styleIntensity) : "—";
    const arLbl = h.params?.aspectRatio || "—";

    // Map key analysis -> nhãn tiếng Việt (gộp cả STYLE_KEYS lẫn MODEL_KEYS).
    const labelMap = Object.fromEntries([...STYLE_KEYS, ...MODEL_KEYS, ...MJ_BLEND_KEYS, ...BLEND_SECONDARY_KEYS]);

    // (v30.1) Gom phân tích thành ĐÚNG các section + banner như app, cùng thứ tự.
    // Section blend chỉ hiện khi snapshot thật sự có key đó. Ghi chú mirror app
    // (lược phần thao tác "sửa ở đây" vì file xuất là tĩnh, chỉ để đọc).
    const A = h.analysis || {};
    const hasKeys = (keys) => keys.some(([k]) => A[k] != null && String(A[k]).trim() !== "");
    // (v32.2) Nhãn field exterior theo sceneType CỦA ENTRY (không theo state hiện tại).
    const _extEntry = h.params?.sceneType === "exterior";
    const exLbl = (k, label) => (_extEntry && EXT_LABELS[k]) ? EXT_LABELS[k] : label;
    const fieldsOf = (keys) => keys
      .filter(([k]) => A[k] != null && String(A[k]).trim() !== "")
      .map(([k, label]) => `
        <div class="field">
          <div class="field-key">${escapeHtml(exLbl(k, label))}</div>
          <div class="field-val">${escapeHtml(A[k])}</div>
        </div>`).join("");
    const section = (keys, banner, note) =>
      hasKeys(keys)
        ? `<h2 class="sec">${escapeHtml(banner)}</h2>${note ? `<p class="note">${escapeHtml(note)}</p>` : ""}${fieldsOf(keys)}`
        : "";
    const knownKeys = new Set([...STYLE_KEYS, ...MODEL_KEYS, ...MJ_BLEND_KEYS, ...BLEND_SECONDARY_KEYS].map(([k]) => k));
    const otherKeys = Object.keys(A)
      .filter((k) => !knownKeys.has(k) && String(A[k] ?? "").trim() !== "")
      .map((k) => [k, labelMap[k] || k.replace(/_/g, " ")]);
    const grouped =
      section(STYLE_KEYS, "Nội Dung Phân Tích", "") +
      section(MODEL_KEYS, "Góc nhìn & bố cục (giữ theo model)", "") +
      section(MJ_BLEND_KEYS, "Từ khóa trộn cho Midjourney (::)", "Mỗi bộ là từ khóa của một phong cách, giữ riêng (không hòa) để trọng số :: điều khiển tỷ lệ.") +
      section(BLEND_SECONDARY_KEYS, "Phân tích style phụ (blend)", "Bộ phân tích đầy đủ của style phụ (palette, ánh sáng, mood, vật liệu...), giữ riêng song song bộ chính. Tỷ lệ trộn quyết định mức nghiêng giữa hai style.") +
      (otherKeys.length ? `<h2 class="sec">Khác</h2>${fieldsOf(otherKeys)}` : "");
    const analysisHtml = (h.analysis && grouped)
      ? grouped
      : '<p class="muted">Không có dữ liệu phân tích.</p>';

    // Khối prompt: mỗi nền tảng 1 box mono.
    const promptsHtml = Object.entries(h.prompts).map(([pid, text]) => `
      <div class="prompt-block">
        <div class="prompt-label">Prompt · ${escapeHtml(platformName(pid))}</div>
        <pre class="prompt-text">${escapeHtml(text)}</pre>
      </div>`).join("");

    // Ảnh đã tạo (gpt-image-2) — genImg là data URI, nhúng thẳng vào HTML.
    const imageHtml = h.genImg
      ? `<h2>Ảnh đã tạo</h2><img class="genimg" src="${h.genImg}" alt="Anh AI tao">`
      : "";

    // Khối thay đổi đã áp dụng (nếu có).
    const changesHtml = (h.changes && h.changes.length > 0)
      ? `<ul class="changes">${h.changes.map((c) => {
          const detail = c.note ? escapeHtml(c.note) : `${escapeHtml(c.from)} → <strong>${escapeHtml(c.to)}</strong>`;
          return `<li><span class="ch-label">${escapeHtml(c.label)}:</span> ${detail}</li>`;
        }).join("")}</ul>`
      : '';

    const html = `<!DOCTYPE html>
<html lang="vi">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Interior Render Agent · ${escapeHtml(versionLabel)} · ${escapeHtml(h.timeLabel)}</title>
<style>
  :root{
    --bg:#0b0e13; --panel:#141922; --panel2:#1a212c; --inputBg:#0d1119;
    --line:#28303d; --lineSoft:#202733; --accent:#7aa2c4; --accentSoft:#aac6e0;
    --pos:#7cba9b; --neg:#cf9a8d; --text:#e9ecf1; --textDim:#8b94a3; --textFaint:#767f8e;
  }
  *{box-sizing:border-box;}
  body{
    margin:0; padding:32px 20px; background:var(--bg); color:var(--text);
    font-family:'Plus Jakarta Sans',system-ui,-apple-system,'Segoe UI',sans-serif;
    line-height:1.6; -webkit-font-smoothing:antialiased;
  }
  .wrap{max-width:820px; margin:0 auto;}
  header{border-bottom:1px solid var(--line); padding-bottom:16px; margin-bottom:24px;}
  h1{font-size:20px; margin:0 0 8px; color:var(--text);}
  h1 .accent{color:var(--accent);}
  .meta{display:flex; flex-wrap:wrap; gap:8px; font-size:12px; color:var(--textDim);}
  .badge{
    display:inline-flex; align-items:center; gap:4px; padding:3px 10px;
    border:1px solid var(--line); border-radius:999px; background:var(--panel2);
    color:var(--accentSoft); font-size:11px;
  }
  h2{
    font-size:13px; text-transform:uppercase; letter-spacing:.08em;
    color:var(--accentSoft); margin:28px 0 12px; font-weight:700;
  }
  .params{
    display:grid; grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
    gap:10px; margin-bottom:8px;
  }
  .param{
    background:var(--panel); border:1px solid var(--lineSoft);
    border-radius:10px; padding:10px 12px;
  }
  .param .p-key{font-size:10px; text-transform:uppercase; letter-spacing:.06em; color:var(--textFaint);}
  .param .p-val{font-size:14px; color:var(--accentSoft); font-weight:600; margin-top:2px;}
  /* 13 CHỦ ĐỀ: key in đậm + tô màu accent để dễ nhìn */
  .field{
    background:var(--panel); border:1px solid var(--lineSoft);
    border-left:3px solid var(--accent); border-radius:8px;
    padding:10px 14px; margin-bottom:8px;
  }
  .field-key{
    font-weight:700; color:var(--accent); font-size:13px;
    text-transform:capitalize; margin-bottom:3px; letter-spacing:.01em;
  }
  .field-val{color:var(--text); font-size:14px;}
  .prompt-block{margin-bottom:16px;}
  .prompt-label{
    font-size:11px; text-transform:uppercase; letter-spacing:.06em;
    color:var(--accentSoft); font-weight:600; margin-bottom:6px;
  }
  .prompt-text{
    background:var(--inputBg); border:1px solid var(--lineSoft); border-radius:10px;
    padding:14px; margin:0; white-space:pre-wrap; word-break:break-word;
    font-family:'JetBrains Mono',ui-monospace,SFMono-Regular,Menlo,monospace;
    font-size:12.5px; line-height:1.6; color:#ccd6e2;
  }
  .changes{margin:0; padding-left:18px;}
  .changes li{margin-bottom:4px; font-size:13px; color:var(--text);}
  .ch-label{color:var(--textDim);}
  .changes strong{color:var(--accentSoft);}
  .muted{color:var(--textFaint); font-size:13px; font-style:italic;}
  /* (v30.1) Banner phân tích — khớp app: KHÔNG uppercase, title-case, đậm */
  .sec{ font-size:14px; text-transform:none; letter-spacing:0; color:var(--text); font-weight:700; margin:24px 0 6px; }
  .note{ font-size:12px; color:var(--textDim); margin:0 0 8px; line-height:1.5; }
  footer{
    margin-top:36px; padding-top:16px; border-top:1px solid var(--lineSoft);
    text-align:center; font-size:11px; color:var(--textFaint);
  }
  footer a{color:var(--accent); text-decoration:none;}
  .genimg{max-width:100%; height:auto; border-radius:10px; border:1px solid var(--line); margin:8px 0;}
  @media print{ body{background:#fff; color:#111;} .field,.param,.prompt-text{background:#f5f7fa;} }
</style>
</head>
<body>
  <div class="wrap">
    <header>
      <h1>Interior Render Agent <span class="accent">· ${escapeHtml(versionLabel)}</span></h1>
      <div class="meta">
        <span class="badge">🕒 ${escapeHtml(h.timeLabel)}</span>
        <span class="badge">🖥 ${escapeHtml(platformLbl)}</span>
        <span class="badge">🎨 ${escapeHtml(presetLbl)}</span>
      </div>
    </header>

    <h2>Tham số render</h2>
    <div class="params">
      <div class="param"><div class="p-key">Geometry Lock</div><div class="p-val">${escapeHtml(geoLbl)}</div></div>
      <div class="param"><div class="p-key">Style Intensity</div><div class="p-val">${escapeHtml(intLbl)}</div></div>
      <div class="param"><div class="p-key">Aspect Ratio</div><div class="p-val">${escapeHtml(arLbl)}</div></div>
    </div>

    <h2>Thay đổi đã áp dụng</h2>
    ${changesHtml}

    ${imageHtml}

    <h2>Prompt render (English)</h2>
    ${promptsHtml}

    ${analysisHtml}

    <footer>
      Xuất từ <strong>Interior Render Agent</strong> · ${escapeHtml(new Date().toLocaleString("vi-VN"))}<br>
      Sản phẩm thuộc <a href="https://artius.vn/" target="_blank" rel="noopener noreferrer">CÔNG TY THIẾT KẾ VÀ XÂY DỰNG ARTIUS</a>
    </footer>
  </div>
</body>
</html>`;

    const blob = new Blob([html], { type: "text/html;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    // Tên file: phiên bản + thời gian (thay : thành - cho hợp lệ trên Windows).
    const safeTime = (h.timeLabel || "").replace(/[:\s]/g, "-");
    link.download = `interior-prompt-${idx === 0 ? "latest" : "v" + (history.length - idx)}-${safeTime}.html`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  }

  function copy(key, value) {
    const fallback = () => {
      const ta = document.createElement("textarea");
      ta.value = value;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      try { document.execCommand("copy"); } catch (e) { console.error(e); }
      document.body.removeChild(ta);
    };
    // navigator.clipboard là đường đi chính; chỉ fallback khi không khả dụng
    // hoặc bị reject (ví dụ trong iframe không có quyền).
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(value).catch(fallback);
    } else {
      fallback();
    }
    setCopied(key);
    setTimeout(() => setCopied(null), 1500);
  }

  const hasModel = !!modelImg;
  // MJ image-reference mode: chọn Midjourney + có ảnh MODEL -> Trục 1 điều
  // khiển image weight (--iw) thay vì khóa hình học kiểu Nano Banana.
  const mjImageRef = platform === "midjourney" && hasModel;
  // MJ + blend đang áp đủ 2 preset (không ảnh STYLE): khi đó analysis mang thêm
  // 2 field keyword riêng (MJ_BLEND_KEYS) -> render + so sánh pendingChanges.
  const mjBlendNow = platform === "midjourney" && blendMode && !styleImg && !!stylePreset && !!styleB && styleB !== stylePreset;
  // (v30) gpt-image BLEND đang áp đủ 2 preset (không ảnh STYLE): analysis mang
  // thêm field kho accent (BLEND_SECONDARY_KEYS) -> render editor + so sánh pending.
  const blendAccentNow = blendMode && !styleImg && !!stylePreset && !!styleB && styleB !== stylePreset && !mjBlendNow;
  const canAnalyze = (styleImg || stylePreset) && status !== "analyzing";

  // Cụm EN loại không gian hiện hành (rỗng = không áp). Dùng cho instruction
  // và để so sánh với snapshot.
  const effectiveRoomTypeEn = () => roomEnFrom(roomSel, customRoomText);

  // ----- DERIVE: những thay đổi đang chờ cập nhật (so với snapshot) -----
  // So sánh client-side thuần (không tốn token API). Mỗi phần tử mô tả 1 field
  // đã đổi để banner liệt kê CHÍNH XÁC. `from`/`to` cho dạng "cũ → mới";
  // `note` cho field dạng văn bản dài (negative) chỉ ghi "đã chỉnh sửa".
  const presetName = (id) => STYLE_PRESETS.find((p) => p.id === id)?.label || "(không dùng preset)";
  const platformName = (id) => PLATFORMS.find((p) => p.id === id)?.label || id;
  const pendingChanges = [];
  if (snapshot) {
    // Chỉ coi là "đổi preset cần cập nhật" khi VẪN còn nguồn style để phân tích
    // lại (preset mới, hoặc ảnh STYLE).
    if (snapshot.stylePreset !== stylePreset && (stylePreset || styleImg))
      pendingChanges.push({ key: "preset", label: "Preset", from: presetName(snapshot.stylePreset), to: presetName(stylePreset) });
    // Blend: mô tả trạng thái trộn hiện tại vs snapshot (chỉ khi dùng preset).
    const blendDesc = (mode, a, b, r) => (mode && b && b !== a)
      ? `${presetName(a)} ${r}% × ${presetName(b)} ${100 - r}%` : "(không trộn)";
    const blendNow = !styleImg ? blendDesc(blendMode, stylePreset, styleB, blendRatio) : "(không trộn)";
    const blendSnap = blendDesc(snapshot.blendMode, snapshot.stylePreset, snapshot.styleB, snapshot.blendRatio);
    if (blendNow !== blendSnap && (stylePreset || styleImg))
      pendingChanges.push({ key: "blend", label: "Trộn phong cách", from: blendSnap, to: blendNow });
    if (snapshot.platform !== platform)
      pendingChanges.push({ key: "platform", label: "Nền tảng AI", from: platformName(snapshot.platform), to: platformName(platform) });
    if (snapshot.aspectRatio !== aspectRatio)
      pendingChanges.push({ key: "aspect", label: "Tỉ lệ khung", from: snapshot.aspectRatio, to: aspectRatio });
    // Trục 1 nay luôn có tác dụng (có model = khóa theo model; không model =
    // kỷ luật không gian), nên đổi mức luôn được ghi nhận.
    if (snapshot.geometry !== geometry)
      pendingChanges.push({ key: "geometry", label: mjImageRef ? "Image weight (--iw)" : hasModel ? "Khóa hình học" : "Kỷ luật không gian", from: GEOMETRY_LEVELS[snapshot.geometry]?.label, to: GEOMETRY_LEVELS[geometry]?.label });
    if (snapshot.styleIntensity !== styleIntensity)
      pendingChanges.push({ key: "intensity", label: "Độ mạnh áp style", from: STYLE_INTENSITY_LEVELS[snapshot.styleIntensity]?.short, to: STYLE_INTENSITY_LEVELS[styleIntensity]?.short });
    if (snapshot.negativePrompt !== negativePrompt)
      pendingChanges.push({ key: "negative", label: "Negative prompt", note: "đã chỉnh sửa" });
    // Loại không gian: so sánh cụm EN hiệu lực (bỏ qua khác biệt chỉ ở UI).
    if (roomEnFrom(snapshot.roomSel, snapshot.customRoomText) !== effectiveRoomTypeEn())
      pendingChanges.push({ key: "room", label: "Loại không gian", from: roomLabelFrom(snapshot.roomSel, snapshot.customRoomText), to: roomLabelFrom(roomSel, customRoomText) });
  }
  // So sánh từng field analysis (style + model) với bản chụp trong snapshot.
  // Mỗi mục đã sửa tay được đẩy thành MỘT pendingChange riêng -> banner hiển
  // thị mỗi mục trên một dòng (vd "Phân tích · Phong cách: đã sửa tay"),
  // thay vì gộp tất cả vào một dòng mô tả dài.
  if (snapshot && snapshot.analysis && analysis) {
    const cmpKeys = mjBlendNow ? [...STYLE_KEYS, ...MODEL_KEYS, ...MJ_BLEND_KEYS]
      : blendAccentNow ? [...STYLE_KEYS, ...MODEL_KEYS, ...BLEND_SECONDARY_KEYS]
      : [...STYLE_KEYS, ...MODEL_KEYS];
    cmpKeys.forEach(([k, label]) => {
      if ((analysis[k] || "") !== (snapshot.analysis[k] || ""))
        pendingChanges.push({ key: `analysis:${k}`, label, note: "đã sửa tay" });
    });
  }

  // Đổi preset HOẶC đổi loại không gian => nên PHÂN TÍCH LẠI (analyze) để model
  // nhìn lại ảnh và điền furniture/layout đúng loại phòng. Các thay đổi còn lại
  // => rebuild (text-only, rẻ). needsReanalyze quyết định nhánh + ghi chú/màu.
  // Ảnh tham chiếu đã đổi/nạp lại kể từ lần tạo prompt -> coi là một thay đổi
  // đang chờ, và buộc phân tích lại (analyze, kèm ảnh) thay vì rebuild text-only.
  if (prompts && imgDirty)
    pendingChanges.push({ key: "image", label: "Ảnh tham chiếu", note: "đã đổi/nạp lại ảnh" });

  const presetChanged = !!snapshot && snapshot.stylePreset !== stylePreset && (stylePreset || styleImg);
  const roomChanged = !!snapshot && roomEnFrom(snapshot.roomSel, snapshot.customRoomText) !== effectiveRoomTypeEn();
  // (v30) Đổi BẬT/TẮT blend hoặc đổi style PHỤ (B) -> kho accent cũ không còn
  // đúng -> buộc analyze lại để sinh kho mới. Chỉ kéo blendRatio (A,B giữ
  // nguyên) thì KHÔNG vào đây -> đi rebuild (re-allocate từ kho sẵn có).
  const blendStructChanged = !!snapshot && !!stylePreset && !styleImg &&
    (snapshot.blendMode !== blendMode || snapshot.styleB !== styleB);
  const needsReanalyze = presetChanged || roomChanged || blendStructChanged || (prompts && imgDirty);
  const hasPending = pendingChanges.length > 0;
  const updateBusy = rebuilding || status === "analyzing";
  // Ghi chú chi phí: analyze có gửi ảnh nếu đang có ảnh; rebuild luôn text-only.
  const costNote = needsReanalyze
    ? (styleImg || modelImg ? "Lần này sẽ phân tích lại (có gửi lại ảnh)." : "Không kèm ảnh nên lần này là text-only, rất nhanh & rẻ.")
    : "API text-only, không gửi lại ảnh nên rất nhanh & rẻ.";

  // ----- NÚT HÀNH ĐỘNG dùng chung (mobile: trong thanh tab · desktop: trong cột Kết quả) -----
  const actionBtnReAnalyze = !prompts || needsReanalyze;
  const actionBtnBusy = status === "analyzing" || updateBusy;
  const actionBtnArmed = !isDesktop && armAnalyze && actionBtnReAnalyze; // mobile: "Phân tích" cần xác nhận 2 chạm · DESKTOP: bỏ
  const actionBtnDisabled = actionBtnBusy || (actionBtnReAnalyze ? !canAnalyze : !hasPending);
  const runActionBtn = () => {
    const goResult = () => { if (!isDesktop) setActiveTab("result"); }; // desktop: Kết quả luôn hiện sẵn
    if (actionBtnReAnalyze) {
      if (isDesktop) { analyze(prompts ? pendingChanges : undefined); goResult(); } // DESKTOP: 1 chạm, không cần xác nhận
      else if (armAnalyze) { setArmAnalyze(false); analyze(prompts ? pendingChanges : undefined); goResult(); }
      else { setArmAnalyze(true); setTimeout(() => setArmAnalyze(false), 3000); } // mobile: chờ xác nhận, tự hủy 3s
    } else { rebuildPrompt(pendingChanges); goResult(); } // Cập nhật rẻ -> 1 chạm
  };
  const actionBtnBg = actionBtnArmed ? C.neg : (actionBtnReAnalyze ? C.accent : C.pos);
  const actionButton = (
    <button
      onClick={runActionBtn}
      disabled={actionBtnDisabled}
      className="w-full inline-flex items-center justify-center gap-2 rounded-xl px-4 h-12 font-bold transition-all duration-200 disabled:opacity-40"
      style={{ background: actionBtnBg, color: C.onAccent, boxShadow: `0 8px 22px -10px ${actionBtnBg}` }}
    >
      {actionBtnBusy
        ? (<><Loader2 className="w-5 h-5 animate-spin" /> {actionBtnReAnalyze ? "Đang phân tích..." : "Đang cập nhật..."}</>)
        : actionBtnArmed
          ? (<><AlertCircle className="w-5 h-5" /> Bấm lần nữa để xác nhận</>)
          : actionBtnReAnalyze
            ? (<><ImageIcon className="w-5 h-5" /> Phân tích &amp; Tạo prompt</>)
            : (<><RefreshCw className="w-5 h-5" /> Cập nhật thay đổi</>)}
    </button>
  );

  // (Đã gỡ phần dự tính token — thay bằng bộ đếm prompt/ảnh ở badge.)

  // Style nút active dùng chung — nền PHẲNG accent, chữ tối. Tinh gọn.
  const activeBtn = {
    background: C.accent,
    border: `1px solid ${C.accent}`,
    boxShadow: `0 4px 16px -8px ${C.accent}`,
  };
  const idleBtn = { background: C.panel2, border: `1px solid ${C.line}`, boxShadow: "none" };
  // Chip phong cách PHỤ (blend): accent pha loãng ~50% so với chip chính.
  const activeBtnSecondary = {
    background: `color-mix(in srgb, ${C.accent} 42%, ${C.panel2})`,
    border: `1px solid ${C.accent}`,
    boxShadow: "none",
  };

  // ----- 3 phần tử header dùng chung cho cả 2 layout (desktop & mobile) -----
  // Desktop: trái = tiêu đề, phải = cột(logo trên, badge dưới).
  // Mobile : dọc & căn giữa = logo trên cùng → tiêu đề → badge dưới cùng.
  const logoEl = (
    <img
      src={ARTIUS_LOGO}
      alt="ARTIUS — Beyond Design and Build"
      className="h-12 sm:h-14 w-auto"
      style={{ filter: `drop-shadow(0 6px 18px ${C.accent}44)`, opacity: 0.95 }}
    />
  );
  const titleEl = (
    <div className="flex items-center gap-2.5 sm:gap-3.5 min-w-0 w-full sm:w-auto">
      <div
        className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{ background: `linear-gradient(145deg, ${C.accent}, ${C.accentDeep})`, boxShadow: `0 8px 22px -10px ${C.accent}` }}
      >
        <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: C.onAccent }} aria-hidden="true" />
      </div>
      <div>
        <h1 className="text-xl sm:text-2xl md:text-3xl leading-none font-extrabold tracking-tight whitespace-nowrap" style={{ color: C.accent }}>
          Interior Render <span style={{ color: C.accent }}>Agent</span>
        </h1>
        <p className="text-[10px] sm:text-sm mt-1.5 whitespace-nowrap" style={{ color: C.text }}>Chỉ dùng để tìm ý tưởng - không nên hiệu chỉnh chi tiết</p>
      </div>
    </div>
  );
  // Badge bộ đếm — số lần đã tạo prompt / tạo ảnh. Tích lũy qua localStorage (B2),
  // cộng cả "Cập nhật prompt" vào số prompt (A2).
  const badgeEl = (
    <div
      className="rounded-xl px-3 py-1.5 text-xs leading-tight"
      style={{ background: `${C.panel}ee`, border: `1px solid ${C.accent}55`, color: C.text, fontFamily: MONO }}
      title={me?.adm
        ? `TỔNG tất cả tài khoản: ${counts.prompts.toLocaleString()} prompt · ${counts.images.toLocaleString()} ảnh.`
        : `Tài khoản @${me?.sub || ""}: ${counts.prompts.toLocaleString()} prompt · ${counts.images.toLocaleString()} ảnh (tích lũy).`}
    >
      <div className="flex items-center gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-0.5" style={{ color: C.accentSoft }}>Prompt</div>
          <div style={{ color: C.text }}>{counts.prompts.toLocaleString()}</div>
        </div>
        <div className="w-px self-stretch" style={{ background: C.line }} />
        <div>
          <div className="text-[11px] uppercase tracking-[0.16em] mb-0.5" style={{ color: C.accentSoft }}>Ảnh</div>
          <div style={{ color: C.text }}>{counts.images.toLocaleString()}</div>
        </div>
      </div>
    </div>
  );

  // Nút đăng xuất nhỏ, đặt ở header.
  const logoutEl = (
    <div className="flex items-center gap-2">
      {me?.sub && (
        <span
          className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
          style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.textDim }}
          title={me.adm ? "Tài khoản admin" : "Tài khoản"}
        >
          <span style={{ color: C.accent, fontWeight: 700 }}>@{me.sub}</span>
          {me.adm ? <span style={{ color: C.textDim }}>· admin</span> : null}
        </span>
      )}
      {me?.adm ? (
        <button
          onClick={openStats}
          title="Xem thống kê sử dụng"
          className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 transition"
          style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.accentSoft }}
        >
          <History className="w-3.5 h-3.5" aria-hidden="true" /> Thống kê
        </button>
      ) : null}
      <button
        onClick={logout}
        title="Đăng xuất"
        className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5 transition"
        style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.textDim }}
      >
        <X className="w-3.5 h-3.5" aria-hidden="true" /> Đăng xuất
      </button>
    </div>
  );

  // ===== MODAL THỐNG KÊ (admin) =====
  const statsModalEl = showStats ? (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: "rgba(0,0,0,0.6)" }}
      onClick={() => setShowStats(false)}
    >
      <div
        className="w-full max-w-3xl rounded-2xl p-5 ipa-scroll"
        style={{ background: C.panel, border: `1px solid ${C.line}`, maxHeight: "85vh", overflowY: "auto" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-extrabold flex items-center gap-2" style={{ color: C.accent }}>
            <History className="w-4 h-4" aria-hidden="true" /> Thống kê sử dụng
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={() => resetCounters(null)}
              disabled={resetBusy || statsBusy}
              title="Reset bộ đếm prompt + ảnh cho tất cả tài khoản"
              className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
              style={{ background: `${C.neg}22`, border: `1px solid ${C.neg}66`, color: C.neg, opacity: resetBusy ? 0.6 : 1 }}
            >
              <RotateCcw className={`w-3.5 h-3.5 ${resetBusy ? "animate-spin" : ""}`} aria-hidden="true" /> Reset tất cả
            </button>
            <button
              onClick={openStats}
              disabled={statsBusy}
              title="Tải lại"
              className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
              style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.textDim }}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${statsBusy ? "animate-spin" : ""}`} aria-hidden="true" /> Tải lại
            </button>
            <button
              onClick={() => setShowStats(false)}
              className="rounded-lg px-2.5 py-1.5 text-[11px] flex items-center gap-1.5"
              style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.textDim }}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" /> Đóng
            </button>
          </div>
        </div>

        {statsBusy && !statsRows && (
          <div className="text-sm flex items-center gap-2 py-6 justify-center" style={{ color: C.textDim }}>
            <Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang tải…
          </div>
        )}
        {statsErr && (
          <div className="flex items-center gap-1.5 text-xs py-3" style={{ color: C.neg }}>
            <AlertCircle className="w-3.5 h-3.5" aria-hidden="true" /> {statsErr}
          </div>
        )}
        {statsRows && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" style={{ borderCollapse: "collapse" }}>
              <thead>
                <tr style={{ color: C.textDim, textAlign: "left" }}>
                  <th className="py-2 pr-3 font-semibold">Tài khoản</th>
                  <th className="py-2 px-3 font-semibold" style={{ textAlign: "right" }}>Prompt</th>
                  <th className="py-2 px-3 font-semibold" style={{ textAlign: "right" }}>Ảnh</th>
                  <th className="py-2 px-3 font-semibold" style={{ textAlign: "right" }}>Lần ĐN</th>
                  <th className="py-2 px-3 font-semibold">Đăng nhập gần nhất</th>
                  <th className="py-2 pl-3 font-semibold">IP gần nhất</th>
                  <th className="py-2 pl-3 font-semibold" style={{ textAlign: "right" }}></th>
                </tr>
              </thead>
              <tbody>
                {statsRows.length === 0 && (
                  <tr><td colSpan={7} className="py-4 text-center" style={{ color: C.textDim }}>Chưa có dữ liệu.</td></tr>
                )}
                {statsRows.map((u) => (
                  <tr key={u.user} style={{ borderTop: `1px solid ${C.line}` }}>
                    <td className="py-2 pr-3" style={{ color: C.accent, fontWeight: 700 }}>@{u.user}</td>
                    <td className="py-2 px-3" style={{ textAlign: "right", color: C.text }}>{u.prompts}</td>
                    <td className="py-2 px-3" style={{ textAlign: "right", color: C.text }}>{u.images}</td>
                    <td className="py-2 px-3" style={{ textAlign: "right", color: C.textDim }}>{u.logins}</td>
                    <td className="py-2 px-3" style={{ color: C.textDim }}>
                      {u.lastLogin ? new Date(u.lastLogin).toLocaleString("vi-VN") : "—"}
                    </td>
                    <td className="py-2 pl-3" style={{ color: C.textDim, fontFamily: MONO, fontSize: 12 }}>{u.lastIp || "—"}</td>
                    <td className="py-2 pl-3" style={{ textAlign: "right" }}>
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => resetIp(u.user)}
                          disabled={resetBusy}
                          title={`Reset giới hạn IP của @${u.user} (gỡ kẹt khi IP đổi)`}
                          className="rounded-lg px-2 py-1 inline-flex items-center text-[11px] font-semibold"
                          style={{ background: `${C.accent}1a`, border: `1px solid ${C.accent}55`, color: C.accent }}
                        >
                          IP
                        </button>
                        <button
                          onClick={() => resetCounters(u.user)}
                          disabled={resetBusy}
                          title={`Reset bộ đếm của @${u.user}`}
                          className="rounded-lg px-2 py-1 inline-flex items-center"
                          style={{ background: `${C.neg}1a`, border: `1px solid ${C.neg}55`, color: C.neg }}
                        >
                          <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-[11px] mt-3" style={{ color: C.textDim }}>
              "Prompt" = số lần gọi tạo prompt thành công · "Ảnh" = số ảnh tạo thành công. Cộng dồn theo thời gian.
            </p>
          </div>
        )}
      </div>
    </div>
  ) : null;

  // ===== CỔNG ĐĂNG NHẬP =====
  // authReady=false: chưa đọc xong localStorage -> render nền trống để khỏi nháy.
  if (!authReady) {
    return <div style={{ minHeight: "100vh", background: C.bg }} />;
  }
  // Chưa đăng nhập -> chỉ render màn login, KHÔNG render app.
  if (!authed) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-4"
        style={{ background: `radial-gradient(120% 75% at 50% -8%, ${C.bgGrad} 0%, ${C.bg} 55%)`, color: C.text, fontFamily: FONT }}
      >
        <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />
        <div
          className="w-full max-w-sm rounded-2xl p-7"
          style={{ background: C.panel, border: `1px solid ${C.line}`, boxShadow: "0 24px 64px -24px #000" }}
        >
          <div className="flex flex-col items-center text-center mb-6">
            <img src={ARTIUS_LOGO} alt="ARTIUS" className="h-12 w-auto mb-5" style={{ opacity: 0.95 }} />
            <h1 className="text-xl font-extrabold tracking-tight" style={{ color: C.accent }}>Interior Render Agent</h1>
            <p className="text-xs mt-1.5" style={{ color: C.textDim }}>Công cụ nội bộ ARTIUS — đăng nhập bằng tài khoản</p>
          </div>

          <label className="block text-[11px] uppercase tracking-[0.16em] mb-1.5" style={{ color: C.accentSoft }}>Tài khoản</label>
          <input
            type="text"
            value={userInput}
            onChange={(e) => { setUserInput(e.target.value); if (authErr) setAuthErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !authBusy) doLogin(); }}
            autoFocus
            autoComplete="username"
            placeholder="Tên đăng nhập"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none mb-3"
            style={{ background: C.inputBg, border: `1px solid ${authErr ? C.neg : C.line}`, color: C.text }}
          />

          <label className="block text-[11px] uppercase tracking-[0.16em] mb-1.5" style={{ color: C.accentSoft }}>Mật khẩu</label>
          <input
            type="password"
            value={pwInput}
            onChange={(e) => { setPwInput(e.target.value); if (authErr) setAuthErr(null); }}
            onKeyDown={(e) => { if (e.key === "Enter" && !authBusy) doLogin(); }}
            autoComplete="current-password"
            placeholder="Mật khẩu"
            className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
            style={{ background: C.inputBg, border: `1px solid ${authErr ? C.neg : C.line}`, color: C.text }}
          />
          {authErr && (
            <div className="flex items-center gap-1.5 mt-2 text-xs" style={{ color: C.neg }}>
              <AlertCircle className="w-3.5 h-3.5 shrink-0" aria-hidden="true" /> {authErr}
            </div>
          )}
          <button
            onClick={doLogin}
            disabled={authBusy}
            className="w-full mt-4 rounded-xl py-2.5 text-sm font-semibold flex items-center justify-center gap-2 transition"
            style={{ background: `linear-gradient(145deg, ${C.accent}, ${C.accentDeep})`, color: C.onAccent, opacity: authBusy ? 0.6 : 1, cursor: authBusy ? "default" : "pointer" }}
          >
            {authBusy ? (<><Loader2 className="w-4 h-4 animate-spin" aria-hidden="true" /> Đang kiểm tra…</>) : "Đăng nhập"}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen p-4 md:p-8" style={{ background: `radial-gradient(120% 75% at 50% -8%, ${C.bgGrad} 0%, ${C.bg} 55%)`, color: C.text, fontFamily: FONT, overflowX: "clip" }}>
      {statsModalEl}
      {/* Nạp font sans + mono (Plus Jakarta Sans hỗ trợ tiếng Việt) */}
      <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Micro-interaction: fade-up nhẹ khi khu kết quả xuất hiện */}
      <style>{`
        @keyframes ipa-fade-up { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: none; } }
        .ipa-anim { animation: ipa-fade-up .35s ease both; }
        @keyframes ipa-glow { 0%,100% { box-shadow: 0 0 14px -3px ${C.accent}, 0 0 5px -1px ${C.accent}; } 50% { box-shadow: 0 0 24px -1px ${C.accent}, 0 0 10px 0 ${C.accent}; } }
        .ipa-glow { animation: ipa-glow 1.8s ease-in-out infinite; }
        .ipa-scroll { scrollbar-width: thin; scrollbar-color: ${C.accent} ${C.panel2}; }
        .ipa-scroll::-webkit-scrollbar { width: 8px; }
        .ipa-scroll::-webkit-scrollbar-track { background: ${C.panel2}; border-radius: 999px; }
        .ipa-scroll::-webkit-scrollbar-thumb { background: ${C.accent}; border-radius: 999px; }
        .ipa-scroll::-webkit-scrollbar-thumb:hover { background: ${C.accentSoft}; }
        @keyframes ipa-shimmer { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
        .ipa-skel { background: linear-gradient(90deg, ${C.panel2} 25%, ${C.line} 37%, ${C.panel2} 63%); background-size: 200% 100%; animation: ipa-shimmer 1.4s ease-in-out infinite; }
        textarea, input, button { font-family: inherit; }
        *:focus-visible { outline: 2px solid ${C.accent}; outline-offset: 2px; }
        /* === Layout 2 cột desktop — CSS thuần, không phụ thuộc Tailwind JIT === */
        .ipa-grid { margin-top: 1rem; }
        .ipa-col-left, .ipa-col-right { min-width: 0; }
        @media (min-width: 768px) {
          .ipa-grid { display: grid; grid-template-columns: 7fr 5fr; gap: 1rem; align-items: stretch; }
          .ipa-col-left, .ipa-col-right { display: block !important; }
          .ipa-col-right {
            padding-left: 1rem; border-left: 1px solid ${C.line};
          }
          .ipa-img-sticky { position: sticky; top: 0.5rem; z-index: 5; }
        }
      `}</style>

      <div className="w-full max-w-[1536px] mx-auto">
        {/* ===== Header — DESKTOP (md+) : trái = tiêu đề + badge dưới · phải = logo + logout ===== */}
        <div className="hidden md:flex items-start justify-between gap-3 mb-2 pt-2">
          <div className="flex flex-col items-start gap-4">
            {titleEl}
            {badgeEl}
          </div>
          <div className="flex flex-col items-end gap-5 shrink-0">
            {logoEl}
            {logoutEl}
          </div>
        </div>

        {/* ===== Header — MOBILE (<md) : dọc · logo → tiêu đề → (badge trái · logout phải) ===== */}
        <div className="flex md:hidden flex-col items-center gap-5 mb-2 pt-3">
          <div className="mb-7">{logoEl}</div>
          {titleEl}
          <div className="w-full flex items-center justify-between gap-2">
            {badgeEl}
            {logoutEl}
          </div>
        </div>


        {/* =====================================================
            BỐ CỤC CHÍNH: 1 cột dọc — cấu hình (các bước) rồi tới kết quả.
            (Đã bỏ bố cục 2 cột; nay thống nhất 1 cột ở mọi kích thước.)
        ====================================================== */}
        <div className="ipa-grid">

          {/* ===== CỘT TRÁI: thanh tab + nút + controls (Nguồn & phong cách / Thiết lập & điều chỉnh) ===== */}
          {/* Cột trái LUÔN hiện (kể cả khi xem Kết quả trên mobile) để thanh tab không biến mất.
              Nội dung src/cfg tự ẩn theo effectiveControlTab. */}
          <div className="ipa-col-left">

        {/* ===== P1: THANH TAB (sticky) — Thiết lập | Kết quả ===== */}
        <div className="py-2 mb-2">
          <div className={`grid items-stretch ${isDesktop ? "grid-cols-2" : "grid-cols-3"} gap-1.5 rounded-xl p-1`} style={{ background: C.panel2, border: `1px solid ${C.line}` }}>
            {[{ id: "src", l1: "Nguồn ảnh", l2: "& phong cách" }, { id: "cfg", l1: "Thiết lập", l2: "& điều chỉnh" }, { id: "result", l1: "Kết quả", l2: "" }]
              .filter((t) => !(isDesktop && t.id === "result")) // desktop: Kết quả là cột riêng -> ẩn nút tab
              .map((t) => {
              const on = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  onClick={() => setActiveTab(t.id)}
                  className="relative flex h-full items-center justify-center rounded-lg px-2 py-2 text-xs sm:text-sm font-semibold leading-tight transition-all duration-200"
                  style={on
                    ? { background: C.accent, color: C.onAccent, boxShadow: `0 6px 18px -8px ${C.accent}` }
                    : { background: "transparent", color: C.textDim }}
                >
                  <span className="text-center">{t.l1}{t.l2 ? (<><span className="hidden md:inline"> </span><br className="md:hidden" />{t.l2}</>) : null}</span>
                  {t.id === "result" && !on && (prompts || genImg) && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full align-middle" style={{ background: C.accent }} />
                  )}
                </button>
              );
            })}
          </div>

          {/* NÚT HÀNH ĐỘNG — "ô thứ 4" của thanh tab, kiểu KHÁC HẲN 3 tab (full-width, solid)
              để phân biệt. Tự đổi nhãn: chưa có prompt / cần phân tích lại -> "Phân tích &
              Tạo prompt"; chỉ đổi tham số nhẹ -> "Cập nhật thay đổi". Bấm xong nhảy tab Kết quả. */}
          {/* NÚT HÀNH ĐỘNG — chỉ MOBILE ở thanh tab; desktop chuyển sang cột Kết quả */}
          <div className="md:hidden mt-3 pt-3" style={{ borderTop: `1px solid ${C.line}` }}>
            {actionButton}
          </div>

          {/* LỖI (global) */}
          {error && (
            <div className="mt-2 flex items-start gap-2 rounded-xl p-3 text-sm" style={{ background: "#2a1a18", border: `1px solid #5e3b35`, color: "#e8b9b0" }}>
              <AlertCircle className="w-5 h-5 shrink-0" /> {error}
            </div>
          )}
        </div>

          {/* TAB 1: NGUỒN & PHONG CÁCH */}
          {effectiveControlTab === "src" && (
          <div>
            {/* ===== BƯỚC 1: NGUỒN ẢNH & PHONG CÁCH ===== */}
            <StepLabel n={1} tight>Nguồn ảnh &amp; phong cách</StepLabel>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <UploadBox
                img={styleImg}
                onClick={() => styleRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); readImage(e.dataTransfer.files?.[0], setStyleImgClearPreset); }}
                inputRef={styleRef}
                onChange={(e) => readImage(e.target.files?.[0], setStyleImgClearPreset)}
                onClear={clearStyleImg}
                icon={<Palette className="w-6 h-6" style={{ color: C.accent }} />}
                title="Ảnh STYLE"
                subtitle={<>Nạp ảnh để tham chiếu<br />hoặc dùng style preset nhanh</>}
                active={!!styleImg}
              />
              <UploadBox
                img={modelImg}
                onClick={() => modelRef.current?.click()}
                onDrop={(e) => { e.preventDefault(); readImage(e.dataTransfer.files?.[0], setModelImgMark); }}
                inputRef={modelRef}
                onChange={(e) => readImage(e.target.files?.[0], setModelImgMark)}
                onClear={clearModelImg}
                icon={<Box className="w-6 h-6" style={{ color: C.textDim }} />}
                title="Ảnh MODEL"
                subtitle="Nạp ảnh cần áp style lên đối tượng"
                active={!!modelImg}
              />
            </div>
            {/* LOẠI KHÔNG GIAN — dropdown sổ xuống; DÒNG ĐẦU là chế độ tự nhập.
                Tùy chọn: để ô tự nhập rỗng = không áp loại không gian. */}
            <div className="mt-4 flex flex-col md:flex-row gap-4">
              <div className="flex-1 rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <div className="flex items-center gap-2 mb-1">
                <Home className="w-4 h-4" style={{ color: C.accent }} />
                <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: C.accentSoft }}>
                  Loại không gian
                </p>
              </div>
              <p className="text-xs mb-3" style={{ color: C.textDim }}>
                Chọn loại không gian để Agent tạo prompt đúng nội thất, vật liệu &amp; bố cục.
              </p>

              <select
                value={roomSel}
                onChange={(e) => changeRoomSel(e.target.value)}
                className="w-full text-sm rounded-lg px-3 py-2.5 outline-none focus:ring-1 cursor-pointer"
                style={{ background: C.inputBg, border: `1px solid ${C.line}`, color: C.text, fontFamily: FONT }}
              >
                {/* DÒNG ĐẦU: tự nhập */}
                <option value="__custom__">✍️ Tự nhập loại không gian…</option>
                {ROOM_TYPES.map((r) => (
                  <option key={r.value} value={r.value}>{r.label}</option>
                ))}
              </select>

              {roomSel === "__custom__" && (
                <input
                  type="text"
                  value={customRoomText}
                  onChange={(e) => changeRoomCustom(e.target.value)}
                  placeholder="Ví dụ: phòng yoga, tiệm cắt tóc, phòng thờ, spa…"
                  className="w-full mt-2 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1"
                  style={{ background: C.inputBg, border: `1px solid ${C.line}`, color: C.text, fontFamily: FONT }}
                />
              )}

              {effectiveRoomTypeEn() && (
                <p className="text-[11px] mt-2" style={{ color: C.accentSoft }}>
                  Không gian: <strong>{effectiveRoomTypeEn()}</strong>
                  {hasModel && <span style={{ color: C.textDim }}> · ảnh MODEL vẫn được ưu tiên nếu rõ ràng là loại khác.</span>}
                </p>
              )}
              </div>
              {/* (v32.3) Banner LOẠI HÌNH: Nội thất / Kiến trúc — đổi bộ neo khóa hình & thuật ngữ */}
              <div className="flex-1 rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="w-4 h-4" style={{ color: C.accent }} />
                  <p className="text-xs font-bold uppercase tracking-[0.14em]" style={{ color: C.accentSoft }}>
                    Loại hình
                  </p>
                </div>
                <p className="text-xs mb-3" style={{ color: C.textDim }}>
                  Chọn Nội thất hay Kiến trúc để Agent dùng đúng bộ neo khóa hình &amp; thuật ngữ phân tích.
                </p>
                <div className="flex gap-1.5">
                  {[["interior", "Nội thất"], ["exterior", "Kiến trúc"]].map(([val, lbl]) => {
                    const on = sceneType === val;
                    return (
                      <button key={val} type="button" onClick={() => setSceneType(val)}
                        className="flex-1 text-xs font-semibold rounded-lg py-1.5 transition-colors"
                        style={{ background: on ? C.accent : C.panel2, color: on ? "#fff" : C.textDim, border: `1px solid ${on ? C.accent : C.lineSoft}` }}>
                        {lbl}
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* STYLE PRESETS — gom theo nhóm. Khi đã nạp ảnh STYLE thì mờ + khóa. */}
            <div
              className="mt-4 rounded-2xl p-4 transition-opacity"
              style={{ background: C.panel, border: `1px solid ${C.line}`, opacity: styleImg ? 0.5 : 1 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <Layers className="w-4 h-4" style={{ color: C.accent }} />
                <p className="text-xs font-bold uppercase tracking-normal sm:tracking-[0.14em] whitespace-nowrap shrink-0" style={{ color: C.accentSoft }}>
                  Style preset nhanh
                </p>
                <button
                  onClick={() => !styleImg && changeBlendMode(!blendMode)}
                  disabled={!!styleImg}
                  title="Bật để TRỘN 2 phong cách: click chọn style chính, rồi click thêm 1 style nữa làm phụ"
                  className="flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-all ml-auto shrink-0 whitespace-nowrap"
                  style={{ ...(blendMode ? activeBtn : idleBtn), cursor: styleImg ? "not-allowed" : "pointer", opacity: styleImg ? 0.5 : 1 }}
                >
                  <Shuffle className="w-3 h-3" style={{ color: blendMode ? C.onAccent : C.accent }} />
                  <span className="whitespace-nowrap" style={{ color: blendMode ? C.onAccent : C.text }}>Trộn {blendMode ? "BẬT" : "tắt"}</span>
                </button>
              </div>
              {(styleImg || blendMode) && (
                <p className="text-xs mb-3" style={{ color: C.textDim }}>
                  {styleImg
                    ? "Đã có ảnh STYLE — ảnh được ưu tiên nên preset tạm khóa. Gỡ ảnh STYLE để chọn preset."
                    : "Chế độ TRỘN: click chọn phong cách CHÍNH (đậm), rồi click thêm 1 phong cách nữa làm PHỤ (hiện nhạt hơn). Click lại để bỏ."}
                </p>
              )}

              {styleImg && (
                <div className="mb-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: C.panel2, border: `1px dashed ${C.line}`, color: C.text}}>
                  <Lock className="w-3.5 h-3.5 shrink-0" />
                  Đang dùng ảnh STYLE làm nguồn phong cách. Preset bị vô hiệu để tránh xung đột.
                </div>
              )}

              {/* Panel mô tả động: ưu tiên preset đang hover, nếu không thì đang chọn. */}
              {!styleImg && (() => {
                const shownId = presetHover || stylePreset;
                const shown = STYLE_PRESETS.find((p) => p.id === shownId);
                return (
                  <div
                    className="mt-3 rounded-lg px-3 py-2.5 text-xs leading-snug h-14 overflow-y-auto ipa-scroll"
                    style={{ background: C.inputBg, border: `1px solid ${C.line}`, color: shown ? C.text : C.textDim }}
                  >
                    {shown ? (
                      <span>
                        <strong style={{ color: C.accentSoft }}>{shown.label}</strong>
                        <span style={{ color: C.line }}> — </span>
                        {shown.desc}
                      </span>
                    ) : (
                      <span>Di chuột (hoặc chạm) vào một phong cách để xem mô tả; bấm để chọn.</span>
                    )}
                  </div>
                );
              })()}

              {/* ── Tỷ lệ trộn: chỉ hiện khi blend đang áp đủ 2 style ── */}
              {!styleImg && blendMode && stylePreset && styleB && styleB !== stylePreset && (
                <div className="mt-3">
                  <div className="flex items-center justify-between text-[11px] mb-1">
                    <span style={{ color: C.text }}><strong style={{ color: C.accentSoft }}>{presetName(stylePreset)}</strong> {blendRatio}%</span>
                    <span className="uppercase tracking-[0.14em]" style={{ color: C.textFaint }}>Tỷ lệ trộn</span>
                    <span style={{ color: C.text }}>{100 - blendRatio}% <strong style={{ color: C.accentSoft }}>{presetName(styleB)}</strong></span>
                  </div>
                  <input
                    type="range" min={50} max={90} step={5}
                    value={blendRatio}
                    onChange={(e) => changeBlendRatio(Number(e.target.value))}
                    className="w-full"
                    style={{ accentColor: C.accent }}
                  />
                  {platform === "midjourney" && (
                    <p className="text-[11px] mt-1.5 leading-snug" style={{ color: C.textFaint }}>
                      Midjourney mã hóa tỷ lệ bằng multi-prompt weight:{" "}
                      <span style={{ color: C.accentSoft, fontFamily: MONO }}>
                        {presetName(stylePreset)}::1 {presetName(styleB)}::{mjSecondaryWeight(blendRatio)}
                      </span>{" "}
                      — đổi slider sẽ đổi trọng số, nên ratio tác động thật chứ không chỉ là chữ.
                    </p>
                  )}
                </div>
              )}
              
              {/* Chips gom theo NHÓM. Mỗi nhóm có nhãn nhỏ + grid chip. */}
              {Array.from(new Set(STYLE_PRESETS.map((p) => p.group))).map((grp, gi) => (
                <div key={grp} className={`mb-2.5 last:mb-0 ${gi === 0 ? "mt-4" : ""}`}>
                  <p className="text-[11px] uppercase tracking-[0.16em] mb-1.5" style={{ color: C.textFaint }}>{grp}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    {STYLE_PRESETS.filter((p) => p.group === grp).map((p) => {
                      const on = stylePreset === p.id && !styleImg;                                  // CHÍNH
                      const onB = blendMode && styleB === p.id && p.id !== stylePreset && !styleImg;  // PHỤ
                      const handleClick = () => {
                        if (styleImg) return;
                        if (!blendMode) {
                          // Chế độ đơn: toggle style chính như cũ.
                          changeStylePreset(stylePreset === p.id ? null : p.id);
                          return;
                        }
                        // Chế độ trộn: click chính → bỏ chính; click phụ → bỏ phụ;
                        // chưa có chính → đặt làm chính; còn lại → đặt làm phụ.
                        if (p.id === stylePreset) { changeStylePreset(null); return; }
                        if (p.id === styleB) { changeStyleB(null); return; }
                        if (!stylePreset) { changeStylePreset(p.id); return; }
                        changeStyleB(p.id);
                      };
                      return (
                        <button
                          key={p.id}
                          onClick={handleClick}
                          onMouseEnter={() => setPresetHover(p.id)}
                          onMouseLeave={() => setPresetHover(null)}
                          disabled={!!styleImg}
                          title={p.desc}
                          className="group relative rounded-lg px-2.5 py-2 text-left transition-all duration-150"
                          style={{
                            ...(on ? activeBtn : onB ? activeBtnSecondary : idleBtn),
                            cursor: styleImg ? "not-allowed" : "pointer",
                          }}
                        >
                          <div className="relative mb-1.5">
                          {(() => {
                            const src = STYLE_IMAGES[p.id];
                            return src ? (
                              <img
                                src={src}
                                alt={p.label}
                                loading="lazy"
                                className="w-full object-cover rounded-md block"
                                style={{ aspectRatio: "16 / 9", border: `1px solid ${on ? C.onAccent : C.lineSoft}` }}
                              />
                            ) : (
                              <div
                                className="w-full rounded-md flex items-center justify-center"
                                style={{ aspectRatio: "16 / 9", background: C.panel2, border: `1px dashed ${C.line}` }}
                              >
                                <ImageIcon className="w-4 h-4" style={{ color: C.textFaint }} />
                              </div>
                            );
                          })()}
                          {/* Nút kính lúp — góc phải-dưới banner. Mobile: luôn hiện; desktop: chỉ hiện khi hover card (group-hover).
                              Dùng <span role=button> vì card cha là <button> (không lồng button). stopPropagation để không chọn preset. */}
                          {STYLE_IMAGES[p.id] && (
                            <span
                              role="button"
                              tabIndex={0}
                              title="Phóng to ảnh"
                              aria-label={`Phóng to ảnh ${p.label}`}
                              onClick={(e) => { e.stopPropagation(); setZoomStyle(p); }}
                              onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); setZoomStyle(p); } }}
                              className="absolute bottom-0.5 right-0.5 z-20 inline-flex items-center justify-center w-5 h-5 rounded-full cursor-pointer transition-opacity duration-150 opacity-25 md:opacity-0 md:group-hover:opacity-100 hover:scale-120"
                              style={{ background: "rgba(0,0,0,0.55)", color: "#9A9A9A", backdropFilter: "blur(2px)" }}
                            >
                              <ZoomIn className="w-3.5 h-3.5" />
                            </span>
                          )}
                          </div>
                          <div className="text-[12px] font-semibold leading-tight" style={{ color: on ? C.onAccent : C.text }}>{p.label}</div>
                          {blendMode && (on || onB) && (
                            <span
                              className="absolute top-1 right-1 rounded px-1 text-[8px] font-bold uppercase tracking-wider leading-tight"
                              style={{ background: on ? C.onAccent : C.accent, color: on ? C.accent : C.onAccent }}
                            >
                              {on ? "Chính" : "Phụ"}
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

            </div>
          </div>
          )}

          {/* TAB 2: THIẾT LẬP & ĐIỀU CHỈNH */}
          {effectiveControlTab === "cfg" && (
          <div>
            {/* ===== BƯỚC 2: ĐIỀU KHIỂN RENDER ===== */}
            <StepLabel n={2} tight>Điều khiển render</StepLabel>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Trục STYLE INTENSITY — luôn bật */}
              <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] inline-flex items-center gap-1.5" style={{ color: C.accentSoft }}>
                  <Droplet className="w-4 h-4" /> Độ mạnh áp style
                </p>
                {/* 4 nút chọn mức (chữ — đồng bộ style với panel Geometry). */}
                <div className="grid grid-cols-4 gap-1.5 mt-4">
                  {STYLE_INTENSITY_LEVELS.map((lv) => {
                    const on = styleIntensity === lv.value;
                    return (
                      <button
                        key={lv.value}
                        onClick={() => changeStyleIntensity(lv.value)}
                        className="rounded-lg px-1.5 py-2 text-center transition-all"
                        style={{ ...(on ? activeBtn : idleBtn), cursor: "pointer" }}
                      >
                        <div className="text-[11px] font-bold" style={{ color: on ? C.onAccent : C.accentSoft }}>{lv.short}</div>
                        <div className="text-[10px] leading-tight mt-0.5" style={{ color: on ? C.onAccent : C.textDim }}>{lv.label}</div>
                      </button>
                    );
                  })}
                </div>

                {/* Banner: ảnh render lớn của mức đang chọn (public/intensity/lv0..3.webp). */}
                <div className="relative mt-3 rounded-xl overflow-hidden" style={{ border: `1px solid ${C.line}`, aspectRatio: "4 / 3" }}>
                  <img src={`/intensity/lv${styleIntensity}.webp`} alt={`Minh họa mức ${STYLE_INTENSITY_LEVELS[styleIntensity]?.label}`} className="w-full h-full" style={{ objectFit: "cover" }} />
                </div>

                <p className="mt-3 text-xs leading-relaxed" style={{ color: C.textDim }}>
                  {STYLE_INTENSITY_LEVELS[styleIntensity]?.desc}
                </p>
              </div>

              {/* Trục GEOMETRY — luôn bật. Có ảnh MODEL: khóa hình học theo
                  model. Không có MODEL: điều khiển "kỷ luật không gian" (chặt ↔
                  táo bạo) cho cảnh được sinh mới. */}
              <div
                className="rounded-2xl p-4"
                style={{ background: C.panel, border: `1px solid ${C.line}` }}
              >
                <p className="text-xs font-bold uppercase tracking-[0.14em] inline-flex items-center gap-1.5" style={{ color: C.accentSoft }}>
                  <Move3d className="w-4 h-4" /> {mjImageRef ? "Image weight (--iw)" : hasModel ? "Khóa hình học" : "Kỷ luật không gian"}
                </p>
                {hasModel ? (
                  /* ===== BẢNG TÍCH HỢP: hàng tiêu đề = nút chọn mức, thân = ma trận
                     khóa/mở. Nút chọn & ma trận gộp làm một; cột mức đang chọn tô sáng. */
                  <div className="mt-4 rounded-lg overflow-hidden" style={{ border: `1px solid ${C.lineSoft}` }}>
                    {/* Hàng tiêu đề = 4 nút chọn mức (tách rời + bo 4 góc -> rõ là nút bấm) */}
                    <div style={{ display: "grid", gridTemplateColumns: "124px repeat(4, minmax(55px, 1fr))", padding: "6px 0", background: C.panel2 }}>
                      <div />
                      {GEOMETRY_LEVELS.map((lv) => {
                        const onCol = geometry === lv.value;
                        return (
                          <div key={lv.value} className="px-1">
                            <button
                              onClick={() => changeGeometry(lv.value)}
                              className="w-full rounded-lg text-[11px] font-bold text-center px-1 py-1.5 transition-all"
                              style={{ color: onCol ? C.onAccent : C.accentSoft, background: onCol ? C.accent : C.panel, border: `1px solid ${onCol ? C.accent : C.line}`, cursor: "pointer" }}
                            >
                              {lv.short}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                    {/* Hàng yếu tố — Lock = giữ theo MODEL · Sparkles = AI tạo/đổi */}
                    {GEO_ROWS.map(([key, label]) => (
                      <div key={key} style={{ display: "grid", gridTemplateColumns: "124px repeat(4, minmax(55px, 1fr))", borderTop: `1px solid ${C.lineSoft}` }}>
                        <div className="text-[11px] px-1.5 py-1.5 flex items-center whitespace-nowrap" style={{ color: C.textDim }}>{exLabel(key, label)}</div>
                        {GEOMETRY_LEVELS.map((lv) => {
                          const locked = isLocked(key, lv.value);
                          const onCol = geometry === lv.value;
                          return (
                            <div key={lv.value} className="flex items-center justify-center py-1.5"
                              style={{ background: onCol ? "rgba(122,162,196,0.13)" : "transparent", borderLeft: `1px solid ${C.lineSoft}` }}>
                              {locked
                                ? <Lock className="w-3 h-3" style={{ color: C.neg }} />
                                : <Sparkles className="w-3 h-3" style={{ color: C.pos }} />}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                ) : (
                  /* ===== Không có MODEL / Midjourney image-ref: chỉ nút chọn mức ===== */
                  <div className="grid grid-cols-4 gap-1.5 mt-4">
                    {GEOMETRY_LEVELS.map((lv) => {
                      const on = geometry === lv.value;
                      return (
                        <button
                          key={lv.value}
                          onClick={() => changeGeometry(lv.value)}
                          className="rounded-lg px-1.5 py-2 text-center transition-all"
                          style={{ ...(on ? activeBtn : idleBtn), cursor: "pointer" }}
                        >
                          <div className="text-[11px] font-bold" style={{ color: on ? C.onAccent : C.accentSoft }}>{(!mjImageRef && !hasModel) ? lv.shortNoModel : lv.short}</div>
                          <div className="text-[10px] leading-tight mt-0.5" style={{ color: on ? C.onAccent : C.textDim }}>{(!mjImageRef && !hasModel) ? lv.labelNoModel : lv.label}</div>
                        </button>
                      );
                    })}
                  </div>
                )}

                {mjImageRef ? (
                  <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: C.panel2, border: `1px dashed ${C.line}`, color: C.accentSoft }}>
                    <ImageIcon className="w-3.5 h-3.5 shrink-0" />
                    Midjourney: ảnh MODEL thành image-prompt, ảnh STYLE thành --sref. Trục này chỉnh --iw (độ bám ảnh MODEL).
                  </div>
                ) : !hasModel && (
                  <div className="mt-3 flex items-center gap-2 rounded-lg px-3 py-2 text-xs" style={{ background: C.panel2, border: `1px dashed ${C.line}`, color: C.accentSoft }}>
                    <Box className="w-3.5 h-3.5 shrink-0" />
                    Nạp ảnh MODEL để chuyển sang khóa hình học theo model.
                  </div>
                )}

                {/* MÔ TẢ mức đang chọn — dời xuống ĐÁY banner */}
                <p className="mt-3.5 text-xs leading-relaxed" style={{ color: C.textDim }}>
                  {mjImageRef ? GEOMETRY_LEVELS[geometry]?.descMJ : hasModel ? (sceneType === "exterior" ? (GEOMETRY_LEVELS[geometry]?.descExt || GEOMETRY_LEVELS[geometry]?.desc) : GEOMETRY_LEVELS[geometry]?.desc) : GEOMETRY_LEVELS[geometry]?.descNoModel}
                </p>
              </div>

            </div>
            {/* ===== BƯỚC 3: NỀN TẢNG & KHUNG HÌNH ===== */}
            <StepLabel n={3}>Nền tảng &amp; khung hình</StepLabel>

            {/* Tỷ lệ khung (trái) + Negative prompt (phải) — desktop xếp 2 cột, 2 panel cao bằng nhau */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 md:items-stretch">
              {/* Aspect ratio */}
              <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <p className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 inline-flex items-center gap-1.5" style={{ color: C.accentSoft }}>
                  <Maximize2 className="w-4 h-4" /> Tỷ lệ khung
                </p>
                <div className="grid grid-cols-3 gap-1.5">
                  {ASPECT_RATIOS.map((ar) => {
                    const on = aspectRatio === ar.value;
                    return (
                      <button
                        key={ar.value}
                        onClick={() => changeAspect(ar.value)}
                        title={ar.desc}
                        className="rounded-lg px-2 py-2.5 text-center transition-all"
                        style={on ? activeBtn : idleBtn}
                      >
                        <div className="text-[13px] font-bold" style={{ color: on ? C.onAccent : C.accentSoft }}>{ar.label}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] mt-2.5" style={{ color: C.textDim }}>
                  {ASPECT_RATIOS.find((a) => a.value === aspectRatio)?.desc}
                </p>
              </div>

              {/* Negative prompt */}
              <div className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
              <div className="flex items-center justify-between mb-2 flex-wrap gap-1">
                <p className="text-xs font-bold uppercase tracking-[0.14em] inline-flex items-center gap-1.5" style={{ color: C.accentSoft }}>
                  <Ban className="w-4 h-4" /> Negative prompt (cần tránh)
                </p>
                <button
                  onClick={() => changeNegative(NEGATIVE_BY_PLATFORM[platform] || DEFAULT_NEGATIVE)}
                  className="text-[11px] rounded-md px-2 py-1 transition-colors"
                  style={{ border: `1px solid ${C.line}`, color: C.textDim, background: "transparent" }}
                >
                  Khôi phục mặc định
                </button>
              </div>
              <textarea
                ref={(el) => { negRef.current = el; fitNeg(el); }}
                value={negativePrompt}
                onChange={(e) => changeNegative(e.target.value)}
                onInput={(e) => fitNeg(e.target)}
                className="w-full text-sm rounded-lg px-2.5 py-1.5 resize-none leading-relaxed outline-none"
                style={{ background: C.inputBg, border: `1px solid ${C.line}`, color: C.text, fontFamily: MONO, fontSize: "12.5px", overflowY: "hidden" }}
                placeholder={NEGATIVE_BY_PLATFORM[platform] || DEFAULT_NEGATIVE}
              />
              </div>
            </div>

            {/* Điều Chỉnh Nâng Cao — chuyển từ khu Kết quả sang Tab 2.
                Có analysis -> panel sáng (bấm mở); chưa có -> placeholder MỜ. */}
            {/* Bảng phân tích — gói trong khối collapsible "Điều Chỉnh Nâng Cao".
                MẶC ĐỊNH THU GỌN: chỉ hiện header; bấm để xổ toàn bộ 13 field
                (11 STYLE + 2 MODEL) ra chỉnh tay. */}
            {analysis && (
              <div className="ipa-anim mt-3">
                {/* Header bấm để mở/đóng. chevron xoay theo trạng thái. */}
                <button
                  type="button"
                  onClick={() => setShowAnalysis((v) => !v)}
                  aria-expanded={showAnalysis}
                  className="w-full flex items-center justify-between gap-2 rounded-2xl px-4 py-3 text-left transition-colors"
                  style={{ background: C.panel, border: `1px solid ${C.line}` }}
                >
                  <span className="text-[15px] flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                    <Palette className="w-4 h-4" style={{ color: C.accent }} /> Điều Chỉnh Nâng Cao
                  </span>
                  <ChevronDown
                    className="w-5 h-5 shrink-0 transition-transform duration-200"
                    style={{ color: C.textDim, transform: showAnalysis ? "rotate(180deg)" : "rotate(0deg)" }}
                  />
                </button>

                {/* Nội dung — chỉ render khi đã mở */}
                {showAnalysis && (
                  <div className="mt-3 ipa-anim">
                    <h2 className="text-base mb-3 flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                      <Palette className="w-4 h-4" style={{ color: C.accent }} /> Nội Dung Phân Tích
                    </h2>

                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                      {STYLE_KEYS.map(([key, label], i) => (
                        <AnalysisRow key={key} k={key} label={exLabel(key, label)} i={i} enValue={analysis[key] || ""} onChangeEn={handleChangeEn} />
                      ))}
                    </div>

                    <h2 className="text-base mt-6 mb-3 flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                      <Box className="w-4 h-4" style={{ color: C.textDim }} /> Góc nhìn &amp; bố cục (giữ theo model)
                    </h2>
                    <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                      {MODEL_KEYS.map(([key, label], i) => (
                        <AnalysisRow key={key} k={key} label={exLabel(key, label)} i={i} enValue={analysis[key] || ""} onChangeEn={handleChangeEn} />
                      ))}
                    </div>

                    {/* MJ + BLEND: 2 bộ keyword TÁCH RIÊNG nuôi PART 2/PART 3 của
                        chuỗi ::. Sửa ở đây sẽ chảy thẳng vào prompt khi "Cập nhật". */}
                    {mjBlendNow && (analysis.blend_primary_keywords != null || analysis.blend_secondary_keywords != null) && (
                      <>
                        <h2 className="text-base mt-6 mb-3 flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                          <Shuffle className="w-4 h-4" style={{ color: C.accent }} /> Từ khóa trộn cho Midjourney (::)
                        </h2>
                        <p className="text-xs mb-2 -mt-1.5" style={{ color: C.textDim }}>
                          Mỗi bộ là từ khóa của <strong>một</strong> phong cách, giữ riêng (không hòa) để trọng số <span style={{ fontFamily: MONO }}>::</span> điều khiển tỷ lệ. Sửa ở đây sẽ vào thẳng prompt MJ.
                        </p>
                        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                          {MJ_BLEND_KEYS.map(([key, label], i) => (
                            <AnalysisRow key={key} k={key} label={label} i={i} enValue={analysis[key] || ""} onChangeEn={handleChangeEn} />
                          ))}
                        </div>
                      </>
                    )}

                    {/* (v30) gpt-image + BLEND: kho điểm nhấn style PHỤ, giữ
                        riêng để ratio điều khiển SỐ accent được inject. Sửa tay
                        ở đây chảy thẳng vào prompt khi "Cập nhật" (rebuild). */}
                    {blendAccentNow && analysis.blend_secondary_palette != null && (
                      <>
                        <h2 className="text-base mt-6 mb-3 flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                          <Shuffle className="w-4 h-4" style={{ color: C.accent }} /> Phân tích style phụ (blend)
                        </h2>
                        <p className="text-xs mb-2 -mt-1.5" style={{ color: C.textDim }}>
                          Bộ phân tích <strong>đầy đủ</strong> của style phụ (palette, ánh sáng, mood, vật liệu...), giữ riêng song song bộ chính. Tỷ lệ trộn quyết định <strong>mức nghiêng</strong> giữa hai style — kéo slider rồi bấm "Cập nhật" là đủ, không cần phân tích lại.
                        </p>
                        <div className="rounded-2xl overflow-hidden" style={{ border: `1px solid ${C.line}` }}>
                          {BLEND_SECONDARY_KEYS.map(([key, label], i) => (
                            <AnalysisRow key={key} k={key} label={label} i={i} enValue={analysis[key] || ""} onChangeEn={handleChangeEn} />
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            )}

            {!analysis && (
              <div className="rounded-2xl px-4 py-3 mt-3 flex items-center justify-between gap-2 cursor-not-allowed" style={{ background: C.panel, border: `1px solid ${C.line}`, opacity: 0.45 }} aria-disabled="true">
                <span className="text-[15px] flex items-center gap-2 font-bold tracking-tight" style={{ color: C.text }}>
                  <Palette className="w-4 h-4" style={{ color: C.accent }} /> Điều Chỉnh Nâng Cao
                </span>
              </div>
            )}
          </div>
          )}
          </div>{/* /CỘT TRÁI */}

          {/* ===== CỘT PHẢI (desktop): KẾT QUẢ — luôn hiện trên desktop; mobile: hiện theo tab ===== */}
          <div className={(activeTab === "result" ? "" : "hidden ") + "ipa-col-right"}>
            {/* Desktop: NÚT HÀNH ĐỘNG nằm đầu cột Kết quả */}
            <div className="hidden md:block mb-5 mt-2">{actionButton}</div>
            {/* THANH TIẾN TRÌNH — dưới nút Phân tích, trong cột Kết quả. KHÔNG tốn token. */}
            {progressActive && (
              <div className="mb-3 ipa-anim" aria-live="polite">
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-[11px] font-semibold" style={{ color: C.accentSoft }}>
                    {genBusy ? (genImg ? "Đang tạo lại ảnh…" : "Đang tạo ảnh…") : status === "analyzing" ? "Đang phân tích ảnh & dựng cấu trúc…" : "Đang tạo lại prompt…"}
                  </span>
                  <span className="text-[11px] tabular-nums" style={{ color: C.textDim, fontFamily: MONO }}>
                    {Math.round(progress)}%
                  </span>
                </div>
                <div className="w-full rounded-full overflow-hidden" style={{ height: 8, background: C.panel2, border: `1px solid ${C.line}` }}>
                  <div
                    style={{
                      width: `${progress}%`,
                      height: "100%",
                      borderRadius: 999,
                      background: `linear-gradient(90deg, ${C.accent}, ${C.accentSoft})`,
                      boxShadow: `0 0 12px -2px ${C.accent}`,
                      transition: "width 220ms cubic-bezier(0.22, 1, 0.36, 1)",
                    }}
                  />
                </div>
              </div>
            )}
            {/* 4d — SKELETON: trong lúc phân tích lần đầu, panel kết quả hiện các
                dòng shimmer mô phỏng bố cục prompt sắp đổ vào (client-side, 0 token).
                Rebuild (đã có prompt) giữ nguyên prompt cũ nên không cần skeleton. */}
            {status === "analyzing" && (
              <div className="ipa-anim rounded-2xl p-5" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                <div className="flex items-center gap-2 mb-4">
                  <Loader2 className="w-4 h-4 animate-spin" style={{ color: C.accent }} />
                  <span className="text-sm font-semibold" style={{ color: C.accentSoft }}>Đang dựng kết quả…</span>
                </div>
                <div className="space-y-2.5">
                  <div className="ipa-skel h-4 rounded" style={{ width: "42%" }} />
                  <div className="ipa-skel h-3 rounded" style={{ width: "100%" }} />
                  <div className="ipa-skel h-3 rounded" style={{ width: "94%" }} />
                  <div className="ipa-skel h-3 rounded" style={{ width: "80%" }} />
                  <div className="ipa-skel h-28 rounded-xl" style={{ marginTop: "1rem" }} />
                  <div className="ipa-skel h-3 rounded" style={{ width: "88%" }} />
                  <div className="ipa-skel h-3 rounded" style={{ width: "62%" }} />
                </div>
              </div>
            )}
            {!analysis && !prompts && status !== "analyzing" && (
              <div
                className="rounded-2xl p-8 flex flex-col items-center justify-center text-center min-h-[196px]"
                style={{ background: C.panel, border: `1px dashed ${C.line}` }}
              >
                <Sparkles className="w-8 h-8 mb-3" style={{ color: C.textFaint }} />
                <p className="text-sm font-semibold" style={{ color: C.textDim }}>Kết quả sẽ hiện ở đây</p>
                <p className="text-xs mt-1.5 max-w-[360px]" style={{ color: C.textFaint }}>
                  Chọn nguồn phong cách (ảnh STYLE hoặc preset),<br />
                  tùy chọn ảnh MODEL, rồi bấm <strong style={{ color: C.textDim }}>“Phân tích &amp; Tạo prompt”</strong>.
                </p>
              </div>
            )}

            {/* Thay đổi đang chờ áp dụng (nếu có) */}
                {/* Banner liệt kê CHÍNH XÁC từng thay đổi đang chờ (so với
                    snapshot lúc tạo prompt). Mỗi dòng: field + "cũ → mới", hoặc
                    "đã chỉnh sửa" với field dạng văn bản. Viền terracotta nếu
                    có đổi preset (phải phân tích lại), accent nếu chỉ đổi nhẹ. */}
                {hasPending && (
                  <div className="mb-3 rounded-xl p-3 text-xs leading-snug" style={{ background: C.panel2, border: `1px solid ${C.neg}66`, color: C.accentSoft }}>
                    <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: C.neg }}>
                      {needsReanalyze ? <AlertCircle className="w-4 h-4 shrink-0" /> : <RefreshCw className="w-4 h-4 shrink-0" />}
                      <span>Bấm “Cập nhật thay đổi” sẽ áp dụng:</span>
                    </div>
                    <ul className="space-y-1 mb-2">
                      {pendingChanges.map((c) => (
                        <li key={c.key} className="flex flex-wrap items-baseline gap-x-1.5">
                          <span style={{ color: C.textDim }}>•</span>
                          {c.key.startsWith("analysis:") && <span style={{ color: C.text }}>Phân tích ·</span>}
                          <span style={{ color: c.key.startsWith("analysis:") ? C.textDim : C.text }}>{c.label}:</span>
                          {c.note ? (
                            <em style={{ color: C.accentSoft }}>{c.note}</em>
                          ) : (
                            <span>
                              <span style={{ color: C.textDim }}>{c.from}</span>
                              <span style={{ color: C.textFaint }}> → </span>
                              <strong style={{ color: C.accentSoft }}>{c.to}</strong>
                            </span>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div style={{ color: C.textDim }}>{costNote}</div>
                  </div>
                )}

            {/* IMAGE — lên trên cùng khu Kết quả, dính theo cuộn (sticky) */}
                {/* === RENDER ẢNH bằng gpt-image-2 (ChatGPT) — chỉ Nano Banana + có MODEL === */}
                {platform === "nanobanana" && prompts?.nanobanana && modelImg && (
                  <div className="mt-3 rounded-2xl p-4 ipa-img-sticky" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                    <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
                      <div>
                        <span className="font-semibold" style={{ color: C.accentSoft }}>Image</span>
                      </div>
                      <button
                        onClick={renderImage}
                        disabled={genStatus === "generating"}
                        className={`inline-flex items-center gap-2 text-[15px] font-semibold rounded-lg px-4 py-2.5 transition-all ${genStatus === "generating" ? "" : "ipa-glow"}`}
                        style={{ border: `1px solid ${C.accent}`, color: genStatus === "generating" ? C.textDim : C.onAccent, background: genStatus === "generating" ? C.panel2 : C.accent, opacity: genStatus === "generating" ? 0.7 : 1, cursor: genStatus === "generating" ? "default" : "pointer" }}
                      >
                        {genStatus === "generating"
                          ? (<><Loader2 className="w-5 h-5 animate-spin" /> Đang tạo…</>)
                          : genImg
                            ? (<><ImageIcon className="w-5 h-5" /> Tạo lại</>)
                            : (<><ImageIcon className="w-5 h-5" /> Tạo ảnh</>)}
                      </button>
                    </div>
                    
                    {genStatus === "error" && genError && (
                      <div className="rounded-lg p-2.5 text-xs mb-2.5 whitespace-pre-wrap" style={{ background: `${C.neg}1a`, border: `1px solid ${C.neg}55`, color: C.neg }}>
                        {genError}
                      </div>
                    )}

                    {genStatus === "generating" && (
                      <div className="rounded-xl flex items-center justify-center" style={{ aspectRatio: "16 / 10", background: C.inputBg, border: `1px dashed ${C.lineSoft}`, color: C.textDim }}>
                        <span className="inline-flex items-center gap-2 text-sm"><Loader2 className="w-4 h-4 animate-spin" /> đang dựng ảnh…</span>
                      </div>
                    )}

                    {genImg && genStatus !== "generating" && (
                      <div>
                        {/* Hold-to-compare: giữ (chuột/cảm ứng) trực tiếp trên ảnh -> lộ ảnh MODEL gốc; thả -> về ảnh AI */}
                        <div
                          className="relative rounded-xl overflow-hidden select-none"
                          style={{ border: `1px solid ${C.line}`, touchAction: "none", cursor: "pointer", WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none" }}
                          onPointerDown={() => setHoldOrig(true)}
                          onPointerUp={() => setHoldOrig(false)}
                          onPointerLeave={() => setHoldOrig(false)}
                          onPointerCancel={() => setHoldOrig(false)}
                          onContextMenu={(e) => e.preventDefault()}
                        >
                          {/* Ảnh AI: quyết định kích thước khung -> khung không "nhảy" khi đổi ảnh */}
                          <img src={genImg} alt="Kết quả gpt-image-2" className="block w-full" draggable={false} style={{ WebkitTouchCallout: "none", pointerEvents: "none" }} />
                          {/* Ảnh MODEL gốc: overlay object-contain, nền tối phủ kín vì khác tỷ lệ; chỉ hiện khi đang giữ */}
                          <img
                            src={`data:${modelImg.mediaType};base64,${modelImg.data}`}
                            alt="Ảnh gốc MODEL"
                            draggable={false}
                            className="absolute inset-0 w-full h-full object-contain transition-opacity duration-75"
                            style={{ background: C.bg, opacity: holdOrig ? 1 : 0, pointerEvents: "none" }}
                          />
                          {/* Nhãn trạng thái */}
                          <span className="absolute top-2 left-2 text-[11px] font-semibold rounded px-2 py-0.5" style={{ background: "rgba(0,0,0,0.55)", color: holdOrig ? C.accentSoft : C.text, pointerEvents: "none" }}>
                            {holdOrig ? "Gốc (MODEL)" : "AI tạo"}
                          </span>
                        </div>
                        <div className="mt-2 flex items-center justify-between gap-2 flex-wrap">
                          <span className="text-[11px]" style={{ color: C.textDim }}>Nhấn & giữ trên ảnh để xem ảnh gốc MODEL · thả ra về ảnh AI</span>
                          <a href={genImg} download="interior-gpt-image.png" className="inline-flex items-center gap-1.5 text-xs rounded-lg px-3 py-1.5" style={{ border: `1px solid ${C.accent}`, color: C.accent }}>
                            <Download className="w-3.5 h-3.5" /> Tải ảnh
                          </a>
                        </div>
                      </div>
                    )}
                  </div>
                )}

            {/* Đường kẻ ngăn cách giữa Image và Prompt */}
            {platform === "nanobanana" && prompts?.nanobanana && modelImg && (
              <div className="my-6" style={{ borderTop: `1px solid ${C.line}` }} />
            )}

            {/* PROMPT RENDER — xuống dưới Image */}
            {prompts && (
              <div className="ipa-anim">
                <h2 className="text-lg font-bold tracking-tight mb-3" style={{ color: C.text }}>Prompt render <span style={{ color: C.accent }}>(English)</span></h2>
                <div className="space-y-3">
                  {PLATFORMS.filter((p) => prompts[p.id]).map((p) => (
                    <div key={p.id} className="rounded-2xl p-4" style={{ background: C.panel, border: `1px solid ${C.line}` }}>
                      <div className="flex items-center justify-between mb-2.5 gap-2 flex-wrap">
                        <div>
                          <span className="font-semibold" style={{ color: C.accentSoft }}>{p.label}</span>
                          {p.hint && <span className="ml-2 text-xs" style={{ color: C.textDim }}>{p.hint}</span>}
                        </div>
                        {/* Copy luôn hiện (lấy nhanh không cần mở); nút Xem/Ẩn để bung prompt */}
                        <div className="flex items-center gap-1.5">
                          <button
                            onClick={() => copy(p.id, prompts[p.id])}
                            className="inline-flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 transition-colors"
                            style={{ border: `1px solid ${copied === p.id ? C.pos : C.accent}`, color: copied === p.id ? C.pos : C.accent, background: "transparent" }}
                          >
                            {copied === p.id
                              ? (<><Check className="w-4 h-4" /> Đã copy</>)
                              : (<><Copy className="w-4 h-4" /> Copy</>)}
                          </button>
                          <button
                            onClick={() => setPromptOpen((v) => !v)}
                            className="inline-flex items-center gap-1 text-sm rounded-lg px-3 py-1.5 transition-colors"
                            style={{ border: `1px solid ${C.line}`, color: C.textDim, background: "transparent" }}
                          >
                            <ChevronDown className="w-4 h-4 transition-transform" style={{ transform: promptOpen ? "rotate(180deg)" : "none" }} />
                            {promptOpen ? "Ẩn" : "Xem"}
                          </button>
                        </div>
                      </div>
                      {promptOpen && (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "#ccd6e2", fontFamily: MONO, fontSize: "12.5px" }}>{prompts[p.id]}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* LỊCH SỬ PROMPT */}
                {/* BANNER LỊCH SỬ — tối đa 8 phiên bản prompt gần nhất (mới
                    nhất ở trên). Mỗi mục lưu kèm prompt + 13 field analysis +
                    tham số render để XEM LẠI và DÙNG LẠI (khôi phục). */}
                {history.length > 0 && (
                  <div className="mt-8 pt-6" style={{ borderTop: `1px solid ${C.line}` }}>
                  <div className="rounded-xl p-3 text-xs leading-snug" style={{ background: C.panel, border: `1px solid ${C.lineSoft}` }}>
                    <div className="flex items-center gap-2 mb-2 font-semibold" style={{ color: C.textDim }}>
                      <History className="w-3.5 h-3.5 shrink-0" />
                      <span className="whitespace-nowrap">Lịch sử prompt · {history.length} phiên bản gần nhất<span className="hidden sm:inline"> (bấm “Tải HTML” để lưu, “Dùng lại” để khôi phục)</span></span>
                    </div>
                    <div className="space-y-2">
                      {history.map((h, idx) => {
                        const expanded = expandedHistory === h.id;
                        const histPreset = (() => {
                          if (!h.params?.stylePreset) return h.params ? "Ảnh STYLE" : null;
                          const a = presetName(h.params.stylePreset);
                          if (h.params.blendMode && h.params.styleB && h.params.styleB !== h.params.stylePreset) {
                            const rA = h.params.blendRatio ?? 70;
                            return `${a} × ${presetName(h.params.styleB)} (${rA}/${100 - rA})`;
                          }
                          return a;
                        })();
                        return (
                          <div key={h.id} className="rounded-lg px-2.5 py-2" style={{ background: C.panel2, border: `1px solid ${C.lineSoft}` }}>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 mb-1">
                              <div className="flex items-center gap-1.5 flex-nowrap min-w-0 overflow-hidden order-1 w-full md:w-auto md:flex-1">
                                <span className="text-[11px] font-semibold whitespace-nowrap" style={{ color: C.accentSoft }}>
                                  {idx === 0 ? "Mới nhất" : `Lần ${history.length - idx}`}
                                </span>
                                <span className="text-[11px]" style={{ color: C.textFaint }}>· {h.timeLabel}{h.dateLabel ? ` · ${h.dateLabel}` : ""}</span>
                                {histPreset && <span className="text-[11px] font-bold" style={{ color: C.accent }}>· {histPreset}</span>}
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0 order-3 md:order-2 md:ml-auto">
                                <button
                                  onClick={() => setExpandedHistory(expanded ? null : h.id)}
                                  className="text-[11px] rounded px-1.5 py-0.5 transition-colors"
                                  style={{ border: `1px solid ${C.line}`, color: C.textDim, background: "transparent" }}
                                >
                                  {expanded ? "Ẩn" : "Xem"}
                                </button>
                                <button
                                  onClick={() => downloadHistoryItem(h, idx)}
                                  className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 transition-colors"
                                  style={{ border: `1px solid ${C.accent}`, color: C.accent, background: "transparent" }}
                                  title="Tải phiên bản này dưới dạng HTML"
                                >
                                  <Layers className="w-3 h-3" /> Tải HTML
                                </button>
                                <button
                                  onClick={() => restoreHistory(h)}
                                  className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 transition-colors"
                                  style={{ border: `1px solid ${C.accent}`, color: C.accent, background: "transparent" }}
                                >
                                  <RotateCcw className="w-3 h-3" /> Dùng lại
                                </button>
                              </div>
                            {h.changes.length > 0 && (
                              <ul className="space-y-0.5 order-2 basis-full md:order-3">
                                {h.changes.map((c) => (
                                  <li key={c.key} className="flex flex-wrap items-baseline gap-x-1.5">
                                    <span style={{ color: C.textFaint }}>•</span>
                                    {c.key.startsWith("analysis:") && <span style={{ color: C.textDim }}>Phân tích ·</span>}
                                    <span style={{ color: C.textDim }}>{c.label}:</span>
                                    {c.note ? (
                                      <em style={{ color: C.accentSoft }}>{c.note}</em>
                                    ) : (
                                      <span>
                                        <span style={{ color: C.textFaint }}>{c.from}</span>
                                        <span style={{ color: C.textFaint }}> → </span>
                                        <strong style={{ color: C.accentSoft }}>{c.to}</strong>
                                      </span>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            )}
                            </div>

                            {/* Panel xem lại: ẢNH lên trên; prompt + 13 field analysis xuống dưới, LUÔN thu gọn */}
                            {expanded && (
                              <div className="mt-2 pt-2 space-y-2.5" style={{ borderTop: `1px solid ${C.lineSoft}` }}>
                                {h.genImg && (
                                  <div>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.accentSoft }}>Ảnh đã tạo</span>
                                    <img src={h.genImg} alt="Ảnh đã lưu" draggable={false} onContextMenu={(e) => e.preventDefault()} className="mt-1 w-full rounded select-none" style={{ border: `1px solid ${C.lineSoft}`, WebkitTouchCallout: "none", WebkitUserSelect: "none", userSelect: "none", pointerEvents: "none" }} />
                                  </div>
                                )}

                                {/* Prompt + 13 cấu trúc — LUÔN thu gọn, bấm để mở */}
                                {(h.prompts || h.analysis) && (
                                  <div>
                                    <button
                                      onClick={() => setHistDetailOpen(histDetailOpen === h.id ? null : h.id)}
                                      className="inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5 transition-colors"
                                      style={{ border: `1px solid ${C.line}`, color: C.textDim, background: "transparent" }}
                                    >
                                      <ChevronDown className="w-3 h-3 transition-transform" style={{ transform: histDetailOpen === h.id ? "rotate(180deg)" : "none" }} />
                                      {histDetailOpen === h.id ? "Ẩn prompt & cấu trúc" : "Xem prompt & cấu trúc"}
                                    </button>

                                    {histDetailOpen === h.id && (
                                      <div className="mt-2 space-y-2.5">
                                        {h.prompts && Object.keys(h.prompts).map((pid) => {
                                          const ck = `hist-${h.id}-${pid}`;
                                          return (
                                            <div key={pid}>
                                              <div className="flex items-center gap-2 mb-1">
                                                <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.accentSoft }}>Prompt · {platformName(pid)}</span>
                                                <button
                                                  onClick={() => copy(ck, h.prompts[pid])}
                                                  className="ml-auto inline-flex items-center gap-1 text-[11px] rounded px-1.5 py-0.5"
                                                  style={{ border: `1px solid ${copied === ck ? C.pos : C.accent}`, color: copied === ck ? C.pos : C.accent, background: "transparent" }}
                                                >
                                                  {copied === ck ? (<><Check className="w-3 h-3" /> Đã copy</>) : (<><Copy className="w-3 h-3" /> Copy</>)}
                                                </button>
                                              </div>
                                              <p className="rounded p-2 whitespace-pre-wrap" style={{ background: C.inputBg, border: `1px solid ${C.lineSoft}`, color: "#ccd6e2", fontFamily: MONO, fontSize: "11px", lineHeight: 1.5 }}>{h.prompts[pid]}</p>
                                            </div>
                                          );
                                        })}
                                        {h.analysis && (
                                          <div>
                                            <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: C.accentSoft }}>Phân tích ({Object.keys(h.analysis).length} mục)</span>
                                            <ul className="mt-1 space-y-0.5">
                                              {Object.entries(h.analysis).map(([k, v]) => (
                                                <li key={k} className="flex flex-wrap items-baseline gap-x-1.5 text-[11px]">
                                                  <span className="font-medium" style={{ color: C.textDim }}>{k.replace(/_/g, " ")}:</span>
                                                  <span style={{ color: C.text }}>{String(v)}</span>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                  </div>
                )}
          </div>{/* /CỘT PHẢI */}
        </div>

        {/* Mũi tên chuyển tab — chỉ mobile (desktop đã split-view) */}
        <div className="md:hidden flex items-center justify-center gap-8 mt-8">
          <button
            onClick={() => { const o = ["src", "cfg", "result"]; const i = o.indexOf(activeTab); setActiveTab(o[(i + o.length - 1) % o.length]); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center justify-center rounded-full w-11 h-11 transition-colors"
            style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.accentSoft }}
            aria-label="Tab trước"
          >
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            onClick={() => { const o = ["src", "cfg", "result"]; const i = o.indexOf(activeTab); setActiveTab(o[(i + 1) % o.length]); window.scrollTo({ top: 0, behavior: "smooth" }); }}
            className="inline-flex items-center justify-center rounded-full w-11 h-11 transition-colors"
            style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.accentSoft }}
            aria-label="Tab sau"
          >
            <ChevronRight className="w-5 h-5" />
          </button>
        </div>

        {/* Footer attribution */}
        <p className="mt-10 text-center text-[12px] leading-relaxed" style={{ color: C.textDim }}>
          <a
            href="https://artius.vn/"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold transition-colors"
            style={{ color: C.accent }}
          >
            CÔNG TY THIẾT KẾ VÀ XÂY DỰNG ARTIUS
          </a>
        </p>

        <p className="mt-0 text-center" style={{ color: C.textFaint }}>
          <span
            className="inline-block rounded-md px-2 py-0.5 text-[8px] tracking-wider"
            style={{ background: C.panel2, border: `1px solid ${C.line}`, color: C.accentSoft, fontFamily: MONO }}
          >
            build {APP_VERSION}
            
      {/* ===== LIGHTBOX phóng to ảnh Style Preset ===== */}
      {zoomStyle && (
        <div
          onClick={() => setZoomStyle(null)}
          className="fixed inset-0 z-[100] flex items-center justify-center p-4 ipa-anim"
          style={{ background: "rgba(0,0,0,0.90)", backdropFilter: "blur(2px)" }}
        >
          <div className="relative w-full max-w-[920px]" onClick={(e) => e.stopPropagation()}>
            <img
              src={STYLE_IMAGES[zoomStyle.id]}
              alt={zoomStyle.label}
              className="w-full rounded-xl"
              style={{ maxHeight: "90vh", objectFit: "contain", border: `0px solid ${C.line}` }}
            />
            <div className="mt-2 text-center text-sm font-regular" style={{ color: "#fff" }}>{zoomStyle.label}</div>
          </div>
        </div>
      )}
          </span>
        </p>
      </div>
    </div>
  );
}
