const CACHE_NAME = "aruskas-static-v2";

const OFFLINE_HTML = `<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>Sedang Offline · ArusKas</title>
  <style>
    body { margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center; background: linear-gradient(165deg, #FFFFFF 0%, #FAF0DD 50%, #EDD6B4 100%); font-family: system-ui, -apple-system, sans-serif; color: #1C1917; padding: 24px; }
    .card { max-width: 400px; background: #fff; border: 1px solid #E3D4BA; border-radius: 24px; padding: 28px; text-align: center; box-shadow: 0 8px 24px rgba(28,25,23,0.06); }
    .logo { font-size: 26px; font-weight: 700; color: #14532D; margin-bottom: 12px; }
    .logo span { color: #B45309; }
    h1 { font-size: 18px; margin: 0 0 8px; }
    p { font-size: 14px; color: #57534E; line-height: 1.5; margin: 0 0 20px; }
    button { background: #14532D; color: #fff; border: 0; border-radius: 999px; padding: 10px 22px; font-weight: 600; font-size: 14px; cursor: pointer; }
  </style>
</head>
<body>
  <div class="card">
    <div class="logo">ArusKas<span>.</span></div>
    <h1>Koneksi Internet Terputus</h1>
    <p>Data keuangan Anda tersimpan aman di server. Nyalakan koneksi internet lalu ketuk tombol di bawah untuk memuat ulang.</p>
    <button onclick="window.location.reload()">Coba Muat Ulang</button>
  </div>
</body>
</html>`;

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(["/manifest.webmanifest", "/icon-192", "/icon"]))
      .catch(() => {})
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((key) => key !== CACHE_NAME)
            .map((key) => caches.delete(key))
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Never intercept API calls, downloads (.mobileconfig / .apk), or Next.js build assets
  // (Crucial on iOS Safari so .mobileconfig profile downloads are handled natively by Safari)
  if (
    url.pathname.startsWith("/api/") ||
    url.pathname.startsWith("/downloads/") ||
    url.pathname.startsWith("/_next/")
  ) {
    return;
  }

  if (req.mode === "navigate") {
    event.respondWith(
      fetch(req).catch(
        () =>
          new Response(OFFLINE_HTML, {
            status: 503,
            headers: { "Content-Type": "text/html; charset=utf-8" },
          })
      )
    );
    return;
  }

  // Cache-first only for static icons/manifest
  if (
    url.pathname === "/icon" ||
    url.pathname === "/icon-192" ||
    url.pathname === "/icon-maskable" ||
    url.pathname === "/apple-icon" ||
    url.pathname === "/manifest.webmanifest"
  ) {
    event.respondWith(
      caches.match(req).then((cached) => cached || fetch(req))
    );
  }
});
