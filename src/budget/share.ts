import type { CellState } from './model.ts'
import { preparedShareId, sharePreparedMessage } from '../telegram.ts'

export interface CardInput {
  bg: string
  cream: string
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

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  ctx.beginPath()
  ctx.rect(x, y, w, h)
}

export async function renderCard(input: CardInput): Promise<{ blob: Blob; url: string }> {
  await document.fonts.load('700 180px Archivo')
  await document.fonts.load('400 28px "IBM Plex Mono"')
  await document.fonts.ready
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('canvas')

  ctx.fillStyle = input.bg
  ctx.fillRect(0, 0, 1080, 1350)

  ctx.fillStyle = 'rgba(243, 235, 221, 0.16)'
  for (let y = 18; y < 1350; y += 28) {
    for (let x = 18; x < 1080; x += 28) {
      ctx.beginPath()
      ctx.arc(x, y, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
  }

  ctx.strokeStyle = 'rgba(243, 235, 221, 0.16)'
  ctx.lineWidth = 1
  for (const x of [270, 540, 810]) {
    ctx.beginPath()
    ctx.moveTo(x, 0)
    ctx.lineTo(x, 1350)
    ctx.stroke()
  }

  const left = 72
  ctx.fillStyle = input.cream
  ctx.font = '500 22px "IBM Plex Mono"'
  ctx.textBaseline = 'top'
  ctx.fillText('BUDGET BETTER', left, 78)
  ctx.fillStyle = 'rgba(243, 235, 221, 0.55)'
  ctx.font = '400 16px "IBM Plex Mono"'
  ctx.fillText('52-WEEK CHALLENGE', left, 112)

  ctx.fillStyle = 'rgba(243, 235, 221, 0.62)'
  ctx.font = '400 18px "IBM Plex Mono"'
  ctx.fillText(`01  —  SAVINGS / ${input.year}`, left, 190)
  ctx.textAlign = 'right'
  ctx.fillText(`${input.rule}  ·  ${input.currency}`, 1008, 190)
  ctx.textAlign = 'left'

  ctx.fillStyle = 'rgba(243, 235, 221, 0.55)'
  ctx.font = '400 18px "IBM Plex Mono"'
  ctx.fillText('SAVED TO DATE', left, 250)

  let size = 196
  const fontFor = (px: number) => `700 extra-condensed ${px}px Archivo`
  ctx.font = fontFor(size)
  while (size > 96 && ctx.measureText(input.saved).width > 920) {
    size -= 8
    ctx.font = fontFor(size)
  }
  ctx.fillStyle = input.cream
  ctx.fillText(input.saved, left, 290)

  const barY = 290 + size + 28
  ctx.fillStyle = 'rgba(243, 235, 221, 0.22)'
  roundRect(ctx, left, barY, 936, 4)
  ctx.fill()
  const pct = Number.parseFloat(input.progress)
  const width = Number.isFinite(pct) ? Math.max(0, Math.min(1, pct / 100)) * 936 : 0
  ctx.fillStyle = input.gold
  ctx.fillRect(left, barY, width, 4)

  ctx.font = '400 18px "IBM Plex Mono"'
  ctx.fillStyle = 'rgba(243, 235, 221, 0.62)'
  ctx.fillText('0', left, barY + 18)
  ctx.textAlign = 'center'
  ctx.fillText(input.progress, 540, barY + 18)
  ctx.textAlign = 'right'
  ctx.fillText('100', 1008, barY + 18)
  ctx.textAlign = 'left'

  const statY = barY + 78
  input.stats.slice(0, 4).forEach((stat, index) => {
    const x = left + index * 234
    ctx.fillStyle = 'rgba(243, 235, 221, 0.5)'
    ctx.font = '400 16px "IBM Plex Mono"'
    ctx.fillText(stat.label, x, statY)
    ctx.fillStyle = input.cream
    ctx.font = '600 extra-condensed 42px Archivo'
    ctx.fillText(stat.value, x, statY + 28)
  })

  const gridTop = statY + 120
  ctx.fillStyle = 'rgba(243, 235, 221, 0.62)'
  ctx.font = '400 18px "IBM Plex Mono"'
  ctx.fillText('02  —  WEEKS 1–52', left, gridTop)

  const cols = 13
  const gap = 8
  const gridW = 936
  const cell = Math.floor((gridW - gap * (cols - 1)) / cols)
  const originY = gridTop + 46
  input.cells.forEach((status, index) => {
    const col = index % cols
    const row = Math.floor(index / cols)
    const x = left + col * (cell + gap)
    const y = originY + row * (cell + gap)
    if (status === 'paid') {
      ctx.fillStyle = input.gold
      ctx.fillRect(x, y, cell, cell)
    } else if (status === 'missed') {
      ctx.fillStyle = 'rgba(226, 182, 86, 0.28)'
      ctx.fillRect(x, y, cell, cell)
    } else if (status === 'due') {
      ctx.strokeStyle = input.cream
      ctx.lineWidth = 3
      ctx.strokeRect(x + 1.5, y + 1.5, cell - 3, cell - 3)
    } else {
      ctx.strokeStyle = 'rgba(243, 235, 221, 0.28)'
      ctx.lineWidth = 2
      ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2)
    }
  })

  ctx.fillStyle = 'rgba(243, 235, 221, 0.55)'
  ctx.font = '400 18px "IBM Plex Mono"'
  ctx.fillText('SWISS INSTRUMENT  ·  BUDGET BETTER', left, 1268)

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
