import {
  IonAlert,
  IonButton,
  IonContent,
  IonIcon,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonProgressBar,
  useIonRouter,
} from '@ionic/react'
import {
  cloudDownloadOutline,
  phonePortraitOutline,
  sparklesOutline,
  volumeHighOutline,
} from 'ionicons/icons'
import { useEffect, useState } from 'react'
import {
  isStudioEngineInstalled,
  STUDIO_ENGINE_SIZE_MB,
} from '../lib/supertonic/assets'
import {
  getInstallMethod,
  onInstallChange,
  promptInstall,
  type InstallMethod,
} from '../lib/pwa'
import { readSetting, writeSetting } from '../lib/storage'
import { warmVoicePreviews } from '../lib/tts'
import { useT } from '../lib/useT'
import { useEngineDownload } from '../lib/useEngineDownload'
import { STUDIO_VOICES } from '../lib/voices'

/** Einmal gesehen? Dann startet die App künftig direkt in der Bibliothek. */
export const WELCOME_SEEN_KEY = 'booxnet.welcomeSeen'

export function markWelcomeSeen(): void {
  // Ohne Speicher erscheint die Seite ggf. erneut – verschmerzbar.
  writeSetting(WELCOME_SEEN_KEY, '1')
}

/** True, sobald die Willkommensseite einmal gezeigt wurde. Ohne Speicher
 * gilt sie als gesehen, damit niemand in einer Willkommens-Schleife
 * landet. */
export function hasSeenWelcome(): boolean {
  return readSetting(WELCOME_SEEN_KEY) !== null
}

/**
 * Erststart-Seite: erklärt das Angebot und führt direkt zum Download des
 * Sprachpakets – ohne das die App nutzlos wäre. Wer das Paket schon hat
 * (Bestandsinstallation), wird gar nicht erst hierher geleitet.
 */
export default function WelcomePage() {
  const t = useT()
  const { progress, storageBlocked, start } = useEngineDownload()
  const [installMethod, setInstallMethod] = useState<InstallMethod>(() =>
    getInstallMethod(),
  )
  const [showIosHelp, setShowIosHelp] = useState(false)
  const router = useIonRouter()

  useEffect(
    () => onInstallChange(() => setInstallMethod(getInstallMethod())),
    [],
  )

  // Wie in der Bibliothek: nativer Install-Dialog, auf iOS die Anleitung.
  const install = async () => {
    if (installMethod === 'ios-instructions') {
      setShowIosHelp(true)
      return
    }
    await promptInstall()
  }

  const finish = () => {
    markWelcomeSeen()
    router.push('/library', 'root', 'replace')
  }

  useEffect(() => {
    // Paket schon da (z. B. zweites Gerät im Sync, erneuter Besuch nach
    // Skip): direkt weiter in die Bibliothek.
    isStudioEngineInstalled().then((ok) => {
      if (ok) finish()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const startDownload = async () => {
    if (!(await start())) return
    // Begrüßungen im Hintergrund vorrendern – das Probehören spielt
    // dann sofort. Läuft weiter, während der Nutzer schon importiert.
    warmVoicePreviews(STUDIO_VOICES)
    finish()
  }

  return (
    <IonPage>
      <IonContent fullscreen className="ion-padding">
        <div className="welcome">
          <img
            className="welcome__logo"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt=""
            width={72}
            height={72}
          />
          <h1>{t('welcome.title')}</h1>
          <p>{t('welcome.intro')}</p>

          <IonList inset>
            {/* Frueher ein abgeschaltetes Auswahlfeld mit genau einer
                Option: Es sah aus wie eine Einstellung, war aber keine -
                und liess Nutzer spaeter danach suchen. Jetzt eine schlichte
                Zeile. Die tatsaechliche Sprache erkennt die App am Buch und
                laesst sich im Reader unter den Anzeige-Einstellungen
                uebergehen. */}
            <IonItem lines="full">
              <IonLabel className="ion-text-wrap">
                <h2>{t('welcome.language')}</h2>
                <IonNote>{t('welcome.languageNote')}</IonNote>
              </IonLabel>
            </IonItem>
            <IonItem
              button={installMethod !== null}
              onClick={installMethod !== null ? () => void install() : undefined}
            >
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={phonePortraitOutline}
                color="primary"
              />
              <IonLabel>
                <h2>
                  {installMethod !== null
                    ? t('welcome.installAdd')
                    : t('welcome.installAsApp')}
                </h2>
                <IonNote>{t('welcome.installNote')}</IonNote>
              </IonLabel>
            </IonItem>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={volumeHighOutline}
                color="primary"
              />
              <IonLabel>
                <h2>{t('welcome.soundOn')}</h2>
                <IonNote>{t('welcome.soundOnNote')}</IonNote>
              </IonLabel>
            </IonItem>
            <IonItem>
              <IonIcon
                aria-hidden="true"
                slot="start"
                icon={sparklesOutline}
                color="primary"
              />
              <IonLabel>
                <h2>{t('welcome.downloadHeading')}</h2>
                <IonNote>
                  {storageBlocked
                    ? t('welcome.downloadPrivate')
                    : progress === null
                      ? t('welcome.downloadSize', { mb: STUDIO_ENGINE_SIZE_MB })
                      : t('welcome.downloadProgress', { loaded: progress.mb, total: STUDIO_ENGINE_SIZE_MB })}
                </IonNote>
                {progress !== null && (
                  <IonProgressBar
                    value={progress.percent / 100}
                    aria-label={t('voices.downloadAria')}
                    style={{ marginTop: 6 }}
                  />
                )}
              </IonLabel>
            </IonItem>
          </IonList>

          <IonButton
            expand="block"
            size="large"
            disabled={progress !== null || storageBlocked}
            onClick={() => void startDownload()}
          >
            <IonIcon aria-hidden="true" slot="start" icon={cloudDownloadOutline} />
            {progress === null ? t('welcome.start') : t('welcome.starting')}
          </IonButton>
          <IonButton fill="clear" expand="block" onClick={finish}>
            Später – erst mal umschauen
          </IonButton>
        </div>
        <IonAlert
          isOpen={showIosHelp}
          onDidDismiss={() => setShowIosHelp(false)}
          header={t('install.header')}
          message={
            t('install.iosHelp')
          }
          buttons={[t('common.understood')]}
        />
      </IonContent>
    </IonPage>
  )
}
