import type { Metadata } from "next";
import Link from "next/link";
import { SiteHero } from "@/components/site/site-chrome";
import { DataDeletion } from "@/components/site/data-deletion";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Data deletion",
  description: "How to delete your AutoShift account, your WhatsApp connection, or your chats with a business that uses AutoShift.",
};

const STEPS = [
  {
    title: "Businesses using AutoShift",
    body: (
      <>
        Sign in and open <strong>Settings → Data &amp; privacy → Delete workspace</strong>. It disconnects your WhatsApp number, cancels your plan and erases your data within {LEGAL.deletionGraceDays} days. You can also use the form below.
      </>
    ),
  },
  {
    title: "People who connected AutoShift with Facebook",
    body: (
      <>
        On Facebook, open <strong>Settings &amp; privacy → Settings → Business integrations</strong>, select AutoShift and remove it. We are told automatically and delete the data we got from Facebook. You&apos;ll get a confirmation code you can check on this page.
      </>
    ),
  },
  {
    title: "Customers who chatted with a business",
    body: (
      <>
        Reply <strong>STOP</strong> to stop marketing messages. To delete your chats and number, ask the business, or use the form below and we&apos;ll handle it with them.
      </>
    ),
  },
];

export default function DataDeletionPage() {
  return (
    <>
      <SiteHero eyebrow="Legal" title="Delete your data" lead={`How to remove your data from ${LEGAL.product}. We finish every request within 30 days.`} tone="sky" />
      <div className="mx-auto max-w-5xl space-y-10 px-4 pt-12 pb-20 sm:px-8">
        <ol className="grid gap-4 md:grid-cols-3">
          {STEPS.map((s, i) => (
            <li key={s.title} className="rounded-[24px] bg-card p-6 shadow-[var(--shadow-card)] ring-1 ring-border/70">
              <span className="flex size-8 items-center justify-center rounded-full bg-[var(--tone-mint)] text-sm font-bold text-primary">{i + 1}</span>
              <h2 className="mt-3 text-lg font-extrabold tracking-tight">{s.title}</h2>
              <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{s.body}</p>
            </li>
          ))}
        </ol>
        <DataDeletion />
        <p className="text-sm text-muted-foreground">
          What we delete and what we must keep for tax law is explained in our <Link href="/privacy#retention" className="font-medium text-primary hover:underline">privacy policy</Link>.
        </p>
      </div>
    </>
  );
}
