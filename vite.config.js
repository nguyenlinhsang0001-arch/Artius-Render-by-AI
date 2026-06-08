import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// =============================================================
// Vite config. Khi deploy lên Vercel, Vercel tự xử lý folder api/ thành
// serverless functions — không cần gì thêm.
//
// LƯU Ý chạy local: `npm run dev` (Vite) KHÔNG chạy được folder api/.
// Muốn test cả proxy ở local, dùng `vercel dev` (cài Vercel CLI:
// npm i -g vercel) thay cho `npm run dev`.
// =============================================================
export default defineConfig({
  plugins: [react()],
});
