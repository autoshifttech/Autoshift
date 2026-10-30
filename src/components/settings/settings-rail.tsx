'use client';

import { Fragment, useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { NativeSelect } from '@/components/ui/native-select';
import {
  RAIL_GROUPS,
  SECTION_META,
  SETTINGS_SECTIONS,
  type SettingsSection,
} from './settings-sections';

/**
 * The settings section tabs — one scrolling row of pills across the top
 * of the page. The active section is the dark pill and auto-scrolls into
 * view so a deep-linked section is never off-screen.
 */
export function SettingsRail({
  active,
  onSelect,
}: {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
  /** Kept for callers; the tab row has no room for side hints. */
  hints?: Partial<Record<SettingsSection, ReactNode>>;
}) {
  const t = useTranslations('Settings');
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <>
      {/* Phones: one grouped picker instead of fifteen tabs. */}
      <div className="sm:hidden">
        <NativeSelect
          aria-label={t('sectionsNav')}
          value={active}
          onChange={(e) => onSelect(e.target.value as SettingsSection)}
          className="w-full"
        >
          {RAIL_GROUPS.map(({ group }) => (
            <optgroup key={group} label={group === 'top' ? t('sections.overview') : t(`groups.${group}`)}>
              {SETTINGS_SECTIONS.filter((s) => SECTION_META[s].group === group).map((s) => (
                <option key={s} value={s}>
                  {t(`sections.${s}`)}
                </option>
              ))}
            </optgroup>
          ))}
        </NativeSelect>
      </div>
    <nav
      aria-label={t('sectionsNav')}
      className="settings-tabs hidden sm:flex items-center gap-1 overflow-x-auto px-5 py-1 [mask-image:linear-gradient(90deg,transparent,#000_20px,#000_calc(100%-20px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SETTINGS_SECTIONS.map((s, i) => {
        const isActive = s === active;
        const startsGroup =
          i > 0 && SECTION_META[s].group !== SECTION_META[SETTINGS_SECTIONS[i - 1]].group;
        return (
          <Fragment key={s}>
            {startsGroup ? (
              <span aria-hidden className="mx-1 h-5 w-px shrink-0 bg-foreground/15" />
            ) : null}
            <button
              ref={isActive ? activeRef : undefined}
              type="button"
              onClick={() => onSelect(s)}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                'inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 lg:h-10',
                isActive
                  ? 'bg-foreground text-background'
                  : 'text-foreground/80 hover:bg-foreground/[0.07] hover:text-foreground',
              )}
            >
              {t(`sections.${s}`)}
            </button>
          </Fragment>
        );
      })}
    </nav>
    </>
  );
}
