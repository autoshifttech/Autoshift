import { useState } from 'react'
import { PageHero, Section } from '../components/Layout'
import { Segmented } from '../components/Segmented'
import { releases, type ReleaseCategory } from '../content/releases'
import { usePageTitle } from '../hooks/usePageTitle'

type Filter = 'all' | ReleaseCategory
const tone: Record<ReleaseCategory, string> = { New: 'bg-brand-100 text-brand-900', Improved: 'bg-sky-100 text-sky-800', Fixed: 'bg-amber-100 text-amber-800' }

export default function ReleaseNotes() {
  usePageTitle('Release notes')
  const [filter, setFilter] = useState<Filter>('all')
  const visible = releases.filter((release) => filter === 'all' || release.category === filter)

  return (
    <>
      <PageHero eyebrow="Release notes" title="What’s new in Autoshift" description="Product updates, improvements and fixes as they ship.">
        <div className="mt-8">
          <Segmented
            label="Filter updates"
            value={filter}
            onChange={setFilter}
            options={[
              { value: 'all', label: 'All' },
              { value: 'New', label: 'New' },
              { value: 'Improved', label: 'Improved' },
              { value: 'Fixed', label: 'Fixed' },
            ]}
          />
        </div>
      </PageHero>
      <Section className="pt-12 sm:pt-16">
        <ol className="relative mx-auto max-w-3xl space-y-10 border-l border-line pl-6 sm:pl-8">
          {visible.length === 0 && <li className="text-ink-soft">No {filter.toLowerCase()} updates yet.</li>}
          {visible.map((release) => (
            <li key={`${release.date}-${release.title}`} className="relative">
              <span aria-hidden className="absolute top-1.5 -left-[1.95rem] size-3 rounded-full border-2 border-white bg-brand-600 ring-2 ring-brand-200 sm:-left-[2.45rem]" />
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <time dateTime={release.date} className="font-semibold text-muted">
                  {new Date(`${release.date}T00:00:00`).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}
                </time>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${tone[release.category]}`}>{release.category}</span>
              </div>
              <h2 className="mt-2 text-xl font-bold">{release.title}</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-ink-soft">
                {release.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </Section>
    </>
  )
}
