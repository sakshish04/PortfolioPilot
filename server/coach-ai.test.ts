/**
 * Coach/report AI hardening tests. The provider is ALWAYS a stub: global `fetch` is
 * replaced, every URL and credential below is a placeholder, and nothing leaves the
 * machine. These do not exercise a real provider.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRepository, AppUserRow } from "./app-repository";
import { buildMinimalCoachContext, sessionTokenHash } from "./app-security";
import { DEMO_PERSONAS } from "../client/src/data/demo";
import { createEmptyPortfolioState, type PortfolioState } from "../shared/portfolio";

const realFetch = globalThis.fetch;
const BASE = "https://llm.test.invalid";
const KEY = "test-only-placeholder-key";
const QUESTION = "How diversified is my portfolio?";
const persona = DEMO_PERSONAS[0].state;
const context = buildMinimalCoachContext(persona);

type Call = {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
  signal: AbortSignal | null | undefined;
};
type Responder = (call: Call) => Response | Promise<Response>;

function installFetch(responder: Responder) {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      method: init?.method ?? "GET",
      headers: (init?.headers ?? {}) as Record<string, string>,
      body: typeof init?.body === "string" ? init.body : undefined,
      signal: init?.signal,
    };
    calls.push(call);
    return Promise.resolve(responder(call));
  });
  return calls;
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });
const modelsOk = () =>
  json({ object: "list", data: [{ id: "gpt-5-mini", object: "model", created: 0, owned_by: "x" }] });
const chatOk = (content: unknown = "Stubbed answer") =>
  json({ choices: [{ message: { content } }] });
const isModels = (c: Call) => c.url.endsWith("/v1/models");
const isChat = (c: Call) => c.url.endsWith("/v1/chat/completions");
/** A request that never completes on its own and only ends when it is aborted. */
const hang = (c: Call) =>
  new Promise<Response>((_, reject) =>
    c.signal!.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")))
  );

// ---------------------------------------------------------------------------
// callManagedModel, called directly with fake timers
// ---------------------------------------------------------------------------
describe("Coach AI provider calls (stubbed provider, fake timers)", () => {
  let logs: string[];

  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetModules();
    vi.stubEnv("MANUS_API_URL", BASE);
    vi.stubEnv("MANUS_API_KEY", KEY);
    logs = [];
    for (const level of ["warn", "error", "log", "info"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  // callManagedModel lazily imports ./_core/llm (real I/O, which fake timers do not
  // cover). Importing it first makes that later import resolve from cache, so
  // advancing fake time reaches the timers created by the request.
  const load = async () => {
    const { callManagedModel } = await import("./app-api");
    await import("./_core/llm");
    return callManagedModel;
  };

  /** Starts a call and reports whether it has settled, so timing can be asserted. */
  async function start(kind: "coach" | "report" = "coach") {
    const callManagedModel = await load();
    const state = { settled: false, value: undefined as string | null | undefined };
    const promise = callManagedModel(kind, kind === "coach" ? QUESTION : "", context).then(v => {
      state.settled = true;
      state.value = v;
      return v;
    });
    return { promise, state };
  }
  const tick = (ms: number) => vi.advanceTimersByTimeAsync(ms);

  it("succeeds: discovery then chat, with placeholder URLs, bearer header and a trimmed answer", async () => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : chatOk("  Stubbed answer  ")));
    const { promise } = await start();
    expect(await promise).toBe("Stubbed answer");
    expect(calls.map(c => `${c.method} ${c.url}`)).toEqual([
      `GET ${BASE}/v1/models`,
      `POST ${BASE}/v1/chat/completions`,
    ]);
    expect(calls.every(c => c.headers.authorization === `Bearer ${KEY}`)).toBe(true);
    const body = JSON.parse(calls[1]!.body!);
    expect(body.model).toBe("gpt-5-mini");
    expect(body.max_completion_tokens).toBe(1200);
    expect(body.reasoning).toEqual({ effort: "low" });
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["system", "user"]);
    expect(calls.every(c => c.signal instanceof AbortSignal)).toBe(true);
  });

  it("caps the answer at 800 characters and joins text parts of array content", async () => {
    installFetch(c => (isModels(c) ? modelsOk() : chatOk("x".repeat(2000))));
    expect((await (await start()).promise)!.length).toBe(800);
    vi.unstubAllGlobals();
    vi.resetModules();
    installFetch(c =>
      isModels(c) ? modelsOk() : chatOk([{ type: "text", text: "A" }, { type: "image" }, { type: "text", text: "B" }])
    );
    expect(await (await start()).promise).toBe("A B");
  });

  it("uses the next preferred model with the matching token parameter, and stays off when none is offered", async () => {
    const calls = installFetch(c =>
      isModels(c) ? json({ data: [{ id: "gemini-3-flash-preview" }] }) : chatOk()
    );
    expect(await (await start()).promise).toBe("Stubbed answer");
    const body = JSON.parse(calls[1]!.body!);
    expect(body.model).toBe("gemini-3-flash-preview");
    expect(body.max_tokens).toBe(1000);
    expect(body.max_completion_tokens).toBeUndefined();

    vi.unstubAllGlobals();
    vi.resetModules();
    const none = installFetch(c => (isModels(c) ? json({ data: [{ id: "other-model" }] }) : chatOk()));
    const callManagedModel = await load();
    expect(await callManagedModel("coach", QUESTION, context)).toBeNull();
    expect(await callManagedModel("coach", QUESTION, context)).toBeNull();
    expect(none.map(isModels)).toEqual([true]); // no chat call, and the empty result is cached
  });

  it("sends the question and a numeric summary only: no identity, holding or goal names", async () => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : chatOk()));
    await (await start("coach")).promise;
    const outbound = calls[1]!.body!;
    expect(outbound).toContain(QUESTION);
    const forbidden = [
      persona.profile.name,
      persona.profile.employment,
      ...persona.holdings.map(h => h.name),
      ...persona.goals.map(g => g.name),
    ].filter(s => s && s.length >= 5);
    expect(forbidden.length).toBeGreaterThan(5);
    for (const text of forbidden) expect(outbound).not.toContain(text);

    vi.unstubAllGlobals();
    vi.resetModules();
    const reportCalls = installFetch(c => (isModels(c) ? modelsOk() : chatOk()));
    await (await start("report")).promise;
    const reportBody = reportCalls[1]!.body!;
    expect(reportBody).not.toContain(QUESTION);
    expect(reportBody).not.toContain("The account user asks");
    for (const text of forbidden) expect(reportBody).not.toContain(text);
  });

  it.each([500, 401, 429])("chat HTTP %i falls back after exactly one attempt (no chat retry)", async status => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : json({ error: "nope" }, status)));
    expect(await (await start()).promise).toBeNull();
    expect(calls.filter(isChat)).toHaveLength(1);
    expect(calls.filter(isModels)).toHaveLength(1);
  });

  it("chat network error falls back after one attempt", async () => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : Promise.reject(new TypeError("fetch failed")) as never));
    expect(await (await start()).promise).toBeNull();
    expect(calls.filter(isChat)).toHaveLength(1);
  });

  it("discovery 503 is retried exactly once, then falls back without a chat call", async () => {
    const calls = installFetch(() => json({ error: "down" }, 503));
    const { promise } = await start();
    await tick(500);
    expect(await promise).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls.every(isModels)).toBe(true);
  });

  it("discovery recovers if the single retry succeeds", async () => {
    let n = 0;
    const calls = installFetch(c => (isModels(c) ? (++n === 1 ? json({}, 503) : modelsOk()) : chatOk("Recovered")));
    const { promise } = await start();
    await tick(500);
    expect(await promise).toBe("Recovered");
    expect(calls.filter(isModels)).toHaveLength(2);
  });

  it("discovery 4xx (other than 429) is not retried", async () => {
    for (const status of [400, 401, 403, 404]) {
      vi.unstubAllGlobals();
      vi.resetModules();
      const calls = installFetch(() => json({ error: "no" }, status));
      expect(await (await start()).promise).toBeNull();
      expect(calls).toHaveLength(1);
    }
  });

  it("caps a huge Retry-After at 1 second", async () => {
    const calls = installFetch(() => json({}, 503, { "retry-after": "120" }));
    const { promise, state } = await start();
    await tick(999);
    expect(calls).toHaveLength(1);
    expect(state.settled).toBe(false);
    await tick(1);
    expect(calls).toHaveLength(2);
    expect(await promise).toBeNull();
  });

  it.each([
    ["models body is not JSON", (c: Call) => (isModels(c) ? new Response("<html>oops</html>") : chatOk())],
    ["chat body is not JSON", (c: Call) => (isModels(c) ? modelsOk() : new Response("<html>oops</html>"))],
    ["models JSON is null", (c: Call) => (isModels(c) ? json(null) : chatOk())],
    ["chat JSON is null", (c: Call) => (isModels(c) ? modelsOk() : json(null))],
    ["chat has no choices", (c: Call) => (isModels(c) ? modelsOk() : json({}))],
    ["chat choices is empty", (c: Call) => (isModels(c) ? modelsOk() : json({ choices: [] }))],
    ["chat content is empty", (c: Call) => (isModels(c) ? modelsOk() : chatOk(""))],
    ["chat content is whitespace", (c: Call) => (isModels(c) ? modelsOk() : chatOk("   "))],
    ["chat content has no text part", (c: Call) => (isModels(c) ? modelsOk() : chatOk([{ type: "image" }]))],
    ["chat content is a number", (c: Call) => (isModels(c) ? modelsOk() : chatOk(123))],
  ])("falls back when %s", async (_name, responder) => {
    const calls = installFetch(responder as Responder);
    expect(await (await start()).promise).toBeNull();
    expect(calls.length).toBeLessThanOrEqual(2); // a malformed reply is never retried
  });

  it("times out a hanging chat call at 15 s and aborts it", async () => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : hang(c)));
    const { promise, state } = await start();
    await tick(14_999);
    expect(state.settled).toBe(false);
    await tick(1);
    expect(await promise).toBeNull();
    const chat = calls.find(isChat)!;
    expect(chat.signal!.aborted).toBe(true);
    expect(calls.filter(isChat)).toHaveLength(1);
  });

  it("times out a stalled response body, not just the connection", async () => {
    installFetch(c => {
      if (isModels(c)) return modelsOk();
      const stalled = new ReadableStream({ start() {} }); // headers arrive, body never does
      return new Response(stalled, { status: 200 });
    });
    const { promise, state } = await start();
    await tick(14_999);
    expect(state.settled).toBe(false);
    await tick(1);
    expect(await promise).toBeNull();
  });

  it("bounds a hanging discovery call to two 4 s attempts plus one short delay (at most 9 s)", async () => {
    const random = vi.spyOn(Math, "random").mockReturnValue(0); // shortest delay: 250 ms
    const calls = installFetch(hang);
    const { promise, state } = await start();
    await tick(8_249);
    expect(state.settled).toBe(false);
    await tick(1);
    expect(await promise).toBeNull();
    expect(calls).toHaveLength(2);
    expect(calls.every(c => c.signal!.aborted)).toBe(true);

    vi.unstubAllGlobals();
    vi.resetModules();
    random.mockReturnValue(1); // longest delay: 500 ms
    installFetch(hang);
    const slow = await start();
    await tick(9_000);
    expect(slow.state.settled).toBe(true);
  });

  it("pauses AI for 60 s after a failure, then tries again", async () => {
    const calls = installFetch(c => (isModels(c) ? modelsOk() : json({}, 500)));
    const callManagedModel = await load();
    expect(await callManagedModel("coach", QUESTION, context)).toBeNull();
    const after = calls.length;
    expect(await callManagedModel("coach", QUESTION, context)).toBeNull();
    expect(calls).toHaveLength(after); // cooling down: no outbound request
    await tick(60_001);
    await callManagedModel("coach", QUESTION, context);
    expect(calls.length).toBeGreaterThan(after);
  });

  it("makes no request when the URL or the key is not configured", async () => {
    for (const [url, key] of [["", KEY], [BASE, ""], ["", ""]]) {
      vi.stubEnv("MANUS_API_URL", url!);
      vi.stubEnv("MANUS_API_KEY", key!);
      vi.resetModules();
      const calls = installFetch(() => modelsOk());
      expect(await (await start()).promise).toBeNull();
      expect(calls).toHaveLength(0);
      vi.unstubAllGlobals();
    }
  });

  it("logs no provider body, prompt text, portfolio detail or credential", async () => {
    installFetch(c => (isModels(c) ? modelsOk() : json({ echoed: "ECHOED-PROVIDER-BODY" }, 500)));
    await (await start()).promise;
    installFetch(() => json({ echoed: "ECHOED-PROVIDER-BODY" }, 503));
    vi.resetModules();
    const retried = await start();
    await tick(2_000);
    await retried.promise;
    const all = logs.join("\n");
    expect(all.length).toBeGreaterThan(0); // something was logged, so the check is meaningful
    for (const secret of [KEY, QUESTION, "ECHOED-PROVIDER-BODY", persona.profile.name]) {
      expect(all).not.toContain(secret);
    }
  });
});

// ---------------------------------------------------------------------------
// The real HTTP route: consent gating and "unconfigured" never reach the network
// ---------------------------------------------------------------------------
describe("Coach/report routes make no outbound request without configuration or consent", () => {
  const TOKEN = "T".repeat(43);

  function seededRepository(state: PortfolioState): AppRepository {
    const now = new Date();
    const user = {
      id: 1, openId: "email_test", name: "Test User", email: "test@example.com",
      loginMethod: "email", passwordHash: "unused", role: "user",
      createdAt: now, updatedAt: now, lastSignedIn: now,
    } as AppUserRow;
    const session = {
      id: "s1", userId: 1, tokenHash: sessionTokenHash(TOKEN),
      expiresAt: new Date(Date.now() + 3_600_000), createdAt: now, revokedAt: null,
    };
    return {
      async findActiveSession(hash: string) {
        return hash === session.tokenHash ? { ...session, user } : null;
      },
      async getState() {
        return structuredClone(state);
      },
    } as unknown as AppRepository;
  }

  async function boot(state: PortfolioState) {
    vi.resetModules(); // fresh model cache and rate-limit budgets for every test
    const { createPortfolioAppRouter } = await import("./app-api");
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use("/api/app", createPortfolioAppRouter(seededRepository(state)));
    const server: Server = await new Promise(resolve => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const post = (path: string, body: unknown) =>
      realFetch(`${base}/api/app${path}`, {
        method: "POST",
        headers: { Origin: base, "Content-Type": "application/json", Cookie: `pp_session=${TOKEN}` },
        body: JSON.stringify(body),
      });
    return { post, close: () => new Promise<void>(r => server.close(() => r())) };
  }

  function stateWith(coach: boolean, report: boolean) {
    const state = createEmptyPortfolioState("Test User");
    state.preferences.aiCoachConsent = coach;
    state.preferences.aiReportConsent = report;
    return state;
  }

  /** Traps every non-localhost request; localhost passes through to the real server. */
  function trapOutbound() {
    const outbound: string[] = [];
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://localhost")) return realFetch(input, init);
      outbound.push(url);
      return Promise.resolve(url.endsWith("/v1/models") ? modelsOk() : chatOk("Routed AI answer"));
    });
    return outbound;
  }

  beforeEach(() => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  const configure = () => {
    vi.stubEnv("MANUS_API_URL", BASE);
    vi.stubEnv("MANUS_API_KEY", KEY);
  };

  it("positive control: with configuration and both consents the stub IS reached", async () => {
    configure();
    const outbound = trapOutbound();
    const { post, close } = await boot(stateWith(true, true));
    try {
      const res = await post("/coach", { question: QUESTION, aiConsent: true });
      expect(await res.json()).toEqual({ answer: "Routed AI answer", source: "ai" });
      expect(outbound.length).toBe(2);
    } finally {
      await close();
    }
  });

  it("unconfigured: no outbound request even with both consents", async () => {
    vi.stubEnv("MANUS_API_URL", "");
    vi.stubEnv("MANUS_API_KEY", "");
    const outbound = trapOutbound();
    const { post, close } = await boot(stateWith(true, true));
    try {
      const coach = await (await post("/coach", { question: QUESTION, aiConsent: true })).json();
      const report = await (await post("/report-commentary", { aiConsent: true })).json();
      expect(coach.source).toBe("deterministic");
      expect(report.source).toBe("deterministic");
      expect(outbound).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("no per-request consent: no outbound request even when the saved preference is on", async () => {
    configure();
    const outbound = trapOutbound();
    const { post, close } = await boot(stateWith(true, true));
    try {
      expect((await (await post("/coach", { question: QUESTION, aiConsent: false })).json()).source).toBe("deterministic");
      expect((await (await post("/report-commentary", { aiConsent: false })).json()).source).toBe("deterministic");
      expect(outbound).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("no saved preference: no outbound request even when the request asks for AI", async () => {
    configure();
    const outbound = trapOutbound();
    const { post, close } = await boot(stateWith(false, false));
    try {
      expect((await (await post("/coach", { question: QUESTION, aiConsent: true })).json()).source).toBe("deterministic");
      expect((await (await post("/report-commentary", { aiConsent: true })).json()).source).toBe("deterministic");
      expect(outbound).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("the report route needs its own saved consent: Coach consent alone is not enough", async () => {
    configure();
    const outbound = trapOutbound();
    const { post, close } = await boot(stateWith(true, false));
    try {
      expect((await (await post("/report-commentary", { aiConsent: true })).json()).source).toBe("deterministic");
      expect(outbound).toHaveLength(0);
    } finally {
      await close();
    }
  });

  it("a failing provider still returns the deterministic answer through the route", async () => {
    configure();
    vi.stubGlobal("fetch", (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.startsWith("http://localhost")) return realFetch(input, init);
      return Promise.resolve(url.endsWith("/v1/models") ? modelsOk() : json({ error: "boom" }, 500));
    });
    const { post, close } = await boot(stateWith(true, true));
    try {
      const res = await post("/coach", { question: QUESTION, aiConsent: true });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.source).toBe("deterministic");
      expect(body.answer.length).toBeGreaterThan(0);
    } finally {
      await close();
    }
  });
});
