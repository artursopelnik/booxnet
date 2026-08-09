import { defineConfig } from 'vitest/config'

/**
 * Testlauf bewusst getrennt von vite.config.ts: Der Produktions-Build
 * soll nicht davon abhängen, dass ein Testwerkzeug installiert ist.
 *
 * Umgebung 'node' statt eines nachgebauten Browsers: Getestet wird die
 * reine Logik (Satztrennung, Spracherkennung, Einstellungen). Was der
 * Browser beisteuert – localStorage – ist in den Tests ein winziger
 * Ersatz, das spart eine schwere Abhängigkeit samt Startzeit.
 */
export default defineConfig({
  define: {
    // Im Build aus package.json der onnxruntime injiziert; für die Tests
    // ist der Wert bedeutungslos, muss aber definiert sein, weil ihn
    // ortwasm.ts beim Laden des Moduls auswertet.
    __ORT_VERSION__: '"test"',
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    setupFiles: ['./vitest.setup.ts'],
  },
})
