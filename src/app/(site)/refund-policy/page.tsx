import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/legal-page";
import { getBusinessDetails } from "@/lib/legal-details";

export const metadata: Metadata = {
  title: "Refund and cancellation policy",
  description: "How cancellations and refunds work for AutoShift plans and wallet top-ups.",
};
export const revalidate = 300;

export default async function Page() {
  const d = await getBusinessDetails();
  const sections: LegalSection[] = [
    {
      id: "cancel",
      title: "Cancelling a plan",
      body: (
        <ul>
          <li>You can cancel your plan at any time in Settings → Billing. It stays active until the end of the period you paid for and does not renew.</li>
          <li>The free trial can be ended at any time and is never charged.</li>
        </ul>
      ),
    },
    {
      id: "plan-refunds",
      title: "Plan fees",
      body: (
        <ul>
          <li>Plan fees are not refunded for a part of a period, unless the law requires it or we charged you by mistake.</li>
          <li>If you were charged twice, or charged after you cancelled, we refund the extra charge in full.</li>
        </ul>
      ),
    },
    {
      id: "wallet",
      title: "Wallet top-ups",
      body: (
        <ul>
          <li>Wallet credits pay for WhatsApp messages and AI replies. Credits already used are not refundable.</li>
          <li>When you close your workspace, unused credits from top-ups in the last 180 days are refunded to the original payment method, minus payment-gateway fees.</li>
        </ul>
      ),
    },
    {
      id: "how",
      title: "How to ask for a refund",
      body: <p>Email <a href={`mailto:${d.email}`}>{d.email}</a> from your account email with your invoice number, or raise a ticket in Settings → Support. We reply within 2 working days.</p>,
    },
    {
      id: "timeline",
      title: "When you get the money",
      body: <p>Approved refunds are sent through Razorpay to the original payment method within {d.refundDays} working days. Your bank may take a few more days to show it.</p>,
    },
    {
      id: "more",
      title: "More",
      body: <p>These rules are part of our <Link href="/terms">terms of service</Link>. Questions? <Link href="/contact">Contact us</Link>.</p>,
    },
  ];
  return <LegalPage eyebrow="Billing" title="Refund and cancellation policy" lead={`How cancellations and refunds work at ${d.company}.`} sections={sections} />;
}
