import type { CellState } from './model.ts'
import { preparedShareId, sharePreparedMessage } from '../telegram.ts'

export interface CardInput {
  paper: string
  ink: string
  gold: string
  year: number
  rule: string
  currency: string
  saved: string
  progress: string
  stats: Array<{ label: string; value: string }>
  cells: CellState[]
}

export type ShareResult = 'telegram' | 'sheet' | 'download' | 'closed' | 'failed'

export function progressCaption(saved: string, progress: string, week: number): string {
  return `Budget Better · ${saved} saved · ${progress} · week ${week} of 52.`
}

export async function renderCard(input: CardInput): Promise<{ blob: Blob; url: string }> {
  await document.fonts.load('400 180px "Instrument Serif"')
  await document.fonts.load('italic 400 60px "Instrument Serif"')
  await document.fonts.load('500 28px "Geist Mono"')
  await document.fonts.load('400 28px Geist')
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')

  const W = 1080
  const left = 72
  const right = W - 72
  const span = right - left
  const ink = (alpha = 1) => { ctx.globalAlpha = alpha; ctx.fillStyle = input.ink; ctx.strokeStyle = input.ink }
  const mono = (px: number) => `500 ${px}px "Geist Mono"`

  ctx.fillStyle = input.paper
  ctx.fillRect(0, 0, W, 1350)
  ctx.textBaseline = 'top'

  // masthead: heavy rule, labels, hairline
  ink()
  ctx.fillRect(left, 84, span, 4)
  ctx.font = mono(20)
  ctx.fillText('BUDGET BETTER · THE 52-WEEK LEDGER', left, 108)
  ctx.textAlign = 'right'
  ctx.fillText(`${input.year} · ${input.rule}`, right, 108)
  ctx.textAlign = 'left'
  ctx.fillRect(left, 144, span, 2)

  ink(0.56)
  ctx.font = mono(20)
  ctx.fillText('SAVED TO DATE', left, 214)

  let size = 230
  const serif = (px: number) => `400 ${px}px "Instrument Serif"`
  ctx.font = serif(size)
  while (size > 110 && ctx.measureText(input.saved).width > span - 120) {
    size -= 10
    ctx.font = serif(size)
  }
  ink()
  const sym = ({ EUR: '€', USD: '$', INR: '₹', PHP: '₱', NGN: '₦', GBP: '£' } as Record<string, string>)[input.currency] ?? ''
  ctx.font = serif(Math.round(size * 0.45))
  ctx.fillText(sym, left, 262)
  const symW = ctx.measureText(sym).width + 10
  ctx.font = serif(size)
  ctx.fillText(input.saved, left + symW, 250)

  const barY = 250 + size * 0.95 + 40
  ink(0.18)
  ctx.fillRect(left, barY, span, 6)
  const pct = Number.parseFloat(input.progress)
  const width = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) * span : 0
  ink()
  ctx.fillRect(left, barY, width, 6)
  ctx.globalAlpha = 1
  ctx.fillStyle = input.gold
  ctx.fillRect(left + width, barY - 8, 2, 22)

  ink(0.56)
  ctx.font = '400 26px Geist'
  ctx.fillText(input.progress.toLowerCase().replace(' of ', ' of '), left, barY + 30)

  const statY = barY + 110
  const stats = input.stats.slice(0, 4)
  ink(0.18)
  ctx.fillRect(left, statY - 22, span, 2)
  ctx.fillRect(left, statY + 108, span, 2)
  stats.forEach((stat, index) => {
    const x = left + index * (span / 4)
    if (index > 0) { ink(0.18); ctx.fillRect(x - 18, statY - 22, 2, 130) }
    ink(0.56)
    ctx.font = mono(17)
    ctx.fillText(stat.label, x, statY)
    ink()
    ctx.font = serif(56)
    ctx.fillText(stat.value, x, statY + 32)
  })

  const gridTop = statY + 168
  ink()
  ctx.font = `italic 400 44px "Instrument Serif"`
  ctx.fillText('The year at a glance', left, gridTop)

  const cols = 13
  const gap = 6
  const cell = Math.floor((span - gap * (cols - 1)) / cols)
  const originY = gridTop + 74
  input.cells.forEach((status, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = left + col * (cell + gap)
    const y = originY + row * (cell + gap)
    if (status === 'paid') {
      ink()
      ctx.fillRect(x, y, cell, cell)
    } else if (status === 'missed') {
      ink(0.34)
      ctx.lineWidth = 2
      ctx.save()
      ctx.beginPath()
      ctx.rect(x, y, cell, cell)
      ctx.clip()
      for (let d = -cell; d < cell * 2; d += 10) {
        ctx.beginPath()
        ctx.moveTo(x + d, y + cell)
        ctx.lineTo(x + d + cell, y)
        ctx.stroke()
      }
      ctx.restore()
      ink(0.18)
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)
    } else if (status === 'due') {
      ctx.globalAlpha = 1
      ctx.strokeStyle = input.gold
      ctx.lineWidth = 4
      ctx.strokeRect(x + 2, y + 2, cell - 4, cell - 4)
    } else {
      ink(0.18)
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)
    }
  })

  ink()
  ctx.fillRect(left, 1236, span, 2)
  ink(0.56)
  ctx.font = mono(18)
  ctx.fillText('T.ME/BBCHALLENGE_BOT', left, 1258)
  ctx.textAlign = 'right'
  ctx.fillText(input.currency, right, 1258)
  ctx.textAlign = 'left'
  ctx.globalAlpha = 1

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((result) => (result ? resolve(result) : reject(new Error('png'))), 'image/png')
  })
  return { blob, url: URL.createObjectURL(blob) }
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

export async function shareCard(blob: Blob, caption: string): Promise<ShareResult> {
  const prepared = preparedShareId()
  if (prepared) {
    const sent = await sharePreparedMessage(prepared)
    if (sent) return 'telegram'
  }
  const file = new File([blob], 'budget-better.png', { type: 'image/png' })
  const nav = navigator
  if (nav.share && nav.canShare?.({ files: [file] })) {
    try {
      await nav.share({ files: [file], text: caption, title: 'Budget Better' })
      return 'sheet'
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return 'closed'
    }
  }
  try {
    downloadBlob(blob, 'budget-better.png')
    return 'download'
  } catch {
    return 'failed'
  }
}
