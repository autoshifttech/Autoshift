import type { ReactNode } from "react";
import { SiteHero } from "@/components/site/site-chrome";
import { LEGAL } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Shared layout for the privacy policy and terms: contents list, then sections. */
export function LegalPage({ eyebrow, title, lead, sections }: { eyebrow: string; title: string; lead: string; sections: LegalSection[] }) {
  return (
    <>
      <SiteHero eyebrow={eyebrow} title={title} lead={lead} tone="sky" />
      <div className="mx-auto grid max-w-5xl gap-10 px-4 pt-12 pb-20 sm:px-8 lg:grid-cols-[220px_minmax(0,1fr)]">
        <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
          <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">On this page</p>
          <ol className="mt-3 space-y-1.5 text-sm">
            {sections.map((s, i) => (
              <li key={s.id}>
                <a href={`#${s.id}`} className="text-muted-foreground hover:text-foreground">
                  {i + 1}. {s.title}
                </a>
              </li>
            ))}
          </ol>
          <p className="mt-6 text-xs text-muted-foreground">Effective {LEGAL.effective}</p>
        </nav>
        <article className="min-w-0 space-y-10 text-[15px] leading-relaxed text-foreground/90 [&_a]:font-medium [&_a]:text-primary [&_a]:underline-offset-2 hover:[&_a]:underline [&_li]:mt-1.5 [&_ul]:list-disc [&_ul]:pl-5">
          {sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-24">
              <h2 className="text-xl font-extrabold tracking-tight text-foreground">
                {i + 1}. {s.title}
              </h2>
              <div className="mt-3 space-y-3">{s.body}</div>
            </section>
          ))}
        </article>
      </div>
    </>
  );
}

export function ContactLines() {
  return (
    <ul>
      <li>
        Email: <a href={`mailto:${LEGAL.email}`}>{LEGAL.email}</a>
      </li>
      <li>
        WhatsApp: <a href={`https://wa.me/${LEGAL.whatsapp.replace(/\D/g, "")}`}>{LEGAL.whatsapp}</a>
      </li>
      <li>
        {LEGAL.grievanceOfficer}, {LEGAL.company}, {LEGAL.address}
      </li>
    </ul>
  );
}
