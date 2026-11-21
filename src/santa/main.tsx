import { render } from 'preact'
import { SantaApp } from './app.tsx'
import '../styles.css'

const root = document.getElementById('app')
if (root) render(<SantaApp />, root)
