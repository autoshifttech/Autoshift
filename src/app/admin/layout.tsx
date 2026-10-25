import type { Metadata } from "next";

// The platform admin panel is private: never index it.
export const metadata: Metadata = {
  title: "AutoShift Admin",
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false } },
};

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
