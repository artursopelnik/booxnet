import {
  IonButton,
  IonButtons,
  IonContent,
  IonHeader,
  IonModal,
  IonTitle,
  IonToolbar,
} from '@ionic/react'
import { useEffect, useRef, useState } from 'react'
import { useBackDismiss } from '../lib/useBackDismiss'
import { useT } from '../lib/useT'

interface Props {
  isOpen: boolean
  onDismiss: () => void
  /** Bekommt den eingefügten Text, sobald der Nutzer vorlesen will. */
  onSubmit: (text: string) => void
}

/**
 * Text einfügen statt Datei importieren.
 *
 * Ein Buch lädt man ein paar Mal hoch; einen Artikel, eine Mail oder eine
 * lange Nachricht will man dagegen sofort gesprochen hören. Dafür erst
 * eine Datei anzulegen wäre ein Umweg, den niemand geht.
 *
 * Bewusst ein schlichtes <textarea> statt IonTextarea: Es geht hier um
 * einen einzigen, bildschirmfüllenden Eingabebereich, und das native
 * Element bringt Einfügen, Auswahl und Tastaturverhalten des Systems
 * unverändert mit.
 */
export default function PasteSheet({ isOpen, onDismiss, onSubmit }: Props) {
  const t = useT()
  const [text, setText] = useState('')
  const feld = useRef<HTMLTextAreaElement>(null)
  // Android: Zurueck schliesst das Blatt, statt die Bibliothek zu verlassen.
  useBackDismiss(isOpen, onDismiss)

  useEffect(() => {
    if (!isOpen) setText('')
  }, [isOpen])

  const uebernehmen = () => {
    const inhalt = text.trim()
    if (!inhalt) return
    onSubmit(inhalt)
  }

  /**
   * Aus der Zwischenablage holen, ohne den Umweg über die Lupe und
   * "Einfügen". Nicht jeder Browser erlaubt das Lesen (und iOS fragt
   * jedes Mal nach) – schlägt es fehl, bleibt das Feld einfach leer und
   * der Nutzer fügt von Hand ein. Ein Fehlerhinweis wäre hier lauter als
   * der Nutzen.
   */
  const ausZwischenablage = async () => {
    try {
      const inhalt = await navigator.clipboard.readText()
      if (inhalt.trim()) setText((vorher) => (vorher ? vorher : inhalt))
    } catch {
      feld.current?.focus()
    }
  }

  const kannLesen =
    typeof navigator !== 'undefined' &&
    typeof navigator.clipboard?.readText === 'function'

  return (
    <IonModal
      isOpen={isOpen}
      onDidDismiss={onDismiss}
      onDidPresent={() => feld.current?.focus()}
    >
      <IonHeader>
        <IonToolbar>
          <IonButtons slot="start">
            <IonButton onClick={onDismiss}>{t('common.cancel')}</IonButton>
          </IonButtons>
          <IonTitle role="heading" aria-level={1}>
            {t('paste.title')}
          </IonTitle>
          <IonButtons slot="end">
            <IonButton strong disabled={text.trim() === ''} onClick={uebernehmen}>
              {t('paste.read')}
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent>
        <div className="paste-sheet">
          <textarea
            ref={feld}
            className="paste-sheet__field"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder={t('paste.placeholder')}
            aria-label={t('paste.title')}
          />
          {kannLesen && text === '' && (
            <IonButton
              fill="clear"
              size="small"
              onClick={() => void ausZwischenablage()}
            >
              {t('paste.fromClipboard')}
            </IonButton>
          )}
        </div>
      </IonContent>
    </IonModal>
  )
}
