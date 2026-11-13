'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, KeyRound, Plus, ShieldAlert } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { toast } from '@/lib/toast';
import { backend, backendUrl } from '@/lib/backend/client';
import { ApiKeysSettings } from './api-keys-settings';
import { SettingsPanelHead } from './settings-panel-head';

interface ApiKey {
  id: string;
  prefix: string;
  name: string;
  scope: 'read' | 'write';
  expires_at: string | null;
  revoked_at: string | null;
  last_used_at: string | null;
  created_at: string;
}

/**
 * Keys for AI assistants (MCP) and automation tools such as n8n. The key is shown once.
 * `platform` manages platform keys instead (super admins, admin panel): they reach the platform_* MCP tools.
 */
export function ApiKeysPanel({ platform = false }: { platform?: boolean } = {}) {
  const t = useTranslations('Settings.backendKeys');
  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [name, setName] = useState('');
  const [scope, setScope] = useState<'read' | 'write'>('read');
  const [days, setDays] = useState('90');
  const [busy, setBusy] = useState(false);
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);
  const connected = backendUrl() !== null;
  const endpoint = platform ? '/v1/platform/mcp-keys' : '/v1/mcp-keys';

  const load = useCallback(async () => {
    try {
      setKeys(await backend<ApiKey[]>(endpoint));
    } catch (e) {
      setKeys([]);
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t, endpoint]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  // Without the backend, the website's own public API (/api/v1) still serves n8n, Zapier and scripts.
  if (!connected) return platform ? null : <ApiKeysSettings />;

  const create = async () => {
    if (!name.trim()) return toast.error(t('nameRequired'));
    setBusy(true);
    try {
      const made = await backend<ApiKey & { key: string }>(endpoint, {
        method: 'POST',
        body: { name: name.trim(), scope, expires_in_days: days === 'never' ? null : Number(days) },
      });
      setFresh(made.key);
      setCopied(false);
      setName('');
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!fresh) return;
    try {
      await navigator.clipboard.writeText(fresh);
      setCopied(true);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const revoke = async () => {
    if (!revoking) return;
    try {
      await backend(`${endpoint}/${revoking.id}`, { method: 'DELETE' });
      toast.success(t('revoked'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('revokeFailed'));
    }
    setRevoking(null);
  };

  const date = (v: string | null) => (v ? new Date(v).toLocaleDateString() : null);

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t(platform ? 'platformTitle' : 'title')} description={t(platform ? 'platformDesc' : 'desc')} />

      {fresh && (
        <div role="status" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('copyNow')}
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card px-3 py-2 text-xs">{fresh}</code>
            <Button type="button" variant="outline" onClick={copy} className="min-h-10 shrink-0">
              {copied ? <Check className="mr-1.5 size-4" /> : <Copy className="mr-1.5 size-4" />}
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
          <Button type="button" variant="ghost" onClick={() => setFresh(null)} className="min-h-10">
            {t('done')}
          </Button>
        </div>
      )}

      <div className="grid gap-3 rounded-2xl border border-border bg-card p-4 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-end">
        <div className="grid gap-1.5">
          <Label htmlFor="key-name">{t('name')}</Label>
          <Input id="key-name" value={name} onChange={(e) => setName(e.target.value)} placeholder={t('namePlaceholder')} maxLength={80} />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-scope">{t('access')}</Label>
          <NativeSelect id="key-scope" value={scope} onChange={(e) => setScope(e.target.value as 'read' | 'write')}>
            <option value="read">{t('readOnly')}</option>
            <option value="write">{t('readWrite')}</option>
          </NativeSelect>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="key-days">{t('expires')}</Label>
          <NativeSelect id="key-days" value={days} onChange={(e) => setDays(e.target.value)}>
            <option value="30">{t('days30')}</option>
            <option value="90">{t('days90')}</option>
            <option value="365">{t('days365')}</option>
            <option value="never">{t('never')}</option>
          </NativeSelect>
        </div>
        <Button type="button" onClick={create} disabled={busy} className="min-h-10">
          <Plus className="mr-1.5 size-4" /> {t('create')}
        </Button>
      </div>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
        {keys === null && <li className="p-4 text-sm text-muted-foreground">{t('loading')}</li>}
        {keys?.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t('empty')}</li>}
        {keys?.map((k) => (
          <li key={k.id} className="flex flex-wrap items-center gap-3 p-4">
            <KeyRound className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{k.name}</p>
              <p className="text-xs text-muted-foreground">
                {k.prefix}… · {k.scope === 'read' ? t('readOnly') : t('readWrite')}
                {k.last_used_at ? ` · ${t('lastUsed', { date: date(k.last_used_at) ?? '' })}` : ` · ${t('neverUsed')}`}
                {k.expires_at ? ` · ${t('expiresOn', { date: date(k.expires_at) ?? '' })}` : ''}
              </p>
            </div>
            {k.revoked_at ? (
              <span className="rounded-full bg-foreground/10 px-2.5 py-1 text-xs font-semibold text-muted-foreground">{t('revokedBadge')}</span>
            ) : (
              <Button type="button" variant="outline" onClick={() => setRevoking(k)} className="min-h-10">
                {t('revoke')}
              </Button>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(o) => !o && setRevoking(null)}
        title={t('revokeTitle')}
        description={t('revokeDesc', { name: revoking?.name ?? '' })}
        confirmLabel={t('revoke')}
        cancelLabel={t('cancel')}
        onConfirm={revoke}
      />
    </div>
  );
}
