import { ensureFresh } from '../fresh.ts'
ensureFresh()
import { render } from 'preact'
import { RadarApp } from './app.tsx'
import '../styles.css'

const root = document.getElementById('app')
if (root) render(<RadarApp />, root)
