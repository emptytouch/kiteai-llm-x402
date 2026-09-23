# Deploy to Render (free, no credit card)

1. Push this repo to GitHub (e.g. `emptytouch/kiteai-llm-x402`).
2. In Render, **New → Web Service**, connect the repo.
3. Settings (Render auto-detects Node, but set explicitly):
   - **Build command:** `npm install`
   - **Start command:** `npm start`
   - **Instance type:** Free
4. **Environment variables:**
   - `PAY_TO` = your Kite wallet (must match the address on the Bounty Dashboard)
   - `GROQ_API_KEY` = free key from https://console.groq.com/keys
   - `KITE_NETWORK` = `testnet`
   - `PRICE_USD` = `0.001` (optional)
   - `PORT` = leave unset (Render assigns)
5. Deploy. Your service is live at `https://kiteai-llm-x402.onrender.com`.

## After deploy

```bash
# verify liveness
curl -s https://kiteai-llm-x402.onrender.com/healthz

# generate ≥3 real paid-call proofs
BASE_URL=https://kiteai-llm-x402.onrender.com npm run selfpay
# then paste the tx hashes into PROOF.md
```

## Submit the weekly contribution

On the KiteAI Bounty Dashboard, connect your OKX wallet and submit the week with:
- Repository URL: `https://github.com/<you>/kiteai-llm-x402`
- This week's commit: the head of `main` after the above
- Completion notes: link to `PROOF.md` and the deployed URL
