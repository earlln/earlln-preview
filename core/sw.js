// 오프라인에서도 열리도록 앱 파일을 캐시합니다. 파일을 고치면 VERSION을 올려 주세요.
const VERSION = 'core-fit-v7';
const FILES = ['./', 'index.html', 'style.css', 'app.js', 'i18n.js', 'version.js', 'manifest.webmanifest',
  'icons/icon.svg', 'icons/icon-192.png', 'icons/icon-512.png',
  ...['mckenzie', 'plank', 'birddog'].flatMap(id => [`media/${id}.jpg`, `media/${id}-loop.mp4`]),
  'media/mckenzie-up.mp4', 'media/mckenzie-down.mp4',
  'media/birddog-a-out.mp4', 'media/birddog-a-back.mp4', 'media/birddog-b-out.mp4', 'media/birddog-b-back.mp4'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(FILES)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys()
    .then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
// 네트워크 우선, 실패하면 캐시 (업데이트가 바로 반영되도록)
self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        if (res.status === 200 && new URL(e.request.url).origin === location.origin) {
          const copy = res.clone();
          caches.open(VERSION).then(c => c.put(e.request, copy));
        }
        return res;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
