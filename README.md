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
| `POST /v1/chat` | paid LLM completion → OpenAI-compatible `chat/completions` |
| `GET /v1/models` | free — lists the configured default model |
| `GET /healthz` | free — liveness + pricing + network + upstream |
| Price | `$0.001` per call in pieUSD (`eip155:2368`) |
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
| `LLM_BASE_URL` | `https://api.siliconflow.com/v1` | OpenAI-compatible base URL |
| `LLM_MODEL` | `Qwen/Qwen3.5-35B-A3B` | Default model id when the caller omits `model` |

`POST /v1/chat` accepts a `model` field; if provided it is passed through to the
upstream, otherwise `LLM_MODEL` is used. This keeps the deployment flexible:
point `LLM_BASE_URL` at Groq, OpenRouter, Together, a local Ollama, etc.

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
# 200 {"models":["Qwen/Qwen3.5-35B-A3B"],"upstream":"SiliconFlow (OpenAI-compatible, free quota)"}

# Pay a chat call (self-pay, see PROOF.md for the full flow):
BASE_URL="$BASE_URL" npm run selfpay
```

## Status

`testnet`. The service answers the x402 challenge on `eip155:2368` in pieUSD and
settles paid calls on-chain (records in [PROOF.md](./PROOF.md)). Note:
`kpass session execute` currently refuses this host client-side — Kite's
executable-service catalog does not yet include `kiteai-llm-x402.onrender.com` —
so paid calls are signed with a Kite Passport sandbox session key via the
`@x402` client SDK. Admitting the host to the catalog enables the CLI path for
regular buyers.

## Tests

```bash
npm test        # vitest: healthz, free models, 402 on unpaid chat, mocked upstream
```

## Related contribution

Registered to the KiteAI ecosystem via the Bounty Dashboard, which opens the
corresponding migration PR in `electric-capital/open-dev-data`.
