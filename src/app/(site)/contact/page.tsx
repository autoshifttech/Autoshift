import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, type LegalSection } from "@/components/site/legal-page";
import { getBusinessDetails } from "@/lib/legal-details";
import { waLink } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Contact us",
  description: "How to reach AutoShift: support email, WhatsApp, address and hours.",
};
// The details are edited in the admin panel, so refresh them every few minutes.
export const revalidate = 300;

export default async function Page() {
  const d = await getBusinessDetails();
  const sections: LegalSection[] = [
    {
      id: "support",
      title: "Customer support",
      body: (
        <ul>
          <li>Email: <a href={`mailto:${d.email}`}>{d.email}</a></li>
          <li>WhatsApp / phone: <a href={waLink(d.whatsapp)}>{d.whatsapp}</a></li>
          <li>Hours: {d.supportHours}</li>
          <li>Signed in? Open <Link href="/settings?section=support">Settings → Support</Link> to raise a ticket; we reply there and by email.</li>
        </ul>
      ),
    },
    {
      id: "business",
      title: "Business details",
      body: (
        <ul>
          <li>{d.company}</li>
          <li>{d.address}</li>
          {d.gstin ? <li>GSTIN: {d.gstin}</li> : null}
        </ul>
      ),
    },
    {
      id: "grievance",
      title: "Grievances",
      body: <p>For complaints about our service or your personal data, write to the {d.grievanceOfficer} at <a href={`mailto:${d.email}`}>{d.email}</a>. We acknowledge within 48 hours and resolve within 30 days.</p>,
    },
    {
      id: "billing",
      title: "Payments and refunds",
      body: <p>Questions about a payment, invoice or refund? See our <Link href="/refund-policy">refund and cancellation policy</Link>, or email us with your invoice number.</p>,
    },
  ];
  return <LegalPage eyebrow="Contact" title="Contact us" lead="We're happy to help with your account, WhatsApp connection, billing or anything else." sections={sections} />;
}
