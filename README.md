# Booxnet

Komplett kostenfreies Text-to-Speech: PDF hochladen, Stimme auswählen und
sich das Buch vorlesen lassen – über 125 natürlich klingende Stimmen in mehr
als 40 Sprachen, komplett offline und im Look einer nativen iOS-App.

## Features

- **PDF-Upload:** PDFs werden lokal im Browser geparst (pdf.js), der Text wird
  pro Seite extrahiert und zusammen mit einem Cover-Thumbnail in IndexedDB
  gespeichert. Es verlässt keine Datei das Gerät.
- **Vorlesen mit Stimmenauswahl:** Drei Engines in einer Auswahl:
  - **Studio-Stimmen (Supertonic 3):** 10 Preset-Stimmen (Alex, James,
    Emma, …) in Studioqualität (44,1 kHz), jede spricht 31 Sprachen. Das
    gemeinsame Sprachmodell wird einmalig geladen (ca. 400 MB → OPFS), die
    einzelnen Stimmen sind winzige Style-Dateien und laden bei Bedarf.
    Inferenz via onnxruntime-web (WebGPU, WASM-Fallback) mit Session-
    Wiederverwendung. Die Buchsprache wird per Stopwort-Heuristik erkannt,
    unklare Texte laufen im sprachagnostischen Modus (`na`).
  - **Neuronale Stimmen (Piper):** der komplette Katalog mit 118 Stimmen
    in über 30 Sprachen, per ONNX/WASM im Browser. Je Stimme ein Download
    (ca. 28–110 MB → OPFS), danach offline.
  - **Systemstimmen** über die Web Speech API (auf iOS die Apple-Stimmen,
    auf Android die Google-Stimmen), sofort verfügbar, 0 MB.
  Alle Stimmen mit Suche, Sprachgruppierung und personalisiertem
  Probehören („Hallo, ich bin Thorsten.").
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
| Supertonic 3 (portiert, MIT) | Studio-Stimmen via onnxruntime-web (WebGPU/WASM) |
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
- **Supertonic 3 – Zukunftssicherung:** Supertone hat angekündigt, das
  Repository zu archivieren (Juli 2026). Deshalb ist der relevante
  Upstream-Code (MIT) unter `vendor/supertonic/` im Projekt konserviert
  (siehe `vendor/supertonic/NOTICE.md`), und die Modelle (OpenRAIL-M)
  lassen sich mit `node scripts/mirror-supertonic.mjs` nach
  `public/supertonic/` spiegeln – die App nutzt den Spiegel automatisch
  bevorzugt und fällt nur auf Hugging Face zurück. Auf älteren iPhones
  sind 400 MB und WebGPU ein Thema; dort sind Piper-Stimmen die sichere
  Wahl.
- Kokoro wurde bewusst nicht integriert: Es unterstützt kein Deutsch.
