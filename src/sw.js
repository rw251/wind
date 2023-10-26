const CACHE_NAME = 'windyx-v1.8';

// Never cache
const nc = [/\.map$/, /manifest.*\.js(?:on)?$/, /\.htaccess/];

// Network first
const nf = [/script.js/, /index.html/, /wind.rw251.com\/getLatest/];

const precacheFiles = ['/', 'script.js', 'index.html'];

self.addEventListener('install', function (event) {
  console.log(`Install event called for ${CACHE_NAME}`);
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log(`Adding files to cache ${CACHE_NAME}...`);
      cache.addAll(precacheFiles);
    })
  );
});

self.addEventListener('activate', function (event) {
  console.log(`Activate event called for ${CACHE_NAME}`);
  event.waitUntil(
    caches.keys().then(function (cacheNames) {
      return Promise.all(
        cacheNames.map(function (cacheName) {
          if (CACHE_NAME !== cacheName) {
            console.log(`Removing old cache: ${cacheName}`);
            return caches.delete(cacheName);
          }
        })
      );
    })
  );
});

self.addEventListener('fetch', function (event) {
  // Parse the URL:
  const requestURL = new URL(event.request.url);

  const isNC = nc.reduce(function (hadMatch, nextRegex) {
    return hadMatch || nextRegex.test(requestURL);
  }, false);

  if (isNC) {
    NetworkOnly(event);
    return;
  }

  const isNF = nf.reduce(function (hadMatch, nextRegex) {
    return hadMatch || nextRegex.test(requestURL);
  }, false);

  if (isNF) {
    NetworkWithCacheFallback(event);
    return;
  }
  NetworkWithCacheFallback(event);
});

// fetch indicates offline.
var notifyOffline = function () {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) =>
      client.postMessage({ offline: true, online: false })
    );
  });
};

// Passed into then block of a fetch so pass through the
// result
var notifyOnline = function (response) {
  self.clients.matchAll().then((clients) => {
    clients.forEach((client) =>
      client.postMessage({ online: true, offline: false })
    );
  });
  return response;
};

var NetworkOnly = function (event) {
  console.log(`${event.request.url} || network only`);
  event.respondWith(
    fetch(event.request).then(notifyOnline).catch(notifyOffline)
  );
};

var NetworkWithCacheFallback = function (event) {
  const id = (Math.random() * 1000000).toString().substr(0, 4);
  console.log(`${id}|| NWCF for: ${event.request.url}`);
  event.respondWith(
    caches.open(CACHE_NAME).then((cache) => {
      // Go to the network first
      return fetch(event.request.url)
        .then((fetchedResponse) => {
          cache.put(event.request, fetchedResponse.clone());
          notifyOnline();
          return fetchedResponse;
        })
        .catch(() => {
          // If the network is unavailable, get
          console.log(`${id}|| NWCF failed - check cache..`);
          return cache.match(event.request.url);
        });
    })
  );
};
