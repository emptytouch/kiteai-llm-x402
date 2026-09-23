/**
 * kiteai-llm-x402 — LLM chat completions behind x402 on the Kite chain.
 *
 * Unlike a generic proxy, this service terminates the paid request and calls
 * an upstream LLM (Groq free tier) with its own API key, returning the model
 * response. Payment is required on POST /v1/chat; discovery endpoints
 * (/healthz, /v1/models) are free so a buyer can inspect the service first.
 */
import express, { type Request, type Response } from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { FACILITATOR_URL, kiteChainByName, kiteMoneyParser } from "./kite.js";
import { callGroq, DEFAULT_MODEL, ALLOWED_MODELS } from "./llm.js";

const env = (key: string, fallback = ""): string => (process.env[key] ?? "").trim() || fallback;

const payTo = env("PAY_TO");
if (!payTo) throw new Error("PAY_TO is required: the Kite wallet address that receives payments");
const chain = kiteChainByName(env("KITE_NETWORK", "testnet"));
const priceRaw = env("PRICE_USD", "0.001");
const price = priceRaw.startsWith("$") ? priceRaw : `$${priceRaw}`;
const groqKey = env("GROQ_API_KEY");
if (!groqKey) throw new Error("GROQ_API_KEY is required (free key, no card: https://console.groq.com/keys)");

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

// 2. Free discovery endpoints.
app.get("/healthz", (_req, res) => {
  res.json({
    ok: true,
    service: "kiteai-llm-x402",
    network: chain.network,
    asset: chain.assetSymbol,
    price,
    payTo,
    models: ALLOWED_MODELS,
  });
});

app.get("/v1/models", (_req, res) => {
  res.json({
    models: ALLOWED_MODELS,
    upstream: "Groq (free tier)",
    note: "Pass one of these as the `model` field of POST /v1/chat. Unknown models fall back to the default.",
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
        description: "Paid LLM chat completion (x402) via Groq free tier",
        mimeType: "application/json",
      },
    },
    resourceServer,
  ),
);

// 4. Paid handler: forward to Groq once payment is verified.
app.post("/v1/chat", async (req: Request, res: Response) => {
  const { messages, model, temperature, max_tokens, top_p } = req.body ?? {};
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "messages must be a non-empty array" });
    return;
  }
  const useModel = typeof model === "string" && ALLOWED_MODELS.includes(model) ? model : DEFAULT_MODEL;
  try {
    const completion = await callGroq({ messages, model: useModel, temperature, max_tokens, top_p }, groqKey);
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
      `kiteai-llm-x402 on :${port} -> Groq (network ${chain.network}, ${price}/call to ${payTo})`,
    );
  });
}
