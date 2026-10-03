# Smarthone-game — Festungskampf

Ein 2D-Lane-Auto-Battler-Prototyp im Stil eines mobilen Sammelkartenspiels
(Menü, Spieler-Level, tägliche Kartenjagd, Festungsausbau, Kampf-Deck).

## 📱 Auf dem Handy testen

Das Spiel läuft komplett im Browser — es muss nichts installiert werden.

Nach dem Mergen dieses Branches/PRs in `main` baut eine GitHub-Actions-Workflow
(`.github/workflows/deploy-pages.yml`) die Seite automatisch und veröffentlicht
sie über **GitHub Pages**. Danach ist das Spiel unter folgendem Link
erreichbar (einfach mit dem Smartphone-Browser öffnen):

```
https://existenzlos1997.github.io/Smarthone-game/
```

**Einmalige Einrichtung (nur falls der Link noch nicht funktioniert):**
Repository → Settings → Pages → unter "Build and deployment" → Source auf
**"GitHub Actions"** stellen. Ab dann aktualisiert sich der Link automatisch
bei jedem Push nach `main`.

## Spielkonzept

- **Festung/Hauptmenü**: zeigt Spieler-Level, XP-Fortschritt, Pokale/Arena-
  Fortschritt sowie Münzen und Diamanten (Clash-Royale-artig), dazu eine
  Übersicht der eigenen Kartensammlung mit Kartenstufe. Spielername und Avatar
  lassen sich ändern und werden lokal gespeichert.
- **Levelaufstiege**: jedes neue Spielerlevel belohnt dich mit 50 Münzen.
- **Arena-Aufstiege**: jede neu erreichte Arena bringt einmalig mehr Münzen als
  die vorherige; die erhaltenen Belohnungen werden im Spielstand festgehalten.
- **Tägliche Jagd (Kartenjagd-Minigame)**: einmal pro 24h öffnet sich ein
  eigenes Tap-Reaktionsspiel — eine Fährte erscheint an einer zufälligen
  Position und muss innerhalb kurzer Zeit angetippt werden, bevor sie
  verschwindet (6 Runden). Je höher die Trefferquote, desto seltener die am
  Ende gefundene Karte. Neue Karten kommen in die Sammlung, bereits
  vorhandene Karten werden stattdessen eine Stufe höher gestuft.
- **Tägliche Aufgaben**: gewinne einen Kampf, spiele Karten und wirke Zauber,
  um zusätzliche Münzen zu verdienen. Fortschritt und bereits abgeholte
  Belohnungen bleiben im Spielstand und setzen sich täglich nach UTC zurück.
- **Kampfprotokoll**: die zehn letzten Siege, Niederlagen und Remis werden mit
  Datum, Pokaländerung, Spielzeit, gespielten Karten und Festungszustand lokal
  gespeichert; der Protokolleintrag nennt außerdem die eingesetzten Kreaturen
  und Zauber.
- **Siegesserie**: aktuelle Folge und persönlicher Bestwert werden gespeichert;
  Siege verlängern sie, Niederlagen beenden sie und Remis lassen sie bestehen.
- **Kampfstatistik**: das Profil zählt alle abgeschlossenen Kämpfe, die
  Siegesquote sowie gespielte Karten und gewirkte Zauber dauerhaft.
- **Lokale Sicherung**: Spielstände können als JSON-Datei exportiert und auf
  einem anderen Gerät wiederhergestellt werden. Beim Import wird der bestehende
  Spielstand nach Bestätigung ersetzt.
- **Errungenschaften**: dauerhafte Kampfziele belohnen erreichte Meilensteine
  bei Kämpfen, Siegen, gespielten Karten und gewirkten Zaubern einmalig mit
  Münzen.
- **Festung ausrüsten** (außerhalb des Kampfes): die Festung hat 4 Slots, die
  ausschließlich mit eigenen Karten aus der Sammlung bestückt werden können.
  Diese Karten verteidigen die Festung automatisch während eines Kampfes.
- **Kampf-Deck**: vor dem Kampf wird ein eigenes Deck aus genau 4 Karten
  zusammengestellt.
- **Kampf**: eine 2D-Lane-Simulation, in der die 4 Deck-Karten automatisch von
  links nach rechts (bzw. umgekehrt für den Gegner) laufen, aufeinandertreffen
  und von selbst kämpfen, bis eine der beiden Festungen fällt. Sieg/Niederlage
  verändert die Pokalzahl und damit die Arena.
- **Untere Navigationsleiste**: Shop, Karten (Deck-Builder), Kampf (Festung),
  Jagd und Allianz. Im Shop lassen sich Karten mit Münzen bis Stufe 10 aufwerten;
  jede Stufe verbessert ihre Kampfwerte. Allianzen sind noch ein Platzhalter.

## Projektstruktur

- `src/cards.js` — Kartenbibliothek und generische gewichtete Zufallsauswahl.
- `src/huntGame.js` — Logik des Kartenjagd-Minigames (Ziel-Positionen,
  Treffererkennung, Belohnung nach Trefferquote).
- `src/arenas.js` — Arena-/Pokal-Fortschrittslogik.
- `src/player.js` — Spieler-Fortschritt (Level/XP, Pokale, Gems, Sammlung mit
  Kartenstufen, Festungs-Slots, Kampf-Deck, Jagd-Cooldown).
- `src/battle.js` — deterministische 2D-Lane-Kampfsimulation.
- `index.html`, `style.css`, `app.js` — spielbarer Browser-Prototyp, der die
  obigen Module verwendet und den Spielstand in `localStorage` speichert.
- `test/` — Unit-Tests für die Spiellogik (Node's eingebauter Test-Runner).
- `.github/workflows/deploy-pages.yml` — veröffentlicht die statische Seite
  automatisch auf GitHub Pages.

## Entwickeln & Spielen

```bash
# Spielbaren Prototyp lokal starten (beliebiger statischer Server reicht):
npx http-server .
# dann im Browser http://localhost:8080 öffnen
```

## Native Android- und iOS-App (ohne Store-Veröffentlichung)

Das Projekt verwendet Capacitor, um dieselbe Spieloberfläche in nativen
Android- und iOS-Projekten auszuführen. Es wird dabei keine App in einen Store
hochgeladen. Benötigt werden Node.js 22 oder neuer und npm. Für Android brauchst
du zusätzlich Android Studio mit Android SDK; zum Bauen für iOS brauchst du
macOS mit Xcode.

```bash
npm install
npm run cap:sync
npm run cap:open:android
# Auf macOS zusätzlich oder stattdessen:
npm run cap:open:ios
```

`cap:sync` baut die Webdateien neu und kopiert sie in beide nativen Projekte.
Anschließend kannst du in Android Studio oder Xcode einen Emulator oder ein
angeschlossenes Gerät auswählen und die App starten. Nach Änderungen am Spiel
erneut `npm run cap:sync` ausführen. Die nativen Projektdateien liegen in
`android/` und `ios/`; das erzeugte Web-Build unter `www/` wird nicht eingecheckt.

Bei Pushes, Pull Requests und manuellem Start baut GitHub Actions zusätzlich ein
Android-Debug-APK und eine iOS-Simulator-App. Beide erscheinen als Workflow-
Artefakte für 14 Tage. Das Android-APK ist zum lokalen Testen vorgesehen; die
iOS-Datei ist nur für den Simulator und keine auf einem iPhone installierbare
oder für den Store signierte Veröffentlichung.

### Android-APK installieren

1. Öffne in GitHub **Actions** den erfolgreichen Lauf von **Native app builds**.
2. Lade unter **Artifacts** `festung-von-kaltmark-android-debug` herunter und
   entpacke die ZIP-Datei.
3. Öffne `app-debug.apk` auf dem Android-Gerät. Falls Android nachfragt, erlaube
   deinem Browser oder Dateimanager vorübergehend **Unbekannte Apps installieren**
   und starte die APK erneut.

Das Debug-APK ist für Tests gedacht und mit einem Debug-Schlüssel signiert.

## Tests ausführen

```bash
npm test
```
