var VERSION = "schema-demo-v1.01";
var SHELL = ["./", "./index.html", "./manifest.json", "./icon-192.png", "./icon-512.png"];

self.addEventListener("install", function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).catch(function () {}));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.map(function (k) {
      if (k !== VERSION) return caches.delete(k);
      return null;
    }));
  }));
  self.clients.claim();
});

self.addEventListener("fetch", function (e) {
  var url = e.request.url;
  // لا تُخزَّن نداءات قاعدة البيانات ولا الخطوط الخارجية — الشبكة أولاً دائماً
  if (url.indexOf("firebasedatabase.app") >= 0 || url.indexOf("fonts.g") >= 0) return;
  if (e.request.method !== "GET") return;
  e.respondWith(
    caches.match(e.request).then(function (hit) {
      return hit || fetch(e.request).catch(function () {
        return caches.match("./index.html");
      });
    })
  );
});
