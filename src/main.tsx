import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './index.css'
import App from './App'
import { installGlobalErrorReporters } from './lib/errorReporter'

// 全局错误兜底：window.onerror + onunhandledrejection
// 把任何"逃出 React"的错误也送到主进程日志，便于事后排查
installGlobalErrorReporters()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
