import {
  IonAlert,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSpinner,
  useIonToast,
} from '@ionic/react'
import {
  addCircleOutline,
  refreshOutline,
  rocketOutline,
} from 'ionicons/icons'
import { useEffect, useRef, useState } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'
import {
  getInstallMethod,
  onInstallChange,
  promptInstall,
  type InstallMethod,
} from '../lib/pwa'

/**
 * "App"-Bereich der Bibliothek: zum Home-Bildschirm hinzufügen und die
 * PWA per Knopfdruck auf die neuste Version bringen.
 */
export default function AppSection() {
  const [installMethod, setInstallMethod] = useState<InstallMethod>(() =>
    getInstallMethod(),
  )
  const [showIosHelp, setShowIosHelp] = useState(false)
  const [checking, setChecking] = useState(false)
  const [updateReady, setUpdateReady] = useState(false)
  const [presentToast] = useIonToast()
  const registrationRef = useRef<ServiceWorkerRegistration | null>(null)

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      registrationRef.current = registration ?? null
    },
  })

  useEffect(
    () => onInstallChange(() => setInstallMethod(getInstallMethod())),
    [],
  )

  const install = async () => {
    if (installMethod === 'ios-instructions') {
      setShowIosHelp(true)
      return
    }
    await promptInstall()
  }

  const checkForUpdate = async () => {
    const registration = registrationRef.current
    if (!registration) {
      presentToast({
        message:
          'Update-Prüfung hier nicht möglich – die App läuft ohne Service Worker (z. B. im privaten Fenster).',
        duration: 4000,
        color: 'warning',
      })
      return
    }
    setChecking(true)
    try {
      await registration.update()
      // A found update lands in "installing" – wait until it settles.
      const installing = registration.installing
      if (installing) {
        await new Promise<void>((resolve) => {
          installing.addEventListener('statechange', () => {
            if (
              installing.state === 'installed' ||
              installing.state === 'redundant'
            ) {
              resolve()
            }
          })
        })
      }
      if (registration.waiting) {
        setUpdateReady(true)
      } else {
        presentToast({
          message: 'Du hast bereits die neuste Version.',
          duration: 3000,
        })
      }
    } catch {
      presentToast({
        message:
          'Update-Prüfung fehlgeschlagen. Prüfe deine Internetverbindung und versuche es später noch einmal.',
        duration: 4000,
        color: 'danger',
      })
    } finally {
      setChecking(false)
    }
  }

  const hasUpdate = needRefresh || updateReady

  return (
    <>
      <IonList inset>
        {installMethod !== null && (
          <IonItem button onClick={() => void install()}>
            <IonIcon
              aria-hidden="true"
              slot="start"
              icon={addCircleOutline}
              color="primary"
            />
            <IonLabel>
              <h2>Zum Home-Bildschirm hinzufügen</h2>
            </IonLabel>
          </IonItem>
        )}
        <IonItem
          button={!checking}
          onClick={
            checking
              ? undefined
              : hasUpdate
                ? () => void updateServiceWorker(true)
                : () => void checkForUpdate()
          }
        >
          <IonIcon
            aria-hidden="true"
            slot="start"
            icon={hasUpdate ? rocketOutline : refreshOutline}
            color={hasUpdate ? 'primary' : 'medium'}
          />
          <IonLabel>
            <h2>
              {hasUpdate ? 'Update installieren' : 'Nach Update suchen'}
            </h2>
            {hasUpdate && <IonNote>Tippen zum Neuladen</IonNote>}
          </IonLabel>
          {checking && <IonSpinner slot="end" name="crescent" />}
        </IonItem>
      </IonList>
      <IonAlert
        isOpen={showIosHelp}
        onDidDismiss={() => setShowIosHelp(false)}
        header="Zum Home-Bildschirm"
        message={
          'Auf dem iPhone/iPad geht das nur über Safari selbst: Tippe unten auf das Teilen-Symbol (Quadrat mit Pfeil nach oben) und wähle dann „Zum Home-Bildschirm". Danach startet Booxnet wie eine App.'
        }
        buttons={['Verstanden']}
      />
    </>
  )
}
