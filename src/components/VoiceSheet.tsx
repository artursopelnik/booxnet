import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemDivider,
  IonItemGroup,
  IonLabel,
  IonList,
  IonModal,
  IonNote,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { checkmark, volumeMediumOutline } from 'ionicons/icons'
import { useMemo } from 'react'
import { previewVoice } from '../lib/tts'

interface Props {
  isOpen: boolean
  voices: SpeechSynthesisVoice[]
  selectedURI: string | null
  onSelect: (voice: SpeechSynthesisVoice) => void
  onDismiss: () => void
}

/** Human-readable language label for a BCP-47 tag, in the UI language. */
function languageLabel(lang: string): string {
  try {
    const name = new Intl.DisplayNames(['de'], { type: 'language' }).of(
      lang.split('-')[0],
    )
    return name ?? lang
  } catch {
    return lang
  }
}

export default function VoiceSheet({
  isOpen,
  voices,
  selectedURI,
  onSelect,
  onDismiss,
}: Props) {
  const groups = useMemo(() => {
    const byLang = new Map<string, SpeechSynthesisVoice[]>()
    for (const voice of voices) {
      const key = voice.lang.split('-')[0].toLowerCase()
      byLang.set(key, [...(byLang.get(key) ?? []), voice])
    }
    // German first, then alphabetically by label.
    return Array.from(byLang.entries())
      .map(([lang, list]) => ({
        lang,
        label: languageLabel(lang),
        voices: list.sort((a, b) => a.name.localeCompare(b.name)),
      }))
      .sort((a, b) => {
        if (a.lang === 'de') return -1
        if (b.lang === 'de') return 1
        return a.label.localeCompare(b.label)
      })
  }, [voices])

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      initialBreakpoint={0.75}
      breakpoints={[0, 0.75, 1]}
    >
      <IonHeader>
        <IonToolbar>
          <IonTitle>Stimme auswählen</IonTitle>
          <IonButtons slot="end">
            <IonButton strong onClick={onDismiss}>
              Fertig
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        {voices.length === 0 ? (
          <div className="empty-state">
            <h2>Keine Stimmen gefunden</h2>
            <p>
              Dein Browser stellt keine Vorlesestimmen bereit. Auf iOS und
              Android sind in den Systemeinstellungen weitere Stimmen zum
              Download verfügbar.
            </p>
          </div>
        ) : (
          <IonList>
            {groups.map((group) => (
              <IonItemGroup key={group.lang}>
                <IonItemDivider sticky>
                  <IonLabel>{group.label}</IonLabel>
                </IonItemDivider>
                {group.voices.map((voice) => (
                  <IonItem
                    key={voice.voiceURI}
                    button
                    onClick={() => onSelect(voice)}
                  >
                    <IonLabel>
                      <h2>{voice.name}</h2>
                      <IonNote>
                        {voice.lang}
                        {voice.localService
                          ? ' · lokal, offline verfügbar'
                          : ' · benötigt Internet'}
                      </IonNote>
                    </IonLabel>
                    {voice.voiceURI === selectedURI && (
                      <IonIcon slot="end" color="primary" icon={checkmark} />
                    )}
                    <IonButton
                      slot="end"
                      fill="clear"
                      onClick={(event) => {
                        event.stopPropagation()
                        previewVoice(voice)
                      }}
                      aria-label={`Stimme ${voice.name} probehören`}
                    >
                      <IonIcon slot="icon-only" icon={volumeMediumOutline} />
                    </IonButton>
                  </IonItem>
                ))}
              </IonItemGroup>
            ))}
          </IonList>
        )}
      </IonContent>
    </IonModal>
  )
}
