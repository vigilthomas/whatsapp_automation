/**
 * LIVE tool-calling smoke against a real Ollama server with a
 * tool-capable model. Skipped unless LIVE_OLLAMA=1.
 *
 *   LIVE_OLLAMA=1 OLLAMA_MODEL=qwen3:8b OLLAMA_BASE_URL=http://<host>:11434 \
 *     npx vitest run src/lib/ai/providers/ollama.live.test.ts
 *
 * Round 1: the model should ask to call `check_availability` (or
 * `book_appointment`) rather than answer in prose. Round 2: given a
 * fake tool result, it should produce a short text confirmation.
 */
import { describe, it, expect } from 'vitest'
import { generateOllama, ollamaModel } from './ollama'
import type { ChatMessageWithRole } from '../types'

const live = process.env.LIVE_OLLAMA === '1'

const TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'check_availability',
      description: 'Check free appointment slots for a date. Call this before booking.',
      parameters: {
        type: 'object',
        properties: { date: { type: 'string', description: 'YYYY-MM-DD' } },
        required: ['date'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'book_appointment',
      description: 'Book an appointment at a given date and time.',
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'YYYY-MM-DD' },
          time: { type: 'string', description: 'HH:MM 24h' },
        },
        required: ['date', 'time'],
      },
    },
  },
]

describe.skipIf(!live)('ollama tool calling (live)', () => {
  it('calls a tool, then answers with text after the result', async () => {
    const system =
      'You are Sarah, receptionist at Smile Dental. Today is 2026-09-14 (Monday). ' +
      'Use the tools to check availability or book. Reply in one short WhatsApp sentence.'
    const messages: ChatMessageWithRole[] = [
      { role: 'user', content: 'Can I get an appointment tomorrow at 10 AM?' },
    ]

    const t0 = Date.now()
    const r1 = await generateOllama({
      apiKey: '',
      model: ollamaModel(),
      systemPrompt: system,
      messages,
      timeoutMs: 120_000,
      tools: TOOLS,
      numPredict: 512,
    })
    console.log(`\nround 1 [${Date.now() - t0}ms] text=${JSON.stringify(r1.text)} tool_calls=${JSON.stringify(r1.toolCalls)}`)
    expect(r1.toolCalls.length).toBeGreaterThan(0)
    const tc = r1.toolCalls[0]
    expect(['check_availability', 'book_appointment']).toContain(tc.function.name)
    expect(JSON.parse(tc.function.arguments).date).toBe('2026-09-15')

    messages.push({ role: 'assistant', content: r1.text || null, tool_calls: r1.toolCalls })
    messages.push({
      role: 'tool',
      tool_call_id: tc.id,
      content: JSON.stringify(
        tc.function.name === 'check_availability'
          ? { date: '2026-09-15', free_slots: ['10:00', '11:30'] }
          : { ok: true, appointment_id: 'apt_123', date: '2026-09-15', time: '10:00' },
      ),
    })

    const t1 = Date.now()
    const r2 = await generateOllama({
      apiKey: '',
      model: ollamaModel(),
      systemPrompt: system,
      messages,
      timeoutMs: 120_000,
      tools: TOOLS,
      numPredict: 512,
    })
    console.log(`round 2 [${Date.now() - t1}ms] text=${JSON.stringify(r2.text)} tool_calls=${JSON.stringify(r2.toolCalls)}`)
    // Either it books now (2nd tool call) or it confirms in text — both fine.
    expect(r2.text.length > 0 || r2.toolCalls.length > 0).toBe(true)
  }, 300_000)
})
