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
  languageOutline,
  createOutline,
  ellipsisVertical,
  trashOutline,
} from 'ionicons/icons'
import { useRef, useState } from 'react'
import AppSection from '../components/AppSection'
import {
  deleteBook,
  getAllBooks,
  putBook,
  saveBookOrder,
  renameBook,
  type BookMeta,
} from '../lib/db'
import { ACCEPTED_FILES, importBook, unitCount } from '../lib/importers'
import { isStudioEngineInstalled } from '../lib/supertonic/assets'
import { getTheme, setTheme, themeLabel, type ThemeChoice } from '../lib/theme'
import { getUiLang, setUiLang, UI_LANGUAGES, type UiLang } from '../lib/i18n'
import { useT } from '../lib/useT'
import { hasSeenWelcome, markWelcomeSeen } from './WelcomePage'

export default function LibraryPage() {
  const t = useT()
  const [books, setBooks] = useState<BookMeta[]>([])
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
    if (hasSeenWelcome()) return
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
            t('library.noText'),
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
            : t('library.readError'),
        duration: 4000,
        color: 'danger',
      })
    } finally {
      setImporting(false)
    }
  }

  const remove = async (book: BookMeta) => {
    await deleteBook(book.id)
    refresh()
  }

  /**
   * Umbenennen und Löschen auch ohne Wischgeste erreichbar: Die
   * IonItemOptions dahinter kennen weder Tastatur noch Screenreader, es
   * gab also für Tastatur- und Screenreader-Nutzer bisher überhaupt
   * keinen Weg, ein Buch zu löschen (WCAG 2.1.1, 2.5.1). Die Wischgeste
   * bleibt als Abkürzung erhalten.
   */
  const openBookMenu = (book: BookMeta) => {
    void presentActionSheet({
      header: book.title,
      buttons: [
        {
          text: t('library.rename'),
          icon: createOutline,
          handler: () => rename(book),
        },
        {
          text: t('library.deleteBook'),
          icon: trashOutline,
          role: 'destructive',
          handler: () => void remove(book),
        },
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
  }

  const rename = (book: BookMeta) => {
    void presentAlert({
      header: t('library.rename'),
      inputs: [
        {
          name: 'title',
          type: 'text',
          value: book.title,
          attributes: { maxlength: 200 },
        },
      ],
      buttons: [
        { text: t('common.cancel'), role: 'cancel' },
        {
          text: t('common.save'),
          handler: (data: { title?: string }) => {
            const title = (data.title ?? '').trim()
            if (title && title !== book.title) {
              void renameBook(book.id, title).then(refresh)
            }
          },
        },
      ],
    })
  }

  // Drag-and-drop-Reihenfolge sofort anzeigen und dauerhaft speichern.
  const onReorder = (event: CustomEvent<ItemReorderEventDetail>) => {
    const reordered = event.detail.complete(books) as BookMeta[]
    setBooks(reordered)
    void saveBookOrder(reordered.map((book) => book.id))
  }

  const chooseTheme = () => {
    const current = getTheme()
    const option = (choice: ThemeChoice) => ({
      text: themeLabel(choice) + (current === choice ? ' ✓' : ''),
      handler: () => setTheme(choice),
    })
    void presentActionSheet({
      header: t('theme.header'),
      buttons: [
        option('auto'),
        option('light'),
        option('dark'),
        option('eink'),
        { text: t('common.cancel'), role: 'cancel' },
      ],
    })
  }

  const chooseUiLanguage = () => {
    const current = getUiLang()
    void presentActionSheet({
      header: t('library.uiLanguage'),
      buttons: [
        ...UI_LANGUAGES.map(({ code, name }) => ({
          text: name + (current === code ? ' ✓' : ''),
          handler: () => setUiLang(code as UiLang),
        })),
        { text: t('common.cancel'), role: 'cancel' },
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
          {/* Logo links, rechts die Aktionen (Darstellung etc.). */}
          <img
            slot="start"
            className="brand-mark"
            src={`${import.meta.env.BASE_URL}icon.svg`}
            alt=""
          />
          <IonTitle role="heading" aria-level={1}>{t('library.title')}</IonTitle>
          <IonButtons slot="end">
            <IonButton
              onClick={chooseUiLanguage}
              aria-label={t('library.uiLanguage')}
            >
              <IonIcon
                aria-hidden="true"
                slot="icon-only"
                icon={languageOutline}
              />
            </IonButton>
            <IonButton onClick={chooseTheme} aria-label={t('theme.change')}>
              <IonIcon aria-hidden="true" slot="icon-only" icon={contrastOutline} />
            </IonButton>
          </IonButtons>
        </IonToolbar>
      </IonHeader>
      <IonContent fullscreen>
        <IonHeader collapse="condense">
          <IonToolbar>
            <IonTitle size="large">{t('library.title')}</IonTitle>
          </IonToolbar>
        </IonHeader>

        {importing && (
          <>
            <IonProgressBar
              type="indeterminate"
              aria-label={t('library.importing')}
            />
            <div className="visually-hidden" role="status">
              {t('library.importing')}
            </div>
          </>
        )}

        {books.length === 0 && !importing && (
          <div className="empty-state">
            <IonIcon aria-hidden="true" icon={bookOutline} />
            <h2>{t('library.empty.title')}</h2>
            <p>{t('library.empty.body')}</p>
            <IonButton onClick={() => fileInput.current?.click()}>
              {t('library.empty.action')}
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
                          ` · ${t('library.listened', { percent: Math.round(progress * 100) })}`}
                      </IonNote>
                    </IonLabel>
                    <IonReorder slot="end" />
                    <IonButton
                      slot="end"
                      fill="clear"
                      className="book-menu-button"
                      onClick={(event) => {
                        // Sonst öffnet der Klick zusätzlich das Buch.
                        event.stopPropagation()
                        openBookMenu(book)
                      }}
                      aria-label={t('library.actionsFor', { title: book.title })}
                    >
                      <IonIcon
                        aria-hidden="true"
                        slot="icon-only"
                        icon={ellipsisVertical}
                      />
                    </IonButton>
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
            aria-label={t('library.upload')}
          >
            <IonIcon aria-hidden="true" icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  )
}
