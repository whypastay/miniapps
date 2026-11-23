import { ensureFresh } from '../fresh.ts'
ensureFresh()
import { render } from 'preact'
import { useState } from 'preact/hooks'
import { BudgetApp } from './app.tsx'
import { SplitApp, splitTarget } from '../split/app.tsx'
import '../styles.css'

function Root() {
  // Ledger Split shares the Budget Better Mini App: invite / summary links (startapp=sp_… / ss_…) land here
  const [mode, setMode] = useState<'budget' | 'split'>(() => (splitTarget() ? 'split' : 'budget'))
  return mode === 'split'
    ? <SplitApp onLedger={() => { history.replaceState(null, '', location.pathname + location.search.replace(/([?&])(split|sj|ss)=[^&]*/g, '$1')); setMode('budget') }} />
    : <BudgetApp onSplit={() => setMode('split')} />
}

const root = document.getElementById('app')
if (root) render(<Root />, root)
