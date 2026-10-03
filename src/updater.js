// Erzwingt Updates: prüft version.json (nie gecacht), und lädt bei neuer Version
// die App nach, nachdem alle Caches geleert und der Service Worker erneuert wurde.
import { APP_VERSION, isAppOutdated } from './version.js';

const VERSION_KEY = 'festungskampf.appVersion';
const CHECK_INTERVAL_MS = 5 * 60 * 1000;

function showForceUpdateDialog(url) {
  if (document.getElementById('force-update')) return;
  const box = document.createElement('div');
  box.id = 'force-update';
  box.style.cssText = 'position:fixed;inset:0;z-index:99999;background:rgba(0,0,0,.92);color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:16px;padding:24px;text-align:center;font-family:sans-serif';
  const h = document.createElement('h2');
  h.textContent = 'Update erforderlich';
  const p = document.createElement('p');
  p.textContent = 'Deine App-Version ist zu alt. Bitte installiere die neue Version, um weiterzuspielen.';
  const a = document.createElement('a');
  a.href = url;
  a.textContent = '⬇ Neue Version herunterladen';
  a.style.cssText = 'background:#f5b301;color:#000;padding:14px 22px;border-radius:10px;font-weight:bold;text-decoration:none';
  box.append(h, p, a);
  document.body.appendChild(box);
}

function isNativeShell() {
  return !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
}

async function fetchRemoteInfo() {
  const res = await fetch(`version.json?t=${Date.now()}`, { cache: 'no-store' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
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
    const info = await fetchRemoteInfo();
    const remote = info.version;
    if (isNativeShell() && info.downloadUrl && isAppOutdated(APP_VERSION, info.minAppVersion)) {
      showForceUpdateDialog(info.downloadUrl);
      return true;
    }
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
