// Sol de Huacariz — Service Worker v3.2
// Incrementar VERSION para forzar actualización en todos los dispositivos
var VERSION = 'sdh-v4.5';

self.addEventListener('install', function(e) {
  // Activa inmediatamente sin esperar
  e.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', function(e) {
  // Elimina todos los cachés anteriores
  e.waitUntil(
    caches.keys().then(function(keys) {
      return Promise.all(
        keys.map(function(k) { return caches.delete(k); })
      );
    }).then(function() {
      return self.clients.claim();
    }).then(function() {
      // Recarga todos los clientes abiertos
      return self.clients.matchAll({type:'window'});
    }).then(function(clients) {
      clients.forEach(function(client) {
        client.postMessage({type:'SW_UPDATED'});
      });
    })
  );
});

self.addEventListener('fetch', function(e) {
  // Siempre red primero — nunca caché para HTML
  if (e.request.url.endsWith('.html') || e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request.url + '?v=' + VERSION, {cache:'no-store'})
        .catch(function() { return caches.match(e.request); })
    );
    return;
  }
  // Para otros recursos: red primero
  e.respondWith(fetch(e.request).catch(function() { return caches.match(e.request); }));
});
