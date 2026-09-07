var CACHE_NAME = "marga-research-hub-v2";
var OFFLINE_URL = "offline.html";
var CORE_ASSETS = [
  OFFLINE_URL,
  "site_logo/marga-logo.jpg"
];

// A response that arrived via an HTTP redirect carries response.redirected
// === true. Navigation requests (mode: "navigate") always have
// redirect: "manual" internally, and Chrome refuses to let a
// "redirected" response satisfy them - "a redirected response was used
// for a request whose redirect mode is not 'follow'". If offline.html
// (or any core asset) is served behind a redirect on the Worker, that
// flag rides along into the cache and silently breaks the fallback.
// Rebuilding a plain Response with the same body/status/headers resets
// redirected back to false.
function stripRedirected(response) {
  if (!response.redirected) return Promise.resolve(response);
  return response.blob().then(function (body) {
    return new Response(body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers
    });
  });
}

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
              return stripRedirected(response);
            })
            .then(function (finalResponse) {
              return cache.put(url, finalResponse);
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
        if (cachedResponse) return cachedResponse;
        // Cache miss (e.g. the very first offline attempt before install
        // finished). event.request.redirect is "manual" for navigations,
        // so rebuild the request with redirect: "follow" before fetching
        // live - otherwise a redirected offline.html comes back as an
        // opaque redirect, which the browser also refuses to render.
        var liveRequest = event.request.mode === "navigate"
          ? new Request(event.request, { redirect: "follow" })
          : event.request;
        return fetch(liveRequest).then(stripRedirected);
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
