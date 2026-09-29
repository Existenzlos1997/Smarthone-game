# Smarthone-game — Festungskampf

Ein 2D-Lane-Auto-Battler-Prototyp im Stil eines mobilen Sammelkartenspiels
(Menü, Spieler-Level, tägliche Kartenjagd, Festungsausbau, Kampf-Deck).

## Spielkonzept

- **Hauptmenü**: zeigt Spieler-Level, XP-Fortschritt und Münzen (Clash-Royale-artig).
- **Tägliche Jagd**: einmal pro 24h kann eine zufällige Karte (nach Seltenheit
  gewichtet) gefunden werden, die dauerhaft der Kartensammlung hinzugefügt wird.
- **Festung ausrüsten** (außerhalb des Kampfes): die Festung hat 4 Slots, die
  ausschließlich mit eigenen Karten aus der Sammlung bestückt werden können.
  Diese Karten verteidigen die Festung automatisch während eines Kampfes.
- **Kampf-Deck**: vor dem Kampf wird ein eigenes Deck aus genau 4 Karten
  zusammengestellt.
- **Kampf**: eine 2D-Lane-Simulation, in der die 4 Deck-Karten automatisch von
  links nach rechts (bzw. umgekehrt für den Gegner) laufen, aufeinandertreffen
  und von selbst kämpfen, bis eine der beiden Festungen fällt.

## Projektstruktur

- `src/cards.js` — Kartenbibliothek und gewichtete Zufallsauswahl für die
  tägliche Jagd.
- `src/player.js` — Spieler-Fortschritt (Level/XP, Sammlung, Festungs-Slots,
  Kampf-Deck, Jagd-Cooldown).
- `src/battle.js` — deterministische 2D-Lane-Kampfsimulation.
- `index.html`, `style.css`, `app.js` — spielbarer Browser-Prototyp, der die
  obigen Module verwendet und den Spielstand in `localStorage` speichert.
- `test/` — Unit-Tests für die Spiellogik (Node's eingebauter Test-Runner).

## Entwickeln & Spielen

```bash
# Spielbaren Prototyp lokal starten (beliebiger statischer Server reicht):
npx http-server .
# dann im Browser http://localhost:8080 öffnen
```

## Tests ausführen

```bash
npm test
```
