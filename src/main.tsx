import React from 'react'
import { createRoot } from 'react-dom/client'
import { setupIonicReact } from '@ionic/react'
import App from './App'

import '@ionic/react/css/core.css'
import '@ionic/react/css/normalize.css'
import '@ionic/react/css/structure.css'
import '@ionic/react/css/typography.css'
import '@ionic/react/css/padding.css'
import '@ionic/react/css/float-elements.css'
import '@ionic/react/css/text-alignment.css'
import '@ionic/react/css/text-transformation.css'
import '@ionic/react/css/flex-utils.css'
import '@ionic/react/css/display.css'
// Klassen-Paletten statt System-Automatik: Die Darstellung ist in der
// Bibliothek einstellbar (Automatisch/Hell/Dunkel/E-Ink, lib/theme.ts).
import '@ionic/react/css/palettes/dark.class.css'
import '@ionic/react/css/palettes/high-contrast.class.css'
import './theme.css'
import { applyStoredTheme } from './lib/theme'

setupIonicReact({ mode: 'ios' })
applyStoredTheme()

// Browser-Zoom aus (siehe Abwägung in index.html): iOS ignoriert
// user-scalable=no seit iOS 10 – Pinch-Zoom lässt sich dort nur über die
// Safari-eigenen gesture*-Events unterbinden. Die Events feuern
// ausschließlich bei Mehrfinger-Gesten und werden sonst nirgends genutzt;
// Doppeltipp-Zoom fängt touch-action in theme.css ab.
for (const type of ['gesturestart', 'gesturechange']) {
  document.addEventListener(type, (event) => event.preventDefault(), {
    passive: false,
  })
}

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
)
