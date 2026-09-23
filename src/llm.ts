/**
 * Groq upstream adapter.
 *
 * Groq exposes an OpenAI-compatible chat-completions endpoint on its free tier
 * (no credit card). This module is the ONLY place that talks to the upstream;
 * the HTTP layer in index.ts stays agnostic so the same x402 wrapper could be
 * pointed at a different LLM provider by swapping this file.
 */

/** Default model used when the caller does not name one or names an unknown one. */
export const DEFAULT_MODEL = "llama-3.3-70b-versatile";

/**
 * Free-tier Groq models this service is willing to route to. Keeping the list
 * explicit (instead of passing through any model string) prevents a caller from
 * driving billable models through a service that is priced for free ones.
 */
export const ALLOWED_MODELS = [
  "llama-3.3-70b-versatile",
  "llama-3.1-8b-instant",
  "llama-4-scout-17b-16e-instruct",
  "gpt-oss-120b",
  "gpt-oss-20b",
  "qwen3-32b",
  "deepseek-r1-distill-llama-70b",
  "mistral-saba-24b",
];

const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface CallGroqInput {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

/**
 * Call Groq chat completions and return the upstream JSON verbatim.
 * `apiKey` defaults to GROQ_API_KEY; tests pass a dummy key and mock fetch.
 */
export async function callGroq(input: CallGroqInput, apiKey: string = process.env.GROQ_API_KEY ?? ""): Promise<unknown> {
  if (!apiKey) throw new Error("GROQ_API_KEY is not set");
  const body: Record<string, unknown> = { model: input.model, messages: input.messages };
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
  if (input.top_p !== undefined) body.top_p = input.top_p;

  const res = await fetch(GROQ_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`Groq ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}
