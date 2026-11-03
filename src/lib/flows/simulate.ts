/**
 * A tiny in-browser walk through a flow, for the editor's "Test" chat. It
 * never sends anything: steps that talk to the customer become chat bubbles,
 * steps that wait (buttons, lists, questions) pause for a tap or a typed reply,
 * and steps that need the live backend (tags, connected accounts, hand-off)
 * show a short note instead.
 */

export interface SimNode {
  node_key: string;
  node_type: string;
  config: Record<string, unknown>;
}

export interface SimChoice {
  id: string;
  title: string;
  description?: string;
}

export type SimMessage =
  | { kind: "bot"; text: string; footer?: string; media?: string; choices?: SimChoice[]; listLabel?: string }
  | { kind: "user"; text: string }
  | { kind: "note"; code: "tag" | "action" | "handoff" | "end" | "stuck" | "loop" | "noEntry"; arg?: string };

export type SimWait =
  | { type: "choice"; nodeKey: string; choices: SimChoice[]; nexts: Record<string, string> }
  | { type: "input"; nodeKey: string }
  | null;

export interface SimState {
  messages: SimMessage[];
  wait: SimWait;
  vars: Record<string, string>;
  finished: boolean;
}

const SAMPLE_CONTACT: Record<string, string> = { name: "Rahul", phone: "+91 98765 43210", email: "rahul@example.com", company: "Acme" };

const str = (v: unknown): string => (typeof v === "string" ? v : "");

/** Fills {{vars.x}} and {{contact.x}} placeholders with what the test knows. */
export function fill(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{\s*(vars|contact)\.(\w+)\s*\}\}/g, (_m, scope: string, key: string) =>
    scope === "vars" ? (vars[key] ?? `{{vars.${key}}}`) : (SAMPLE_CONTACT[key] ?? ""),
  );
}

function evaluate(cfg: Record<string, unknown>, vars: Record<string, string>): boolean {
  const subject = str(cfg.subject);
  const key = str(cfg.subject_key);
  const operator = str(cfg.operator);
  const value = str(cfg.value);
  const actual = subject === "var" ? (vars[key] ?? "") : subject === "contact_field" ? (SAMPLE_CONTACT[key] ?? "") : "";
  switch (operator) {
    case "equals":
      return actual.trim().toLowerCase() === value.trim().toLowerCase();
    case "contains":
      return actual.toLowerCase().includes(value.toLowerCase());
    case "present":
      return actual.trim() !== "";
    case "absent":
      return actual.trim() === "";
    default:
      return false;
  }
}

const MAX_STEPS = 60;

/** Runs from `startKey` until the flow needs the customer, ends, or loops. */
export function run(nodes: SimNode[], startKey: string | null, prior: SimState): SimState {
  const byKey = new Map(nodes.map((n) => [n.node_key, n]));
  const messages = [...prior.messages];
  const vars = { ...prior.vars };
  let key = startKey;
  let steps = 0;
  const done = (wait: SimWait, finished: boolean): SimState => ({ messages, wait, vars, finished });

  while (key) {
    if (++steps > MAX_STEPS) {
      messages.push({ kind: "note", code: "loop" });
      return done(null, true);
    }
    const node = byKey.get(key);
    if (!node) {
      messages.push({ kind: "note", code: "stuck", arg: key });
      return done(null, true);
    }
    const cfg = node.config;
    const next = str(cfg.next_node_key) || null;
    switch (node.node_type) {
      case "start":
        key = next;
        break;
      case "send_message":
        messages.push({ kind: "bot", text: fill(str(cfg.text), vars) });
        key = next;
        break;
      case "send_media":
        messages.push({ kind: "bot", text: fill(str(cfg.caption), vars), media: str(cfg.media_type) || "image" });
        key = next;
        break;
      case "send_buttons": {
        const buttons = (Array.isArray(cfg.buttons) ? cfg.buttons : []) as Array<Record<string, unknown>>;
        const choices = buttons.map((b) => ({ id: str(b.reply_id), title: str(b.title) }));
        const nexts = Object.fromEntries(buttons.map((b) => [str(b.reply_id), str(b.next_node_key)]));
        messages.push({ kind: "bot", text: fill(str(cfg.text), vars), footer: str(cfg.footer_text) || undefined, choices });
        return done({ type: "choice", nodeKey: node.node_key, choices, nexts }, false);
      }
      case "send_list": {
        const sections = (Array.isArray(cfg.sections) ? cfg.sections : []) as Array<Record<string, unknown>>;
        const rows = sections.flatMap((s) => (Array.isArray(s.rows) ? (s.rows as Array<Record<string, unknown>>) : []));
        const choices = rows.map((r) => ({ id: str(r.reply_id), title: str(r.title), description: str(r.description) || undefined }));
        const nexts = Object.fromEntries(rows.map((r) => [str(r.reply_id), str(r.next_node_key)]));
        messages.push({ kind: "bot", text: fill(str(cfg.text), vars), footer: str(cfg.footer_text) || undefined, choices, listLabel: str(cfg.button_label) || "Options" });
        return done({ type: "choice", nodeKey: node.node_key, choices, nexts }, false);
      }
      case "collect_input":
        messages.push({ kind: "bot", text: fill(str(cfg.prompt_text), vars) });
        return done({ type: "input", nodeKey: node.node_key }, false);
      case "condition":
        key = evaluate(cfg, vars) ? str(cfg.true_next) || null : str(cfg.false_next) || null;
        break;
      case "set_tag":
        messages.push({ kind: "note", code: "tag", arg: str(cfg.mode) });
        key = next;
        break;
      case "action":
        messages.push({ kind: "note", code: "action", arg: str(cfg.service) });
        key = next;
        break;
      case "handoff":
        messages.push({ kind: "note", code: "handoff", arg: str(cfg.note) || undefined });
        return done(null, true);
      case "end":
        messages.push({ kind: "note", code: "end" });
        return done(null, true);
      default:
        key = next;
    }
  }
  messages.push({ kind: "note", code: "end" });
  return done(null, true);
}

export function begin(nodes: SimNode[], entryKey: string | null): SimState {
  const empty: SimState = { messages: [], wait: null, vars: {}, finished: false };
  if (!entryKey || !nodes.some((n) => n.node_key === entryKey)) {
    return { ...empty, messages: [{ kind: "note", code: "noEntry" }], finished: true };
  }
  return run(nodes, entryKey, empty);
}

/** The customer taps a button / list row. */
export function choose(nodes: SimNode[], state: SimState, choiceId: string): SimState {
  if (state.wait?.type !== "choice") return state;
  const picked = state.wait.choices.find((c) => c.id === choiceId);
  if (!picked) return state;
  const messages: SimMessage[] = [...state.messages, { kind: "user", text: picked.title }];
  return run(nodes, state.wait.nexts[choiceId] || null, { ...state, messages, wait: null });
}

/** The customer types an answer to a question step. */
export function reply(nodes: SimNode[], state: SimState, text: string): SimState {
  if (state.wait?.type !== "input") return state;
  const node = nodes.find((n) => n.node_key === (state.wait as { nodeKey: string }).nodeKey);
  const cfg = node?.config ?? {};
  const varKey = str(cfg.var_key);
  const vars = varKey ? { ...state.vars, [varKey]: text } : state.vars;
  const messages: SimMessage[] = [...state.messages, { kind: "user", text }];
  return run(nodes, str(cfg.next_node_key) || null, { ...state, messages, vars, wait: null });
}
