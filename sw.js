var CACHE_NAME = "marga-research-hub-v4";
var OFFLINE_URL = "offline.html";
var CORE_ASSETS = [
  OFFLINE_URL,
  "site_logo/marga-logo.jpg"
];

// How often to check the network for a newer offline.html / logo while the
// visitor is browsing online. Keeps the fallback fresh without re-fetching
// on literally every click.
var REFRESH_INTERVAL_MS = 60 * 60 * 1000; // 1 hour
var REFRESH_META_KEY = "https://sw-meta.local/last-offline-refresh";

// A response that arrived after following an HTTP redirect carries an
// internal "redirected" flag, and Cache Storage preserves it. Navigation
// requests always have their redirect mode forced to "manual" by the
// browser, and Chrome refuses to satisfy a "manual" request with a cached
// response that's flagged as redirected - that's what throws "a redirected
// response was used for a request whose redirect mode is not follow".
// Rebuilding a plain Response from the body/status/headers strips that
// flag, so anything we cache is always safe to serve to a navigation,
// redirected origin or not.
function toCacheableResponse(response) {
  if (!response.redirected) return Promise.resolve(response);
  return response.blob().then(function (body) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  });
}

// Fetches each core asset straight from the network, bypassing the
// browser's HTTP cache. Plain cache.addAll()/fetch() can silently reuse an
// already-cached HTTP response, so a page/logo update on the server
// wouldn't necessarily make it into the Cache Storage entry. {cache:
// "reload"} forces an actual round-trip.
function cacheCoreAssetsFresh(cache) {
  return Promise.all(
    CORE_ASSETS.map(function (url) {
      return fetch(url, { cache: "reload" })
        .then(function (response) {
          if (response && response.ok) {
            return toCacheableResponse(response).then(function (cacheable) {
              return cache.put(url, cacheable);
            });
          }
        })
        .catch(function () {
          // Offline or asset briefly unreachable - leave whatever is
          // already cached in place rather than failing the whole batch.
        });
    })
  );
}

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(CACHE_NAME).then(function (cache) {
      return cacheCoreAssetsFresh(cache);
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

// Re-fetches CORE_ASSETS from the network and overwrites the cached copies,
// but only if it's been more than REFRESH_INTERVAL_MS since the last time -
// called opportunistically whenever we know we're online (see the
// navigate handler below).
function maybeRefreshOfflineCache(cache) {
  return cache.match(REFRESH_META_KEY)
    .then(function (metaResponse) {
      return metaResponse ? metaResponse.text() : null;
    })
    .then(function (lastText) {
      var last = lastText ? parseInt(lastText, 10) : 0;
      if (Date.now() - last < REFRESH_INTERVAL_MS) return;
      return cacheCoreAssetsFresh(cache).then(function () {
        return cache.put(REFRESH_META_KEY, new Response(String(Date.now())));
      });
    });
}

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

  // A navigation request only reaches here if the browser thinks it's
  // worth trying the network, which is a good, cheap signal that we're
  // online right now. Piggyback a throttled refresh of the offline
  // fallback so it doesn't go stale between deploys.
  event.waitUntil(
    caches.open(CACHE_NAME).then(maybeRefreshOfflineCache)
  );

  event.respondWith(
    fetch(event.request).catch(function () {
      return caches.match(OFFLINE_URL);
    })
  );
});
