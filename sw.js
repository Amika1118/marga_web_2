var CACHE_NAME = "marga-research-hub-v2";
var OFFLINE_URL = "offline.html";
var CORE_ASSETS = [
  OFFLINE_URL,
  "site_logo/marga-logo.jpg"
];

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      // cache.addAll() is atomic: if ANY request here fails (404, a
      // transient network error, an opaque response, etc.) the WHOLE
      // install rejects and NOTHING is cached - including offline.html.
      // That silently breaks the offline fallback with no visible error.
      // Cache each asset independently instead, so one bad asset can
      // never take offline.html down with it. { cache: "reload" } skips
      // the HTTP cache so we always store a genuinely fresh copy.
      return Promise.all(
        CORE_ASSETS.map(function (url) {
          return fetch(url, { cache: "reload" })
            .then(function (response) {
              if (!response.ok) throw new Error("Bad response (" + response.status + ") for " + url);
              return cache.put(url, response);
            })
            .catch(function (error) {
              console.warn("[sw] failed to precache", url, error);
            });
        })
      );
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
