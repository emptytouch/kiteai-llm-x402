/**
 * Self-pay proof generator for kiteai-llm-x402.
 *
 * x402 payments are signed with a Kite Passport sandbox session key (EIP-3009),
 * so this script reproduces the buyer side without a wallet UI. It posts a few
 * distinct chat prompts to the deployed service, pays each one, and records the
 * settlement tx hash to proof/paid-calls.jsonl — giving reviewers reproducible
 * evidence that the endpoint actually settles on-chain.
 *
 * Prereqs:
 *   - the service is deployed and BASE_URL points at it
 *   - the Kite Passport sandbox session exists at the path below
 *   - `npm install` has run (provides @x402/* and viem)
 *
 * Run:  BASE_URL=https://kiteai-llm-x402.onrender.com node examples/paid-call.mjs
 */
import { x402Client } from "@x402/core/client";
import { x402HTTPClient } from "@x402/core/http";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { toClientEvmSigner } from "@x402/evm";
import { privateKeyToAccount } from "viem/accounts";
import fs from "node:fs";
import path from "node:path";

const NET = "eip155:2368";
const ASSET = "0x38129cf4CE5E183eFF248F42A7D345Bb1B47621A"; // pieUSD
const BASE = (process.env.BASE_URL || "https://kiteai-llm-x402.onrender.com").replace(/\/$/, "");
const SESSION_FILE = "D:/Web3/kiteai/kpass/.kite-passport/sandbox/sessions.json";

const sess = JSON.parse(fs.readFileSync(SESSION_FILE, "utf8"));
const account = privateKeyToAccount(sess.sessions[sess.current_session_id].private_key);
console.log("payer address :", account.address);

const coreClient = x402Client.fromConfig({
  schemes: [{ network: NET, client: new ExactEvmScheme(toClientEvmSigner(account)) }],
  spendControls: { allowedAssets: [{ network: NET, asset: ASSET }] },
});
const client = new x402HTTPClient(coreClient);

const prompts = [
  "Say hello in exactly three words.",
  "What is 7 times 6? Answer with the number only.",
  "Name a primary color. One word.",
];

const url = `${BASE}/v1/chat`;
const headers0 = { "Content-Type": "application/json" };
const proofDir = path.join(process.cwd(), "proof");
fs.mkdirSync(proofDir, { recursive: true });
const outFile = path.join(proofDir, "paid-calls.jsonl");

const rows = [];
for (let i = 0; i < prompts.length; i++) {
  const chatBody = { messages: [{ role: "user", content: prompts[i] }], model: "Qwen/Qwen3-8B" };
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
