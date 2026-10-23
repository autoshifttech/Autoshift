import QRCode from 'qrcode'

export type QrOptions = { foreground: string; background: string; size: number; logo?: string | null }

/** Renders a QR code (with an optional centred logo) to a PNG data URL. */
export async function renderQrPng(text: string, { foreground, background, size, logo }: QrOptions): Promise<string> {
  const canvas = document.createElement('canvas')
  await QRCode.toCanvas(canvas, text, {
    width: size,
    margin: 2,
    // High error correction keeps the code scannable with a logo covering the centre.
    errorCorrectionLevel: logo ? 'H' : 'M',
    color: { dark: foreground, light: background },
  })
  if (logo) {
    const ctx = canvas.getContext('2d')
    const image = await loadImage(logo)
    if (ctx) {
      const box = Math.round(size * 0.22)
      const x = (size - box) / 2
      ctx.fillStyle = background
      ctx.beginPath()
      ctx.roundRect(x - 6, x - 6, box + 12, box + 12, 12)
      ctx.fill()
      ctx.drawImage(image, x, x, box, box)
    }
  }
  return canvas.toDataURL('image/png')
}

export async function renderQrSvg(text: string, { foreground, background }: Omit<QrOptions, 'size' | 'logo'>): Promise<string> {
  return QRCode.toString(text, { type: 'svg', margin: 2, errorCorrectionLevel: 'M', color: { dark: foreground, light: background } })
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Could not read that image'))
    image.src = src
  })
}

export function downloadDataUrl(dataUrl: string, filename: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function downloadText(text: string, filename: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  downloadDataUrl(url, filename)
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}
