# kiteai-llm-x402

LLM chat completions behind **x402** on the **Kite chain**. A buyer sends a chat
prompt; the service answers only after an x402 micropayment settles in pieUSD
(Kite testnet). The upstream model runs on any **OpenAI-compatible** provider
(defaults to **SiliconFlow**, which is card-free and grants new accounts free
quota — no credit card, no upstream cost).

This is a deliberately different track from the many "wrap a free public API"
x402 services: an AI endpoint is the protocol's native use case yet was
completely unrepresented among KiteAI bounty submissions at the time of writing.

| | |
|---|---|
| `POST /v1/chat` | paid LLM completion — standard tier (`$0.001`) |
| `POST /v1/chat/pro` | paid LLM completion — pro tier, reasoning model (`$0.01`) |
| `GET /v1/models` | free — lists models and both paid tiers |
| `GET /healthz` | free — liveness + pricing tiers + network + upstream |
| Price | `$0.001` standard / `$0.01` pro, per call in pieUSD (`eip155:2368`) |
| Upstream | OpenAI-compatible, defaults to SiliconFlow free quota (key held server-side, never exposed) |
| Deployed | `status: testnet` — https://kiteai-llm-x402.onrender.com |
| Paid proof | see [PROOF.md](./PROOF.md) (≥3 settled tx) |

## Provider-agnostic upstream

The HTTP layer is a thin x402 gate. All upstream logic lives in `src/llm.ts`
(`callLLM`), which posts to any OpenAI-compatible `/chat/completions` endpoint.
The provider is driven entirely by environment variables — swap providers
without touching code:

| Env var | Default | Purpose |
|---|---|---|
| `LLM_API_KEY` | _(required)_ | API key for the upstream provider |
| `LLM_BASE_URL` | `https://api.siliconflow.cn/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `Qwen/Qwen3-8B` | Standard-tier model id |
| `PRICE_USD` | `0.001` | Standard-tier price per call |
| `PRICE_USD_PRO` | `0.01` | Pro-tier price per call |
| `LLM_MODEL_PRO` | `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B` | Pro-tier (reasoning) model id |

`POST /v1/chat` accepts a `model` field; if provided it is passed through to the
upstream, otherwise the tier's default model is used. This keeps the deployment
flexible: point `LLM_BASE_URL` at Groq, OpenRouter, Together, a local Ollama, etc.

## Tiered pricing

x402 is not limited to a single flat price. This service exposes **two paid
endpoints at different price points**, each routed to a different capability
class of model:

| Tier | Endpoint | Price | Default model | Character |
|---|---|---|---|---|
| standard | `POST /v1/chat` | `$0.001` | `Qwen/Qwen3-8B` | fast, general-purpose |
| pro | `POST /v1/chat/pro` | `$0.01` | `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B` | slower, reasoning (emits `reasoning_content`) |

The two endpoints are independent x402 resources: each answers with its own
`402` carrying its own price, and paying one does not unlock the other.
`GET /v1/models` and `/healthz` expose the tiers and prices for free, so a
client can pick a tier before paying.

Both default models sit on SiliconFlow's free quota (¥0 in / ¥0 out), so the
price gap reflects **capability**, not upstream cost — a pro call costs roughly
10× the tokens because of its reasoning trace.

## Run locally

```bash
npm install
cp .env.example .env      # set PAY_TO and LLM_API_KEY (SiliconFlow: free, no card)
npm start                 # tsx src/index.ts, listens on $PORT (default 8080)
```

Any Node 22 host works (Render, Fly, Cloud Run, a VPS). The service must be
reachable over public https: Kite Passport fetches the URL server-side, so
`localhost` and browser-gated tunnels will not work.

## Try it

```bash
curl -i "$BASE_URL/healthz"
# 200 {"ok":true,"network":"eip155:2368","asset":"pieUSD","price":"$0.001","upstream":"SiliconFlow ...", ...}

curl -i "$BASE_URL/v1/models"
# 200 {"models":["Qwen/Qwen3-8B"],"upstream":"SiliconFlow (OpenAI-compatible, free quota)"}

# Pay a chat call (self-pay, see PROOF.md for the full flow):
BASE_URL="$BASE_URL" npm run selfpay
```

## Verify it yourself (buyer quickstart)

Anyone holding a funded Kite testnet key can pay for a call and watch it settle —
no allowlist, no special access. Because the host is not in Kite's catalog,
`kpass session execute` refuses it client-side; this script signs the
EIP-3009 authorization directly instead.

```bash
npm install

# Option A: any Kite testnet private key holding pieUSD
BUYER_PRIVATE_KEY=0x<hex> \
BASE_URL=https://kiteai-llm-x402.onrender.com \
node examples/paid-call.mjs

# Option B: an existing Kite Passport sandbox session
KITE_SESSION_FILE=/path/to/.kite-passport/sandbox/sessions.json \
BASE_URL=https://kiteai-llm-x402.onrender.com \
node examples/paid-call.mjs

# single custom prompt
CHAT_PROMPT="Reply with the single word: ok" npm run selfpay

# pay the pro tier ($0.01 per call, reasoning model)
TIER=pro npm run selfpay
```

Key resolution order: `BUYER_PRIVATE_KEY` → `KITE_SESSION_FILE` → auto-detect
(`./.kite-passport/sandbox/sessions.json`, `~/.kite-passport/sandbox/sessions.json`).
Each call prints the unpaid `402`, the authorization it signed, the paid status
and the settlement tx hash; every record is appended to `proof/paid-calls.jsonl`.

You need testnet pieUSD on `eip155:2368` — obtain it from the Kite testnet
faucet or by creating a Kite Passport sandbox session.

## Status

`testnet`. The service answers the x402 challenge on `eip155:2368` in pieUSD and
settles paid calls on-chain (records in [PROOF.md](./PROOF.md)).

One caveat for buyers: `kpass session execute` currently refuses this host
client-side — Kite's executable-service catalog does not yet include
`kiteai-llm-x402.onrender.com`. Anyone can still pay using the buyer script
above, which signs the EIP-3009 authorization directly via the `@x402` client
SDK. Admitting the host to the catalog would additionally enable the CLI path.

## Tests

```bash
npm test        # vitest: healthz, free models, 402 on unpaid chat, mocked upstream
```

## Related contribution

Registered to the KiteAI ecosystem via the Bounty Dashboard, which opens the
corresponding migration PR in `electric-capital/open-dev-data`.
