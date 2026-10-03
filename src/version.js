// Version der installierten App-Hülle. Bei jedem neuen App-Build erhöhen.
export const APP_VERSION = '0.1.0';

export function compareVersions(a, b) {
  const pa = String(a).split('.').map((n) => parseInt(n, 10) || 0);
  const pb = String(b).split('.').map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

export function isAppOutdated(installed, minAppVersion) {
  return !!minAppVersion && compareVersions(installed, minAppVersion) < 0;
}
