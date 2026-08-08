import { IonApp, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { useEffect } from 'react'
import { Redirect, Route } from 'react-router-dom'
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
