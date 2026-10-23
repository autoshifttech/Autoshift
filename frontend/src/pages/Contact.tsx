import { CheckCircle2, Handshake, LifeBuoy, Send, TrendingUp } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Button } from '../components/Button'
import { Field } from '../components/Field'
import { PageHero, Section } from '../components/Layout'
import { brand } from '../content/brand'
import { usePageTitle } from '../hooks/usePageTitle'
import { api, ApiError } from '../lib/api'
import { cn } from '../lib/cn'

type Topic = 'sales' | 'support' | 'partnerships'
const topics: { value: Topic; label: string; icon: typeof TrendingUp; text: string }[] = [
  { value: 'sales', label: 'Sales', icon: TrendingUp, text: 'Plans, demos and Enterprise pricing.' },
  { value: 'support', label: 'Support', icon: LifeBuoy, text: 'Help with your workspace or WhatsApp setup.' },
  { value: 'partnerships', label: 'Partnerships', icon: Handshake, text: 'Agencies, resellers and integrations.' },
]

type Errors = Partial<Record<'name' | 'email' | 'message', string>>

function validate(values: { name: string; email: string; message: string }): Errors {
  const errors: Errors = {}
  if (!values.name.trim()) errors.name = 'Tell us your name.'
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim())) errors.email = 'Enter a valid email address.'
  if (values.message.trim().length < 10) errors.message = 'Add a few more details (at least 10 characters).'
  return errors
}

export default function Contact() {
  usePageTitle('Contact')
  const [params] = useSearchParams()
  const initialTopic = (topics.find((t) => t.value === params.get('topic'))?.value ?? 'sales') as Topic
  const [topic, setTopic] = useState<Topic>(initialTopic)
  const [values, setValues] = useState({ name: '', email: '', company: '', message: '', website: '' })
  const [errors, setErrors] = useState<Errors>({})
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle')
  const [serverError, setServerError] = useState('')

  const update = (key: keyof typeof values) => (event: { target: { value: string } }) =>
    setValues((current) => ({ ...current, [key]: event.target.value }))

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    const found = validate(values)
    setErrors(found)
    if (Object.keys(found).length) return
    setState('sending')
    try {
      await api('/api/contact', {
        method: 'POST',
        auth: false,
        body: { ...values, company: values.company || null, website: values.website || null, topic },
      })
      setState('sent')
    } catch (error) {
      setServerError(error instanceof ApiError ? error.message : 'Something went wrong.')
      setState('error')
    }
  }

  return (
    <>
      <PageHero eyebrow="Contact" title="Talk to the Autoshift team" description="Tell us what you’re working on. We reply on business days." />
      <Section className="pt-12 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[1fr_1.4fr]">
          <div className="space-y-3">
            {topics.map(({ value, label, icon: Icon, text }) => (
              <button
                key={value}
                type="button"
                aria-pressed={topic === value}
                onClick={() => setTopic(value)}
                className={cn(
                  'flex w-full items-start gap-4 rounded-2xl border p-5 text-left transition-colors',
                  topic === value ? 'border-brand-500 bg-brand-50' : 'border-line bg-white hover:border-brand-200',
                )}
              >
                <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white text-brand-700 shadow-sm">
                  <Icon aria-hidden className="size-5" />
                </span>
                <span>
                  <span className="block font-bold">{label}</span>
                  <span className="mt-1 block text-sm text-ink-soft">{text}</span>
                </span>
              </button>
            ))}
            {brand.contactEmail && (
              <p className="pt-2 text-sm text-ink-soft">
                Prefer email? Write to{' '}
                <a className="font-semibold text-brand-700 hover:underline" href={`mailto:${brand.contactEmail}`}>
                  {brand.contactEmail}
                </a>
              </p>
            )}
          </div>

          <div className="card p-6 sm:p-8">
            {state === 'sent' ? (
              <div className="py-10 text-center" role="status">
                <CheckCircle2 aria-hidden className="mx-auto size-12 text-brand-600" />
                <h2 className="mt-4 text-2xl font-bold">Message received</h2>
                <p className="mt-2 text-ink-soft">Thanks, {values.name.split(' ')[0]}. We’ll reply to {values.email}.</p>
              </div>
            ) : (
              <form onSubmit={submit} noValidate className="space-y-5">
                <h2 className="text-xl font-bold">{topics.find((t) => t.value === topic)!.label} enquiry</h2>
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Name" error={errors.name}>
                    {({ id, describedBy, invalid }) => <input id={id} autoComplete="name" value={values.name} onChange={update('name')} aria-invalid={invalid} aria-describedby={describedBy} className="field-input" />}
                  </Field>
                  <Field label="Work email" error={errors.email}>
                    {({ id, describedBy, invalid }) => <input id={id} type="email" autoComplete="email" value={values.email} onChange={update('email')} aria-invalid={invalid} aria-describedby={describedBy} className="field-input" />}
                  </Field>
                </div>
                <Field label="Company (optional)">
                  {({ id }) => <input id={id} autoComplete="organization" value={values.company} onChange={update('company')} className="field-input" />}
                </Field>
                <Field label="How can we help?" error={errors.message}>
                  {({ id, describedBy, invalid }) => <textarea id={id} rows={5} value={values.message} onChange={update('message')} aria-invalid={invalid} aria-describedby={describedBy} className="field-input resize-y" />}
                </Field>
                <div className="hidden" aria-hidden>
                  <label htmlFor="website">Website</label>
                  <input id="website" tabIndex={-1} autoComplete="off" value={values.website} onChange={update('website')} />
                </div>
                {state === 'error' && (
                  <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm text-red-700">
                    Your message was not sent: {serverError}
                  </p>
                )}
                <Button type="submit" size="lg" disabled={state === 'sending'} className="w-full sm:w-auto">
                  <Send aria-hidden className="size-4" /> {state === 'sending' ? 'Sending…' : 'Send message'}
                </Button>
              </form>
            )}
          </div>
        </div>
      </Section>
    </>
  )
}
