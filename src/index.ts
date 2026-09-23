/**
 * kiteai-llm-x402 — LLM chat completions behind x402 on the Kite chain.
 *
 * Unlike a generic proxy, this service terminates the paid request and calls
 * an upstream LLM (any OpenAI-compatible provider) with its own API key,
 * returning the model response. Discovery endpoints (/healthz, /v1/models) are
 * free so a buyer can inspect the service first.
 *
 * The upstream is fully env-driven (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL),
 * so the same image can target SiliconFlow, Groq, OpenRouter, etc. without a
 * code change. Defaults point at SiliconFlow (card-free, free quota).
 *
 * Pricing is tiered: two paid endpoints at different price points, each routed
 * to a different capability class of model.
 */
import express, { type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR_URL, kiteChainByName, kiteMoneyParser } from "./kite.js";
import { callLLM, DEFAULT_MODEL, DEFAULT_BASE_URL } from "./llm.js";

const env = (key: string, fallback = ""): string => (process.env[key] ?? "").trim() || fallback;
const money = (v: string): string => (v.startsWith("$") ? v : `$${v}`);

const payTo = env("PAY_TO");
if (!payTo) throw new Error("PAY_TO is required: the Kite wallet address that receives payments");
const chain = kiteChainByName(env("KITE_NETWORK", "testnet"));
const price = money(env("PRICE_USD", "0.001"));
const llmKey = env("LLM_API_KEY");
if (!llmKey) {
  throw new Error(
    "LLM_API_KEY is required — an OpenAI-compatible key (e.g. SiliconFlow, free & card-free): https://siliconflow.cn",
  );
}
const llmBaseURL = env("LLM_BASE_URL", DEFAULT_BASE_URL);
const llmModel = env("LLM_MODEL", DEFAULT_MODEL);

// Tiered pricing: an affordable standard tier and a pricier pro tier that
// routes to a heavier reasoning model. Both defaults sit on SiliconFlow's free
// tier (¥0), so the price split reflects capability, not upstream cost.
const pricePro = money(env("PRICE_USD_PRO", "0.01"));
const llmModelPro = env("LLM_MODEL_PRO", "deepseek-ai/DeepSeek-R1-0528-Qwen3-8B");

// 1. Facilitator + Kite pricing.
const facilitator = new HTTPFacilitatorClient({ url: env("FACILITATOR_URL", FACILITATOR_URL) });
const resourceServer = new x402ResourceServer(facilitator).register(
  chain.network,
  new ExactEvmScheme().registerMoneyParser(kiteMoneyParser(chain)),
);

export const app = express();
app.disable("x-powered-by");

// Render terminates TLS in front of the app; advertise the public https origin
// in the 402 body so buyers see the URL they actually called.
app.set("trust proxy", 1);
app.use(express.json({ limit: "1mb" }));

// Human-readable upstream label for discovery endpoints.
const upstreamLabel = llmBaseURL.includes("siliconflow")
  ? "SiliconFlow (OpenAI-compatible, free quota)"
  : `OpenAI-compatible (${llmBaseURL})`;

const tiers = {
  standard: { endpoint: "POST /v1/chat", price, model: llmModel },
  pro: { endpoint: "POST /v1/chat/pro", price: pricePro, model: llmModelPro },
};

// 2. Free discovery endpoints.
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "kiteai-llm-x402",
    network: chain.network,
    asset: chain.assetSymbol,
    payTo,
    upstream: upstreamLabel,
    models: [llmModel, llmModelPro],
    tiers,
  });
});

app.get("/v1/models", (_req, res) => {
  res.json({
    models: [llmModel, llmModelPro],
    upstream: upstreamLabel,
    tiers,
    note: "Two paid tiers: POST /v1/chat (standard) and POST /v1/chat/pro (reasoning). Pass `model` to override the tier default.",
  });
});

// 3. Payment gate: two paid endpoints, each with its own price.
app.use(
  paymentMiddleware(
    {
      "POST /v1/chat": {
        accepts: {
          scheme: "exact",
          price,
          network: chain.network,
          payTo,
          maxTimeoutSeconds: 120,
        },
        description: `Paid LLM chat completion — standard tier (${llmModel}) via ${upstreamLabel}`,
        mimeType: "application/json",
      },
      "POST /v1/chat/pro": {
        accepts: {
          scheme: "exact",
          price: pricePro,
          network: chain.network,
          payTo,
          maxTimeoutSeconds: 180,
        },
        description: `Paid LLM chat completion — pro tier, reasoning model (${llmModelPro}) via ${upstreamLabel}`,
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

// 4. Paid handlers: forward to the upstream LLM once payment is verified.
async function handleChat(req: Request, res: Response, tierModel: string): Promise<void> {
  const { messages, model, temperature, max_tokens, top_p } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }
  const useModel = typeof model === "string" && model.trim() ? model.trim() : tierModel;
  try {
    const completion = await callLLM(
      { messages, model: useModel, temperature, max_tokens, top_p },
      { apiKey: llmKey, baseURL: llmBaseURL, model: tierModel },
    );
    res.status(200).json(completion);
  } catch (err) {
    // A >= 400 upstream status means the x402 middleware does NOT settle the charge.
    res.status(502).json({ error: "upstream unreachable", detail: String(err) });
  }
}

app.post("/v1/chat", (req: Request, res: Response) => void handleChat(req, res, llmModel));
app.post("/v1/chat/pro", (req: Request, res: Response) => void handleChat(req, res, llmModelPro));

const port = Number(env("PORT", "8080"));
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(
      `kiteai-llm-x402 on :${port} -> ${upstreamLabel} (network ${chain.network}, standard ${price}, pro ${pricePro}, to ${payTo})`,
    );
  });
}
