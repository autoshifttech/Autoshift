import { ViewTransition, type ReactNode } from "react";

/**
 * Page-to-page transition for in-app navigation (View Transitions API via
 * React's <ViewTransition>): the old page settles back and fades while the
 * new one rises into place. Only the wrapped content takes part, so the
 * sidebar and header stay perfectly still, like moving between screens of
 * one app. Browsers without view transitions simply switch pages.
 * Styles: "Page transitions" in globals.css.
 */
export function RouteTransition({ children }: { children: ReactNode }) {
  return <ViewTransition default="page">{children}</ViewTransition>;
}
