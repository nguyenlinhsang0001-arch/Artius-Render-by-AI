# Deploy InteriorPromptAgent lên Vercel

Bộ này đã sẵn sàng push. Cấu trúc:

```
interior-prompt/
├── api/
│   └── generate.js      ← serverless proxy giữ API key (Vercel tự nhận folder api/)
├── src/
│   ├── App.jsx          ← component v20.5 (đã đổi fetch sang /api/generate)
│   └── main.jsx
├── index.html           ← nạp Tailwind qua CDN
├── package.json
└── vite.config.js
```

## Điều đã đổi so với v20.4

1. Thêm hằng `const API_URL = "/api/generate";` (ngay dưới `APP_VERSION`).
2. Cả 2 chỗ `fetch("https://api.anthropic.com/v1/messages", ...)` (hàm
   `analyze` và `rebuildPrompt`) đổi thành `fetch(API_URL, ...)`.
   Body và phần xử lý response giữ nguyên 100%.
3. `api/generate.js` đính `x-api-key` + `anthropic-version` rồi forward sang
   Anthropic. Key đọc từ `process.env.ANTHROPIC_API_KEY`, KHÔNG lộ ra browser.

> ⚠️ Hệ quả: file này KHÔNG còn chạy trong Claude artifact preview nữa (artifact
> chỉ proxy ngầm cho `api.anthropic.com`). Muốn test phải deploy hoặc chạy
> `vercel dev` ở local.

## Các bước deploy

### 1. Lấy API key
Vào https://console.anthropic.com → API Keys → tạo key (chuỗi `sk-ant-...`).
Cần nạp credit cho account để gọi API thật (không còn miễn phí như trong artifact).

### 2. Đẩy code lên GitHub
```bash
cd interior-prompt
npm install          # (tùy chọn) test local trước
git init
git add .
git commit -m "v20.5 deploy-ready"
# tạo repo trống trên github.com rồi:
git remote add origin https://github.com/<user>/<repo>.git
git push -u origin main
```

### 3. Import vào Vercel
- vercel.com → **Add New → Project** → chọn repo vừa push.
- Vercel tự nhận diện Vite (Framework: Vite, Build: `npm run build`, Output: `dist`).
  Không cần chỉnh gì.
- **Settings → Environment Variables**, thêm:
  - Name: `ANTHROPIC_API_KEY`
  - Value: key `sk-ant-...` của bạn
  - Áp dụng cho cả Production + Preview.
- **Deploy**.

Xong → có link công khai (vd `https://<repo>.vercel.app`) test được trên mobile thật.

### 4. (Tùy chọn) Test cả proxy ở local
`npm run dev` của Vite KHÔNG chạy folder `api/`. Muốn test luôn proxy:
```bash
npm i -g vercel
vercel dev          # tự hỏi env, hoặc tạo file .env có ANTHROPIC_API_KEY=sk-ant-...
```

## Lưu ý kỹ thuật

- **Giới hạn body**: serverless function Vercel giới hạn request ~4.5MB. App đã
  nén ảnh thích ứng nên thường ổn, nhưng nếu gửi 2 ảnh rất lớn mà gặp lỗi, đó là
  nguyên nhân — giảm kích thước ảnh đầu vào.
- **Tailwind CDN**: nhanh, đủ dùng cho công cụ cá nhân. Nếu muốn build tối ưu
  (nhẹ hơn, không cảnh báo console), bỏ thẻ `<script src="cdn.tailwindcss.com">`
  trong index.html và cài Tailwind theo hướng dẫn hiện hành ở tailwindcss.com
  (bản v4 dùng plugin `@tailwindcss/vite` + `@import "tailwindcss";`). Bước này
  không bắt buộc để chạy được.
- **Bảo mật key**: tuyệt đối KHÔNG nhét key vào App.jsx hay index.html — chỉ để
  trong Environment Variables của Vercel. Proxy là lớp duy nhất chạm tới key.
