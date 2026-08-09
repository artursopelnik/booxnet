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
import { useT } from '../lib/useT'
import {
  getInstallMethod,
  onInstallChange,
  promptInstall,
  type InstallMethod,
} from '../lib/pwa'

/**
 * "App"-Bereich der Bibliothek: genau EIN Eintrag. Solange die App noch
 * nicht installiert ist, "Zum Home-Bildschirm hinzufügen"; danach (bzw. wo
 * keine Installation möglich ist) der Update-Eintrag.
 */
export default function AppSection() {
  const t = useT()
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
          t('update.noServiceWorker'),
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
          message: t('update.upToDate'),
          duration: 3000,
        })
      }
    } catch {
      presentToast({
        message:
          t('update.failed'),
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
        {installMethod !== null ? (
          <IonItem button onClick={() => void install()}>
            <IonIcon
              aria-hidden="true"
              slot="start"
              icon={addCircleOutline}
              color="primary"
            />
            <IonLabel>
              <h2>{t('install.addToHome')}</h2>
            </IonLabel>
          </IonItem>
        ) : (
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
                {hasUpdate ? t('update.install') : t('update.check')}
              </h2>
              {hasUpdate && <IonNote>{t('update.tapToReload')}</IonNote>}
            </IonLabel>
            {checking && <IonSpinner slot="end" name="crescent" />}
          </IonItem>
        )}
      </IonList>
      <IonAlert
        isOpen={showIosHelp}
        onDidDismiss={() => setShowIosHelp(false)}
        header={t('install.header')}
        message={
          t('install.iosHelp')
        }
        buttons={[t('common.understood')]}
      />
    </>
  )
}
