import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Root from './Root'
import { forwardProductLink } from './router'
import './index.css'

forwardProductLink()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Root />
  </StrictMode>,
)
