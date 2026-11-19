"use client";

import { Suspense, useEffect, useRef } from "react";
import { ShiftyFigure, type ShiftyApi } from "@/components/shifty/shifty";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { SignInPanel } from "@/components/auth/sign-in-panel";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { UsersRound } from "lucide-react";

// `useSearchParams` opts the component out of static prerendering
// unless it sits under a Suspense boundary. We split the form into
// a child component so the outer page can prerender the chrome
// (background, card frame) while the form hydrates with the query
// string on the client.
export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageInner />
    </Suspense>
  );
}

function LoginPageInner() {
  const searchParams = useSearchParams();
  // Forwarded from `/join/<token>` when the visitor already has an
  // account. After a successful sign-in we send them to the join
  // page to accept rather than to /dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("LoginPage");
  // Set by /auth/callback when an emailed link (confirmation, password
  // reset) could not be turned into a session — see src/lib/auth/callback.ts.
  const linkError = searchParams.get("error");
  const linkErrorMessage =
    linkError === "link_expired"
      ? t("linkExpired")
      : linkError === "link_invalid"
        ? t("linkInvalid")
        : null;

  // Shifty waves hello and shakes his head when a sign-in link didn't work.
  const shifty = useRef<ShiftyApi | null>(null);
  useEffect(() => { if (linkErrorMessage) void shifty.current?.shake(); }, [linkErrorMessage]);
  // Where a signed-in person goes: the invite they were accepting, else the dashboard.
  const next = inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : "/dashboard";

  return (
    <div className="app-canvas flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="liquid-glass lg-frost relative w-full max-w-md rounded-3xl border-0 bg-transparent px-2 py-6 ring-0 sm:px-4">
        <CardHeader className="items-center text-center">
          {inviteToken ? (
            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
              <UsersRound className="h-6 w-6 text-primary" />
            </div>
          ) : (
            <div className="mx-auto mb-1 w-20" aria-hidden>
              <ShiftyFigure level="calm" onReady={(a) => { shifty.current = a; void a.wave(); }} />
            </div>
          )}
          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground">
            {inviteToken ? t('titleAccept') : t('titleWelcome')}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken
              ? t('descAccept')
              : t('descWelcome')}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            {linkErrorMessage && (
              <div role="alert" className="rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                {linkErrorMessage}
              </div>
            )}
            <SignInPanel next={next} />
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t('noAccount')}{" "}
            <Link
              href={
                inviteToken
                  ? `/signup?invite=${encodeURIComponent(inviteToken)}`
                  : "/signup"
              }
              className="text-primary hover:text-primary/80"
            >
              {t('createAccount')}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
