import { IonApp, IonRouterOutlet } from '@ionic/react'
import { IonReactRouter } from '@ionic/react-router'
import { Redirect, Route } from 'react-router-dom'
import LibraryPage from './pages/LibraryPage'
import ReaderPage from './pages/ReaderPage'

export default function App() {
  return (
    <IonApp>
      <IonReactRouter basename={import.meta.env.BASE_URL}>
        <IonRouterOutlet>
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
