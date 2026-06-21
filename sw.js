// Sol de Huacariz — Service Worker
// Cambia este número para forzar actualización en todos los dispositivos
var VERSION = 'sdh-v3.1';
var CACHE = VERSION;

self.addEventListener('install', function(e) {
  self.skipWaiting();
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== CACHE; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function(e) {
  // Para archivos HTML: siempre red primero, caché como fallback
  if (e.request.mode === 'navigate' || e.request.url.endsWith('.html')) {
    e.respondWith(
      fetch(e.request).then(function(r) {
        var rc = r.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, rc); });
        return r;
      }).catch(function() {
        return caches.match(e.request);
      })
    );
    return;
  }
  // Para otros recursos: caché primero
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request).then(function(nr) {
        var rc = nr.clone();
        caches.open(CACHE).then(function(c) { c.put(e.request, rc); });
        return nr;
      });
    })
  );
});
