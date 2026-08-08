import {
  IonButton,
  IonButtons,
  IonContent,
  IonFab,
  IonFabButton,
  IonHeader,
  IonIcon,
  IonItem,
  IonItemOption,
  IonItemOptions,
  IonItemSliding,
  IonLabel,
  IonList,
  IonNote,
  IonPage,
  IonProgressBar,
  IonReorder,
  IonReorderGroup,
  IonTitle,
  IonToolbar,
  useIonActionSheet,
  useIonAlert,
  useIonRouter,
  useIonToast,
  useIonViewWillEnter,
  type ItemReorderEventDetail,
} from '@ionic/react'
import {
  add,
  bookOutline,
  contrastOutline,
  createOutline,
  trashOutline,
} from 'ionicons/icons'
import { useRef, useState } from 'react'
import AppSection from '../components/AppSection'
import {
  deleteBook,
  getAllBooks,
  putBook,
  saveBookOrder,
  type Book,
} from '../lib/db'
import { ACCEPTED_FILES, importBook, unitCount } from '../lib/importers'
import { isStudioEngineInstalled } from '../lib/supertonic/assets'
import { getTheme, setTheme, THEME_LABELS, type ThemeChoice } from '../lib/theme'
import { markWelcomeSeen, WELCOME_SEEN_KEY } from './WelcomePage'

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const router = useIonRouter()
  const [presentToast] = useIonToast()
  const [presentAlert] = useIonAlert()
  const [presentActionSheet] = useIonActionSheet()

  const refresh = () => {
    getAllBooks().then(setBooks)
  }

  useIonViewWillEnter(refresh)

  // Erststart ohne Sprachpaket: erst das Willkommen mit Erklärung und
  // Download. Bestandsinstallationen (Paket vorhanden) sehen es nie.
  useIonViewWillEnter(() => {
    let seen = true
    try {
      seen = localStorage.getItem(WELCOME_SEEN_KEY) !== null
    } catch {
      // Ohne Speicher lieber nicht in eine Willkommens-Schleife laufen.
    }
    if (seen) return
    void isStudioEngineInstalled().then((installed) => {
      if (installed) markWelcomeSeen()
      else router.push('/welcome', 'root', 'replace')
    })
  })

  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const book = await importBook(file)
      if (book.sentenceCount === 0) {
        presentToast({
          message:
            'In dieser Datei wurde kein Text gefunden. Gescannte PDFs ohne Textebene können nicht vorgelesen werden.',
          duration: 4000,
          color: 'warning',
        })
        return
      }
      await putBook(book)
      refresh()
      router.push(`/reader/${book.id}`)
    } catch (error) {
      presentToast({
        message:
          error instanceof Error && error.message
            ? error.message
            : 'Die Datei konnte nicht gelesen werden.',
        duration: 4000,
        color: 'danger',
      })
    } finally {
      setImporting(false)
    }
  }

  const remove = async (book: Book) => {
    await deleteBook(book.id)
    refresh()
  }

  const rename = (book: Book) => {
    void presentAlert({
      header: 'Titel ändern',
      inputs: [
        {
          name: 'title',
          type: 'text',
          value: book.title,
          attributes: { maxlength: 200 },
        },
      ],
      buttons: [
        { text: 'Abbrechen', role: 'cancel' },
        {
          text: 'Speichern',
          handler: (data: { title?: string }) => {
            const title = (data.title ?? '').trim()
            if (title && title !== book.title) {
              void putBook({ ...book, title }).then(refresh)
            }
          },
        },
      ],
    })
  }

  // Drag-and-drop-Reihenfolge sofort anzeigen und dauerhaft speichern.
  const onReorder = (event: CustomEvent<ItemReorderEventDetail>) => {
    const reordered = event.detail.complete(books) as Book[]
    setBooks(reordered)
    void saveBookOrder(reordered.map((book) => book.id))
  }

  const chooseTheme = () => {
    const current = getTheme()
    const option = (choice: ThemeChoice) => ({
      text: THEME_LABELS[choice] + (current === choice ? ' ✓' : ''),
      handler: () => setTheme(choice),
    })
    void presentActionSheet({
      header: 'Darstellung',
      buttons: [
        option('auto'),
        option('light'),
        option('dark'),
        option('eink'),
        { text: 'Abbrechen', role: 'cancel' },
      ],
    })
  }

  /** Schließt die Wisch-Optionen, bevor ein Dialog aufgeht. */
  const closeSliding = (event: React.MouseEvent) => {
    void (
      (event.target as HTMLElement).closest('ion-item-sliding') as
        | (HTMLElement & { close(): Promise<void> })
        | null
    )?.close()
  }

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonTitle>Bibliothek</IonTitle>
          <IonButtons slot="end">
            <IonButton onClick={chooseTheme} aria-label="Darstellung ändern">
              <IonIcon aria-hidden="true" slot="icon-only" icon={contrastOutline} />
            </IonButton>
          </IonButtons>
          <img
            slot="end"
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt="Booxnet"
          />
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">Bibliothek</IonTitle>
          </IonToolbar>
        </IonHeader>

        {importing && <IonProgressBar type="indeterminate" />}

        {books.length === 0 && !importing && (
          <div className="empty-state">
            <IonIcon aria-hidden="true" icon={bookOutline} />
            <h2>Noch keine Bücher</h2>
            <p>
              Lade ein PDF, EPUB oder eine Textdatei hoch und lass es dir
              vorlesen. Kostenlos und komplett offline auf deinem Gerät.
            </p>
            <IonButton onClick={() => fileInput.current?.click()}>
              Buch hochladen
            </IonButton>
          </div>
        )}

        <IonList inset={books.length > 0}>
          <IonReorderGroup
            disabled={books.length < 2}
            onIonItemReorder={onReorder}
          >
            {books.map((book) => {
              const progress =
                book.sentenceCount > 0 ? book.position / book.sentenceCount : 0
              return (
                <IonItemSliding key={book.id}>
                  <IonItem
                    button
                    detail={false}
                    onClick={() => router.push(`/reader/${book.id}`)}
                  >
                    {book.cover ? (
                      <img className="book-cover" src={book.cover} alt="" />
                    ) : (
                      <div className="book-cover book-cover--placeholder">
                        <IonIcon aria-hidden="true" icon={bookOutline} />
                      </div>
                    )}
                    <IonLabel>
                      <h2>{book.title}</h2>
                      <IonNote>
                        {unitCount(book.unit, book.pageCount)}
                        {progress > 0 &&
                          ` · ${Math.round(progress * 100)} % gehört`}
                      </IonNote>
                    </IonLabel>
                    <IonReorder slot="end" />
                  </IonItem>
                  <IonItemOptions side="end">
                    <IonItemOption
                      onClick={(event) => {
                        closeSliding(event)
                        rename(book)
                      }}
                    >
                      <IonIcon
                        aria-hidden="true"
                        slot="icon-only"
                        icon={createOutline}
                      />
                    </IonItemOption>
                    <IonItemOption color="danger" onClick={() => remove(book)}>
                      <IonIcon aria-hidden="true" slot="icon-only" icon={trashOutline} />
                    </IonItemOption>
                  </IonItemOptions>
                </IonItemSliding>
              )
            })}
          </IonReorderGroup>
        </IonList>

        <AppSection />

        <input
          ref={fileInput}
          type="file"
          accept={ACCEPTED_FILES}
          hidden
          onChange={onFileChosen}
        />

        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            aria-label="Buch hochladen"
          >
            <IonIcon aria-hidden="true" icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  )
}
