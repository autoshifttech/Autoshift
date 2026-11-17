import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/legal-page";
import { getBusinessDetails } from "@/lib/legal-details";

export const metadata: Metadata = {
  title: "Shipping and delivery policy",
  description: "AutoShift is an online service: how and when you get access after paying.",
};
export const revalidate = 300;

export default async function Page() {
  const d = await getBusinessDetails();
  const sections: LegalSection[] = [
    {
      id: "digital",
      title: "An online service, nothing to ship",
      body: <p>{d.company} sells online software (AutoShift). There are no physical goods, so nothing is shipped and there are no delivery charges.</p>,
    },
    {
      id: "access",
      title: "When you get access",
      body: (
        <ul>
          <li>Plans start as soon as the payment is confirmed, usually within a minute.</li>
          <li>Wallet top-ups are added to your balance as soon as Razorpay confirms the payment.</li>
          <li>An invoice is emailed to you and is always available in Settings → Billing.</li>
        </ul>
      ),
    },
    {
      id: "delays",
      title: "If something doesn't arrive",
      body: <p>If your plan or credits don&apos;t show within 30 minutes of a successful payment, email <a href={`mailto:${d.email}`}>{d.email}</a> with the payment ID and we&apos;ll fix it the same working day.</p>,
    },
    {
      id: "merchants",
      title: "Businesses selling on AutoShift",
      body: <p>Shops that take orders through AutoShift ship their own products and set their own delivery terms. Please contact the shop directly about an order. See also our <Link href="/refund-policy">refund policy</Link> and <Link href="/contact">contact page</Link>.</p>,
    },
  ];
  return <LegalPage eyebrow="Delivery" title="Shipping and delivery policy" lead="How and when you get access to AutoShift after you pay." sections={sections} />;
}
