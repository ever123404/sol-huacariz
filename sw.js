// Sol de Huacariz — Service Worker v5.1
// Incrementar VERSION para forzar actualización en todos los dispositivos
var VERSION = 'sdh-v8.4';
var ARCHIVOS = [
  './ever.html','./jorge.html','./carlos.html',
  './administrador.html','./mozos.html',
  './cocina.html','./bar.html','./caja.html'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(VERSION).then(function(cache) {
      return cache.addAll(ARCHIVOS);
    }).then(function() { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.filter(function(k) { return k !== VERSION; })
            .map(function(k) { return caches.delete(k); })
      );
    }).then(function() { return self.clients.claim(); })
    .then(function() {
      return self.clients.matchAll({type:'window'});
    }).then(function(clients) {
      clients.forEach(function(c) { c.postMessage({type:'SW_UPDATED',version:VERSION}); });
    })
  );
});

self.addEventListener('fetch', function(e) {
  if (e.request.mode === 'navigate' ||
      ARCHIVOS.some(function(a) { return e.request.url.includes(a.replace('./','/')); })) {
    e.respondWith(
      fetch(e.request, {cache:'no-store'})
        .then(function(r) {
          var rc = r.clone();
          caches.open(VERSION).then(function(c) { c.put(e.request, rc); });
          return r;
        }).catch(function() { return caches.match(e.request); })
    );
    return;
  }
  e.respondWith(
    caches.match(e.request).then(function(r) {
      return r || fetch(e.request);
    })
  );
});
