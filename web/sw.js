// Guarda o app no celular para abrir sem internet.
const V = "volei-v1";
const ARQS = ["./", "index.html", "app.js", "logica.js", "manifest.json", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(V).then((c) => c.addAll(ARQS)));
  self.skipWaiting();
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== V).map((k) => caches.delete(k)))));
});
self.addEventListener("fetch", (e) => {
  e.respondWith(
    fetch(e.request).then((r) => {
      const copia = r.clone();
      caches.open(V).then((c) => c.put(e.request, copia));
      return r;
    }).catch(() => caches.match(e.request))
  );
});
