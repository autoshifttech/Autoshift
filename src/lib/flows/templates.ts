/**
 * Starter flow templates.
 *
 * Three pre-canned flows users can clone with one click instead of
 * building from scratch. Each template is a plain JS object describing
 * the same shape `/api/flows` PUT accepts — name, trigger config,
 * entry_node_id, fallback_policy, nodes[] — keyed by a stable
 * `slug`.
 *
 * The clone path (`/api/flows` POST with `template_slug`) creates a
 * NEW flow_row + flow_nodes rows for the user. `node_key`s are kept
 * verbatim (they're stable strings, not UUIDs, so cloning never
 * needs to rewrite edge references).
 *
 * Choosing a single static module over a DB-backed gallery for v1
 * because: (a) the set is small and changes with code releases, not
 * data; (b) keeps templates portable across self-hosted instances
 * without migrations; (c) editing in source is the lowest-friction
 * way to add the next template.
 */

import type {
  ActionNodeConfig,
  CollectInputNodeConfig,
  ConditionNodeConfig,
  HandoffNodeConfig,
  KeywordTriggerConfig,
  SendButtonsNodeConfig,
  SendListNodeConfig,
  SendMessageNodeConfig,
  StartNodeConfig,
} from "./types";
import { getT } from "@/lib/i18n/translate";

export type FlowTemplateNodeType =
  | "start"
  | "send_message"
  | "send_buttons"
  | "send_list"
  | "collect_input"
  | "condition"
  | "set_tag"
  | "action"
  | "handoff"
  | "end";

export interface FlowTemplateNode {
  node_key: string;
  node_type: FlowTemplateNodeType;
  config:
    | StartNodeConfig
    | SendMessageNodeConfig
    | SendButtonsNodeConfig
    | SendListNodeConfig
    | CollectInputNodeConfig
    | ConditionNodeConfig
    | HandoffNodeConfig
    | ActionNodeConfig
    | Record<string, unknown>;
}

export interface FlowTemplate {
  slug: string;
  name: string;
  description: string;
  /** Used by the gallery to surface a relevant icon. lucide-react name. */
  icon: "MessageSquare" | "HelpCircle" | "UserPlus" | "ShoppingBag" | "CalendarCheck";
  trigger_type: "keyword" | "first_inbound_message" | "manual";
  trigger_config: KeywordTriggerConfig | Record<string, unknown>;
  entry_node_id: string;
  nodes: FlowTemplateNode[];
}

const t = getT("StarterFlows");

/** Comma-separated keyword list from the catalogue → trimmed array. */
function keywords(key: string): string[] {
  return t(key)
    .split(",")
    .map((k) => k.trim())
    .filter(Boolean);
}

// ============================================================
// 1. Welcome menu — the example from the owner's brief
// ============================================================
const WELCOME_MENU: FlowTemplate = {
  slug: "welcome_menu",
  name: t("welcome_menu.name"),
  description: t("welcome_menu.description"),
  icon: "MessageSquare",
  trigger_type: "keyword",
  trigger_config: { keywords: keywords("welcome_menu.keywords"), match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "welcome" },
    },
    {
      node_key: "welcome",
      node_type: "send_buttons",
      config: {
        text: t("welcome_menu.text"),
        footer_text: t("welcome_menu.footer"),
        buttons: [
          {
            reply_id: "existing",
            title: t("welcome_menu.existingButton"),
            next_node_key: "existing_handoff",
          },
          {
            reply_id: "new",
            title: t("welcome_menu.newButton"),
            next_node_key: "new_handoff",
          },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "existing_handoff",
      node_type: "handoff",
      config: {
        note: t("welcome_menu.existingNote"),
      } as HandoffNodeConfig,
    },
    {
      node_key: "new_handoff",
      node_type: "handoff",
      config: {
        note: t("welcome_menu.newNote"),
      } as HandoffNodeConfig,
    },
  ],
};

// ============================================================
// 2. FAQ bot — list-message answers, fully automated
// ============================================================
const FAQ_BOT: FlowTemplate = {
  slug: "faq_bot",
  name: t("faq_bot.name"),
  description: t("faq_bot.description"),
  icon: "HelpCircle",
  trigger_type: "keyword",
  trigger_config: {
    keywords: keywords("faq_bot.keywords"),
    match_type: "contains",
  },
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "topics" },
    },
    {
      node_key: "topics",
      node_type: "send_list",
      config: {
        text: t("faq_bot.text"),
        button_label: t("faq_bot.buttonLabel"),
        sections: [
          {
            title: t("faq_bot.commonSection"),
            rows: [
              {
                reply_id: "hours",
                title: t("faq_bot.hoursRow"),
                next_node_key: "answer_hours",
              },
              {
                reply_id: "pricing",
                title: t("faq_bot.pricingRow"),
                next_node_key: "answer_pricing",
              },
              {
                reply_id: "refunds",
                title: t("faq_bot.refundsRow"),
                next_node_key: "answer_refunds",
              },
            ],
          },
          {
            title: t("faq_bot.otherSection"),
            rows: [
              {
                reply_id: "human",
                title: t("faq_bot.humanRow"),
                next_node_key: "human_handoff",
              },
            ],
          },
        ],
      } as SendListNodeConfig,
    },
    {
      node_key: "answer_hours",
      node_type: "send_message",
      config: {
        text: t("faq_bot.hoursAnswer"),
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_pricing",
      node_type: "send_message",
      config: {
        text: t("faq_bot.pricingAnswer"),
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "answer_refunds",
      node_type: "send_message",
      config: {
        text: t("faq_bot.refundsAnswer"),
        next_node_key: "end",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "human_handoff",
      node_type: "handoff",
      config: {
        note: t("faq_bot.humanNote"),
      } as HandoffNodeConfig,
    },
    {
      node_key: "end",
      node_type: "end",
      config: {},
    },
  ],
};

// ============================================================
// 3. Lead capture — collect_input chain, ends in a handoff
// ============================================================
const LEAD_CAPTURE: FlowTemplate = {
  slug: "lead_capture",
  name: t("lead_capture.name"),
  description: t("lead_capture.description"),
  icon: "UserPlus",
  trigger_type: "first_inbound_message",
  trigger_config: {},
  entry_node_id: "start",
  nodes: [
    {
      node_key: "start",
      node_type: "start",
      config: { next_node_key: "intro" },
    },
    {
      node_key: "intro",
      node_type: "send_message",
      config: {
        text: t("lead_capture.intro"),
        next_node_key: "ask_name",
      } as SendMessageNodeConfig,
    },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: {
        prompt_text: t("lead_capture.askName"),
        var_key: "name",
        next_node_key: "ask_email",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_email",
      node_type: "collect_input",
      config: {
        prompt_text: t("lead_capture.askEmail", { name: "{{vars.name}}" }),
        var_key: "email",
        next_node_key: "ask_company",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_company",
      node_type: "collect_input",
      config: {
        prompt_text: t("lead_capture.askCompany"),
        var_key: "company",
        next_node_key: "handoff",
      } as CollectInputNodeConfig,
    },
    {
      node_key: "handoff",
      node_type: "handoff",
      config: {
        note: t("lead_capture.handoffNote", {
          name: "{{vars.name}}",
          email: "{{vars.email}}",
          company: "{{vars.company}}",
        }),
      } as HandoffNodeConfig,
    },
  ],
};


// ============================================================
// 4. Order with payment — collect an order, send a payment link
// ============================================================
const ORDER_PAYMENT: FlowTemplate = {
  slug: "order_payment",
  name: t("order_payment.name"),
  description: t("order_payment.description"),
  icon: "ShoppingBag",
  trigger_type: "keyword",
  trigger_config: { keywords: keywords("order_payment.keywords"), match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "ask_item" } },
    {
      node_key: "ask_item",
      node_type: "collect_input",
      config: { prompt_text: t("order_payment.askItem"), var_key: "item", next_node_key: "ask_address" } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_address",
      node_type: "collect_input",
      config: { prompt_text: t("order_payment.askAddress"), var_key: "address", next_node_key: "confirm" } as CollectInputNodeConfig,
    },
    {
      node_key: "confirm",
      node_type: "send_buttons",
      config: {
        text: t("order_payment.confirmText", { item: "{{vars.item}}", address: "{{vars.address}}" }),
        buttons: [
          { reply_id: "pay", title: t("order_payment.payButton"), next_node_key: "make_link" },
          { reply_id: "cod", title: t("order_payment.codButton"), next_node_key: "cod_note" },
          { reply_id: "human", title: t("order_payment.humanButton"), next_node_key: "human" },
        ],
      } as SendButtonsNodeConfig,
    },
    {
      node_key: "make_link",
      node_type: "action",
      config: {
        service: "razorpay_link",
        connection_id: "",
        params: { amount: "", description: t("order_payment.linkDescription", { item: "{{vars.item}}" }) },
        save_as: "payment_link",
        next_node_key: "send_link",
      } as ActionNodeConfig,
    },
    {
      node_key: "send_link",
      node_type: "send_message",
      config: { text: t("order_payment.linkMessage", { link: "{{vars.payment_link}}" }), next_node_key: "end" } as SendMessageNodeConfig,
    },
    {
      node_key: "cod_note",
      node_type: "send_message",
      config: { text: t("order_payment.codMessage"), next_node_key: "end" } as SendMessageNodeConfig,
    },
    { node_key: "human", node_type: "handoff", config: { note: t("order_payment.humanNote") } as HandoffNodeConfig },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// 5. Site visit — qualify, log to Sheets, book on Calendar
// ============================================================
const SITE_VISIT: FlowTemplate = {
  slug: "site_visit",
  name: t("site_visit.name"),
  description: t("site_visit.description"),
  icon: "CalendarCheck",
  trigger_type: "keyword",
  trigger_config: { keywords: keywords("site_visit.keywords"), match_type: "contains" },
  entry_node_id: "start",
  nodes: [
    { node_key: "start", node_type: "start", config: { next_node_key: "ask_name" } },
    {
      node_key: "ask_name",
      node_type: "collect_input",
      config: { prompt_text: t("site_visit.askName"), var_key: "name", next_node_key: "ask_budget" } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_budget",
      node_type: "collect_input",
      config: { prompt_text: t("site_visit.askBudget", { name: "{{vars.name}}" }), var_key: "budget", next_node_key: "ask_when" } as CollectInputNodeConfig,
    },
    {
      node_key: "ask_when",
      node_type: "collect_input",
      config: { prompt_text: t("site_visit.askWhen"), var_key: "visit_time", next_node_key: "log_row" } as CollectInputNodeConfig,
    },
    {
      node_key: "log_row",
      node_type: "action",
      config: {
        service: "google_sheets_append",
        connection_id: "",
        params: { spreadsheet: "", sheet: "Leads", values: "{{contact.phone}}\n{{vars.name}}\n{{vars.budget}}\n{{vars.visit_time}}" },
        save_as: "",
        next_node_key: "book",
      } as ActionNodeConfig,
    },
    {
      node_key: "book",
      node_type: "action",
      config: {
        service: "google_calendar_event",
        connection_id: "",
        params: { calendar: "", title: t("site_visit.eventTitle", { name: "{{vars.name}}" }), start: "{{vars.visit_time}}", minutes: "30" },
        save_as: "event_link",
        next_node_key: "thanks",
      } as ActionNodeConfig,
    },
    {
      node_key: "thanks",
      node_type: "send_message",
      config: { text: t("site_visit.thanks", { name: "{{vars.name}}", time: "{{vars.visit_time}}" }), next_node_key: "end" } as SendMessageNodeConfig,
    },
    { node_key: "end", node_type: "end", config: {} },
  ],
};

// ============================================================
// Registry
// ============================================================

const TEMPLATES: Record<string, FlowTemplate> = {
  welcome_menu: WELCOME_MENU,
  faq_bot: FAQ_BOT,
  lead_capture: LEAD_CAPTURE,
  order_payment: ORDER_PAYMENT,
  site_visit: SITE_VISIT,
};

export function getFlowTemplate(slug: string): FlowTemplate | null {
  return TEMPLATES[slug] ?? null;
}

export function listFlowTemplates(): FlowTemplate[] {
  return Object.values(TEMPLATES);
}
