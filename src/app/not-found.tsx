import { getTranslations } from "next-intl/server";

import { ShiftyLost } from "@/components/shifty/shifty-lost";

export default async function NotFound() {
  const t = await getTranslations("NotFound");
  return (
    <main id="main-content" className="flex min-h-screen flex-col items-center justify-center bg-background px-4 py-16 text-center">
      <ShiftyLost line={t("shifty")} />
      <h1 className="mt-6 text-6xl font-extrabold tracking-tight text-primary">404</h1>
      <p className="mt-2 text-lg font-semibold text-foreground">{t("title")}</p>
      <p className="mt-1 max-w-md text-muted-foreground">{t("desc")}</p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <a href="/dashboard" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-semibold text-primary-foreground hover:opacity-90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t("dashboard")}</a>
        <a href="/" className="inline-flex min-h-11 items-center rounded-full border border-border px-5 font-semibold text-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">{t("home")}</a>
      </div>
    </main>
  );
}
