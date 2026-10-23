import { Download, ImagePlus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Field } from '../../components/Field'
import { downloadDataUrl, downloadText, renderQrPng, renderQrSvg } from '../../lib/qr'
import { buildWaLink, countries, validateNationalNumber } from '../../lib/whatsapp'
import { CountrySelect, ToolShell } from './ToolShell'

const MAX_LOGO_BYTES = 1024 * 1024

export default function QrGenerator() {
  const [country, setCountry] = useState('IN')
  const [number, setNumber] = useState('')
  const [message, setMessage] = useState('')
  const [foreground, setForeground] = useState('#0b3f33')
  const [background, setBackground] = useState('#ffffff')
  const [logo, setLogo] = useState<string | null>(null)
  const [logoError, setLogoError] = useState<string | null>(null)
  const [touched, setTouched] = useState(false)
  const [rendered, setRendered] = useState<{ key: string; url: string } | null>(null)

  const dial = countries.find((c) => c.code === country)!.dial
  const error = validateNationalNumber(dial, number)
  const link = error ? '' : buildWaLink(dial, number, message)

  useEffect(() => {
    let cancelled = false
    if (!link) return
    const key = [link, foreground, background, logo].join('|')
    renderQrPng(link, { foreground, background, size: 1024, logo })
      .then((url) => !cancelled && setRendered({ key, url }))
      .catch(() => !cancelled && setLogoError('That logo could not be used. Try a PNG or JPG.'))
    return () => {
      cancelled = true
    }
  }, [link, foreground, background, logo])

  const onLogo = (file: File | undefined) => {
    setLogoError(null)
    if (!file) return
    if (!file.type.startsWith('image/')) return setLogoError('Choose an image file (PNG, JPG or SVG).')
    if (file.size > MAX_LOGO_BYTES) return setLogoError('Logos must be under 1 MB.')
    const reader = new FileReader()
    reader.onload = () => setLogo(String(reader.result))
    reader.readAsDataURL(file)
  }

  const png = link && rendered?.key === [link, foreground, background, logo].join('|') ? rendered.url : null

  const downloadSvg = async () => {
    downloadText(await renderQrSvg(link, { foreground, background }), 'whatsapp-qr.svg', 'image/svg+xml')
  }

  return (
    <ToolShell
      path="/tools/whatsapp-qr-code-generator"
      title="WhatsApp QR code generator"
      description="A scannable QR that opens a chat with your business. Add your colours and logo, then download in HD — no watermark."
    >
      <div className="grid gap-10 lg:grid-cols-[1.2fr_1fr]">
        <form className="card min-w-0 space-y-5 p-6 sm:p-8" onSubmit={(event) => event.preventDefault()} noValidate>
          <div className="grid gap-4 sm:grid-cols-[1fr_1.3fr]">
            <Field label="Country">{({ id }) => <CountrySelect id={id} value={country} onChange={setCountry} />}</Field>
            <Field label="WhatsApp number" hint="Without the country code" error={touched ? (error ?? undefined) : undefined}>
              {({ id, describedBy, invalid }) => (
                <input
                  id={id}
                  inputMode="tel"
                  placeholder="98765 43210"
                  value={number}
                  onChange={(event) => setNumber(event.target.value)}
                  onBlur={() => setTouched(true)}
                  aria-invalid={invalid}
                  aria-describedby={describedBy}
                  className="field-input"
                />
              )}
            </Field>
          </div>
          <Field label="Prefilled message (optional)">
            {({ id }) => <input id={id} value={message} maxLength={300} onChange={(event) => setMessage(event.target.value)} className="field-input" />}
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="QR colour">
              {({ id }) => <input id={id} type="color" value={foreground} onChange={(event) => setForeground(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white p-1" />}
            </Field>
            <Field label="Background">
              {({ id }) => <input id={id} type="color" value={background} onChange={(event) => setBackground(event.target.value)} className="h-11 w-full cursor-pointer rounded-xl border border-line bg-white p-1" />}
            </Field>
          </div>
          <Field label="Logo (optional)" hint="PNG, JPG or SVG up to 1 MB" error={logoError ?? undefined}>
            {({ id, describedBy }) => (
              <div className="flex flex-wrap items-center gap-3">
                <label htmlFor={id} className="inline-flex h-11 cursor-pointer items-center gap-2 rounded-full border border-line px-4 text-sm font-semibold hover:bg-brand-50">
                  <ImagePlus aria-hidden className="size-4" /> {logo ? 'Change logo' : 'Upload logo'}
                </label>
                <input id={id} type="file" accept="image/*" aria-describedby={describedBy} className="sr-only" onChange={(event) => onLogo(event.target.files?.[0])} />
                {logo && (
                  <Button variant="ghost" size="sm" onClick={() => setLogo(null)}>
                    <X aria-hidden className="size-4" /> Remove
                  </Button>
                )}
              </div>
            )}
          </Field>
        </form>
        <div className="card flex flex-col items-center p-6 sm:p-8">
          {png ? (
            <img src={png} alt="Your WhatsApp QR code" className="w-full max-w-72 rounded-xl" />
          ) : (
            <div className="grid aspect-square w-full max-w-72 place-items-center rounded-xl border border-dashed border-line bg-surface p-6 text-center text-sm text-muted">
              Enter a valid number to see your QR code
            </div>
          )}
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Button disabled={!png} onClick={() => png && downloadDataUrl(png, 'whatsapp-qr.png')}>
              <Download aria-hidden className="size-4" /> PNG (1024px)
            </Button>
            <Button variant="secondary" disabled={!link} onClick={downloadSvg}>
              <Download aria-hidden className="size-4" /> SVG
            </Button>
          </div>
          <p className="mt-4 text-center text-xs text-muted">Static wa.me codes keep working as long as the number stays active on WhatsApp.{logo && ' The SVG download does not include the logo.'}</p>
        </div>
      </div>
    </ToolShell>
  )
}
