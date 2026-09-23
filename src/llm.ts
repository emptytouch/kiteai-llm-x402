/**
 * Upstream LLM adapter — OpenAI-compatible, provider-agnostic.
 *
 * The service terminates the x402 payment and then calls an upstream LLM that
 * speaks the OpenAI chat-completions protocol. The provider is fully driven by
 * environment variables, so the same build can target SiliconFlow, Groq,
 * OpenRouter, Together, a local Ollama, etc. — no code change required.
 *
 * Defaults point at SiliconFlow (siliconflow.cn), which is card-free to sign up
 * for and grants new accounts free quota — ideal for this zero-cost bounty demo.
 */

/** Default OpenAI-compatible base URL (SiliconFlow). Override with LLM_BASE_URL. */
export const DEFAULT_BASE_URL = "https://api.siliconflow.com/v1";

/** Default model id. Override with LLM_MODEL. Pick any id your provider exposes. */
export const DEFAULT_MODEL = process.env.LLM_MODEL || "Qwen/Qwen3-8B";

export interface ChatMessage {
  role: string;
  content: string;
}

export interface CallLLMInput {
  messages: ChatMessage[];
  model: string;
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export interface LLMConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
}

/**
 * Call an OpenAI-compatible chat-completions endpoint and return the upstream
 * JSON verbatim. `apiKey`/`baseURL`/`model` fall back to env defaults when
 * omitted (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL).
 */
export async function callLLM(input: CallLLMInput, config: LLMConfig): Promise<unknown> {
  const apiKey = config.apiKey;
  if (!apiKey) throw new Error("LLM_API_KEY is not set");
  const baseURL = (config.baseURL ?? DEFAULT_BASE_URL).replace(/\/$/, "");
  const model = input.model || config.model || DEFAULT_MODEL;
  const url = `${baseURL}/chat/completions`;

  const body: Record<string, unknown> = { model, messages: input.messages };
  if (input.temperature !== undefined) body.temperature = input.temperature;
  if (input.max_tokens !== undefined) body.max_tokens = input.max_tokens;
  if (input.top_p !== undefined) body.top_p = input.top_p;

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`upstream ${res.status}: ${JSON.stringify(data).slice(0, 200)}`);
  }
  return data;
}
