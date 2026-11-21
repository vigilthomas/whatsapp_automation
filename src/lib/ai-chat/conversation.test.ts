import { describe, expect, it, vi } from "vitest";

import { DEFAULT_HANDOFF_REPLY, type ChatTurn } from "./model";
import { MAX_TOOL_ROUNDS, converse } from "./conversation";

const user = (content: string): ChatTurn => ({ role: "user", content });

/** A fake model that answers with the given strings in order. */
function model(...answers: string[]) {
  const seen: ChatTurn[][] = [];
  const ask = vi.fn(async (turns: ChatTurn[]) => {
    seen.push(turns.map((t) => ({ ...t })));
    return answers.shift() ?? "";
  });
  return { ask, seen };
}

describe("converse", () => {
  it("returns a plain answer without running anything", async () => {
    const { ask } = model('{"reply":"We open at 9.","handoff":false}');
    const run = vi.fn();
    const out = await converse({ ask, turns: [user("When do you open?")], run });
    expect(out.decision).toMatchObject({ reply: "We open at 9.", handoff: false });
    expect(run).not.toHaveBeenCalled();
  });

  it("runs each action, feeds the result back and answers", async () => {
    const { ask, seen } = model(
      '{"action":"my_appointments"}',
      '{"reply":"You have Hair Spa on Tue 25 Nov at 10:00 am.","handoff":false}',
    );
    const run = vi.fn(async () => ({ ok: true as const, upcoming: [] }));
    const out = await converse({ ask, turns: [user("When is my appointment?")], run });
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ tool: "my_appointments" }));
    expect(seen[1].at(-1)?.content).toContain("ACTION RESULT for my_appointments");
    expect(out.decision.reply).toContain("Hair Spa");
    expect(out.steps).toHaveLength(1);
  });

  it("asks once more when the answer is unreadable, then hands over with the fixed message", async () => {
    const once = model("Sure! 10am works.", '{"reply":"Booked?","handoff":false}');
    expect((await converse({ ask: once.ask, turns: [user("10am")], run: vi.fn() })).decision).toMatchObject({ handoff: false });

    const twice = model("Sure!", "Okay!");
    const out = await converse({ ask: twice.ask, turns: [user("10am")], run: vi.fn() });
    expect(out.decision).toMatchObject({ handoff: true, reply: DEFAULT_HANDOFF_REPLY });
    expect(twice.ask).toHaveBeenCalledTimes(2);
  });

  it(`stops after ${MAX_TOOL_ROUNDS} actions and hands over`, async () => {
    const { ask } = model(...Array.from({ length: 10 }, () => '{"action":"find_times","service":"X"}'));
    const run = vi.fn(async () => ({ ok: true as const }));
    const out = await converse({ ask, turns: [user("book")], run });
    expect(run).toHaveBeenCalledTimes(MAX_TOOL_ROUNDS);
    expect(out.decision).toMatchObject({ handoff: true, reply: DEFAULT_HANDOFF_REPLY });
  });

  it("allows look-up, find times and reschedule in one message", () => {
    expect(MAX_TOOL_ROUNDS).toBeGreaterThanOrEqual(4);
  });
});
