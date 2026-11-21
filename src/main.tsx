import { render } from 'preact'
import { Hub } from './hub.tsx'
import './styles.css'

const root = document.getElementById('app')
if (root) render(<Hub />, root)
