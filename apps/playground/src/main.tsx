import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import { App } from '../../../plugins/react-ui/src/index'
import { startRuntime } from './runtime'
import './style.css'

const root = createRoot(document.getElementById('root')!)
void startRuntime()
  .then(({ ui }) => root.render(<StrictMode><BrowserRouter><App ui={ui} /></BrowserRouter></StrictMode>))
  .catch(console.error)
