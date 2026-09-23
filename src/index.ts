/**
 * kiteai-llm-x402 — LLM chat completions behind x402 on the Kite chain.
 *
 * Unlike a generic proxy, this service terminates the paid request and calls
 * an upstream LLM (any OpenAI-compatible provider) with its own API key,
 * returning the model response. Payment is required on POST /v1/chat;
 * discovery endpoints (/healthz, /v1/models) are free so a buyer can inspect
 * the service first.
 *
 * The upstream is fully env-driven (LLM_API_KEY / LLM_BASE_URL / LLM_MODEL),
 * so the same image can target SiliconFlow, Groq, OpenRouter, etc. without a
 * code change. Defaults point at SiliconFlow (card-free, free quota).
 */
import express, { type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR_URL, kiteChainByName, kiteMoneyParser } from "./kite.js";
import { callLLM, DEFAULT_MODEL, DEFAULT_BASE_URL } from "./llm.js";

const env = (key: string, fallback = ""): string => (process.env[key] ?? "").trim() || fallback;

const payTo = env("PAY_TO");
if (!payTo) throw new Error("PAY_TO is required: the Kite wallet address that receives payments");
const chain = kiteChainByName(env("KITE_NETWORK", "testnet"));
const priceRaw = env("PRICE_USD", "0.001");
const price = priceRaw.startsWith("$") ? priceRaw : `$${priceRaw}`;
const llmKey = env("LLM_API_KEY");
if (!llmKey) {
  throw new Error(
    "LLM_API_KEY is required — an OpenAI-compatible key (e.g. SiliconFlow, free & card-free): https://siliconflow.cn",
  );
}
const llmBaseURL = env("LLM_BASE_URL", DEFAULT_BASE_URL);
const llmModel = env("LLM_MODEL", DEFAULT_MODEL);

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

// 2. Free discovery endpoints.
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "kiteai-llm-x402",
    network: chain.network,
    asset: chain.assetSymbol,
    price,
    payTo,
    upstream: upstreamLabel,
    models: [llmModel],
  });
});

app.get("/v1/models", (_req, res) => {
  res.json({
    models: [llmModel],
    upstream: upstreamLabel,
    note: "Pass `model` in POST /v1/chat to route a specific id; otherwise this default is used. Any OpenAI-compatible model id works.",
  });
});

// 3. Payment gate: only POST /v1/chat costs money.
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
        description: `Paid LLM chat completion (x402) via ${upstreamLabel}`,
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

// 4. Paid handler: forward to the upstream LLM once payment is verified.
app.post("/v1/chat", async (req: Request, res: Response) => {
  const { messages, model, temperature, max_tokens, top_p } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }
  const useModel = typeof model === "string" && model.trim() ? model.trim() : llmModel;
  try {
    const completion = await callLLM(
      { messages, model: useModel, temperature, max_tokens, top_p },
      { apiKey: llmKey, baseURL: llmBaseURL, model: llmModel },
    );
    res.status(200).json(completion);
  } catch (err) {
    // A >= 400 upstream status means the x402 middleware does NOT settle the charge.
    res.status(502).json({ error: "upstream unreachable", detail: String(err) });
  }
});

const port = Number(env("PORT", "8080"));
if (process.env.NODE_ENV !== "test") {
  app.listen(port, () => {
    console.log(
      `kiteai-llm-x402 on :${port} -> ${upstreamLabel} (network ${chain.network}, ${price}/call to ${payTo})`,
    );
  });
}
