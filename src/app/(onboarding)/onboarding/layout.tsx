import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AuthProvider } from "@/hooks/use-auth";

// First-run setup after sign-up: full-screen, outside the app shell.
export const metadata: Metadata = {
  title: "Set up your workspace",
  robots: { index: false, follow: false, nocache: true },
};

export default function OnboardingLayout({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
