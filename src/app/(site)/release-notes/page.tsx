import type { Metadata } from "next";
import { SiteHero } from "@/components/site/site-chrome";

export const metadata: Metadata = {
  title: "Release notes",
  description: "What's new in AutoShift: product updates, improvements and fixes.",
};

type Category = "New" | "Improved" | "Fixed";
type Release = { date: string; title: string; category: Category; items: string[] };

/** Newest first. Add an entry to publish a release note. */
const RELEASES: Release[] = [
  {
    date: "2026-10-24",
    title: "AutoShift CRM",
    category: "New",
    items: [
      "Shared WhatsApp inbox, contacts with tags and custom fields, sales pipelines, broadcasts, automations, flows and AI replies in one workspace.",
      "A fresh look across the app: warm cream background, white rounded cards and AutoShift green, with light and dark modes.",
    ],
  },
  {
    date: "2026-10-24",
    title: "Free WhatsApp tools",
    category: "New",
    items: ["Link generator, QR code generator, text formatter and website chat button. Free, with no sign-up."],
  },
];

const tone: Record<Category, string> = {
  New: "bg-[var(--tone-mint)] text-primary",
  Improved: "bg-[var(--tone-sky)] text-[#24508F]",
  Fixed: "bg-[var(--tone-butter)] text-[#7A5A0E]",
};

export default function ReleaseNotesPage() {
  return (
    <>
      <SiteHero eyebrow="Release notes" title="What’s new in AutoShift" lead="Product updates, improvements and fixes as they ship." tone="sky" />
      <section className="mx-auto max-w-3xl px-4 pt-14 sm:px-8">
        <ol className="space-y-6">
          {RELEASES.map((release) => (
            <li key={`${release.date}-${release.title}`} className="rounded-[24px] bg-card p-7 shadow-[var(--shadow-card)] ring-1 ring-border/70">
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <time dateTime={release.date} className="font-semibold text-muted-foreground">
                  {new Date(`${release.date}T00:00:00Z`).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" })}
                </time>
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${tone[release.category]}`}>{release.category}</span>
              </div>
              <h2 className="mt-3 text-2xl font-extrabold tracking-tight">{release.title}</h2>
              <ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted-foreground">
                {release.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </li>
          ))}
        </ol>
      </section>
    </>
  );
}
