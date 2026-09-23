/**
 * Self-pay buyer client for kiteai-llm-x402.
 *
 * x402 payments are signed with an EIP-3009 authorization, so this script
 * reproduces the buyer side without a wallet UI: it posts chat prompts to the
 * deployed service, pays each one, and records the settlement tx hash to
 * proof/paid-calls.jsonl — reproducible evidence that the endpoint really
 * settles on-chain.
 *
 * It is deliberately agnostic about *who* pays: any Kite testnet key holding
 * pieUSD works, so a reviewer can run this themselves instead of trusting a
 * screenshot.
 *
 * Key resolution order:
 *   1. BUYER_PRIVATE_KEY  — raw hex key (0x...); simplest for automation/CI
 *   2. KITE_SESSION_FILE  — explicit path to a Kite Passport sandbox sessions.json
 *   3. auto-detect        — ./.kite-passport/..., ~/.kite-passport/..., legacy path
 *
 * Prereqs:
 *   - the service is deployed and BASE_URL points at it
 *   - the paying key holds testnet pieUSD on eip155:2368
 *   - `npm install` has run (provides @x402/* and viem)
 *
 * Run:
 *   BUYER_PRIVATE_KEY=0x... node examples/paid-call.mjs
 *   KITE_SESSION_FILE=/path/to/sessions.json node examples/paid-call.mjs
 *   npm run selfpay                      (uses an auto-detected sandbox session)
 *   PROMPT="one custom prompt" npm run selfpay
 */
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const NET = "eip155:2368";
const ASSET = "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A"; // pieUSD
const BASE = (process.env.BASE_URL || "https://kiteai-llm-x402.onrender.com").replace(/\/$/, "");

const norm = (k) => (k.startsWith("0x") ? k : `0x${k}`);

function resolvePrivateKey() {
  const raw = (process.env.BUYER_PRIVATE_KEY || "").trim();
  if (raw) return norm(raw);

  const candidates = [];
  if (process.env.KITE_SESSION_FILE) candidates.push(process.env.KITE_SESSION_FILE);
  candidates.push(
    path.join(process.cwd(), ".kite-passport", "sandbox", "sessions.json"),
    path.join(os.homedir(), ".kite-passport", "sandbox", "sessions.json"),
    "D:/Web3/kiteai/kpass/.kite-passport/sandbox/sessions.json", // legacy dev-machine location
  );

  for (const file of candidates) {
    if (!file || !fs.existsSync(file)) continue;
    try {
      const sess = JSON.parse(fs.readFileSync(file, "utf8"));
      const pk = sess?.sessions?.[sess.current_session_id]?.private_key;
      if (pk) {
        console.log("session file :", file);
        return norm(pk);
      }
    } catch {
      /* try the next candidate */
    }
  }

  throw new Error(
    "No buyer key found.\n" +
      "  Set BUYER_PRIVATE_KEY=0x<hex>  (a Kite testnet key holding pieUSD), or\n" +
      "  Set KITE_SESSION_FILE=/path/to/sessions.json  (Kite Passport sandbox session).\n" +
      "  Searched: " +
      candidates.join(", "),
  );
}

const account = privateKeyToAccount(resolvePrivateKey());
console.log("payer address :", account.address);

const coreClient = x402Client.fromConfig({
  schemes: [{ network: NET, client: new ExactEvmScheme(toClientEvmSigner(account)) }],
  spendControls: { allowedAssets: [{ network: NET, asset: ASSET }] },
});
const client = new x402HTTPClient(coreClient);

// NOTE: deliberately not `PROMPT` — Windows exports a PROMPT variable ($P$G)
// that Git Bash inherits, which would silently override these defaults.
const prompts = process.env.CHAT_PROMPT
  ? [process.env.CHAT_PROMPT]
  : [
      "Say hello in exactly three words.",
      "What is 7 times 6? Answer with the number only.",
      "Name a primary color. One word.",
    ];

// Two independently priced tiers; TIER=pro targets the pricier reasoning endpoint.
const tier = (process.env.TIER || "standard").toLowerCase();
const endpoint = tier === "pro" ? "/v1/chat/pro" : "/v1/chat";
const url = `${BASE}${endpoint}`;
const headers0 = { "Content-Type": "application/json" };
const proofDir = path.join(process.cwd(), "proof");
fs.mkdirSync(proofDir, { recursive: true });
const outFile = path.join(proofDir, "paid-calls.jsonl");

const rows = [];
for (let i = 0; i < prompts.length; i++) {
  // Omit `model` so the server applies the tier's default model.
  const chatBody = { messages: [{ role: "user", content: prompts[i] }] };
  console.log(`\n================ call ${i + 1} :: ${prompts[i]}`);

  const r1 = await fetch(url, { method: "POST", headers: headers0, body: JSON.stringify(chatBody) });
  console.log("unpaid status:", r1.status);
  const pr = client.getPaymentRequiredResponse((n) => r1.headers.get(n));
  const payload = await client.createPaymentPayload(pr);
  const a = payload?.payload?.authorization;
  console.log("authorization:", a ? `${a.from} -> ${a.to} value=${a.value}` : "(n/a)");

  const paid = await fetch(url, {
    method: "POST",
    headers: { ...headers0, ...client.encodePaymentSignatureHeader(payload) },
    body: JSON.stringify(chatBody),
  });
  console.log("PAID status  :", paid.status);
  let settle = null;
  try {
    settle = client.getPaymentSettleResponse((n) => paid.headers.get(n));
  } catch (e) {
    console.log("settle parse err:", e.message);
  }
  const txt = await paid.text();
  console.log("body         :", txt.slice(0, 200));

  const record = {
    url,
    method: "POST",
    prompt: prompts[i],
    unpaid_status: r1.status,
    accepts: pr.accepts,
    authorization: a || null,
    paid_status: paid.status,
    settlement: settle,
    body: txt,
  };
  fs.appendFileSync(outFile, JSON.stringify(record) + "\n");
  rows.push({ prompt: prompts[i], status: paid.status, tx: settle?.transaction ?? "(none)" });
}

console.log("\n================ SUMMARY");
console.log("| prompt | status | tx |");
console.log("| --- | --- | --- |");
for (const r of rows) console.log(`| ${r.prompt} | ${r.status} | ${r.tx} |`);
console.log(`\nWrote ${rows.length} records to ${outFile}`);
