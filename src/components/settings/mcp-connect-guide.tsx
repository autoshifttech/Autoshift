'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, PlugZap } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from '@/lib/toast';
import { backendUrl } from '@/lib/backend/client';

const CLIENTS = ['claudeCode', 'claudeDesktop', 'cursor', 'vscode', 'n8n', 'other'] as const;
type Client = (typeof CLIENTS)[number];

function CodeBlock({ code, label }: { code: string; label: string }) {
  const t = useTranslations('Settings.mcpGuide');
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error(t('copyFailed'));
    }
  };
  return (
    <div className="relative">
      <pre aria-label={label} className="max-w-full overflow-x-auto rounded-xl border border-border bg-muted/40 p-3 pr-12 text-xs leading-relaxed text-foreground">
        <code>{code}</code>
      </pre>
      <Button type="button" variant="ghost" size="icon" onClick={copy} className="absolute top-1 right-1 size-11" aria-label={copied ? t('copied') : t('copyLabel', { what: label })}>
        {copied ? <Check className="size-4 text-primary" aria-hidden /> : <Copy className="size-4" aria-hidden />}
      </Button>
    </div>
  );
}

/**
 * How to connect AutoShift's MCP server to an AI app (Claude, Cursor, VS Code, n8n…), with ready
 * to paste setup. Shown on both API key pages; `apiKey` fills the snippets right after a key is made.
 */
export function McpConnectGuide({ platform = false, apiKey }: { platform?: boolean; apiKey?: string | null }) {
  const t = useTranslations('Settings.mcpGuide');
  const [client, setClient] = useState<Client>('claudeCode');
  const base = backendUrl();
  if (!base) return null;
  const url = `${base}/mcp/`;
  const key = apiKey || 'asmcp_YOUR_KEY';

  const snippet: Record<Client, string | null> = {
    claudeCode: `claude mcp add --transport http autoshift ${url} \\\n  --header "Authorization: Bearer ${key}"`,
    claudeDesktop: JSON.stringify({ mcpServers: { autoshift: { command: 'npx', args: ['-y', 'mcp-remote', url, '--header', 'Authorization:${AUTOSHIFT_AUTH}'], env: { AUTOSHIFT_AUTH: `Bearer ${key}` } } } }, null, 2),
    cursor: JSON.stringify({ mcpServers: { autoshift: { url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    vscode: JSON.stringify({ servers: { autoshift: { type: 'http', url, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    n8n: null,
    other: `URL:    ${url}\nHeader: Authorization: Bearer ${key}`,
  };
  const steps = (t.raw(`steps.${client}`) as string[]) ?? [];

  return (
    <section aria-labelledby="mcp-guide-title" className="space-y-4 rounded-2xl border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-primary/10">
          <PlugZap className="size-4 text-primary" aria-hidden />
        </span>
        <div className="min-w-0">
          <h3 id="mcp-guide-title" className="font-semibold text-foreground">
            {t('title')}
          </h3>
          <p className="text-sm text-muted-foreground">{platform ? t('descPlatform') : t('desc')}</p>
        </div>
      </div>

      <ol className="list-decimal space-y-1 pl-5 text-sm text-foreground">
        <li>{t('step1')}</li>
        <li>{t('step2')}</li>
        <li>{t('step3')}</li>
      </ol>

      <div>
        <p className="mb-1 text-xs font-medium text-muted-foreground">{t('serverUrl')}</p>
        <CodeBlock code={url} label={t('serverUrl')} />
      </div>

      <div role="tablist" aria-label={t('chooseApp')} className="flex flex-wrap gap-2">
        {CLIENTS.map((c) => (
          <button
            key={c}
            type="button"
            role="tab"
            aria-selected={client === c}
            onClick={() => setClient(c)}
            className={cn(
              'min-h-11 rounded-full border px-3 text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
              client === c ? 'border-primary bg-primary text-primary-foreground' : 'border-border bg-card text-foreground hover:bg-muted',
            )}
          >
            {t(`apps.${c}`)}
          </button>
        ))}
      </div>

      <div role="tabpanel" aria-label={t(`apps.${client}`)} className="space-y-3">
        <ol className="list-decimal space-y-1.5 pl-5 text-sm text-foreground">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {snippet[client] && <CodeBlock code={snippet[client]!} label={t(`apps.${client}`)} />}
      </div>

      <ul className="space-y-1 border-t border-border pt-3 text-xs text-muted-foreground">
        <li>{t('tipScope')}</li>
        <li>{t('tipConfirm')}</li>
        <li>{t('tipSecret')}</li>
        <li>{t('tipTry')}</li>
      </ul>
    </section>
  );
}
