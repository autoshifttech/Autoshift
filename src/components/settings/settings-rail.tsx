'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { SETTINGS_SECTIONS, type SettingsSection } from './settings-sections';

/**
 * The settings sections as one row of rounded pills across the top of the
 * page, on every screen size. The active section is the dark pill and
 * scrolls into view, so a deep-linked section is never off-screen; on a
 * phone the row swipes sideways with a soft fade at both ends.
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
    <nav
      aria-label={t('sectionsNav')}
      className="settings-tabs mx-auto flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full border border-border bg-card/85 p-1 shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_20px_-12px_rgb(0_0_0/0.25)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {SETTINGS_SECTIONS.map((s) => {
        const isActive = s === active;
        return (
          <button
            key={s}
            ref={isActive ? activeRef : undefined}
            type="button"
            onClick={() => onSelect(s)}
            aria-current={isActive ? 'page' : undefined}
            className={cn(
              'inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold sm:px-3.5 sm:text-sm whitespace-nowrap transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95',
              isActive
                ? 'bg-foreground text-background'
                : 'text-foreground/80 hover:bg-foreground/[0.07] hover:text-foreground',
            )}
          >
            {t(`sections.${s}`)}
          </button>
        );
      })}
    </nav>
  );
}
