import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { generateOllama } from './ollama'
import { mergeConsecutiveWithTools } from './shared'
import type { ChatMessageWithRole } from '../types'

const TOOL = {
  type: 'function' as const,
  function: {
    name: 'book_appointment',
    description: 'Book',
    parameters: { type: 'object', properties: { date: { type: 'string' } } },
  },
}

describe('mergeConsecutiveWithTools', () => {
  it('merges consecutive plain turns but never tool turns', () => {
    const msgs: ChatMessageWithRole[] = [
      { role: 'user', content: 'a' },
      { role: 'user', content: 'b' },
      {
        role: 'assistant',
        content: null,
        tool_calls: [{ id: 'c1', type: 'function', function: { name: 'x', arguments: '{}' } }],
      },
      { role: 'tool', tool_call_id: 'c1', content: '{"ok":true}' },
      { role: 'tool', tool_call_id: 'c2', content: '{"ok":true}' },
      { role: 'assistant', content: 'done' },
    ]
    const out = mergeConsecutiveWithTools(msgs)
    expect(out).toHaveLength(5)
    expect(out[0]).toEqual({ role: 'user', content: 'a\n\nb' })
    expect(out[1].tool_calls?.[0].id).toBe('c1')
    expect(out[2].tool_call_id).toBe('c1')
    expect(out[3].tool_call_id).toBe('c2')
  })
})

describe('generateOllama tool calling', () => {
  const fetchMock = vi.fn()
  beforeEach(() => vi.stubGlobal('fetch', fetchMock))
  afterEach(() => {
    vi.unstubAllGlobals()
    fetchMock.mockReset()
    delete process.env.OLLAMA_THINK
  })

  const base = {
    apiKey: '',
    model: 'qwen3:8b',
    systemPrompt: 'sys',
    timeoutMs: 1000,
  }

  it('sends tools and think:false, normalises object arguments + missing ids', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({
          message: {
            role: 'assistant',
            content: '',
            tool_calls: [{ function: { name: 'book_appointment', arguments: { date: '2026-09-15' } } }],
          },
          done: true,
          done_reason: 'stop',
          prompt_eval_count: 100,
          eval_count: 20,
        }),
      ),
    )
    const r = await generateOllama({
      ...base,
      messages: [{ role: 'user', content: 'book tomorrow' }],
      tools: [TOOL],
    })
    expect(r.toolCalls).toHaveLength(1)
    expect(r.toolCalls[0].function.name).toBe('book_appointment')
    expect(r.toolCalls[0].function.arguments).toBe('{"date":"2026-09-15"}')
    expect(r.toolCalls[0].id).toMatch(/^call_/)
    expect(r.finishReason).toBe('tool_calls')
    expect(r.text).toBe('')

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.tools).toEqual([TOOL])
    expect(body.think).toBe(false)
    expect(body.options.num_predict).toBe(80)
  })

  it('serialises assistant tool_calls back to objects and tool results with tool_call_id', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ message: { content: 'Booked for tomorrow at 10!' }, done: true })),
    )
    const r = await generateOllama({
      ...base,
      numPredict: 1024,
      messages: [
        { role: 'user', content: 'book tomorrow' },
        {
          role: 'assistant',
          content: null,
          tool_calls: [
            { id: 'c1', type: 'function', function: { name: 'book_appointment', arguments: '{"date":"2026-09-15"}' } },
          ],
        },
        { role: 'tool', tool_call_id: 'c1', content: '{"appointment_id":"a1"}' },
      ],
    })
    expect(r.text).toBe('Booked for tomorrow at 10!')
    expect(r.toolCalls).toEqual([])

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.messages[2].tool_calls[0].function.arguments).toEqual({ date: '2026-09-15' })
    expect(body.messages[3]).toEqual({ role: 'tool', content: '{"appointment_id":"a1"}', tool_call_id: 'c1' })
    expect(body.tools).toBeUndefined()
    expect(body.options.num_predict).toBe(1024)
  })

  it('honours OLLAMA_THINK=true', async () => {
    process.env.OLLAMA_THINK = 'true'
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: { content: 'hi' } })))
    await generateOllama({ ...base, messages: [{ role: 'user', content: 'hi' }] })
    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string)
    expect(body.think).toBe(true)
  })

  it('throws AiError on empty response with no tool calls', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ message: { content: '' } })))
    await expect(
      generateOllama({ ...base, messages: [{ role: 'user', content: 'hi' }] }),
    ).rejects.toMatchObject({ code: 'empty_response' })
  })
})
