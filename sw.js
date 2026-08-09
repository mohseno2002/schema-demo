var VERSION = "schema-demo-v4.70";
var SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
});
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) { return k !== VERSION ? caches.delete(k) : null; }));
  }));
  self.clients.claim();
});
self.addEventListener("fetch", function (e) {
  var url = e.request.url;
  // استثناء: القاعدة، جوجل شيت، البلاطات، الخطوط — الشبكة أولاً بلا تخزين
  if (url.indexOf("firebasedatabase.app") >= 0 || url.indexOf("docs.google.com") >= 0 ||
      url.indexOf("arcgisonline") >= 0 || url.indexOf("tile.openstreetmap") >= 0 ||
      url.indexOf("gibs.earthdata") >= 0 || url.indexOf("fonts.g") >= 0 ||
      url.indexOf("unpkg.com") >= 0) return;
  if (e.request.method !== "GET") return;
  e.respondWith(caches.match(e.request).then(function (hit) {
    return hit || fetch(e.request).catch(function () { return caches.match("./index.html"); });
  }));
});
