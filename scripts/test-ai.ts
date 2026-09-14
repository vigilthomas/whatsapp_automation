/**
 * Quick smoke test for the NVIDIA NIM / DeepSeek V4 Flash integration.
 *
 * Usage:
 *   npx tsx scripts/test-ai.ts
 *
 * Reads config from .env and makes a single chat completion request.
 */

import 'dotenv/config'

const BASE_URL = process.env.NVIDIA_NIM_BASE_URL || 'https://integrate.api.nvidia.com/v1'
const API_KEY = process.env.NVIDIA_NIM_API_KEY
const MODEL = process.env.AI_MODEL || 'deepseek-ai/deepseek-v4-flash-0731'
const TEMPERATURE = Number(process.env.AI_TEMPERATURE) || 1
const MAX_TOKENS = Number(process.env.AI_MAX_TOKENS) || 16384
const REASONING_EFFORT = process.env.AI_REASONING_EFFORT || 'high'

if (!API_KEY) {
  console.error('❌ NVIDIA_NIM_API_KEY is not set in .env — paste your key and retry.')
  process.exit(1)
}

console.log('🔧 Config:')
console.log(`   Model:       ${MODEL}`)
console.log(`   Base URL:    ${BASE_URL}`)
console.log(`   Temperature: ${TEMPERATURE}`)
console.log(`   Max Tokens:  ${MAX_TOKENS}`)
console.log(`   Reasoning:   ${REASONING_EFFORT}`)
console.log()

// Load persona from .ai-config.json
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'

interface PersonaConfig {
  role?: string
  name?: string
  persona?: string
  instructions?: string[]
  boundaries?: string[]
}

const configPath = join(process.cwd(), '.ai-config.json')
let persona: PersonaConfig = {}
if (existsSync(configPath)) {
  persona = JSON.parse(readFileSync(configPath, 'utf-8'))
  console.log(`🤖 Persona: "${persona.name}" (${persona.role})`)
} else {
  console.log('⚠️  No .ai-config.json found — using default persona.')
}

const systemPrompt = [
  `You are ${persona.name ?? 'an assistant'}, ${persona.role ?? 'AI receptionist'} for TestClinic.`,
  persona.persona ?? 'You help patients book appointments and answer questions.',
  ...(persona.instructions ?? ['Keep responses concise and friendly.']),
].join(' ')

console.log()

const isDeepSeek = MODEL.startsWith('deepseek')

interface Message {
  role: string
  content: string
}

interface RequestBody {
  model: string
  messages: Message[]
  temperature: number
  max_tokens: number
  top_p?: number
  chat_template_kwargs?: { thinking: boolean; reasoning_effort: string }
  stream: false
}

const body: RequestBody = {
  model: MODEL,
  messages: [
    { role: 'system', content: systemPrompt },
    {
      role: 'user',
      content: 'Hi, I would like to book an appointment with Dr. Smith for tomorrow morning.',
    },
  ],
  temperature: TEMPERATURE,
  max_tokens: MAX_TOKENS,
  stream: false as const,
}

if (isDeepSeek) {
  body.top_p = 0.95
  body.chat_template_kwargs = { thinking: true, reasoning_effort: REASONING_EFFORT }
}

console.log('📡 Sending request...')
const start = Date.now()

async function run() {
  try {
    const res = await fetch(`${BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })

    const elapsed = Date.now() - start

    if (!res.ok) {
      const errBody = await res.text()
      console.error(`\n❌ API returned ${res.status}:`)
      console.error(errBody)
      process.exit(1)
    }

    const data = await res.json() as {
      choices?: Array<{
        message?: {
          content?: string
          reasoning?: string
          reasoning_content?: string
        }
        finish_reason?: string
      }>
      usage?: {
        prompt_tokens?: number
        completion_tokens?: number
        total_tokens?: number
      }
    }

    const choice = data.choices?.[0]
    const message = choice?.message
    const reasoning = message?.reasoning ?? message?.reasoning_content ?? null

    console.log(`\n✅ Response received in ${elapsed}ms`)
    console.log(`   Finish reason: ${choice?.finish_reason ?? 'unknown'}`)

    if (data.usage) {
      console.log(`   Tokens: ${data.usage.prompt_tokens} prompt + ${data.usage.completion_tokens} completion = ${data.usage.total_tokens} total`)
    }

    if (reasoning) {
      console.log('\n💭 Reasoning:')
      console.log('─'.repeat(50))
      console.log(reasoning)
    }

    console.log('\n💬 Reply:')
    console.log('─'.repeat(50))
    console.log(message?.content ?? '(empty)')
    console.log()
  } catch (err) {
    const elapsed = Date.now() - start
    console.error(`\n❌ Request failed after ${elapsed}ms:`)
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

run()
