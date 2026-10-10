// Service worker do VanControl: permite abrir o app sem sinal (a fila offline cuida dos dados).
const VERSAO = 'vancontrol-v2';
const SHELL = ['/', '/index.html', '/manifest.webmanifest', '/icons/icon-192.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSAO).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(ks => Promise.all(ks.filter(k => k !== VERSAO).map(k => caches.delete(k)))).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  // API: sempre rede (os dados offline ficam no app)
  if (url.origin === self.location.origin && url.pathname.startsWith('/api')) return;

  // Páginas: rede primeiro, cópia salva se estiver sem sinal
  if (req.mode === 'navigate') {
    e.respondWith(
      fetch(req).then(res => { const c = res.clone(); caches.open(VERSAO).then(x => x.put('/index.html', c)); return res; })
        .catch(() => caches.match('/index.html'))
    );
    return;
  }

  // Arquivos do app e fontes de ícones: cache primeiro
  const fonte = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (url.origin === self.location.origin || fonte) {
    e.respondWith(
      caches.match(req).then(hit => hit || fetch(req).then(res => {
        if (res.ok || res.type === 'opaque') { const c = res.clone(); caches.open(VERSAO).then(x => x.put(req, c)); }
        return res;
      }))
    );
  }
});
