/**
 * Minimaler localStorage-Ersatz für die Testumgebung 'node'.
 *
 * Die getesteten Module lesen und schreiben Einstellungen über
 * localStorage. Statt dafür einen kompletten Browser nachzubauen (schwere
 * Abhängigkeit, spürbare Startzeit) genügt diese Handvoll Zeilen – sie
 * deckt genau die vier Methoden ab, die der Quelltext benutzt.
 */
class MemoryStorage implements Storage {
  private entries = new Map<string, string>()

  get length(): number {
    return this.entries.size
  }

  key(index: number): string | null {
    return Array.from(this.entries.keys())[index] ?? null
  }

  getItem(key: string): string | null {
    return this.entries.get(key) ?? null
  }

  setItem(key: string, value: string): void {
    this.entries.set(key, String(value))
  }

  removeItem(key: string): void {
    this.entries.delete(key)
  }

  clear(): void {
    this.entries.clear()
  }
}

globalThis.localStorage = new MemoryStorage()
