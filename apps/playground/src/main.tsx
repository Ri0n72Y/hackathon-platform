import React from 'react'
import {createRoot} from 'react-dom/client'
import {App} from '../../../plugins/react-ui/src/index'
import {startRuntime} from './runtime'
import './style.css'
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>)
void startRuntime().catch(console.error)
