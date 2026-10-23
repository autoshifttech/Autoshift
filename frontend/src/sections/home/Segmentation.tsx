import { Section, SectionHeading } from '../../components/Layout'
import { Reveal } from '../../components/Reveal'

const columns = [
  { name: 'Interested', tone: 'bg-amber-100 text-amber-800', leads: [['Arjun K.', 'Asked about bulk pricing'], ['Sara M.', 'Wants a demo on Friday']] },
  { name: 'Converted', tone: 'bg-brand-100 text-brand-900', leads: [['Priya R.', 'Ordered 2 × linen shirt'], ['Leo T.', 'Booked an appointment']] },
  { name: 'Cold', tone: 'bg-slate-100 text-slate-700', leads: [['Omar H.', 'No reply in 7 days']] },
]

const fields = [
  ['City', 'Coimbatore'],
  ['Language', 'Tamil, English'],
  ['Budget', '₹2,000–3,000'],
  ['Intent', 'Buy this week'],
]

export function Segmentation() {
  return (
    <Section id="segmentation" className="bg-surface">
      <SectionHeading
        eyebrow="AI lead segmentation"
        title="Every conversation sorted, every detail captured"
        description="Define your own categories — Interested, Converted, Cold or anything else — and the AI moves each contact as the chat evolves. It also pulls out the fields you care about."
      />
      <div className="mt-12 grid gap-4 lg:grid-cols-[2fr_1fr]">
        <Reveal className="grid gap-3 sm:grid-cols-3">
          {columns.map((column) => (
            <div key={column.name} className="rounded-2xl border border-line bg-white/70 p-3">
              <div className="flex items-center justify-between px-1">
                <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${column.tone}`}>{column.name}</span>
                <span className="text-xs text-muted">{column.leads.length}</span>
              </div>
              <ul className="mt-3 space-y-2">
                {column.leads.map(([name, note]) => (
                  <li key={name} className="rounded-xl border border-line bg-white p-3 shadow-sm">
                    <p className="text-sm font-semibold">{name}</p>
                    <p className="mt-0.5 text-xs text-muted">{note}</p>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </Reveal>
        <Reveal delay={80} className="card p-6">
          <p className="text-xs font-semibold tracking-wide text-muted uppercase">Extracted from chat</p>
          <p className="mt-1 text-lg font-bold">Priya R.</p>
          <dl className="mt-4 divide-y divide-line text-sm">
            {fields.map(([label, value]) => (
              <div key={label} className="flex justify-between gap-4 py-2.5">
                <dt className="text-muted">{label}</dt>
                <dd className="text-right font-semibold">{value}</dd>
              </div>
            ))}
          </dl>
          <p className="mt-4 text-xs text-muted">Illustrative example — fields are configured per workspace.</p>
        </Reveal>
      </div>
    </Section>
  )
}
