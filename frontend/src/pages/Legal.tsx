import { PageHero, Section } from '../components/Layout'
import { brand } from '../content/brand'
import { usePageTitle } from '../hooks/usePageTitle'

type Doc = { title: string; updated: string; sections: { id: string; heading: string; body: string[] }[] }

// TEMPLATE TEXT — have counsel review and replace before launch.
const docs: Record<'terms' | 'privacy', Doc> = {
  terms: {
    title: 'Terms of service',
    updated: '2026-10-23',
    sections: [
      { id: 'agreement', heading: 'Agreement', body: [`These terms govern your use of ${brand.name} (the “Service”). By creating a workspace you agree to them on behalf of yourself or the business you represent.`] },
      { id: 'accounts', heading: 'Accounts and workspaces', body: ['You are responsible for the people you invite to your workspace and for keeping sign-in credentials secure.'] },
      { id: 'meta', heading: 'WhatsApp, Instagram and Messenger', body: ['Messaging runs on Meta’s platforms. You must follow Meta’s commerce and business messaging policies, obtain opt-in before messaging customers, and use approved templates where Meta requires them.', 'Meta may charge for some WhatsApp conversations; those fees are passed through to you.'] },
      { id: 'billing', heading: 'Plans and AI usage', body: ['Subscription fees are billed in advance for the selected period. AI conversations are billed pay-per-use from your prepaid AI wallet.'] },
      { id: 'data', heading: 'Your data', body: ['You own the contacts, messages and other content you bring to the Service. We process it only to provide the Service, as described in the Privacy Policy.'] },
      { id: 'termination', heading: 'Ending the service', body: ['You can disconnect channels or close your workspace at any time. We may suspend workspaces that break these terms or Meta’s policies.'] },
    ],
  },
  privacy: {
    title: 'Privacy policy',
    updated: '2026-10-23',
    sections: [
      { id: 'scope', heading: 'What this covers', body: [`How ${brand.name} collects and uses personal data on this website and in the product.`] },
      { id: 'collect', heading: 'Data we collect', body: ['Account data you give us (name, email), workspace content (contacts and conversations from the channels you connect), and technical data needed to run the Service.', 'The free WhatsApp tools run in your browser; what you type into them is not sent to us.'] },
      { id: 'use', heading: 'How we use it', body: ['To provide and secure the Service, respond to enquiries, and meet legal obligations. Customer conversation data is processed on your behalf as a data processor.'] },
      { id: 'processors', heading: 'Service providers', body: ['We rely on infrastructure, database and AI providers to run the Service, and on Meta to deliver messages on its platforms.'] },
      { id: 'security', heading: 'Security', body: ['Access tokens for connected channels are encrypted at rest, and access to workspace data is limited to its members.'] },
      { id: 'rights', heading: 'Your rights', body: ['You can request access to, correction of, or deletion of your personal data through the contact page.'] },
    ],
  },
}

export default function Legal({ kind }: { kind: 'terms' | 'privacy' }) {
  const doc = docs[kind]
  usePageTitle(doc.title)
  return (
    <>
      <PageHero title={doc.title} description={`Last updated ${new Date(`${doc.updated}T00:00:00`).toLocaleDateString('en-US', { dateStyle: 'long' })}`} />
      <Section className="pt-12 sm:pt-16">
        <div className="grid gap-10 lg:grid-cols-[14rem_1fr]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="text-xs font-semibold tracking-wide text-muted uppercase">On this page</p>
            <ul className="mt-3 space-y-2 text-sm">
              {doc.sections.map((section) => (
                <li key={section.id}>
                  <a href={`#${section.id}`} className="text-ink-soft hover:text-brand-700">{section.heading}</a>
                </li>
              ))}
            </ul>
          </nav>
          <article className="max-w-3xl space-y-10">
            {doc.sections.map((section) => (
              <section key={section.id} id={section.id}>
                <h2 className="text-xl font-bold">{section.heading}</h2>
                {section.body.map((paragraph) => (
                  <p key={paragraph} className="mt-3 leading-relaxed text-ink-soft">{paragraph}</p>
                ))}
              </section>
            ))}
          </article>
        </div>
      </Section>
    </>
  )
}
