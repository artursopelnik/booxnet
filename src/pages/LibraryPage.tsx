import {
  IonButton,
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
  IonTitle,
  IonToolbar,
  useIonRouter,
  useIonToast,
  useIonViewWillEnter,
} from '@ionic/react'
import { add, bookOutline, trashOutline } from 'ionicons/icons'
import { useRef, useState } from 'react'
import { deleteBook, getAllBooks, putBook, type Book } from '../lib/db'
import { importPdf } from '../lib/pdf'

export default function LibraryPage() {
  const [books, setBooks] = useState<Book[]>([])
  const [importing, setImporting] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)
  const router = useIonRouter()
  const [presentToast] = useIonToast()

  const refresh = () => {
    getAllBooks().then(setBooks)
  }

  useIonViewWillEnter(refresh)

  const onFileChosen = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setImporting(true)
    try {
      const book = await importPdf(file)
      if (book.sentenceCount === 0) {
        presentToast({
          message:
            'In diesem PDF wurde kein Text gefunden. Gescannte PDFs ohne Textebene können nicht vorgelesen werden.',
          duration: 4000,
          color: 'warning',
        })
        return
      }
      await putBook(book)
      refresh()
      router.push(`/reader/${book.id}`)
    } catch {
      presentToast({
        message: 'Das PDF konnte nicht gelesen werden.',
        duration: 3000,
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

  return (
    <IonPage>
      <IonHeader translucent>
        <IonToolbar>
          <IonTitle>Bibliothek</IonTitle>
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
              Lade ein PDF hoch und lass es dir vorlesen – kostenlos und
              komplett offline auf deinem Gerät.
            </p>
            <IonButton onClick={() => fileInput.current?.click()}>
              PDF hochladen
            </IonButton>
          </div>
        )}

        <IonList inset={books.length > 0}>
          {books.map((book) => {
            const progress =
              book.sentenceCount > 0 ? book.position / book.sentenceCount : 0
            return (
              <IonItemSliding key={book.id}>
                <IonItem
                  button
                  detail
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
                      {book.pageCount}{' '}
                      {book.pageCount === 1 ? 'Seite' : 'Seiten'}
                      {progress > 0 && ` · ${Math.round(progress * 100)} % gehört`}
                    </IonNote>
                  </IonLabel>
                </IonItem>
                <IonItemOptions side="end">
                  <IonItemOption color="danger" onClick={() => remove(book)}>
                    <IonIcon aria-hidden="true" slot="icon-only" icon={trashOutline} />
                  </IonItemOption>
                </IonItemOptions>
              </IonItemSliding>
            )
          })}
        </IonList>

        <input
          ref={fileInput}
          type="file"
          accept="application/pdf,.pdf"
          hidden
          onChange={onFileChosen}
        />

        <IonFab slot="fixed" vertical="bottom" horizontal="end">
          <IonFabButton
            onClick={() => fileInput.current?.click()}
            disabled={importing}
            aria-label="PDF hochladen"
          >
            <IonIcon aria-hidden="true" icon={add} />
          </IonFabButton>
        </IonFab>
      </IonContent>
    </IonPage>
  )
}
