'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';

import { cn } from '@/lib/utils';
import { useLiquidBulge } from '@/components/motion/liquid-bulge';
import { SETTINGS_SECTIONS, type SettingsSection } from './settings-sections';

/**
 * The settings sections as one glass bar across the top of the page, on
 * every screen size. The black pill marks the active section and slides to
 * the next one like a drop of liquid; the active section scrolls into view, so a
 * deep-linked section is never off-screen; on a phone the bar swipes sideways.
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
  // A glass bar whose black pill is one liquid drop: it slides to the section you pick, stretching
  // on the way (leading edge first), squishes on press, and taps ripple the glass.
  const barRef = useRef<HTMLElement>(null);
  useLiquidBulge(barRef, { item: 'button', current: '[aria-current="page"]', follow: 'current', ripple: true, condense: 'settings' });

  useEffect(() => {
    activeRef.current?.scrollIntoView({
      inline: 'center',
      block: 'nearest',
      behavior: 'smooth',
    });
  }, [active]);

  return (
    <nav
      ref={barRef}
      aria-label={t('sectionsNav')}
      className="settings-tabs liquid-glass lg-floating mx-auto flex w-fit max-w-full items-center gap-0.5 overflow-x-auto rounded-full p-1.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
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
              'inline-flex h-10 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold sm:px-3.5 sm:text-sm whitespace-nowrap transition-[background-color,transform] focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none active:scale-95',
              isActive ? 'settings-tab-on text-background' : 'text-foreground/80 hover:bg-foreground/[0.07] hover:text-foreground',
            )}
          >
            {t(`sections.${s}`)}
          </button>
        );
      })}
    </nav>
  );
}
