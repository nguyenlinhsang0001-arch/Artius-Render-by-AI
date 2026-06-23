// ARTIUS PWA service worker
// Chiến lược: app shell cache-first (mở nhanh, dùng offline phần vỏ),
// còn các lệnh gọi API (/api/*) thì LUÔN qua mạng (network-only) vì cần backend.
const CACHE = "artius-shell-v1";

// Vỏ app tải sẵn khi cài. Vite/CRA băm tên file build nên KHÔNG liệt kê cứng;
// ta cache động (runtime) các tài nguyên cùng origin khi chúng được tải lần đầu.
const PRECACHE = ["/", "/manifest.webmanifest"];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(PRECACHE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (e) => {
  const req = e.request;
  const url = new URL(req.url);

  // Chỉ xử lý GET cùng origin. Khác origin (CDN, OpenAI...) để mặc định.
  if (req.method !== "GET" || url.origin !== self.location.origin) return;

  // API: không bao giờ cache — luôn lấy mới từ server.
  if (url.pathname.startsWith("/api/")) {
    e.respondWith(fetch(req));
    return;
  }

  // Điều hướng trang (mở app): network trước, lỗi mạng -> trả "/" trong cache.
  if (req.mode === "navigate") {
    e.respondWith(
      fetch(req).catch(() => caches.match("/").then((r) => r || caches.match(req)))
    );
    return;
  }

  // Tài nguyên tĩnh (JS/CSS/ảnh/font): cache-first, nền tự cập nhật (SWR).
  e.respondWith(
    caches.match(req).then((cached) => {
      const fetched = fetch(req)
        .then((res) => {
          if (res && res.status === 200 && res.type === "basic") {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => cached);
      return cached || fetched;
    })
  );
});
