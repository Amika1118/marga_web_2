var CACHE_NAME = "marga-research-hub-v2";
var OFFLINE_URL = "offline.html";
var CORE_ASSETS = [
  OFFLINE_URL,
  "site_logo/marga-logo.jpg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cache.addAll(CORE_ASSETS);
    }).then(function () {
      return self.skipWaiting();
    })
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches.keys().then(function (keys) {
      return Promise.all(keys.map(function (key) {
        if (key !== CACHE_NAME) return caches.delete(key);
        return null;
      }));
    }).then(function () {
      return self.clients.claim();
    })
  );
});

self.addEventListener("fetch", function (event) {
  var requestUrl = new URL(event.request.url);
  var isCachedOfflineAsset = requestUrl.pathname.endsWith("/offline.html") ||
    requestUrl.pathname.endsWith("/site_logo/marga-logo.jpg");

  if (isCachedOfflineAsset) {
    event.respondWith(
      caches.match(event.request).then(function (cachedResponse) {
        return cachedResponse || fetch(event.request);
      })
    );
    return;
  }

  if (event.request.mode !== "navigate") return;

  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(OFFLINE_URL);
    })
  );
});