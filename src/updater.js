// Erzwingt Updates: prüft version.json (nie gecacht), und lädt bei neuer Version
// die App nach, nachdem alle Caches geleert und der Service Worker erneuert wurde.
const VERSION_KEY = 'festungskampf.appVersion';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

async function fetchRemoteVersion() {
  const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return (await res.json()).version;
}

async function forceUpdate(version) {
  if ('caches' in window) {
    const keys = await caches.keys();
    await Promise.all(keys.map((k) => caches.delete(k)));
  }
  if ('serviceWorker' in navigator) {
    const regs = await navigator.serviceWorker.getRegistrations();
    await Promise.all(regs.map((r) => r.unregister()));
  }
  localStorage.setItem(VERSION_KEY, version);
  window.location.reload();
}

export async function checkForUpdate() {
  try {
    const remote = await fetchRemoteVersion();
    const known = localStorage.getItem(VERSION_KEY);
    if (!known) {
      localStorage.setItem(VERSION_KEY, remote);
    } else if (known !== remote) {
      await forceUpdate(remote);
      return true;
    }
  } catch (err) {
    console.warn('Update-Prüfung fehlgeschlagen', err);
  }
  return false;
}

export function startUpdater() {
  if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }
  checkForUpdate();
  setInterval(checkForUpdate, CHECK_INTERVAL_MS);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') checkForUpdate();
  });
}
