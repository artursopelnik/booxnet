/**
 * Zerlegen zu langer Sätze für die Sprachsynthese.
 *
 * Eigenes Modul, damit sich diese Logik testen lässt: Im Worker ginge
 * das nicht, weil dessen Modulrumpf beim Import sofort einen
 * Nachrichten-Empfänger einrichtet. Und geprüft gehört sie, weil sie
 * direkt hörbar ist – an einer schlecht gewählten Trennstelle klingt ein
 * Satz zerhackt.
 */

/**
 * Zerlegt einen Satz an seinen Satzzeichen in Teilsaetze. Genau dort
 * macht auch ein Mensch eine Atempause, deshalb sind das die einzigen
 * Stellen, an denen eine Teilung nicht auffaellt.
 */
function clauses(text: string): string[] {
  const parts: string[] = []
  let current = ''
  for (let i = 0; i < text.length; i++) {
    current += text[i]
    if (/[,;:–—]/.test(text[i]) && text[i + 1] === ' ') {
      parts.push(current.trim())
      current = ''
      i++
    }
  }
  if (current.trim()) parts.push(current.trim())
  return parts
}

/** Notfall fuer einen Teilsatz, der allein schon zu lang ist. */
function splitByWords(text: string, maxLen: number): string[] {
  const chunks: string[] = []
  let current = ''
  for (const word of text.split(/\s+/)) {
    if (current && current.length + word.length + 1 > maxLen) {
      chunks.push(current)
      current = word
    } else {
      current = current ? `${current} ${word}` : word
    }
  }
  if (current) chunks.push(current)
  return chunks
}

/**
 * Teilt einen zu langen Satz in Stuecke, die das Modell verarbeitet.
 *
 * Die Teilung folgt jetzt den Satzzeichen statt einer blossen
 * Wortgrenze: Vorher konnte ein langer Satz mitten in einer Wortgruppe
 * auseinandergerissen werden, und beide Haelften wurden unabhaengig
 * voneinander vertont - die Betonung passte dann an der Nahtstelle
 * nicht zusammen und der Satz klang zerhackt.
 */
export function chunkText(text: string, lang: string): string[] {
  const maxLen = lang === 'ko' || lang === 'ja' ? 120 : 300
  const clean = text.trim()
  if (clean.length <= maxLen) return [clean]
  const chunks: string[] = []
  let current = ''
  for (const clause of clauses(clean)) {
    if (clause.length > maxLen) {
      if (current) chunks.push(current)
      current = ''
      chunks.push(...splitByWords(clause, maxLen))
      continue
    }
    if (current && current.length + clause.length + 1 > maxLen) {
      chunks.push(current)
      current = clause
    } else {
      current = current ? `${current} ${clause}` : clause
    }
  }
  if (current) chunks.push(current)
  return chunks
}
