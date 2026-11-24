import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@fontsource/ibm-plex-sans-arabic/400.css'
import '@fontsource/ibm-plex-sans-arabic/500.css'
import '@fontsource/ibm-plex-sans-arabic/700.css'
import './styles/theme.css'
import App from './App'
import ConfigError from './components/ConfigError'
import { getFirebaseConfig, MissingConfigError } from './lib/firebase'
import { createFirebaseServices } from './services/firebaseServices'
import { ServicesProvider } from './services/ServicesContext'

function Root() {
  try {
    getFirebaseConfig(import.meta.env)
  } catch (e) {
    if (e instanceof MissingConfigError) return <ConfigError missing={e.missing} />
    throw e
  }
  return (
    <ServicesProvider services={createFirebaseServices()}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </ServicesProvider>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
