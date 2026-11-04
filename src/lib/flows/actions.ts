import type { ConnectionKind } from "@/lib/flows/connections";

/**
 * The "Use a connection" step: one step type, three services. Each service
 * needs one connected account of the right kind and a few fields. Fields can
 * hold {{vars.name}} placeholders filled in from earlier answers.
 */
export type ActionService = "google_sheets_append" | "google_calendar_event" | "razorpay_link";

export interface ActionField {
  key: string;
  /** A longer box for multi-line values. */
  multiline?: boolean;
  /** Shown as the field's example text. */
  placeholder: string;
}

export const ACTION_SERVICES: Record<ActionService, { kind: ConnectionKind; fields: ActionField[]; /** Saves a link into a variable. */ savesLink: boolean }> = {
  google_sheets_append: {
    kind: "google",
    savesLink: false,
    fields: [
      { key: "spreadsheet", placeholder: "1AbCdEf…" },
      { key: "sheet", placeholder: "Sheet1" },
      { key: "values", multiline: true, placeholder: "{{contact.name}}\n{{contact.phone}}\n{{vars.budget}}" },
    ],
  },
  google_calendar_event: {
    kind: "google",
    savesLink: true,
    fields: [
      { key: "calendar", placeholder: "name@gmail.com" },
      { key: "title", placeholder: "{{contact.name}}" },
      { key: "start", placeholder: "{{vars.visit_time}}" },
      { key: "minutes", placeholder: "30" },
    ],
  },
  razorpay_link: {
    kind: "razorpay",
    savesLink: true,
    fields: [
      { key: "amount", placeholder: "1500" },
      { key: "description", placeholder: "" },
    ],
  },
};

export const ACTION_SERVICE_IDS = Object.keys(ACTION_SERVICES) as ActionService[];

export function isActionService(v: unknown): v is ActionService {
  return typeof v === "string" && v in ACTION_SERVICES;
}
