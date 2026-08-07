# Vorleser

Eine Speechify-Alternative als Web-App: PDF hochladen, Stimme auswählen und
sich das Buch vorlesen lassen – komplett offline und im Look einer nativen
iOS-App.

## Features

- **PDF-Upload:** PDFs werden lokal im Browser geparst (pdf.js), der Text wird
  pro Seite extrahiert und zusammen mit einem Cover-Thumbnail in IndexedDB
  gespeichert. Es verlässt keine Datei das Gerät.
- **Vorlesen mit Stimmenauswahl:** Zwei Engines in einer Auswahl:
  - **Systemstimmen** über die Web Speech API (auf iOS die Apple-Stimmen,
    auf Android die Google-Stimmen), sofort verfügbar.
  - **Neuronale Stimmen** (Piper) laufen per ONNX/WASM direkt im Browser –
    deutlich natürlicher. Einmal herunterladen (ca. 28–110 MB, wird in OPFS
    gespeichert), danach komplett offline. Kuratierte Auswahl u. a. mit
    Thorsten, Kerstin, Ramona (Deutsch) sowie Stimmen für EN/FR/ES/IT.
  Alle Stimmen sind nach Sprache gruppiert und mit Probehören.
- **Reader mit Satz-Highlighting:** Der aktuell gelesene Satz wird markiert
  und automatisch in den sichtbaren Bereich gescrollt. Tippen auf einen Satz
  springt dorthin. Lesegeschwindigkeit 0,5×–2× einstellbar.
- **Merkt sich alles:** Leseposition pro Buch, gewählte Stimme und Tempo
  bleiben erhalten.
- **Offline als PWA:** Die App ist installierbar („Zum Home-Bildschirm") und
  läuft dank Service Worker vollständig offline.
- **Nativer iOS-Look:** Ionic React im iOS-Modus, inkl. Large Titles,
  Sheet-Modals, Swipe-to-Delete und automatischem Dark Mode.

## Entwicklung

```bash
npm install
npm run dev       # Dev-Server
npm run build     # Produktions-Build (dist/)
npm run preview   # Build lokal testen (nötig für Service Worker/PWA)
```

## Technik

| Baustein | Zweck |
| --- | --- |
| React + TypeScript + Vite | App-Grundgerüst |
| Ionic React (iOS-Modus) | Native iOS-Optik und -Navigation |
| pdfjs-dist | Textextraktion und Cover-Rendering aus PDFs |
| Web Speech API | Sprachausgabe mit Systemstimmen (offline) |
| @diffusionstudio/vits-web (Piper) | Neuronale Offline-Stimmen via ONNX/WASM |
| IndexedDB (idb) | Lokale Buch-Bibliothek |
| vite-plugin-pwa (Workbox) | Offline-Fähigkeit und Installierbarkeit |

## Hinweise

- Gescannte PDFs ohne Textebene enthalten keinen extrahierbaren Text und
  können nicht vorgelesen werden (kein OCR).
- Welche Systemstimmen verfügbar sind, bestimmt das Betriebssystem. Auf iOS
  lassen sich unter *Einstellungen → Bedienungshilfen → Gesprochene Inhalte →
  Stimmen* weitere hochwertige Stimmen herunterladen; als „lokal" markierte
  Stimmen funktionieren ohne Internet.
- Neuronale Stimmen benötigen einmalig Internet: Das Stimmmodell kommt von
  Hugging Face (→ OPFS), die WASM-Binaries von jsdelivr/cdnjs (→ Service-
  Worker-Cache). Ab dann läuft die Synthese vollständig offline auf dem
  Gerät.
- Die neuronale Synthese erzeugt pro Satz eine kurze Audiodatei; die
  nächsten Sätze werden während der Wiedergabe vorab berechnet, damit es
  keine Lücken gibt. Auf schwächeren Geräten empfiehlt sich eine „low"- oder
  „x_low"-Stimme.
