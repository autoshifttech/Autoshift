import type { Metadata } from "next";
import Link from "next/link";
import { ContactLines, LegalPage, type LegalSection } from "@/components/site/legal-page";
import { LEGAL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy policy",
  description: "How AutoShift collects, uses, shares and protects data, including WhatsApp Business data from Meta.",
};

const sections: LegalSection[] = [
  {
    id: "who-we-are",
    title: "Who we are",
    body: (
      <>
        <p>
          {LEGAL.product} is a software platform run by {LEGAL.company} ({LEGAL.address}). Businesses use it to connect their WhatsApp Business number, answer customers with a shared inbox and AI assistants, send messages, take bookings and capture leads.
        </p>
        <p>
          This policy covers two groups of people: <strong>businesses</strong> that sign up for AutoShift and their team members, and the <strong>customers</strong> of those businesses who chat with them on WhatsApp.
        </p>
      </>
    ),
  },
  {
    id: "roles",
    title: "Our role for each kind of data",
    body: (
      <ul>
        <li>For a business&apos;s account, team and billing details, we decide how the data is used (we are the data fiduciary or controller).</li>
        <li>
          For the messages, contacts and leads a business handles through AutoShift, the <strong>business</strong> decides how they are used, and we process them on its behalf (we are the processor). If you are a customer of a business, contact that business first about your data. We will help them answer you.
        </li>
      </ul>
    ),
  },
  {
    id: "what-we-collect",
    title: "What we collect",
    body: (
      <>
        <p>
          <strong>From businesses and their teams:</strong> name, email, phone number, business name, industry, country and time zone, login details, and billing details such as GSTIN and billing address. Payments are handled by Razorpay; we never see or store full card or UPI details.
        </p>
        <p>
          <strong>From Meta when a business connects WhatsApp</strong> (through Meta&apos;s Embedded Signup): the WhatsApp Business Account ID, phone number ID, display name, phone number, quality rating, messaging limit, message templates and an access token that lets AutoShift send and receive messages for that number.
        </p>
        <p>
          <strong>From customers who message a business:</strong> WhatsApp profile name and number, the messages, photos, files and voice notes sent and received, delivery and read status, answers to lead or booking questions, and whether they opted in or out of marketing.
        </p>
        <p>
          <strong>Automatically:</strong> device and browser type, IP address, pages used and error logs, kept for security and to fix problems.
        </p>
      </>
    ),
  },
  {
    id: "how-we-use",
    title: "How we use it",
    body: (
      <ul>
        <li>To run the service: deliver and store messages, show the inbox, run AI replies, bookings, broadcasts and automations the business sets up.</li>
        <li>To bill: plans, wallet top-ups, and charging the wallet for Meta&apos;s message fees and AI replies.</li>
        <li>To keep accounts safe: sign-in, preventing spam and abuse, and following WhatsApp&apos;s Business and Commerce policies.</li>
        <li>To support businesses when they ask us for help.</li>
        <li>To improve AutoShift using aggregated, de-identified usage.</li>
      </ul>
    ),
  },
  {
    id: "whatsapp",
    title: "WhatsApp and Meta data",
    body: (
      <>
        <p>We use data received from Meta&apos;s platform only to provide the features the business turned on, and as allowed by Meta&apos;s Platform Terms and the WhatsApp Business policies. In particular:</p>
        <ul>
          <li>We do not sell WhatsApp or Meta data, or use it for advertising.</li>
          <li>We do not use customers&apos; messages to train AI models. AI replies are generated from the business&apos;s own instructions and knowledge.</li>
          <li>Marketing messages are sent only to customers the business has recorded as opted in. Replies such as STOP opt the customer out automatically.</li>
          <li>When a business disconnects WhatsApp or deletes its workspace, we stop using its token and delete its WhatsApp data as described below.</li>
        </ul>
      </>
    ),
  },
  {
    id: "sharing",
    title: "Who we share it with",
    body: (
      <>
        <p>Only with service providers that help us run AutoShift, under contracts that limit their use of the data:</p>
        <ul>
          <li>Meta Platforms (WhatsApp Business Platform) to send and receive messages.</li>
          <li>Supabase for our database, file storage and sign-in.</li>
          <li>Vercel for hosting the app.</li>
          <li>Razorpay for payments and subscriptions.</li>
          <li>Our AI provider to generate assistant replies, without using the data to train its models.</li>
          <li>Email and SMS providers for sign-in codes and account emails.</li>
        </ul>
        <p>We may also share data if the law requires it, to protect people from harm, or as part of a merger, with the same protections in place.</p>
      </>
    ),
  },
  {
    id: "retention",
    title: "How long we keep it",
    body: (
      <ul>
        <li>Messages, contacts and leads: for as long as the business keeps its workspace, or until it deletes them.</li>
        <li>After a workspace is deleted: everything is erased within {LEGAL.deletionGraceDays} days, except invoices and payment records we must keep for tax law (usually 8 years in India).</li>
        <li>Backups roll over and are erased within a further 30 days.</li>
        <li>Security logs: up to 180 days.</li>
      </ul>
    ),
  },
  {
    id: "rights",
    title: "Your rights and choices",
    body: (
      <>
        <p>You can ask to see, correct or delete your personal data, and withdraw consent at any time. Under India&apos;s Digital Personal Data Protection Act, 2023 you can also name someone to act for you and complain to the Data Protection Board of India.</p>
        <ul>
          <li>Businesses can export or delete their data from Settings → Data &amp; privacy in the app.</li>
          <li>Customers of a business can reply STOP to stop marketing, and ask the business or us to delete their data.</li>
          <li>
            Anyone can request deletion on our <Link href="/data-deletion">data deletion page</Link>. We reply within 30 days.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: "security",
    title: "How we protect it",
    body: <p>Data is encrypted in transit and at rest. Access tokens from Meta are stored encrypted and only used by our servers. Team access is limited by role, every admin action is logged, and we review access regularly. No system is perfectly secure; if a breach affects you, we will tell you and the authorities as the law requires.</p>,
  },
  {
    id: "children",
    title: "Children",
    body: <p>AutoShift is for businesses and is not meant for anyone under 18. We do not knowingly collect children&apos;s data for our own purposes.</p>,
  },
  {
    id: "changes",
    title: "Changes to this policy",
    body: <p>If we change this policy in a way that matters, we will tell businesses by email or in the app before it takes effect. The date at the top shows the latest version.</p>,
  },
  {
    id: "contact",
    title: "Contact",
    body: (
      <>
        <p>For privacy questions or requests, contact our Grievance Officer:</p>
        <ContactLines />
      </>
    ),
  },
];

export default function PrivacyPage() {
  return <LegalPage eyebrow="Legal" title="Privacy policy" lead={`How ${LEGAL.product} handles data for businesses and the customers they chat with on WhatsApp.`} sections={sections} />;
}
