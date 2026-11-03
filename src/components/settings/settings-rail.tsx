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
      className="settings-tabs flex items-center gap-1 overflow-x-auto px-1 py-1 [mask-image:linear-gradient(90deg,#000_calc(100%-24px),transparent)] [scrollbar-width:none] sm:px-5 sm:[mask-image:linear-gradient(90deg,transparent,#000_20px,#000_calc(100%-20px),transparent)] [&::-webkit-scrollbar]:hidden"
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
              'inline-flex h-11 shrink-0 items-center rounded-full px-4 text-sm font-semibold whitespace-nowrap transition-[background-color,color,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95 lg:h-10',
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
