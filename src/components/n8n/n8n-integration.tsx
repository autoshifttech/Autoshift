"use client"

import { useMemo, useState, useSyncExternalStore } from "react"
import Link from "next/link"
import { useTranslations } from "next-intl"
import { toast } from "sonner"
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  Copy,
  Download,
  GitBranch,
  KeyRound,
  Send,
  Webhook,
} from "lucide-react"

import { Button, buttonVariants } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import {
  CREDENTIAL_NAME,
  NODE_CATALOGUE,
  WORKFLOW_TEMPLATES,
  catalogueSnippet,
  isDeliverableWebhookUrl,
  webhookRegistrationCurl,
  type CatalogueEntry,
  type WorkflowTemplate,
} from "@/lib/n8n/workflows"

const API_DOCS_URL = "https://github.com/autoshifttech/autoshift/blob/main/docs/public-api.md"
const EVENTS = ["message.received", "message.status_updated", "conversation.created"] as const

const METHOD_TONE: Record<CatalogueEntry["method"], string> = {
  WEBHOOK: "bg-[var(--tone-lilac)] text-[#6A2E80] dark:text-fuchsia-300",
  GET: "bg-[var(--tone-sky)] text-[#24508F] dark:text-sky-300",
  POST: "bg-[var(--tone-mint)] text-primary",
  PATCH: "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300",
}

const noopSubscribe = () => () => {}

/** The browser's origin on the client, "" during server rendering (no hydration mismatch). */
function useOrigin(): string {
  return useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "")
}

function useCopy() {
  const t = useTranslations("N8n")
  const [copiedKey, setCopiedKey] = useState<string | null>(null)
  const copy = async (key: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedKey(key)
      toast.success(t("copied"))
      window.setTimeout(() => setCopiedKey((current) => (current === key ? null : current)), 2000)
    } catch {
      toast.error(t("copyFailed"))
    }
  }
  return { copiedKey, copy }
}

function download(filename: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/json" }))
  const link = document.createElement("a")
  link.href = url
  link.download = filename
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function StepNumber({ n }: { n: number }) {
  return (
    <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary text-sm font-bold text-primary-foreground">
      {n}
    </span>
  )
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="max-h-72 overflow-auto rounded-xl bg-foreground p-4 font-mono text-xs leading-relaxed text-background">
      <code>{children}</code>
    </pre>
  )
}

export function N8nIntegration() {
  const t = useTranslations("N8n")
  const origin = useOrigin()
  const [customBase, setCustomBase] = useState<string | null>(null)
  const baseUrl = customBase ?? origin
  const [n8nUrl, setN8nUrl] = useState("")
  const [n8nTouched, setN8nTouched] = useState(false)
  const [events, setEvents] = useState<string[]>(["message.received"])
  const { copiedKey, copy } = useCopy()

  const n8nUrlError = n8nTouched && n8nUrl && !isDeliverableWebhookUrl(n8nUrl) ? t("setup.n8nUrlError") : null
  const curl = useMemo(() => webhookRegistrationCurl(baseUrl, n8nUrl, events), [baseUrl, n8nUrl, events])

  const toggleEvent = (event: string) =>
    setEvents((current) => (current.includes(event) ? current.filter((e) => e !== event) : [...current, event]))

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="max-w-3xl">
          <Link href="/automations" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" /> {t("back")}
          </Link>
          <div className="mt-3 flex items-center gap-3">
            <span className="rounded-lg bg-[#EA4B71] px-2 py-1 font-mono text-sm font-bold text-white">n8n</span>
            <h1 className="text-2xl font-extrabold tracking-tight text-foreground sm:text-3xl">{t("title")}</h1>
          </div>
          <p className="mt-2 text-muted-foreground">{t("subtitle")}</p>
        </div>
        <a href={API_DOCS_URL} target="_blank" rel="noopener noreferrer" className={buttonVariants({ variant: "outline" })}>
          <BookOpen className="size-4" /> {t("docs")}
        </a>
      </div>

      {/* How it connects */}
      <section aria-labelledby="n8n-flow">
        <h2 id="n8n-flow" className="mb-3 text-sm font-semibold text-muted-foreground">
          {t("flow.title")}
        </h2>
        <ol className="grid gap-3 md:grid-cols-3">
          {(
            [
              { key: "receive", icon: Webhook, tone: "var(--tone-lilac)" },
              { key: "decide", icon: GitBranch, tone: "var(--tone-butter)" },
              { key: "send", icon: Send, tone: "var(--tone-mint)" },
            ] as const
          ).map(({ key, icon: Icon, tone }, index) => (
            <li key={key} className="relative">
              <Card className="h-full">
                <CardContent className="space-y-3">
                  <span className="grid size-11 place-items-center rounded-full text-primary" style={{ background: tone }}>
                    <Icon className="size-5" />
                  </span>
                  <p className="text-base font-bold text-foreground">{t(`flow.${key}Title`)}</p>
                  <p className="text-sm text-muted-foreground">{t(`flow.${key}Desc`)}</p>
                </CardContent>
              </Card>
              {index < 2 && (
                <ArrowRight aria-hidden className="absolute top-1/2 -right-3 z-10 hidden size-6 -translate-y-1/2 rounded-full bg-background p-1 text-muted-foreground md:block" />
              )}
            </li>
          ))}
        </ol>
      </section>

      {/* Setup */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t("setup.title")}</CardTitle>
          <CardDescription>{t("setup.baseUrlHint")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-8">
          <div className="max-w-md space-y-2">
            <Label htmlFor="n8n-base-url">{t("setup.baseUrlLabel")}</Label>
            <Input id="n8n-base-url" value={baseUrl} onChange={(e) => setCustomBase(e.target.value)} spellCheck={false} />
          </div>

          <div className="flex gap-4">
            <StepNumber n={1} />
            <div className="min-w-0 flex-1 space-y-3">
              <p className="font-bold text-foreground">{t("setup.step1Title")}</p>
              <p className="text-sm text-muted-foreground">{t("setup.step1Desc", { credential: CREDENTIAL_NAME })}</p>
              <Link href="/settings?tab=api" className={buttonVariants({ variant: "outline", size: "sm" })}>
                <KeyRound className="size-4" /> {t("setup.step1Action")}
              </Link>
            </div>
          </div>

          <div className="flex gap-4">
            <StepNumber n={2} />
            <div className="min-w-0 flex-1 space-y-4">
              <p className="font-bold text-foreground">{t("setup.step2Title")}</p>
              <p className="text-sm text-muted-foreground">{t("setup.step2Desc")}</p>
              <div className="grid gap-4 lg:grid-cols-[1.2fr_1fr]">
                <div className="space-y-2">
                  <Label htmlFor="n8n-webhook-url">{t("setup.n8nUrlLabel")}</Label>
                  <Input
                    id="n8n-webhook-url"
                    value={n8nUrl}
                    placeholder={t("setup.n8nUrlPlaceholder")}
                    onChange={(e) => setN8nUrl(e.target.value)}
                    onBlur={() => setN8nTouched(true)}
                    aria-invalid={Boolean(n8nUrlError)}
                    aria-describedby={n8nUrlError ? "n8n-webhook-url-error" : undefined}
                    spellCheck={false}
                  />
                  {n8nUrlError && (
                    <p id="n8n-webhook-url-error" role="alert" className="text-xs font-medium text-destructive">
                      {n8nUrlError}
                    </p>
                  )}
                </div>
                <fieldset className="space-y-2">
                  <legend className="mb-2 text-sm font-medium">{t("setup.eventsLabel")}</legend>
                  {EVENTS.map((event) => (
                    <label key={event} className="flex cursor-pointer items-center gap-2.5 text-sm">
                      <input type="checkbox" checked={events.includes(event)} onChange={() => toggleEvent(event)} className="size-4 accent-[var(--primary)]" />
                      <code className="font-mono text-xs text-foreground">{event}</code>
                      <span className="text-muted-foreground">{t(`events.${event.replace(".", "_")}`)}</span>
                    </label>
                  ))}
                </fieldset>
              </div>
              <div className="space-y-2">
                <CodeBlock>{curl}</CodeBlock>
                <div className="flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => copy("curl", curl)} disabled={events.length === 0}>
                    {copiedKey === "curl" ? <Check className="size-4" /> : <Copy className="size-4" />} {t("setup.copyCall")}
                  </Button>
                  <p className="text-xs text-muted-foreground">{t("setup.step2Note")}</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex gap-4">
            <StepNumber n={3} />
            <div className="min-w-0 flex-1 space-y-2">
              <p className="font-bold text-foreground">{t("setup.step3Title")}</p>
              <p className="text-sm text-muted-foreground">{t("setup.step3Desc", { credential: CREDENTIAL_NAME })}</p>
              <a href="#n8n-templates" className={buttonVariants({ variant: "outline", size: "sm" })}>
                {t("setup.step3Action")} <ArrowRight className="size-4" />
              </a>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Workflow templates */}
      <section id="n8n-templates" aria-labelledby="n8n-templates-title" className="scroll-mt-20 space-y-3">
        <div>
          <h2 id="n8n-templates-title" className="text-lg font-bold text-foreground">
            {t("templates.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("templates.desc")}</p>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          {WORKFLOW_TEMPLATES.map((template) => (
            <TemplateCard key={template.id} template={template} baseUrl={baseUrl} copiedKey={copiedKey} onCopy={copy} />
          ))}
        </div>
      </section>

      {/* Node catalogue */}
      <section aria-labelledby="n8n-nodes-title" className="space-y-3">
        <div>
          <h2 id="n8n-nodes-title" className="text-lg font-bold text-foreground">
            {t("nodes.title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("nodes.desc")}</p>
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {NODE_CATALOGUE.map((entry) => {
            const key = `node:${entry.id}`
            return (
              <li key={entry.id}>
                <Card className="h-full">
                  <CardContent className="flex h-full flex-col gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={cn("rounded-full px-2.5 py-0.5 font-mono text-[11px] font-bold", METHOD_TONE[entry.method])}>
                        {entry.method}
                      </span>
                      <span className="text-xs font-semibold text-muted-foreground">
                        {entry.kind === "trigger" ? t("nodes.trigger") : t("nodes.action")}
                      </span>
                    </div>
                    <div>
                      <p className="font-bold text-foreground">{t(`nodes.items.${entry.id}.title`)}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{t(`nodes.items.${entry.id}.desc`)}</p>
                    </div>
                    <code className="block truncate font-mono text-xs text-foreground/80" title={entry.path}>
                      {entry.path}
                    </code>
                    <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-1">
                      <span className="text-xs text-muted-foreground">
                        {entry.scope ? t("nodes.scope", { scope: entry.scope }) : t("nodes.noScope")}
                      </span>
                      <Button variant="outline" size="sm" onClick={() => copy(key, JSON.stringify(catalogueSnippet(entry, baseUrl), null, 2))}>
                        {copiedKey === key ? <Check className="size-4" /> : <Copy className="size-4" />} {t("nodes.copy")}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              </li>
            )
          })}
        </ul>
      </section>
    </div>
  )
}

function TemplateCard({
  template,
  baseUrl,
  copiedKey,
  onCopy,
}: {
  template: WorkflowTemplate
  baseUrl: string
  copiedKey: string | null
  onCopy: (key: string, text: string) => void
}) {
  const t = useTranslations("N8n")
  const workflow = useMemo(() => template.build(baseUrl), [template, baseUrl])
  const json = useMemo(() => JSON.stringify(workflow, null, 2), [workflow])
  const key = `template:${template.id}`

  return (
    <Card className="h-full">
      <CardHeader>
        <CardTitle className="text-base">{t(`templates.items.${template.id}.title`)}</CardTitle>
        <CardDescription>{t(`templates.items.${template.id}.desc`)}</CardDescription>
      </CardHeader>
      <CardContent className="flex h-full flex-col gap-4">
        <ol className="flex flex-wrap items-center gap-1.5" aria-label={t("templates.steps")}>
          {workflow.nodes.map((node, index) => (
            <li key={node.id} className="flex items-center gap-1.5">
              {index > 0 && <ArrowRight aria-hidden className="size-3.5 text-muted-foreground" />}
              <span
                className={cn(
                  "rounded-full px-2.5 py-1 text-xs font-semibold",
                  node.type.endsWith(".webhook")
                    ? "bg-[var(--tone-lilac)] text-[#6A2E80] dark:text-fuchsia-300"
                    : node.type.endsWith(".if")
                      ? "bg-[var(--tone-butter)] text-[#7A5A0E] dark:text-amber-300"
                      : "bg-[var(--tone-mint)] text-primary",
                )}
              >
                {node.name}
              </span>
            </li>
          ))}
        </ol>
        <dl className="grid gap-2 text-xs sm:grid-cols-2">
          <div>
            <dt className="font-semibold text-muted-foreground">{t("templates.listensFor")}</dt>
            <dd className="mt-1 font-mono text-foreground">{template.events.join(", ")}</dd>
          </div>
          <div>
            <dt className="font-semibold text-muted-foreground">{t("templates.keyScopes")}</dt>
            <dd className="mt-1 font-mono text-foreground">{template.scopes.join(", ")}</dd>
          </div>
        </dl>
        {template.id === "failed-delivery" && <p className="text-xs text-amber-800 dark:text-amber-300">{t("templates.failedNote")}</p>}
        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-primary">{t("templates.viewJson")}</summary>
          <div className="mt-2">
            <CodeBlock>{json}</CodeBlock>
          </div>
        </details>
        <div className="mt-auto flex flex-wrap gap-2">
          <Button size="sm" onClick={() => onCopy(key, json)}>
            {copiedKey === key ? <Check className="size-4" /> : <Copy className="size-4" />} {t("templates.copy")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => download(`autoshift-${template.id}.n8n.json`, json)}>
            <Download className="size-4" /> {t("templates.download")}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
