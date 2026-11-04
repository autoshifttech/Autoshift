import {
  BellRing,
  FolderOpen,
  KeyRound,
  FileLock2,
  CreditCard,
  LifeBuoy,
  Palette,
  PlugZap,
  Shield,
  ShieldCheck,
  User,
  UsersRound,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

/**
 * Settings information architecture for the redesigned page.
 *
 * The flat tab strip became a grouped left rail with a new Overview
 * landing. The URL query param stays `?tab=` (deep-linkable, and it
 * keeps the existing links in sidebar.tsx / header.tsx working) — we
 * just map the old values onto the new sections.
 */
export const SETTINGS_SECTIONS = [
  'profile',
  'security',
  'appearance',
  'alerts',
  'whatsapp',
  'members',
  'billing',
  'wallet',
  'opt-ins',
  'files',
  'api',
  'support',
  'privacy',
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const DEFAULT_SECTION: SettingsSection = 'profile';

/** Rail grouping. `adminOnly` items are hidden for non-admins. */
export interface SectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  group: 'account' | 'workspace';
}

export const SECTION_META: Record<SettingsSection, SectionMeta> = {
  profile: { id: 'profile', label: 'Your profile', icon: User, group: 'account' },
  security: { id: 'security', label: 'Login & security', icon: Shield, group: 'account' },
  appearance: { id: 'appearance', label: 'Appearance', icon: Palette, group: 'account' },
  alerts: { id: 'alerts', label: 'Email & WhatsApp alerts', icon: BellRing, group: 'account' },
  whatsapp: { id: 'whatsapp', label: 'WhatsApp', icon: PlugZap, group: 'workspace' },
  members: { id: 'members', label: 'Team members', icon: UsersRound, group: 'workspace' },
  billing: { id: 'billing', label: 'Plan & billing', icon: CreditCard, group: 'workspace' },
  wallet: { id: 'wallet', label: 'Wallet', icon: Wallet, group: 'workspace' },
  'opt-ins': { id: 'opt-ins', label: 'Opt-ins & blocklist', icon: ShieldCheck, group: 'workspace' },
  files: { id: 'files', label: 'Files', icon: FolderOpen, group: 'workspace' },
  api: { id: 'api', label: 'API keys', icon: KeyRound, group: 'workspace' },
  support: { id: 'support', label: 'Help & support', icon: LifeBuoy, group: 'workspace' },
  privacy: { id: 'privacy', label: 'Data & privacy', icon: FileLock2, group: 'workspace' },
};

export const RAIL_GROUPS: { label: string | null; group: SectionMeta['group'] }[] = [
  { label: 'Account', group: 'account' },
  { label: 'Workspace', group: 'workspace' },
];

function isSection(value: string | null): value is SettingsSection {
  return !!value && (SETTINGS_SECTIONS as readonly string[]).includes(value);
}

/**
 * Resolve a raw `?tab=` value to a section. Legacy tabs from the old
 * flat layout collapse onto their new home (Tags + Custom fields → the
 * merged "Fields & tags" section). Anything unknown falls back to the
 * Overview landing.
 */
export function resolveSection(raw: string | null): SettingsSection {
  if (isSection(raw)) return raw;
  return DEFAULT_SECTION;
}
