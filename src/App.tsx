import { IonApp, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { useEffect } from 'react'
import { Redirect, Route } from 'react-router-dom'
import { isStudioEngineInstalled } from './lib/supertonic/assets'
import { studioWarmup } from './lib/supertonic/client'
import { getSavedVoiceId } from './lib/tts'
import { STUDIO_VOICES, studioVoiceById } from './lib/voices'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'
import WelcomePage from './pages/WelcomePage'

export default function App() {
  // One-time cleanup: earlier versions stored Piper voice models under
  // OPFS "piper"; that engine is gone, so free the space.
  useEffect(() => {
    navigator.storage
      ?.getDirectory?.()
      .then((root) => root.removeEntry('piper', { recursive: true }))
      .catch(() => {})
  }, [])

  // Engine-Warmstart beim App-Start, nicht erst beim Öffnen des Readers:
  // Das Laden der ~400 MB Sessions dauert auf Handys zehn Sekunden bis
  // Minuten. Beginnt es erst im Reader, wartet der erste Play-Druck fast
  // die volle Zeit – so zählt schon die Zeit in der Bibliothek mit.
  useEffect(() => {
    void isStudioEngineInstalled().then((installed) => {
      if (!installed) return
      const voice =
        studioVoiceById(getSavedVoiceId()) ?? STUDIO_VOICES[0]
      studioWarmup(voice.id)
    })
  }, [])

  return (
    <IonApp>
      <IonReactRouter basename={import.meta.env.BASE_URL}>
        <IonRouterOutlet>
          <Route exact path="/welcome" component={WelcomePage} />
          <Route exact path="/library" component={LibraryPage} />
          <Route exact path="/reader/:id" component={ReaderPage} />
          <Route exact path="/">
            <Redirect to="/library" />
          </Route>
        </IonRouterOutlet>
      </IonReactRouter>
    </IonApp>
  )
}
