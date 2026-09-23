# kiteai-llm-x402

LLM chat completions behind **x402** on the **Kite chain**. A buyer sends a chat
prompt; the service answers only after an x402 micropayment settles in pieUSD
(Kite testnet). The upstream model runs on **Groq's free tier** — no credit card,
no upstream cost.

This is a deliberately different track from the many "wrap a free public API"
x402 services: an AI endpoint is the protocol's native use case yet was
completely unrepresented among KiteAI bounty submissions at the time of writing.

| | |
|---|---|
| `POST /v1/chat` | paid LLM completion → Groq `chat/completions` |
| `GET /v1/models` | free — lists routable free-tier models |
| `GET /healthz` | free — liveness + pricing + network |
| Price | `$0.001` per call in pieUSD (`eip155:2368`) |
| Upstream | Groq free tier (key held server-side, never exposed) |
| Deployed | `status: testnet` — https://kiteai-llm-x402.onrender.com |
| Paid proof | see [PROOF.md](./PROOF.md) (≥3 settled tx) |

## Why this is not a `.env`-only wrapper

The HTTP layer stays a thin x402 gate. The only business logic is in
`src/llm.ts` (`callGroq`), which posts to Groq's OpenAI-compatible endpoint and
returns the JSON verbatim. Swapping the provider means swapping that one file.

Model routing is explicit: `POST /v1/chat` accepts a `model` field, but only
values from `ALLOWED_MODELS` (`src/llm.ts`) are forwarded; anything else falls
back to `DEFAULT_MODEL`. This keeps a service priced for free models from being
driven at billable ones.

## Run locally

```bash
npm install
cp .env.example .env      # set PAY_TO and GROQ_API_KEY (free, no card)
npm start                 # tsx src/index.ts, listens on $PORT (default 8080)
```

Any Node 22 host works (Render, Fly, Cloud Run, a VPS). The service must be
reachable over public https: Kite Passport fetches the URL server-side, so
`localhost` and browser-gated tunnels will not work.

## Try it

```bash
curl -i "$BASE_URL/healthz"
# 200 {"ok":true,"network":"eip155:2368","asset":"pieUSD","price":"$0.001", ...}

curl -i "$BASE_URL/v1/models"
# 200 {"models":["llama-3.3-70b-versatile", ...],"upstream":"Groq (free tier)"}

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
