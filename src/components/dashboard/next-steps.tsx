"use client"

import Link from "next/link"
import { useTranslations } from "next-intl"
import { ArrowUpRight, CheckCircle2, Megaphone, MessageSquareReply, PlugZap, Sparkles, Wallet, type LucideIcon } from "lucide-react"

import type { DashboardOverview } from "@/lib/dashboard/overview"
import { trialDaysLeft, useSubscription } from "@/lib/billing/plans"
import { balanceOf, useWallet } from "@/lib/wallet/model"

interface Step {
  id: string
  icon: LucideIcon
  text: string
  href: string
}

/**
 * Up to three things worth doing right now, most urgent first, built from
 * what the workspace already knows: connection, waiting customers, wallet,
 * trial and campaigns. Hides itself when there is nothing to suggest.
 */
export function NextSteps({ data }: { data: DashboardOverview | null }) {
  const t = useTranslations("Dashboard.nextSteps")
  const wallet = useWallet()
  const sub = useSubscription()
  if (!data) return null

  const steps: Step[] = []
  if (!data.setup.whatsappConnected) steps.push({ id: "connect", icon: PlugZap, text: t("connect"), href: "/settings?tab=whatsapp" })
  if (data.attention.waiting > 0) steps.push({ id: "reply", icon: MessageSquareReply, text: t("reply", { count: data.attention.waiting }), href: "/inbox" })
  if (balanceOf(wallet.transactions) < wallet.lowBalanceAlert) steps.push({ id: "topup", icon: Wallet, text: t("topUp"), href: "/wallet" })
  if (sub.status === "trialing" && trialDaysLeft(sub) <= 3) steps.push({ id: "trial", icon: Sparkles, text: t("trial", { days: trialDaysLeft(sub) }), href: "/settings?tab=billing" })
  if (!data.campaigns.latestBroadcast) steps.push({ id: "broadcast", icon: Megaphone, text: t("broadcast"), href: "/broadcasts" })

  const shown = steps.slice(0, 3)
  return (
    <section aria-label={t("title")} className="rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] sm:p-5">
      <h2 className="text-base font-semibold text-foreground">{t("title")}</h2>
      {shown.length === 0 ? (
        <p className="mt-2 inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <CheckCircle2 className="size-4 text-primary" />
          {t("allClear")}
        </p>
      ) : (
        <ul className="mt-3 grid gap-2 md:grid-cols-3">
          {shown.map((s) => (
            <li key={s.id}>
              <Link
                href={s.href}
                className="group flex min-h-14 items-center gap-3 rounded-2xl bg-muted/60 px-3 py-2.5 text-sm font-semibold text-foreground transition-[background-color,transform] hover:bg-muted active:scale-[0.98]"
              >
                <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <s.icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">{s.text}</span>
                <ArrowUpRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
