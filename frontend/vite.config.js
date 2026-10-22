import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// El frontend le habla a la API por /api, en su misma dirección, y Vite la
// reenvía al backend. Así la página funciona igual en este computador y en
// un celular de la misma red WiFi (npm run dev:celular), donde "localhost"
// sería el propio celular. Además no hace falta CORS.
const proxyApi = {
  '/api': {
    target: 'http://localhost:8000',
    rewrite: (ruta) => ruta.replace(/^\/api/, ''),
  },
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: { proxy: proxyApi },
  preview: { proxy: proxyApi },
  // Pruebas: npm test / npm run test:coverage (ver tests/)
  test: {
    environment: 'jsdom',
    setupFiles: ['./tests/setup.js'],
    include: ['tests/**/*.test.{js,jsx}'],
    env: { VITE_API_URL: 'http://api.test' },
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text', 'lcov'],
      include: ['src/**/*.{js,jsx}'],
      exclude: ['src/main.jsx'],
    },
  },
})
