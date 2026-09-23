# Payment Proof — kiteai-llm-x402

This service settles x402 payments on **Kite testnet (`eip155:2368`)** in **pieUSD**.
Every paid call is a real on-chain EIP-3009 `transferWithAuthorization` settled by
the Kite facilitator (`https://facilitator.pieverse.io/v2`). The transactions below
are reproducible: run `npm run selfpay` against the deployed URL and the same
flow produces fresh, verifiable hashes.

## How to reproduce

The buyer side needs no allowlist — any Kite testnet key holding pieUSD works.

```bash
npm install

# Option A: raw private key (any funded Kite testnet key)
BUYER_PRIVATE_KEY=0x<hex> \
BASE_URL=https://kiteai-llm-x402.onrender.com \
node examples/paid-call.mjs

# Option B: an existing Kite Passport sandbox session
KITE_SESSION_FILE=/path/to/.kite-passport/sandbox/sessions.json \
BASE_URL=https://kiteai-llm-x402.onrender.com \
node examples/paid-call.mjs
```

The key is resolved as `BUYER_PRIVATE_KEY` → `KITE_SESSION_FILE` → auto-detect
(`./.kite-passport/sandbox/sessions.json`, `~/.kite-passport/sandbox/sessions.json`).

The script posts three distinct chat prompts, pays each one, and appends the
settlement records to `proof/paid-calls.jsonl`.

## Settlement records

> Generated 2026-09-24 01:55 (GMT+8) by `npm run selfpay`. Each row is one paid
> `POST /v1/chat` that settled on-chain (EIP-3009, 0.001 pieUSD each).
> Payer `0x92DF53ED56E3baCc6b9F2b1E10ACdA5355Fbf9C9` → payee `0x9e610Cd701472bF7C815a6404B6Ff88D81838C91`.
> Upstream model: `Qwen/Qwen3-8B` (SiliconFlow free tier, ¥0 in / ¥0 out).

| # | prompt | paid status | transaction hash |
|---|--------|-------------|-----------------|
| 1 | Say hello in exactly three words. | 200 | `0x2ad2f404624044fdcd894a56a7d3d8461f754d02f7626c5b2bbead0a3f57517e` |
| 2 | What is 7 times 6? Answer with the number only. | 200 | `0x9fd0f8c9aecb000a4035fb8e58f9ac230da830b06f267e1737147c96388c19d3` |
| 3 | Name a primary color. One word. | 200 | `0x4350fbcb8ad2027def8dfd7f33ebe4681954b08ae844deb740e8d2f7107a31d9` |

## Why a direct script instead of the dashboard CLI

`kpass session execute` refuses to pay this host client-side — Kite's
executable-service catalog does not yet list `kiteai-llm-x402.onrender.com`
(`sandbox_merchant_not_allowlisted`). This blocks only the official CLI path:
**any** buyer can still pay by signing the EIP-3009 authorization directly with
the `@x402` client SDK, which is exactly what `examples/paid-call.mjs` does.
Asking Kite to admit the host to the catalog would additionally enable the CLI.
The settlement is identical on-chain regardless of which client signed it.
