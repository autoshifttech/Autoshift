"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { toast } from "sonner"
import {
  Zap,
  Plus,
  MoreVertical,
  Copy,
  Pencil,
  Trash2,
  FileText,
  MessageCircle,
  Clock,
  Users,
  PhoneCall,
  Loader2,
  ArrowRight,
} from "lucide-react"

import { createClient } from "@/lib/supabase/client"
import { useCan } from "@/hooks/use-can"
import { useTranslations } from "next-intl"
import type { Automation } from "@/types"
import { Button, buttonVariants } from "@/components/ui/button"
import { GatedButton } from "@/components/ui/gated-button"
import { Switch } from "@/components/ui/switch"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { AUTOMATION_TEMPLATES, type TemplateSlug } from "@/lib/automations/templates"
import { triggerMeta, formatRelative, isKnownTrigger } from "@/lib/automations/trigger-meta"
import { cn } from "@/lib/utils"

const TEMPLATE_ORDER: TemplateSlug[] = [
  "welcome_message",
  "out_of_office",
  "lead_qualifier",
  "follow_up_reminder",
]

const TEMPLATE_ICON: Record<TemplateSlug, typeof Zap> = {
  welcome_message: MessageCircle,
  out_of_office: Clock,
  lead_qualifier: Users,
  follow_up_reminder: PhoneCall,
}

export default function AutomationsPage() {
  const router = useRouter()
  const canCreate = useCan("send-messages")
  const t = useTranslations("Automations.list")
  const tGate = useTranslations("GatedButton")
  const tN8n = useTranslations("N8n.banner")
  const [automations, setAutomations] = useState<Automation[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [pendingDelete, setPendingDelete] = useState<Automation | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    try {
      const supabase = createClient()
      const { data, error: fetchErr } = await supabase
        .from("automations")
        .select("*")
        .order("created_at", { ascending: false })
      if (fetchErr) throw fetchErr
      setAutomations((data ?? []) as Automation[])
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loadFailed"))
    }
  }

  useEffect(() => {
    load()
  }, [])

  async function toggleActive(a: Automation, next: boolean) {
    // Optimistic flip so the switch feels instant.
    setAutomations((prev) =>
      prev?.map((x) => (x.id === a.id ? { ...x, is_active: next } : x)) ?? prev,
    )
    const res = await fetch(`/api/automations/${a.id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ is_active: next }),
    })
    if (!res.ok) {
      // Roll back on error.
      setAutomations((prev) =>
        prev?.map((x) => (x.id === a.id ? { ...x, is_active: !next } : x)) ?? prev,
      )
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.updateError"))
      return
    }
    toast.success(next ? t("toasts.activated") : t("toasts.paused"))
  }

  async function duplicate(a: Automation) {
    const res = await fetch(`/api/automations/${a.id}/duplicate`, { method: "POST" })
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.duplicateError"))
      return
    }
    toast.success(t("toasts.duplicated"))
    load()
  }

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    const res = await fetch(`/api/automations/${pendingDelete.id}`, { method: "DELETE" })
    setDeleting(false)
    if (!res.ok) {
      const body = await res.json().catch(() => ({}))
      toast.error(body?.error ?? t("toasts.deleteError"))
      return
    }
    toast.success(t("toasts.deleted"))
    setPendingDelete(null)
    load()
  }

  async function startFromTemplate(slug: TemplateSlug) {
    router.push(`/automations/new?template=${slug}`)
  }

  if (error) {
    return (
      <div className="flex h-64 flex-col items-center justify-center gap-2">
        <p className="text-sm text-red-700 dark:text-red-400">{error}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          {t("retry")}
        </Button>
      </div>
    )
  }

  if (automations === null) {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    )
  }

  const showTemplates = automations.length < 3

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="sr-only">{t("title")}</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {t("subtitle")}
          </p>
        </div>
        <GatedButton
          canAct={canCreate}
          gateReason={tGate("reasons.createAutomations")}
          onClick={() => router.push("/automations/new")}
          className="bg-primary text-primary-foreground hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" />
          {t("create")}
        </GatedButton>
      </div>

      <Link
        href="/automations/n8n"
        className="group flex flex-wrap items-center gap-4 rounded-2xl bg-[var(--tone-lilac)] p-4 ring-1 ring-border transition hover:ring-primary/40 sm:flex-nowrap"
      >
        <span className="rounded-lg bg-[#C92A55] px-2 py-1 font-mono text-sm font-bold text-white">n8n</span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-foreground">{tN8n("title")}</span>
          <span className="block text-sm text-muted-foreground">{tN8n("desc")}</span>
        </span>
        <span className={buttonVariants({ variant: "outline", size: "sm", className: "bg-card" })}>
          {tN8n("cta")} <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
        </span>
      </Link>

      {showTemplates && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">{t("templatesTitle")}</h2>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {TEMPLATE_ORDER.map((slug) => {
              const t = AUTOMATION_TEMPLATES[slug]
              const Icon = TEMPLATE_ICON[slug]
              return (
                <button
                  key={slug}
                  onClick={() => startFromTemplate(slug)}
                  className="group flex flex-col items-start rounded-xl border border-border bg-card p-4 text-left transition-colors hover:border-primary/50 hover:bg-card/80"
                >
                  <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary/15">
                    <Icon className="h-5 w-5" />
                  </div>
                  <div className="text-sm font-semibold text-foreground">{t.name}</div>
                  <p className="mt-1 text-xs text-muted-foreground">{t.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      )}

      {automations.length === 0 ? (
        <div className="flex h-48 flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            <Zap className="h-6 w-6 text-primary" />
          </div>
          <p className="mt-3 text-sm font-medium text-foreground">{t("emptyTitle")}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {t("emptyDesc")}
          </p>
        </div>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {automations.map((a) => (
            <AutomationCard
              key={a.id}
              automation={a}
              onToggle={(next) => toggleActive(a, next)}
              onEdit={() => router.push(`/automations/${a.id}/edit`)}
              onDuplicate={() => duplicate(a)}
              onLogs={() => router.push(`/automations/${a.id}/logs`)}
              onDelete={() => setPendingDelete(a)}
              t={t}
            />
          ))}
        </ul>
      )}

      <Dialog open={!!pendingDelete} onOpenChange={(v) => !v && setPendingDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("deleteTitle")}</DialogTitle>
            <DialogDescription>
              {t("deleteDesc", { name: pendingDelete?.name ?? "" })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setPendingDelete(null)}
              disabled={deleting}
            >
              {t("cancel")}
            </Button>
            <Button
              variant="destructive"
              onClick={confirmDelete}
              disabled={deleting}
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              {t("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function AutomationCard({
  automation,
  onToggle,
  onEdit,
  onDuplicate,
  onLogs,
  onDelete,
  t,
}: {
  automation: Automation
  onToggle: (next: boolean) => void
  onEdit: () => void
  onDuplicate: () => void
  onLogs: () => void
  onDelete: () => void
  t: ReturnType<typeof useTranslations>
}) {
  const tTriggers = useTranslations("Automations.builder.triggers")
  const tRelative = useTranslations("Automations.relative")
  const meta = triggerMeta(automation.trigger_type)
  const triggerLabel = isKnownTrigger(automation.trigger_type)
    ? tTriggers(`${automation.trigger_type}.label`)
    : automation.trigger_type
  return (
    <li className="flex flex-col gap-3 rounded-[18px] border border-border bg-card p-4 shadow-[var(--shadow-card)] transition-[transform,box-shadow] hover:-translate-y-0.5">
      <div className="flex items-start justify-between gap-2">
        <button type="button" onClick={onEdit} className="min-w-0 text-left text-sm leading-snug font-bold text-foreground hover:underline">
          {automation.name}
        </button>
        <div className="flex shrink-0 items-center gap-1.5">
          <span className="text-xs text-muted-foreground">{automation.is_active ? t("statusActive") : t("statusPaused")}</span>
          <Switch
            checked={automation.is_active}
            onCheckedChange={(v) => onToggle(!!v)}
            aria-label={automation.is_active ? t("deactivate") : t("activate")}
          />
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label={t("openMenu")}
              className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground data-[popup-open]:bg-muted"
            >
              <MoreVertical className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={onEdit}>
                <Pencil className="h-4 w-4" />
                {t("edit")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onDuplicate}>
                <Copy className="h-4 w-4" />
                {t("duplicate")}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={onLogs}>
                <FileText className="h-4 w-4" />
                {t("viewLogs")}
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={onDelete}>
                <Trash2 className="h-4 w-4" />
                {t("delete")}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <span className={cn("inline-flex w-fit items-center gap-1 rounded-lg border px-2 py-0.5 text-xs font-semibold", meta.pillClass)}>
        <Zap className="size-3" aria-hidden />
        {triggerLabel}
      </span>
      {automation.description && <p className="line-clamp-2 min-h-9 text-xs text-muted-foreground">{automation.description}</p>}
      <dl className="mt-auto grid grid-cols-2 gap-2 border-t border-border pt-3 text-xs text-muted-foreground">
        <div>
          <dt>{t("runsLabel")}</dt>
          <dd className="text-base font-bold tracking-[-0.02em] text-foreground tabular-nums">{automation.execution_count.toLocaleString()}</dd>
        </div>
        <div>
          <dt>{t("lastRunLabel")}</dt>
          <dd className="text-sm font-semibold text-foreground">{formatRelative(automation.last_executed_at, tRelative)}</dd>
        </div>
      </dl>
    </li>
  )
}
