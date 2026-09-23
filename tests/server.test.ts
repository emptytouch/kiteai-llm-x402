import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { app } from "../src/index.js";
import { callLLM, DEFAULT_MODEL } from "../src/llm.js";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("GET /healthz", () => {
  it("returns 200 with network + model info", async () => {
    const r = await request(app).get("/healthz");
    expect(r.status).toBe(200);
    expect(r.body.ok).toBe(true);
    expect(r.body.network).toBe("eip155:2368");
    expect(Array.isArray(r.body.models)).toBe(true);
    expect(r.body.models).toContain(DEFAULT_MODEL);
  });
});

describe("GET /v1/models", () => {
  it("returns both paid tiers for free", async () => {
    const r = await request(app).get("/v1/models");
    expect(r.status).toBe(200);
    expect(r.body.models).toContain(DEFAULT_MODEL);
    expect(r.body.upstream).toMatch(/SiliconFlow|OpenAI/i);
    expect(r.body.tiers.standard.endpoint).toBe("POST /v1/chat");
    expect(r.body.tiers.pro.endpoint).toBe("POST /v1/chat/pro");
  });
});

describe("POST /v1/chat unpaid", () => {
  it("returns 402 with a PAYMENT-REQUIRED header", async () => {
    // The facilitator is a local mock (tests/setup.ts), so this exercises the
    // real x402 gate without outbound network.
    const r = await request(app)
      .post("/v1/chat")
      .send({ messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(402);
    expect(r.headers["payment-required"]).toBeTruthy();
  });
});

describe("tiered pricing", () => {
  const decodeAmount = (header: unknown): string => {
    const decoded = JSON.parse(Buffer.from(String(header), "base64").toString("utf8"));
    return String(decoded.accepts[0].amount);
  };

  it("gates the pro tier behind its own 402", async () => {
    const r = await request(app)
      .post("/v1/chat/pro")
      .send({ messages: [{ role: "user", content: "hi" }] });
    expect(r.status).toBe(402);
    expect(r.headers["payment-required"]).toBeTruthy();
  });

  it("charges more on the pro tier than the standard tier", async () => {
    const std = await request(app)
      .post("/v1/chat")
      .send({ messages: [{ role: "user", content: "hi" }] });
    const pro = await request(app)
      .post("/v1/chat/pro")
      .send({ messages: [{ role: "user", content: "hi" }] });
    const stdAmount = decodeAmount(std.headers["payment-required"]);
    const proAmount = decodeAmount(pro.headers["payment-required"]);
    expect(BigInt(proAmount)).toBeGreaterThan(BigInt(stdAmount));
  });
});

describe("callLLM", () => {
  it("forwards to the upstream and returns the JSON payload", async () => {
    const fakeRes = {
      ok: true,
      status: 200,
      json: async () => ({ id: "chatcmpl-1", choices: [{ message: { role: "assistant", content: "hello" } }] }),
    };
    vi.stubGlobal("fetch", vi.fn(async () => fakeRes));
    const out = (await callLLM(
      { messages: [{ role: "user", content: "hi" }], model: DEFAULT_MODEL },
      { apiKey: "dummy-key" },
    )) as { id: string };
    expect(out.id).toBe("chatcmpl-1");
  });

  it("throws on a non-OK upstream response", async () => {
    const fakeRes = { ok: false, status: 429, json: async () => ({ error: "rate limited" }) };
    vi.stubGlobal("fetch", vi.fn(async () => fakeRes));
    await expect(
      callLLM({ messages: [{ role: "user", content: "hi" }], model: DEFAULT_MODEL }, { apiKey: "dummy-key" }),
    ).rejects.toThrow(/upstream 429/);
  });
});
