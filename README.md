# Booxnet

Komplett kostenfreies Text-to-Speech: PDF hochladen, Stimme auswählen und
sich das Buch vorlesen lassen – 10 Studio-Stimmen in 31 Sprachen, komplett
offline und im Look einer nativen iOS-App.

## Features

- **PDF-Upload:** PDFs werden lokal im Browser geparst (pdf.js), der Text wird
  pro Seite extrahiert und zusammen mit einem Cover-Thumbnail in IndexedDB
  gespeichert. Es verlässt keine Datei das Gerät.
- **Studio-Stimmen (Supertonic 3):** 10 Preset-Stimmen (Alex, James,
  Emma, …) in Studioqualität (44,1 kHz), jede spricht 31 Sprachen. Das
  gemeinsame Sprachmodell wird einmalig geladen (ca. 400 MB → OPFS), die
  einzelnen Stimmen sind winzige Style-Dateien und laden bei Bedarf. Die
  Buchsprache wird per Stopwort-Heuristik erkannt, unklare Texte laufen im
  sprachagnostischen Modus (`na`). Personalisiertes Probehören („Hallo,
  ich bin Alex.").
- **Ruckelfrei:** Die komplette ONNX-Inferenz (onnxruntime-web, WebGPU mit
  WASM-Fallback, Sessions werden wiederverwendet) läuft in einem Web
  Worker – die Oberfläche bleibt beim Vorlesen und Scrollen flüssig.
  Off-Screen-Seiten werden per `content-visibility` vom Layout
  ausgenommen, Seiten rendern memoisiert.
- **Natürlicher Lesefluss:** Pausen an Satzenden mit leichtem Zufalls-
  Jitter (kein metronomischer Gleichtakt), längere Pausen an
  Seitenwechseln, hörbare Atmer an Absatzanfängen über Supertonics
  `<breath>`-Expression-Tag, höhere Denoising-Qualität bei WebGPU. Das
  Lesetempo (0,5×–2×) wird nativ in der Synthese umgesetzt statt das
  Audio zu beschleunigen, und über Zeilenumbrüche getrennte Wörter
  („Bei-spiel") werden beim PDF-Import wieder zusammengefügt. Beim
  Auswählen stellt sich jede Stimme selbst vor („Hallo, ich bin Alex.").
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
| Supertonic 3 (portiert, MIT) | Studio-Stimmen via onnxruntime-web (WebGPU/WASM) im Web Worker |
| IndexedDB (idb) | Lokale Buch-Bibliothek |
| vite-plugin-pwa (Workbox) | Offline-Fähigkeit und Installierbarkeit |

## Hinweise

- Gescannte PDFs ohne Textebene enthalten keinen extrahierbaren Text und
  können nicht vorgelesen werden (kein OCR).
- Erster Start benötigt einmalig Internet: Das Sprachmodell kommt von
  Hugging Face bzw. dem eigenen Spiegel (→ OPFS), die WASM-Binaries von
  cdnjs (→ Service-Worker-Cache). Ab dann läuft die Synthese vollständig
  offline auf dem Gerät.
- Die Synthese erzeugt pro Satz eine kurze Audiodatei; die nächsten Sätze
  werden während der Wiedergabe im Worker vorab berechnet, damit es keine
  Lücken gibt.
- **Supertonic 3 – Zukunftssicherung:** Supertone hat angekündigt, das
  Repository zu archivieren (Juli 2026). Deshalb ist der relevante
  Upstream-Code (MIT) unter `vendor/supertonic/` im Projekt konserviert
  (siehe `vendor/supertonic/NOTICE.md`), und die Modelle (OpenRAIL-M)
  lassen sich mit `node scripts/mirror-supertonic.mjs` nach
  `public/supertonic/` spiegeln – die App nutzt den Spiegel automatisch
  bevorzugt und fällt nur auf Hugging Face zurück.
