import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import * as Sentry from '@sentry/react'
import './index.css'
import App from './App.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { ToastProvider } from './components/Toast.jsx'
import { Analytics } from '@vercel/analytics/react'
import { SpeedInsights } from '@vercel/speed-insights/react'

// ─── Sentry — Error monitoring ───
// Active uniquement en prod et si la DSN est définie dans les env vars.
// Setup à faire :
//   1. Créer un compte gratuit sur https://sentry.io (5K events/mois free)
//   2. Créer un projet "React" → récupérer la DSN
//   3. Sur Vercel → Project Settings → Environment Variables :
//        VITE_SENTRY_DSN = "https://...@...ingest.sentry.io/..."
//   4. Redéployer
// Sans VITE_SENTRY_DSN, l'init est skip silencieusement (no-op).
const SENTRY_DSN = import.meta.env.VITE_SENTRY_DSN
if (SENTRY_DSN && import.meta.env.PROD) {
  Sentry.init({
    dsn: SENTRY_DSN,
    integrations: [Sentry.browserTracingIntegration()],
    // Trace 10% des transactions (assez pour repérer les patterns lents
    // sans exploser le quota gratuit). Ajuste si besoin.
    tracesSampleRate: 0.1,
    // Capture l'env (vercel preview vs prod) pour filtrer dans le dashboard
    environment: import.meta.env.MODE,
    // Filtre des erreurs bruyantes / non-actionnables
    ignoreErrors: [
      'ResizeObserver loop limit exceeded',
      'ResizeObserver loop completed with undelivered notifications',
      'Network request failed',
      // Extensions navigateur, pas notre code
      /chrome-extension/,
      /moz-extension/,
    ],
  })
}

createRoot(document.getElementById('root')).render(
  // <StrictMode> est désactivé temporairement car il détruit la connexion
  // WebSocket Supabase (Realtime) en développement à cause du double-montage.
  // <StrictMode>
  <>
    <ErrorBoundary>
      <ToastProvider>
        <BrowserRouter>
          <App />
        </BrowserRouter>
      </ToastProvider>
    </ErrorBoundary>
    <Analytics />
    <SpeedInsights />
  </>
  // </StrictMode>,
)
