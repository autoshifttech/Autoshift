import type { Metadata } from "next";
import Link from "next/link";
import { ContactLines, LegalPage, type LegalSection } from "@/components/site/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms of service",
  description: "The terms for using AutoShift: accounts, WhatsApp rules, plans, wallet credits, refunds and data.",
};

const sections: LegalSection[] = [
  {
    id: "agreement",
    title: "Agreement",
    body: (
      <p>
        These terms are an agreement between {LEGAL.company} and the business that signs up for {LEGAL.product} (&quot;you&quot;). By creating a workspace or using the service you accept them. If you sign up for a company, you confirm you can bind it.
      </p>
    ),
  },
  {
    id: "service",
    title: "The service",
    body: <p>{LEGAL.product} lets you connect your WhatsApp Business number and use a shared inbox, AI assistants, lead capture, bookings, broadcasts, drip campaigns and automations. We may improve or change features; if we remove something important you pay for, we will tell you in advance.</p>,
  },
  {
    id: "account",
    title: "Your account and team",
    body: (
      <ul>
        <li>Keep your login details safe and give team members only the role they need.</li>
        <li>You are responsible for what your team does in your workspace.</li>
        <li>Tell us straight away if you think your account has been misused.</li>
      </ul>
    ),
  },
  {
    id: "whatsapp-rules",
    title: "WhatsApp rules",
    body: (
      <>
        <p>Your use of WhatsApp through {LEGAL.product} must follow Meta&apos;s WhatsApp Business Terms, Business Policy and Commerce Policy. In particular you must:</p>
        <ul>
          <li>Send marketing only to customers who agreed to get it, and stop when they opt out.</li>
          <li>Not send spam, misleading content, or anything illegal or banned by Meta.</li>
          <li>Keep your business details and display name accurate.</li>
        </ul>
        <p>Meta can limit or ban a number for breaking its rules. We may pause sending, or suspend a workspace, to protect the platform and other businesses, and we will tell you why.</p>
      </>
    ),
  },
  {
    id: "plans",
    title: "Plans, trial and billing",
    body: (
      <ul>
        <li>New workspaces get a free trial. When it ends, choose a plan to keep using AutoShift.</li>
        <li>Plans are billed monthly or yearly in advance through Razorpay, plus GST, and renew automatically until you cancel.</li>
        <li>You can change plan at any time; the difference is charged or credited on your next bill.</li>
        <li>If a payment fails, we retry and may limit the workspace after 7 days.</li>
      </ul>
    ),
  },
  {
    id: "wallet",
    title: "Wallet credits",
    body: (
      <ul>
        <li>Meta charges for some WhatsApp messages, and AI replies have a cost. These are paid from prepaid wallet credits at the prices shown in the app.</li>
        <li>Messages stop sending when your wallet runs out, so keep enough credits or turn on auto-recharge.</li>
        <li>Credits do not expire while your workspace is active and cannot be exchanged for cash, except as described under refunds.</li>
      </ul>
    ),
  },
  {
    id: "refunds",
    title: "Cancellation and refunds",
    body: (
      <ul>
        <li>You can cancel any time from Settings. Your plan stays active until the end of the period you paid for.</li>
        <li>Plan fees are not refunded for partial periods, unless the law requires it or we made a mistake.</li>
        <li>When you delete your workspace, unused wallet credits from top-ups in the last 180 days are refunded to the original payment method, minus payment fees.</li>
      </ul>
    ),
  },
  {
    id: "your-data",
    title: "Your data",
    body: (
      <p>
        You own your data: your contacts, messages and content. You give us permission to process it only to run the service for you, as our <Link href="/privacy">privacy policy</Link> explains. You can export it, and delete it on the <Link href="/data-deletion">data deletion page</Link> or from Settings.
      </p>
    ),
  },
  {
    id: "acceptable-use",
    title: "Acceptable use",
    body: (
      <ul>
        <li>Don&apos;t try to break, overload or get around the security of the service.</li>
        <li>Don&apos;t resell AutoShift or copy it without our written permission.</li>
        <li>Don&apos;t use AI assistants to give medical, legal or financial advice without a qualified person checking it.</li>
      </ul>
    ),
  },
  {
    id: "liability",
    title: "Liability",
    body: <p>We work hard to keep AutoShift available, but we depend on Meta, payment providers and the internet, and we cannot promise it will never fail. To the extent the law allows, our total liability for any claim is limited to the fees you paid us in the 12 months before it, and we are not liable for lost profits or indirect losses.</p>,
  },
  {
    id: "ending",
    title: "Ending the agreement",
    body: <p>You can stop using AutoShift and delete your workspace at any time. We can end these terms or suspend your workspace if you seriously or repeatedly break them, after warning you where we reasonably can.</p>,
  },
  {
    id: "law",
    title: "Law and disputes",
    body: <p>These terms are governed by the laws of India. We will first try to solve any disagreement by talking with you; if that fails, the courts of India have jurisdiction.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: <ContactLines />,
  },
];

export default function TermsPage() {
  return <LegalPage eyebrow="Legal" title="Terms of service" lead={`The rules for using ${LEGAL.product}: your account, WhatsApp, plans, wallet credits and your data.`} sections={sections} />;
}
