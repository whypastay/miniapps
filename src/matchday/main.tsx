import { render } from 'preact'
import { MatchdayApp } from './app.tsx'
import '../styles.css'

const root = document.getElementById('app')
if (root) render(<MatchdayApp />, root)
