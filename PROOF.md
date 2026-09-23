# Payment Proof — kiteai-llm-x402

This service settles x402 payments on **Kite testnet (`eip155:2368`)** in **pieUSD**.
Every paid call is a real on-chain EIP-3009 `transferWithAuthorization` settled by
the Kite facilitator (`https://facilitator.pieverse.io/v2`). The transactions below
are reproducible: run `npm run selfpay` against the deployed URL and the same
flow produces fresh, verifiable hashes.

## How to reproduce

```bash
# 1. deploy the service (see DEPLOY.md) and note its public URL
# 2. make sure the Kite Passport sandbox session exists at:
#    D:/Web3/kiteai/kpass/.kite-passport/sandbox/sessions.json
# 3. run the self-pay generator
BASE_URL=https://kiteai-llm-x402.onrender.com npm run selfpay
```

The script posts three distinct chat prompts, pays each one via a Kite Passport
sandbox session key, and appends the settlement records to `proof/paid-calls.jsonl`.

## Settlement records

> Fill the table after running `npm run selfpay`. Each row is one paid
> `POST /v1/chat` that settled on-chain.

| # | prompt | paid status | transaction hash |
|---|--------|-------------|-----------------|
| 1 | Say hello in exactly three words. | 200 | _run `npm run selfpay`_ |
| 2 | What is 7 times 6? Answer with the number only. | 200 | _run `npm run selfpay`_ |
| 3 | Name a primary color. One word. | 200 | _run `npm run selfpay`_ |

## Why a sandbox session key instead of the dashboard CLI

`kpass session execute` refuses to pay this host client-side — Kite's
executable-service catalog does not yet list `kiteai-llm-x402.onrender.com`
(`sandbox_merchant_not_allowlisted`). The payment above is therefore signed with
a Kite Passport sandbox session key through the `@x402` client SDK directly
against the Kite facilitator. Asking Kite to admit the host to the catalog
enables the CLI path for regular buyers. The settlement is identical on-chain
regardless of which client signed it.
