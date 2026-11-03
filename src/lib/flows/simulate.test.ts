import { describe, expect, it } from "vitest";
import { begin, choose, fill, reply, type SimNode } from "./simulate";

const nodes: SimNode[] = [
  { node_key: "start", node_type: "start", config: { next_node_key: "menu" } },
  {
    node_key: "menu",
    node_type: "send_buttons",
    config: {
      text: "Hi {{contact.name}}!",
      buttons: [
        { reply_id: "buy", title: "Buy", next_node_key: "ask" },
        { reply_id: "talk", title: "Talk", next_node_key: "human" },
      ],
    },
  },
  { node_key: "ask", node_type: "collect_input", config: { prompt_text: "Budget?", var_key: "budget", next_node_key: "check" } },
  { node_key: "check", node_type: "condition", config: { subject: "var", subject_key: "budget", operator: "present", true_next: "thanks", false_next: "end" } },
  { node_key: "thanks", node_type: "send_message", config: { text: "Noted {{vars.budget}}", next_node_key: "end" } },
  { node_key: "human", node_type: "handoff", config: { note: "" } },
  { node_key: "end", node_type: "end", config: {} },
];

describe("flow simulation", () => {
  it("fills placeholders", () => {
    expect(fill("Hi {{contact.name}} {{vars.x}}", { x: "1" })).toBe("Hi Rahul 1");
  });

  it("pauses on buttons, then walks the chosen branch", () => {
    let s = begin(nodes, "start");
    expect(s.wait?.type).toBe("choice");
    expect(s.messages[0]).toMatchObject({ kind: "bot", text: "Hi Rahul!" });
    s = choose(nodes, s, "buy");
    expect(s.wait?.type).toBe("input");
    s = reply(nodes, s, "50 lakh");
    expect(s.vars.budget).toBe("50 lakh");
    expect(s.messages.some((m) => m.kind === "bot" && m.text === "Noted 50 lakh")).toBe(true);
    expect(s.finished).toBe(true);
  });

  it("hands off to a person", () => {
    const s = choose(nodes, begin(nodes, "start"), "talk");
    expect(s.finished).toBe(true);
    expect(s.messages.at(-1)).toMatchObject({ kind: "note", code: "handoff" });
  });

  it("stops with a note when there is no entry step", () => {
    expect(begin(nodes, null).messages[0]).toMatchObject({ code: "noEntry" });
  });

  it("stops on a loop instead of hanging", () => {
    const loop: SimNode[] = [{ node_key: "a", node_type: "send_message", config: { text: "x", next_node_key: "a" } }];
    const s = begin(loop, "a");
    expect(s.finished).toBe(true);
    expect(s.messages.at(-1)).toMatchObject({ code: "loop" });
  });
});
