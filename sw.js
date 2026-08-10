// Service worker minimal untuk SAKTI PKB.
// Tujuannya HANYA supaya Chrome menganggap situs ini "installable" (syarat wajib
// PWA agar Chrome membuatkan WebAPK yang ditandatangani resmi oleh Google, alih-alih
// sekadar shortcut biasa). Tidak melakukan cache agresif terhadap data, dan SAMA
// SEKALI TIDAK mencegat (intercept) panggilan ke backend Google Apps Script
// (script.google.com) supaya data selalu real-time dan tidak ada risiko data basi
// atau kredensial ketinggalan cache.

const CACHE_NAME = 'sakti-pkb-shell-v2';
const APP_SHELL = [
  './',
  './index.html',
  './manifest.json',
  './favicon-16.png',
  './favicon-32.png',
  './apple-touch-icon.png',
  './icon-192.png',
  './icon-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Hanya tangani request GET ke origin sendiri (file statis app-shell).
  // Semua request lain (termasuk POST/GET ke script.google.com untuk data,
  // upload foto, login, dsb) dibiarkan lewat langsung ke jaringan tanpa
  // campur tangan service worker sama sekali.
  if (req.method !== 'GET' || url.origin !== self.location.origin) {
    return;
  }

  // Strategi: stale-while-revalidate.
  // Cache (kalau ada) langsung dipakai supaya app-shell (index.html ~382KB)
  // tampil instan meski sinyal lemah/lambat di lapangan. Bersamaan dengan itu,
  // request tetap dikirim ke jaringan di background untuk mengambil versi
  // terbaru dan menyimpannya ke cache — jadi buka berikutnya sudah versi baru.
  // Kalau tidak ada cache sama sekali (mis. pertama kali install), tetap
  // tunggu jaringan seperti biasa.
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) =>
      cache.match(req).then((cached) => {
        const networkFetch = fetch(req)
          .then((res) => {
            cache.put(req, res.clone());
            return res;
          })
          .catch(() => cached);
        return cached || networkFetch;
      })
    )
  );
});
