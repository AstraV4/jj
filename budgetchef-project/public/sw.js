// Service worker AUTO-DESTRUCTEUR : supprime tous les caches, se désinstalle,
// puis recharge les pages ouvertes. Élimine les pages blanches dues à un cache périmé.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    try {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => client.navigate(client.url));
    } catch (e) { /* ignore */ }
  })());
});
// Pas de handler 'fetch' -> toutes les requêtes passent directement par le réseau.
