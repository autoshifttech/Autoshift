"use client";

import { Suspense } from "react";
import { LogoMark } from "@/components/brand/logo-mark";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
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
// unless wrapped in Suspense — same pattern as /login.
export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageInner />
    </Suspense>
  );
}

function SignupPageInner() {
  const searchParams = useSearchParams();
  // When the user lands here from `/join/<token>` we carry the invite token so that after
  // Google (or the email code) they land on the accept step instead of the dashboard.
  const inviteToken = searchParams.get("invite");
  const t = useTranslations("SignupPage");

  // New businesses go on to set up their workspace; invited teammates go back to accept the invite.
  const next = inviteToken ? `/join/${encodeURIComponent(inviteToken)}` : "/onboarding";

  return (
    <div className="app-canvas flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <Card className="liquid-glass lg-frost relative w-full max-w-md rounded-3xl border-0 bg-transparent px-2 py-6 ring-0 sm:px-4">
        <CardHeader className="items-center text-center">
          <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10">
            {inviteToken ? (
              <UsersRound className="h-6 w-6 text-primary" />
            ) : (
              <LogoMark className="size-12" />
            )}
          </div>
          <CardTitle className="text-2xl font-extrabold tracking-tight text-foreground">
            {inviteToken ? t("titleJoin") : t("title")}
          </CardTitle>
          <CardDescription className="text-muted-foreground">
            {inviteToken ? t("descJoin") : t("desc")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-4">
            <SignInPanel next={next} />
            <p className="text-center text-xs text-muted-foreground">
              {t.rich("agreeTerms", {
                terms: (chunks) => (
                  <Link href="/terms" className="font-medium text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
                privacy: (chunks) => (
                  <Link href="/privacy" className="font-medium text-primary hover:underline">
                    {chunks}
                  </Link>
                ),
              })}
            </p>
          </div>

          <p className="mt-6 text-center text-sm text-muted-foreground">
            {t("haveAccount")}{" "}
            <Link
              href={
                inviteToken
                  ? `/login?invite=${encodeURIComponent(inviteToken)}`
                  : "/login"
              }
              className="text-primary hover:text-primary/80"
            >
              {t("signIn")}
            </Link>
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
