/**
 * HTTP-level tests for the local email/password API (`/api/app/*`).
 *
 * IMPORTANT: these use an IN-MEMORY stand-in for `AppRepository`, injected through
 * the router's existing `repository` parameter. They verify route, validation,
 * cookie, CSRF/origin, isolation and rate-limit logic. They do NOT verify MySQL,
 * the SQL in `app-repository.ts`, real persistence across restarts, or browser
 * cookie behaviour. Those remain pending a configured database.
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { createPortfolioAppRouter, type CoachAI } from "./app-api";
import type {
  ActiveSession,
  AppRepository,
  AppUserRow,
  SessionRow,
} from "./app-repository";
import { sessionTokenHash } from "./app-security";
import { createEmptyPortfolioState, type PortfolioState } from "../shared/portfolio";
import { createMemoryRepository } from "./test-memory-repository";

// ---------------------------------------------------------------------------
// Test server and client helpers
// ---------------------------------------------------------------------------
async function startServer(repo: AppRepository, ai?: CoachAI) {
  const app = express();
  // Same body-parser settings as server/_core/index.ts.
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "256kb", extended: true, parameterLimit: 1000 }));
  app.use("/api/app", createPortfolioAppRouter(repo, ai));
  const server: Server = await new Promise(resolve => {
    const s = app.listen(0, "127.0.0.1", () => resolve(s));
  });
  const base = `http://localhost:${(server.address() as AddressInfo).port}`;
  return { base, close: () => new Promise<void>(r => server.close(() => r())) };
}

type CallOptions = {
  body?: unknown;
  cookie?: string;
  headers?: Record<string, string>;
  /** Send no Origin / Sec-Fetch-Site (for CSRF negative tests). */
  noOrigin?: boolean;
};
const sessionCookie = (res: Response) =>
  res.headers.getSetCookie().find(c => c.startsWith("pp_session=")) ?? null;
const tokenOf = (setCookie: string | null) => setCookie?.split(";")[0]?.slice("pp_session=".length) ?? "";

describe("local /api/app authentication over HTTP (in-memory repository)", () => {
  const mem = createMemoryRepository();
  let base = "";
  let close: () => Promise<void>;
  const coachAi = vi.fn<Parameters<CoachAI>, ReturnType<CoachAI>>();

  const call = (method: string, path: string, opts: CallOptions = {}) =>
    fetch(`${base}/api/app${path}`, {
      method,
      headers: {
        ...(opts.noOrigin ? {} : { Origin: base }),
        ...(opts.body !== undefined || method === "POST"
          ? { "Content-Type": "application/json" }
          : {}),
        ...(opts.cookie ? { Cookie: `pp_session=${opts.cookie}` } : {}),
        ...opts.headers,
      },
      body:
        opts.body === undefined
          ? method === "POST"
            ? "{}"
            : undefined
          : JSON.stringify(opts.body),
    });

  beforeAll(async () => {
    const started = await startServer(mem.repo, coachAi);
    base = started.base;
    close = started.close;
  });
  afterAll(async () => {
    await close();
  });

  const alice = { name: "Alice Rao", email: "Alice@Example.com", password: "correct horse battery" };
  const bob = { name: "Bob Iyer", email: "bob@example.com", password: "another long passphrase" };
  let aliceToken = "";
  let aliceToken2 = "";
  let bobToken = "";

  it("returns a null session and no-store headers to anonymous visitors, and blocks private routes", async () => {
    const res = await call("GET", "/session");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ user: null, state: null });
    expect(res.headers.get("cache-control")).toMatch(/no-store/);
    expect((await call("GET", "/state")).status).toBe(401);
    expect((await call("GET", "/sessions")).status).toBe(401);
  });

  it("registers an account: secure cookie, hashed secrets, lower-cased email, empty (non-demo) state", async () => {
    const res = await call("POST", "/register", { body: alice });
    expect(res.status).toBe(201);
    const setCookie = sessionCookie(res);
    expect(setCookie).toMatch(/HttpOnly/);
    expect(setCookie).toMatch(/Secure/);
    expect(setCookie).toMatch(/SameSite=None/);
    expect(setCookie).toMatch(/Partitioned/);
    expect(setCookie).toMatch(/Max-Age=2592000/);
    aliceToken = tokenOf(setCookie);
    expect(aliceToken).toMatch(/^[A-Za-z0-9_-]{40,100}$/);

    const body = await res.json();
    expect(body.user).toEqual({ id: 1, name: "Alice Rao", email: "alice@example.com" });
    expect(JSON.stringify(body)).not.toMatch(/passwordHash|openId|scrypt/);
    expect(body.state.holdings).toEqual([]);
    expect(body.state.goals).toEqual([]);
    expect(body.state.dataOrigin).toBe("account");

    const stored = mem.users.get(1)!;
    expect(stored.passwordHash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{128}$/);
    expect(stored.passwordHash).not.toContain(alice.password);
    expect(stored.openId).toMatch(/^email_[0-9a-f]{48}$/);
    // The session token is stored only as a SHA-256 hash.
    expect(mem.sessions[0]!.tokenHash).toBe(sessionTokenHash(aliceToken));
    expect(JSON.stringify(mem.sessions)).not.toContain(aliceToken);
  });

  it("rejects bad registrations (duplicate email in any case, weak password, unknown fields)", async () => {
    const dup = await call("POST", "/register", { body: { ...alice, email: "ALICE@example.com" } });
    expect(dup.status).toBe(409);
    expect(sessionCookie(dup)).toBeNull();
    expect(mem.users.size).toBe(1);

    const weak = await call("POST", "/register", {
      body: { name: "Weak Pass", email: "weak@example.com", password: "short-11-ch" },
    });
    expect(weak.status).toBe(400);
    const extra = await call("POST", "/register", {
      body: { name: "Extra Field", email: "extra@example.com", password: "long enough password", role: "admin" },
    });
    expect(extra.status).toBe(400);
    expect(mem.users.size).toBe(1);
  });

  it("restores a session from the cookie, and treats unknown, malformed or expired tokens as signed out", async () => {
    const ok = await (await call("GET", "/session", { cookie: aliceToken })).json();
    expect(ok.user.email).toBe("alice@example.com");
    expect(ok.state.dataOrigin).toBe("account");

    const unknown = await call("GET", "/session", { cookie: "A".repeat(43) });
    expect(await unknown.json()).toEqual({ user: null, state: null });
    expect(sessionCookie(unknown)).toMatch(/Max-Age=0/);

    const malformed = await call("GET", "/session", { cookie: "bad token;" });
    expect(await malformed.json()).toEqual({ user: null, state: null });

    const expiredToken = "E".repeat(43);
    await mem.repo.createSession(1, "expired-session", sessionTokenHash(expiredToken), new Date(Date.now() - 1000));
    const expired = await call("GET", "/session", { cookie: expiredToken });
    expect(await expired.json()).toEqual({ user: null, state: null });
  });

  it("logs in with correct credentials and gives identical errors for a wrong password and an unknown email", async () => {
    const res = await call("POST", "/login", { body: { email: "ALICE@example.com", password: alice.password } });
    expect(res.status).toBe(200);
    aliceToken2 = tokenOf(sessionCookie(res));
    expect(aliceToken2).not.toBe(aliceToken);
    expect((await res.json()).user.email).toBe("alice@example.com");
    expect((await call("GET", "/sessions", { cookie: aliceToken })).status).toBe(200);

    const wrong = await call("POST", "/login", { body: { email: alice.email, password: "not the password" } });
    const unknown = await call("POST", "/login", { body: { email: "nobody@example.com", password: "not the password" } });
    expect(wrong.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(await wrong.json()).toEqual(await unknown.json());
    expect(sessionCookie(wrong)).toBeNull();

    expect((await call("POST", "/login", { body: { email: "not-an-email", password: "x" } })).status).toBe(400);
  });

  it("logs out: revokes only that session, clears the cookie, and tolerates a missing cookie", async () => {
    const res = await call("POST", "/logout", { cookie: aliceToken2 });
    expect(res.status).toBe(200);
    expect(sessionCookie(res)).toMatch(/Max-Age=0/);
    expect(await (await call("GET", "/session", { cookie: aliceToken2 })).json()).toEqual({ user: null, state: null });
    expect((await call("GET", "/state", { cookie: aliceToken2 })).status).toBe(401);
    // The first session is untouched.
    expect((await (await call("GET", "/session", { cookie: aliceToken })).json()).user.email).toBe("alice@example.com");
    expect((await call("POST", "/logout")).status).toBe(200);
  });

  it("saves validated state per account, forces dataOrigin to account, and isolates accounts", async () => {
    const reg = await call("POST", "/register", { body: bob });
    expect(reg.status).toBe(201);
    bobToken = tokenOf(sessionCookie(reg));

    const aliceState = createEmptyPortfolioState("Alice Rao", "demo");
    aliceState.profile.age = 31;
    const put = await call("PUT", "/state", { cookie: aliceToken, body: { state: aliceState } });
    expect(put.status).toBe(200);
    const saved = (await put.json()).state;
    expect(saved.profile.age).toBe(31);
    expect(saved.dataOrigin).toBe("account"); // client-supplied "demo" is overridden

    const bobState = (await (await call("GET", "/state", { cookie: bobToken })).json()).state;
    expect(bobState.profile.age).toBeNull();
    expect(bobState.profile.name).toBe("Bob Iyer");
    expect((await (await call("GET", "/state", { cookie: aliceToken })).json()).state.profile.age).toBe(31);

    const invalid = createEmptyPortfolioState("Alice Rao");
    invalid.profile.age = 12; // below the server's 18 minimum
    const bad = await call("PUT", "/state", { cookie: aliceToken, body: { state: invalid } });
    expect(bad.status).toBe(400);
    expect((await call("PUT", "/state", { body: { state: aliceState } })).status).toBe(401);
    expect((await call("PUT", "/state", { cookie: aliceToken, body: { state: aliceState, extra: 1 } })).status).toBe(400);
    // The rejected write did not change the stored state.
    expect((await (await call("GET", "/state", { cookie: aliceToken })).json()).state.profile.age).toBe(31);
  });

  it("blocks cross-site, origin-less and non-JSON mutations before any work is done", async () => {
    const body = { email: alice.email, password: alice.password };
    const usersBefore = mem.sessions.length;
    const evil = await call("POST", "/login", { body, headers: { Origin: "https://evil.example" } });
    expect(evil.status).toBe(403);
    const crossSite = await call("POST", "/login", { body, headers: { "Sec-Fetch-Site": "cross-site" } });
    expect(crossSite.status).toBe(403);
    const none = await call("POST", "/login", { body, noOrigin: true });
    expect(none.status).toBe(403);
    const text = await fetch(`${base}/api/app/login`, {
      method: "POST",
      headers: { Origin: base, "Content-Type": "text/plain" },
      body: JSON.stringify(body),
    });
    expect(text.status).toBe(415);
    const wrongPort = await call("POST", "/login", { body, headers: { Origin: "http://localhost:1" } });
    expect(wrongPort.status).toBe(403);
    expect(mem.sessions.length).toBe(usersBefore); // none of these created a session
    // Same-site browsers signal safety with Sec-Fetch-Site even without Origin.
    const sameOrigin = await call("POST", "/login", { body, noOrigin: true, headers: { "Sec-Fetch-Site": "same-origin" } });
    expect(sameOrigin.status).toBe(200);
  });

  it("lists sessions and only revokes another session of the same account", async () => {
    const list = await (await call("GET", "/sessions", { cookie: aliceToken })).json();
    expect(list.sessions.length).toBeGreaterThanOrEqual(2);
    expect(list.sessions.filter((s: { current: boolean }) => s.current)).toHaveLength(1);
    const own = list.sessions.find((s: { current: boolean }) => s.current).id;
    const other = list.sessions.find((s: { current: boolean }) => !s.current).id;

    expect((await call("DELETE", `/sessions/${own}`, { cookie: aliceToken })).status).toBe(409);
    expect((await call("DELETE", "/sessions/bad%20id!", { cookie: aliceToken })).status).toBe(400);
    const bobSessionId = (await (await call("GET", "/sessions", { cookie: bobToken })).json()).sessions[0].id;
    expect((await call("DELETE", `/sessions/${bobSessionId}`, { cookie: aliceToken })).status).toBe(404);
    expect((await call("DELETE", `/sessions/${other}`, { cookie: aliceToken })).status).toBe(200);
    expect((await call("GET", "/sessions", { cookie: bobToken })).status).toBe(200); // Bob unaffected
  });

  it("changes a password: needs the current one, enforces length, revokes other sessions, swaps credentials", async () => {
    const other = tokenOf(sessionCookie(await call("POST", "/login", { body: { email: alice.email, password: alice.password } })));
    const newPassword = "a brand new long password";

    expect((await call("POST", "/password", { cookie: aliceToken, body: { currentPassword: "wrong", newPassword } })).status).toBe(403);
    expect((await call("POST", "/password", { cookie: aliceToken, body: { currentPassword: alice.password, newPassword: "tiny" } })).status).toBe(400);
    expect((await call("POST", "/password", { body: { currentPassword: alice.password, newPassword } })).status).toBe(401);
    expect((await call("POST", "/password", { cookie: aliceToken, body: { currentPassword: alice.password, newPassword } })).status).toBe(200);

    expect((await call("GET", "/state", { cookie: aliceToken })).status).toBe(200); // current session kept
    expect((await call("GET", "/state", { cookie: other })).status).toBe(401); // other session revoked
    expect((await call("POST", "/login", { body: { email: alice.email, password: alice.password } })).status).toBe(401);
    expect((await call("POST", "/login", { body: { email: alice.email, password: newPassword } })).status).toBe(200);
    expect(mem.users.get(1)!.passwordHash).not.toContain(newPassword);
  });

  it("deletes an account only with the password, then removes its data and sessions", async () => {
    expect((await call("DELETE", "/account", { cookie: bobToken, body: { password: "wrong" } })).status).toBe(403);
    expect((await call("DELETE", "/account", { cookie: bobToken, body: {} })).status).toBe(400);
    expect(mem.users.has(2)).toBe(true);
    const del = await call("DELETE", "/account", { cookie: bobToken, body: { password: bob.password } });
    expect(del.status).toBe(200);
    expect(sessionCookie(del)).toMatch(/Max-Age=0/);
    expect(mem.users.has(2)).toBe(false);
    expect(mem.states.has(2)).toBe(false);
    expect((await call("GET", "/state", { cookie: bobToken })).status).toBe(401);
    expect((await call("POST", "/login", { body: { email: bob.email, password: bob.password } })).status).toBe(401);
    expect(mem.users.has(1)).toBe(true); // Alice untouched
  });

  it("Coach: stays deterministic without consent, uses injected AI with consent, falls back when AI returns nothing", async () => {
    const withConsent = (await (await call("GET", "/state", { cookie: aliceToken })).json()).state as PortfolioState;
    // Consent is off in a fresh account: AI must not be called even if requested.
    const off = await (await call("POST", "/coach", { cookie: aliceToken, body: { question: "How diversified am I?", aiConsent: true } })).json();
    expect(off.source).toBe("deterministic");
    expect(coachAi).not.toHaveBeenCalled();

    withConsent.preferences.aiCoachConsent = true;
    expect((await call("PUT", "/state", { cookie: aliceToken, body: { state: withConsent } })).status).toBe(200);

    coachAi.mockResolvedValueOnce("Injected AI answer");
    const ai = await (await call("POST", "/coach", { cookie: aliceToken, body: { question: "How diversified am I?", aiConsent: true } })).json();
    expect(ai).toEqual({ answer: "Injected AI answer", source: "ai" });
    expect(coachAi).toHaveBeenCalledTimes(1);

    coachAi.mockResolvedValueOnce(null);
    const fallback = await (await call("POST", "/coach", { cookie: aliceToken, body: { question: "How diversified am I?", aiConsent: true } })).json();
    expect(fallback.source).toBe("deterministic");
    expect(typeof fallback.answer).toBe("string");
    expect(fallback.answer.length).toBeGreaterThan(0);
  });

  it("rate-limits repeated login attempts with Retry-After", async () => {
    let first429: Response | null = null;
    for (let i = 0; i < 14 && !first429; i++) {
      const res = await call("POST", "/login", { body: { email: "nobody@example.com", password: "guess guess guess" } });
      if (res.status === 429) first429 = res;
      else expect(res.status).toBe(401);
    }
    expect(first429).not.toBeNull();
    expect(Number(first429!.headers.get("retry-after"))).toBeGreaterThan(0);
  });
});

describe("Coach with the default (Manus-backed) model and no Manus configuration", () => {
  it("falls back to the deterministic answer without any outbound call", async () => {
    vi.stubEnv("MANUS_API_URL", "");
    vi.stubEnv("MANUS_API_KEY", "");
    const realFetch = globalThis.fetch;
    const outbound = vi.fn();
    vi.stubGlobal("fetch", ((input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input instanceof Request ? input.url : input);
      if (url.startsWith("http://localhost")) return realFetch(input, init);
      outbound(url);
      return Promise.reject(new Error("unexpected outbound request"));
    }) as typeof fetch);

    // Seed directly: the register limiter is module-wide and already spent above.
    const mem = createMemoryRepository();
    const user = await mem.repo.createUser({
      openId: "email_test",
      name: "Carol Das",
      email: "carol@example.com",
      loginMethod: "email",
      passwordHash: "unused",
    });
    const token = "C".repeat(43);
    await mem.repo.createSession(user.id, "carol-session", sessionTokenHash(token), new Date(Date.now() + 3600_000));
    const state = createEmptyPortfolioState("Carol Das");
    state.preferences.aiCoachConsent = true;
    await mem.repo.saveState(user.id, state);

    const started = await startServer(mem.repo); // default `ai` = the managed model
    try {
      const coach = await fetch(`${started.base}/api/app/coach`, {
        method: "POST",
        headers: { Origin: started.base, "Content-Type": "application/json", Cookie: `pp_session=${token}` },
        body: JSON.stringify({ question: "How diversified am I?", aiConsent: true }),
      });
      expect(coach.status).toBe(200);
      const answer = await coach.json();
      expect(answer.source).toBe("deterministic");
      expect(answer.answer.length).toBeGreaterThan(0);
      expect(outbound).not.toHaveBeenCalled();
    } finally {
      await started.close();
      vi.unstubAllEnvs();
      vi.unstubAllGlobals();
    }
  });
});
