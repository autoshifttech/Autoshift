'use client';

import { useCallback, useEffect, useState } from 'react';
import { useTranslations } from 'next-intl';
import { Check, Copy, Play, Plus, ShieldAlert, Trash2, Wrench, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { NativeSelect } from '@/components/ui/native-select';
import { SettingsPanelHead } from '@/components/settings/settings-panel-head';
import { toast } from '@/lib/toast';
import { backend, backendUrl } from '@/lib/backend/client';

type ParamType = 'string' | 'number' | 'integer' | 'boolean';
interface Param {
  name: string;
  type: ParamType;
  description: string;
  required: boolean;
}
interface CustomTool {
  id: string;
  name: string;
  description: string;
  params: Param[];
  webhook_url: string;
  audience: 'platform' | 'business';
  min_role: 'viewer' | 'agent' | 'admin' | 'owner';
  requires_confirm: boolean;
  enabled: boolean;
  calls: number;
  last_called_at: string | null;
  last_status: number | null;
}

const NAME_RE = /^[a-z][a-z0-9_]{1,47}$/;
const PARAM_RE = /^[a-z][a-z0-9_]{0,39}$/;
const emptyParam = (): Param => ({ name: '', type: 'string', description: '', required: false });

/** Sample value for a test run, typed the way the tool expects. */
function sample(p: Param, raw: string): unknown {
  if (raw === '') return undefined;
  if (p.type === 'boolean') return raw === 'true';
  if (p.type === 'integer') return Number.parseInt(raw, 10);
  if (p.type === 'number') return Number(raw);
  return raw;
}

/**
 * Custom MCP tools (admin panel, super admins). Each tool is a name, a description the AI reads,
 * its inputs and an https webhook (e.g. n8n) that does the work. AI assistants find them with
 * custom_tools_list and run them with custom_tool_run. Hidden without the backend.
 */
export function CustomToolsPanel() {
  const t = useTranslations('Settings.customTools');
  const [tools, setTools] = useState<CustomTool[] | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [url, setUrl] = useState('');
  const [audience, setAudience] = useState<'platform' | 'business'>('platform');
  const [minRole, setMinRole] = useState<CustomTool['min_role']>('agent');
  const [needsConfirm, setNeedsConfirm] = useState(true);
  const [params, setParams] = useState<Param[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [secret, setSecret] = useState<{ tool: string; value: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [deleting, setDeleting] = useState<CustomTool | null>(null);
  const [testing, setTesting] = useState<CustomTool | null>(null);
  const [testValues, setTestValues] = useState<Record<string, string>>({});
  const [testResult, setTestResult] = useState<string | null>(null);
  const connected = backendUrl() !== null;

  const load = useCallback(async () => {
    try {
      setTools(await backend<CustomTool[]>('/v1/platform/custom-tools'));
    } catch (e) {
      setTools([]);
      toast.error(e instanceof Error ? e.message : t('loadFailed'));
    }
  }, [t]);

  useEffect(() => {
    if (connected) void load();
  }, [connected, load]);

  if (!connected) return null;

  const validate = () => {
    const next: Record<string, string> = {};
    if (!NAME_RE.test(name)) next.name = t('nameRule');
    if (!description.trim()) next.description = t('descriptionRequired');
    if (!url.startsWith('https://')) next.url = t('urlRule');
    params.forEach((p, i) => {
      if (!PARAM_RE.test(p.name)) next[`param-${i}`] = t('paramRule');
    });
    if (new Set(params.map((p) => p.name)).size !== params.length) next.params = t('paramUnique');
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const create = async () => {
    if (!validate()) return;
    setBusy(true);
    try {
      const made = await backend<CustomTool & { secret: string }>('/v1/platform/custom-tools', {
        method: 'POST',
        body: { name, description: description.trim(), webhook_url: url.trim(), audience, min_role: minRole, requires_confirm: needsConfirm, params },
      });
      setSecret({ tool: made.name, value: made.secret });
      setCopied(false);
      setName('');
      setDescription('');
      setUrl('');
      setParams([]);
      toast.success(t('created'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('createFailed'));
    } finally {
      setBusy(false);
    }
  };

  const patch = async (tool: CustomTool, body: Record<string, unknown>) => {
    try {
      const out = await backend<CustomTool & { secret?: string }>(`/v1/platform/custom-tools/${tool.id}`, { method: 'PATCH', body });
      if (out.secret) {
        setSecret({ tool: tool.name, value: out.secret });
        setCopied(false);
      }
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('saveFailed'));
    }
  };

  const remove = async () => {
    if (!deleting) return;
    try {
      await backend(`/v1/platform/custom-tools/${deleting.id}`, { method: 'DELETE' });
      toast.success(t('deleted'));
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('deleteFailed'));
    }
    setDeleting(null);
  };

  const runTest = async () => {
    if (!testing) return;
    const args: Record<string, unknown> = {};
    for (const p of testing.params) {
      const v = sample(p, testValues[p.name] ?? '');
      if (v !== undefined) args[p.name] = v;
    }
    setBusy(true);
    setTestResult(null);
    try {
      const out = await backend<{ result: unknown }>(`/v1/platform/custom-tools/${testing.id}/test`, { method: 'POST', body: { arguments: args } });
      setTestResult(JSON.stringify(out.result, null, 2));
      await load();
    } catch (e) {
      setTestResult(e instanceof Error ? e.message : t('testFailed'));
    } finally {
      setBusy(false);
    }
  };

  const copy = async () => {
    if (!secret) return;
    try {
      await navigator.clipboard.writeText(secret.value);
      setCopied(true);
    } catch {
      toast.error(t('copyFailed'));
    }
  };

  const setParam = (i: number, change: Partial<Param>) => setParams((ps) => ps.map((p, j) => (j === i ? { ...p, ...change } : p)));

  return (
    <div className="space-y-6">
      <SettingsPanelHead title={t('title')} description={t('desc')} />

      {secret && (
        <div role="status" className="space-y-3 rounded-2xl border border-primary/30 bg-primary/5 p-4">
          <p className="flex items-start gap-2 text-sm font-medium text-foreground">
            <ShieldAlert className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden /> {t('secretNow', { tool: secret.tool })}
          </p>
          <div className="flex gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border bg-card px-3 py-2 text-xs">{secret.value}</code>
            <Button type="button" variant="outline" onClick={copy} className="min-h-11 shrink-0">
              {copied ? <Check className="mr-1.5 size-4" aria-hidden /> : <Copy className="mr-1.5 size-4" aria-hidden />}
              {copied ? t('copied') : t('copy')}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t('secretHelp')}</p>
          <Button type="button" variant="ghost" onClick={() => setSecret(null)} className="min-h-11">
            {t('done')}
          </Button>
        </div>
      )}

      <form
        className="space-y-4 rounded-2xl border border-border bg-card p-4"
        onSubmit={(e) => {
          e.preventDefault();
          void create();
        }}
        noValidate
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="grid gap-1.5">
            <Label htmlFor="ct-name">{t('name')}</Label>
            <Input id="ct-name" value={name} onChange={(e) => setName(e.target.value.toLowerCase())} placeholder="order_status" maxLength={48} aria-invalid={!!errors.name} aria-describedby="ct-name-help" autoComplete="off" spellCheck={false} />
            <p id="ct-name-help" className={errors.name ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {errors.name ?? t('nameHelp')}
            </p>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ct-url">{t('url')}</Label>
            <Input id="ct-url" type="url" inputMode="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://n8n.example.com/webhook/…" maxLength={500} aria-invalid={!!errors.url} aria-describedby="ct-url-help" autoComplete="off" />
            <p id="ct-url-help" className={errors.url ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
              {errors.url ?? t('urlHelp')}
            </p>
          </div>
        </div>

        <div className="grid gap-1.5">
          <Label htmlFor="ct-desc">{t('description')}</Label>
          <Textarea id="ct-desc" value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t('descriptionPlaceholder')} maxLength={1000} rows={3} aria-invalid={!!errors.description} aria-describedby="ct-desc-help" />
          <p id="ct-desc-help" className={errors.description ? 'text-xs text-destructive' : 'text-xs text-muted-foreground'}>
            {errors.description ?? t('descriptionHelp')}
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-3 sm:items-end">
          <div className="grid gap-1.5">
            <Label htmlFor="ct-audience">{t('audience')}</Label>
            <NativeSelect id="ct-audience" value={audience} onChange={(e) => setAudience(e.target.value as 'platform' | 'business')}>
              <option value="platform">{t('audiencePlatform')}</option>
              <option value="business">{t('audienceBusiness')}</option>
            </NativeSelect>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="ct-role">{t('minRole')}</Label>
            <NativeSelect id="ct-role" value={minRole} onChange={(e) => setMinRole(e.target.value as CustomTool['min_role'])} disabled={audience !== 'business'}>
              <option value="viewer">{t('role.viewer')}</option>
              <option value="agent">{t('role.agent')}</option>
              <option value="admin">{t('role.admin')}</option>
              <option value="owner">{t('role.owner')}</option>
            </NativeSelect>
          </div>
          <div className="flex min-h-11 items-center gap-3">
            <Switch id="ct-confirm" checked={needsConfirm} onCheckedChange={setNeedsConfirm} />
            <Label htmlFor="ct-confirm" className="leading-snug">{t('needsConfirm')}</Label>
          </div>
        </div>

        <fieldset className="space-y-3">
          <legend className="text-sm font-medium text-foreground">{t('inputs')}</legend>
          <p className="text-xs text-muted-foreground">{t('inputsHelp')}</p>
          {params.map((p, i) => (
            <div key={i} className="grid gap-2 rounded-xl border border-border p-3 sm:grid-cols-[minmax(0,10rem)_8rem_minmax(0,1fr)_auto_auto] sm:items-center">
              <div className="grid gap-1">
                <Label htmlFor={`ct-p-name-${i}`} className="sr-only sm:not-sr-only sm:text-xs">{t('inputName')}</Label>
                <Input id={`ct-p-name-${i}`} value={p.name} onChange={(e) => setParam(i, { name: e.target.value.toLowerCase() })} placeholder="order_id" maxLength={40} aria-invalid={!!errors[`param-${i}`]} spellCheck={false} />
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`ct-p-type-${i}`} className="sr-only sm:not-sr-only sm:text-xs">{t('inputType')}</Label>
                <NativeSelect id={`ct-p-type-${i}`} value={p.type} onChange={(e) => setParam(i, { type: e.target.value as ParamType })}>
                  <option value="string">{t('type.string')}</option>
                  <option value="number">{t('type.number')}</option>
                  <option value="integer">{t('type.integer')}</option>
                  <option value="boolean">{t('type.boolean')}</option>
                </NativeSelect>
              </div>
              <div className="grid gap-1">
                <Label htmlFor={`ct-p-desc-${i}`} className="sr-only sm:not-sr-only sm:text-xs">{t('inputDescription')}</Label>
                <Input id={`ct-p-desc-${i}`} value={p.description} onChange={(e) => setParam(i, { description: e.target.value })} placeholder={t('inputDescriptionPlaceholder')} maxLength={300} />
              </div>
              <div className="flex min-h-11 items-center gap-2 sm:pt-5">
                <Switch id={`ct-p-req-${i}`} checked={p.required} onCheckedChange={(v) => setParam(i, { required: v })} />
                <Label htmlFor={`ct-p-req-${i}`} className="text-xs">{t('required')}</Label>
              </div>
              <Button type="button" variant="ghost" size="icon" onClick={() => setParams((ps) => ps.filter((_, j) => j !== i))} className="size-11 sm:mt-5" aria-label={t('removeInput', { name: p.name || String(i + 1) })}>
                <X className="size-4" aria-hidden />
              </Button>
              {errors[`param-${i}`] && <p className="text-xs text-destructive sm:col-span-5">{errors[`param-${i}`]}</p>}
            </div>
          ))}
          {errors.params && <p className="text-xs text-destructive">{errors.params}</p>}
          <Button type="button" variant="outline" onClick={() => setParams((ps) => [...ps, emptyParam()])} disabled={params.length >= 20} className="min-h-11">
            <Plus className="mr-1.5 size-4" aria-hidden /> {t('addInput')}
          </Button>
        </fieldset>

        <div className="flex justify-end">
          <Button type="submit" disabled={busy} className="min-h-11">
            <Wrench className="mr-1.5 size-4" aria-hidden /> {t('create')}
          </Button>
        </div>
      </form>

      <ul className="divide-y divide-border rounded-2xl border border-border bg-card" aria-label={t('listLabel')}>
        {tools === null && <li className="p-4 text-sm text-muted-foreground">{t('loading')}</li>}
        {tools?.length === 0 && <li className="p-4 text-sm text-muted-foreground">{t('empty')}</li>}
        {tools?.map((tool) => (
          <li key={tool.id} className="space-y-3 p-4">
            <div className="flex flex-wrap items-start gap-3">
              <Wrench className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-sm font-semibold text-foreground">{tool.name}</p>
                <p className="text-sm text-muted-foreground">{tool.description}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {tool.audience === 'business' ? t('audienceBusinessShort', { role: t(`role.${tool.min_role}`) }) : t('audiencePlatformShort')}
                  {' · '}
                  {tool.requires_confirm ? t('confirmOn') : t('confirmOff')}
                  {' · '}
                  {t('calls', { count: tool.calls })}
                  {tool.last_status !== null && ` · ${t('lastStatus', { status: tool.last_status })}`}
                </p>
                <p className="truncate text-xs text-muted-foreground">{tool.webhook_url}</p>
              </div>
              <div className="flex min-h-11 items-center gap-2">
                <Switch id={`ct-on-${tool.id}`} checked={tool.enabled} onCheckedChange={(v) => void patch(tool, { enabled: v })} />
                <Label htmlFor={`ct-on-${tool.id}`} className="text-sm">{tool.enabled ? t('on') : t('off')}</Label>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 pl-7">
              <Button type="button" variant="outline" className="min-h-11" onClick={() => { setTesting(tool); setTestValues({}); setTestResult(null); }}>
                <Play className="mr-1.5 size-4" aria-hidden /> {t('test')}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => void patch(tool, { rotate_secret: true })}>
                {t('newSecret')}
              </Button>
              <Button type="button" variant="outline" className="min-h-11" onClick={() => setDeleting(tool)}>
                <Trash2 className="mr-1.5 size-4" aria-hidden /> {t('delete')}
              </Button>
            </div>
            {testing?.id === tool.id && (
              <div className="space-y-3 rounded-xl border border-border p-3 pl-4 sm:ml-7">
                <p className="text-sm font-medium text-foreground">{t('testTitle')}</p>
                {tool.params.length === 0 && <p className="text-xs text-muted-foreground">{t('noInputs')}</p>}
                {tool.params.map((p) => (
                  <div key={p.name} className="grid gap-1.5">
                    <Label htmlFor={`ct-t-${tool.id}-${p.name}`}>
                      {p.name} {p.required && <span className="text-muted-foreground">({t('required')})</span>}
                    </Label>
                    {p.type === 'boolean' ? (
                      <NativeSelect id={`ct-t-${tool.id}-${p.name}`} value={testValues[p.name] ?? ''} onChange={(e) => setTestValues((v) => ({ ...v, [p.name]: e.target.value }))}>
                        <option value="">{t('notSet')}</option>
                        <option value="true">true</option>
                        <option value="false">false</option>
                      </NativeSelect>
                    ) : (
                      <Input id={`ct-t-${tool.id}-${p.name}`} inputMode={p.type === 'string' ? 'text' : 'decimal'} value={testValues[p.name] ?? ''} onChange={(e) => setTestValues((v) => ({ ...v, [p.name]: e.target.value }))} placeholder={p.description} />
                    )}
                  </div>
                ))}
                <div className="flex flex-wrap gap-2">
                  <Button type="button" onClick={runTest} disabled={busy} className="min-h-11">
                    <Play className="mr-1.5 size-4" aria-hidden /> {t('runTest')}
                  </Button>
                  <Button type="button" variant="ghost" onClick={() => setTesting(null)} className="min-h-11">
                    {t('close')}
                  </Button>
                </div>
                {testResult !== null && (
                  <pre aria-live="polite" className="max-h-64 overflow-auto rounded-lg border border-border bg-muted/40 p-3 text-xs text-foreground">{testResult}</pre>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>

      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t('deleteTitle')}
        description={t('deleteDesc', { name: deleting?.name ?? '' })}
        confirmLabel={t('delete')}
        cancelLabel={t('cancel')}
        onConfirm={remove}
      />
    </div>
  );
}
