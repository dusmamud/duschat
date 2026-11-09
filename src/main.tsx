import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { z } from 'zod'
import '@fontsource-variable/instrument-sans'
import '@fontsource-variable/jetbrains-mono'
import './index.css'
import App from './App.tsx'

// Zod v4 JIT-compiles schemas with `new Function` when it can. Our CSP
// blocks that (script-src 'self', no unsafe-eval) — harmless, because Zod
// probes it inside a try/catch and falls back to its interpreted path, but
// the probe still shows up in DevTools as a CSP eval issue. Tell Zod
// upfront that eval is unavailable so it never probes and never attempts
// `new Function`. The login/signup schemas are tiny, so the interpreted
// path costs nothing measurable. Do NOT "fix" this with unsafe-eval.
z.config({ jitless: true })

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
