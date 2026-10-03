// Spielstand-Migrationen: bei jeder Datenänderung SAVE_VERSION erhöhen und
// einen Schritt in MIGRATIONS ergänzen, damit bestehende Spielstände angepasst werden.
export const SAVE_VERSION = 1;

export const MIGRATIONS = {
  // 0 -> 1: Spielstände ohne Versionsfeld übernehmen
  0: (data) => data,
};

export function migrateSave(data) {
  if (!data || typeof data !== 'object') return null;
  let version = Number.isInteger(data.saveVersion) ? data.saveVersion : 0;
  let current = { ...data };
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (step) current = step(current);
    version += 1;
  }
  current.saveVersion = SAVE_VERSION;
  return current;
}
