# Deploy to Render (free, no credit card)

1. Push this repo to GitHub (e.g. `emptytouch/kiteai-llm-x402`).
2. In Render, **New → Web Service**, connect the repo.
3. Settings (the Dockerfile is auto-detected; uniform Docker runtime across all x402 services):
   - **Runtime:** Docker (Dockerfile present)
   - **Instance type:** Free
4. **Environment variables:**
   - `PAY_TO` = your Kite wallet (must match the address on the Bounty Dashboard)
   - `LLM_API_KEY` = free key from https://siliconflow.cn (card-free, free quota)
   - `LLM_BASE_URL` = `https://api.siliconflow.cn/v1` (default; any OpenAI-compatible URL)
   - `LLM_MODEL` = `Qwen/Qwen3-8B` (default; SiliconFlow 9B 以下为**永久免费档，单价 ¥0**；也可换任意模型 id)
   - `KITE_NETWORK` = `testnet`
   - `PRICE_USD` = `0.001` (optional; standard tier)
   - `PRICE_USD_PRO` = `0.01` (optional; pro tier)
   - `LLM_MODEL_PRO` = `deepseek-ai/DeepSeek-R1-0528-Qwen3-8B` (optional; pro tier reasoning model)
   - `PORT` = leave unset (Render assigns)
5. Deploy. Your service is live at `https://kiteai-llm-x402.onrender.com`.

> Note: services created via the Render REST API do **not** get a GitHub webhook,
> so pushing does **not** auto-deploy. After each push, trigger a build manually
> with `POST /v1/services/{serviceId}/deploys` (see the `render-x402-deploy` skill).

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
