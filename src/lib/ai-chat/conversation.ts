// ============================================================
// AI assistant — one inbound message's back-and-forth with the model.
// Pure loop, no I/O of its own: the caller passes `ask` (the provider)
// and `run` (the booking actions), so the WhatsApp runner and the
// dry-run test chat share exactly the same logic.
//
//   ask → action? → run it → "ACTION RESULT …" turn → ask again → …
//
// At most MAX_TOOL_ROUNDS actions per inbound message (look up, find
// times and reschedule is three); an unreadable answer is asked for
// once more before handing over. Anything else that goes wrong ends in
// a handoff, whose message is always DEFAULT_HANDOFF_REPLY.
// ============================================================

import type { ToolCall, ToolResult } from "./booking";
import { DEFAULT_HANDOFF_REPLY, parseModelReply, type ChatTurn, type ModelDecision } from "./model";

/** Actions allowed while answering one inbound message. */
export const MAX_TOOL_ROUNDS = 4;

export interface ConverseStep {
  call: ToolCall;
  result: ToolResult;
}

export async function converse({
  ask,
  turns,
  run,
}: {
  ask: (turns: ChatTurn[]) => Promise<string>;
  /** The history; actions and their results are appended to it. */
  turns: ChatTurn[];
  run: (call: ToolCall) => Promise<ToolResult>;
}): Promise<{ decision: ModelDecision; steps: ConverseStep[] }> {
  const steps: ConverseStep[] = [];
  let retried = false;
  const next = async (): Promise<ModelDecision> => {
    const d = parseModelReply(await ask(turns));
    if (!d.unreadable || retried) return d;
    retried = true;
    return parseModelReply(
      await ask([
        ...turns,
        { role: "user", content: "(from the system) Your last answer was not valid JSON. Answer again with ONLY the JSON object." },
      ]),
    );
  };

  let decision = await next();
  while (decision.tool) {
    if (steps.length >= MAX_TOOL_ROUNDS) {
      return {
        decision: { reply: DEFAULT_HANDOFF_REPLY, handoff: true, reason: "The assistant couldn't finish the request." },
        steps,
      };
    }
    const call = decision.tool;
    const result = await run(call);
    steps.push({ call, result });
    turns.push(
      { role: "assistant", content: JSON.stringify({ action: call.tool, ...withoutTool(call) }) },
      { role: "user", content: `ACTION RESULT for ${call.tool} (from the system, not the customer):\n${JSON.stringify(result)}` },
    );
    decision = await next();
  }
  return { decision, steps };
}

/** The call's arguments without empty ones, as the model wrote them. */
function withoutTool(call: ToolCall): Record<string, string> {
  const { tool: _tool, ...args } = call;
  return Object.fromEntries(Object.entries(args).filter(([, v]) => v));
}
