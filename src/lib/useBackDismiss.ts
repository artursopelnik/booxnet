import { useEffect } from 'react'

/**
 * Laesst die Android-Zurueck-Geste ein offenes Blatt schliessen, statt die
 * Seite zu verlassen.
 *
 * Auf iOS faellt das nie auf: Dort wischt man ein Blatt nach unten weg.
 * Auf Android ist Zurueck die selbstverstaendliche Geste zum Schliessen -
 * und ohne diesen Haken landete man damit mitten im Buch wieder in der
 * Bibliothek, weil der Browser die Geste als Navigation verstand.
 *
 * Der Kniff ist ein eigener Verlaufseintrag, solange das Blatt offen ist:
 * Zurueck nimmt dann diesen Eintrag statt der Seite. Wird das Blatt
 * regulaer geschlossen ("Fertig", Wischen, Tipp daneben), raeumen wir den
 * Eintrag selbst wieder weg - sonst bliebe ein toter Zurueck-Druck uebrig,
 * bei dem sichtbar nichts passiert.
 *
 * Die Zustandsform des Eintrags bleibt die des Routers, ergaenzt um eine
 * eigene Markierung: Ein fremd geformter Eintrag brachte React Router aus
 * dem Tritt.
 */
/**
 * Die offenen Blaetter, unterstes zuerst. Ohne diesen Stapel reagierten
 * bei zwei uebereinanderliegenden Blaettern beide auf dieselbe Geste:
 * Eines waere zu viel geschlossen worden, und ein Verlaufseintrag bliebe
 * als toter Zurueck-Druck liegen.
 */
const offeneBlaetter: symbol[] = []

export function claimBackGesture(onDismiss: () => void): () => void {
  if (typeof window === 'undefined') return () => {}

  const marke = Symbol('blatt')
  offeneBlaetter.push(marke)
  history.pushState({ ...history.state, booxnetOverlay: true }, '')
  let eigenerEintrag = true

  const abmelden = () => {
    window.removeEventListener('popstate', beiZurueck)
    const stelle = offeneBlaetter.indexOf(marke)
    if (stelle >= 0) offeneBlaetter.splice(stelle, 1)
  }

  function beiZurueck() {
    // Nur das oberste Blatt reagiert.
    if (offeneBlaetter[offeneBlaetter.length - 1] !== marke) return
    // Den Eintrag hat der Browser schon entfernt.
    eigenerEintrag = false
    abmelden()
    onDismiss()
  }
  window.addEventListener('popstate', beiZurueck)

  return () => {
    // Schon per Geste geschlossen: nichts mehr zu tun.
    if (!offeneBlaetter.includes(marke)) return
    abmelden()
    if (eigenerEintrag) history.back()
  }
}

/** React-Fassung von claimBackGesture fuer Blaetter mit `isOpen`. */
export function useBackDismiss(isOpen: boolean, onDismiss: () => void): void {
  useEffect(() => {
    if (!isOpen) return
    return claimBackGesture(onDismiss)
    // onDismiss absichtlich nicht in der Liste: Eine neu erzeugte Funktion
    // bei jedem Rendern wuerde den Eintrag staendig neu setzen.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen])
}
