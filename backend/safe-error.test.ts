/**
 * Safe error logging. Database errors from drizzle/mysql2 embed the raw SQL, the bound
 * parameters (email, name, password hash) and connection details in their messages. These
 * tests prove none of that reaches the server log. Every secret below is a made-up value;
 * nothing here touches a real database (repositories are stubbed, drizzle is mocked).
 */
import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { AppRepository } from "./app-repository";
import { DB_UNAVAILABLE_MESSAGE, describeError } from "./safe-error";

const SECRETS = {
  email: "carol.secret@example.com",
  name: "Carol Secretname",
  password: "Sup3r-Secret-Passphrase",
  hash: "scrypt$aaaabbbbccccddddeeeeffff00001111$" + "ab".repeat(64),
  token: "tok_" + "z".repeat(40),
  dbPassword: "dbpass-123-fake",
  dbHost: "db.internal.fake",
  url: "mysql://appuser:dbpass-123-fake@db.internal.fake:3306/portfoliopilot",
};
const SQL_FRAGMENTS = ["Failed query", "params:", "insert into", "values (", "`users`", "passwordHash"];

const leaksIn = (text: string) =>
  [...Object.values(SECRETS), ...SQL_FRAGMENTS].filter(fragment => text.includes(fragment));

/** What drizzle really throws when an INSERT fails: SQL and parameters inside the message. */
function queryError(code = "ER_NO_SUCH_TABLE", errno = 1146, sqlState = "42S02") {
  const cause = Object.assign(
    new Error(`Table 'portfoliopilot.users' doesn't exist (${SECRETS.email})`),
    { code, errno, sqlState, sqlMessage: `row for ${SECRETS.email}` }
  );
  return new DrizzleQueryError(
    "insert into `users` (`email`, `name`, `passwordHash`) values (?, ?, ?)",
    [SECRETS.email, SECRETS.name, SECRETS.hash],
    cause
  );
}

describe("describeError", () => {
  it("precondition: the raw drizzle error message really does contain the SQL and the parameters", () => {
    const raw = queryError().message;
    expect(raw).toContain("insert into");
    expect(raw).toContain(SECRETS.email);
    expect(raw).toContain(SECRETS.hash);
  });

  it("reports a failed query by category and driver code only", () => {
    const text = describeError(queryError());
    expect(text).toBe(
      "category=database-query code=ER_NO_SUCH_TABLE errno=1146 sqlState=42S02 type=DrizzleQueryError"
    );
    expect(leaksIn(text)).toEqual([]);
  });

  it("does not leak the value inside a duplicate-entry error", () => {
    const err = Object.assign(
      new Error(`Duplicate entry '${SECRETS.email}' for key 'users.users_email_unique'`),
      { code: "ER_DUP_ENTRY", errno: 1062, sqlState: "23000", sqlMessage: `Duplicate entry '${SECRETS.email}'` }
    );
    const text = describeError(err);
    expect(text).toBe("category=database-query code=ER_DUP_ENTRY errno=1062 sqlState=23000 type=Error");
    expect(leaksIn(text)).toEqual([]);
  });

  it.each(["ECONNREFUSED", "ETIMEDOUT", "ENOTFOUND", "PROTOCOL_CONNECTION_LOST"])(
    "classifies %s as a connection problem without host or credentials",
    code => {
      const err = Object.assign(new Error(`connect ${code} ${SECRETS.dbHost}:3306 user appuser ${SECRETS.url}`), { code });
      const text = describeError(err);
      expect(text).toContain("category=database-connection");
      expect(text).toContain(`code=${code}`);
      expect(leaksIn(text)).toEqual([]);
    }
  );

  it("explains the unavailable-database case with a fixed hint", () => {
    const text = describeError(new Error(DB_UNAVAILABLE_MESSAGE));
    expect(text).toContain("category=database-unavailable");
    expect(text).toContain("restart the server");
    expect(leaksIn(text)).toEqual([]);
  });

  it("describes unexpected errors by class name only, never by message", () => {
    const text = describeError(new TypeError(`bad value ${SECRETS.password} for ${SECRETS.email}`));
    expect(text).toBe("category=unexpected type=TypeError");
    expect(leaksIn(text)).toEqual([]);
  });

  it("ignores untrusted-looking fields instead of copying them", () => {
    const err = Object.assign(new Error("x"), {
      code: SECRETS.email, // not a plain identifier
      errno: `${SECRETS.token}`, // not a number
      sqlState: SECRETS.password, // not a SQLSTATE
    });
    const text = describeError(err);
    expect(text).toBe("category=unexpected type=Error");
    expect(leaksIn(text)).toEqual([]);
    expect(describeError(Object.assign(new Error("x"), { code: "A".repeat(200) }))).toBe(
      "category=unexpected type=Error"
    );
  });

  it("handles non-Error values, null, undefined and hostile objects", () => {
    for (const value of [
      `password=${SECRETS.password}`,
      { message: SECRETS.email, code: `${SECRETS.token}` },
      [SECRETS.hash],
      null,
      undefined,
      42,
    ]) {
      const text = describeError(value);
      expect(text).toMatch(/^category=unexpected type=\w+$/);
      expect(leaksIn(text)).toEqual([]);
    }
  });

  it("terminates on circular and very deep cause chains", () => {
    const loop: Error & { cause?: unknown } = new Error("loop");
    loop.cause = loop;
    expect(describeError(loop)).toBe("category=unexpected type=Error");
    let deep: unknown = Object.assign(new Error("deepest"), { code: "ER_DEEP" });
    for (let i = 0; i < 20; i++) deep = Object.assign(new Error("wrap"), { cause: deep });
    expect(describeError(deep)).toMatch(/^category=unexpected/); // code is beyond the depth limit
  });
});

describe("request failures never put SQL or user data in the log", () => {
  const COOKIE = "T".repeat(43);
  let logs: string[];

  beforeEach(() => {
    logs = [];
    for (const level of ["error", "warn", "log", "info"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
  });
  afterEach(() => {
    vi.restoreAllMocks();
  });

  async function boot(repository: Partial<AppRepository>) {
    vi.resetModules(); // fresh rate-limit budgets per test
    const { createPortfolioAppRouter } = await import("./app-api");
    const app = express();
    app.use(express.json({ limit: "1mb" }));
    app.use("/api/app", createPortfolioAppRouter(repository as AppRepository));
    const server: Server = await new Promise(resolve => {
      const s = app.listen(0, "127.0.0.1", () => resolve(s));
    });
    const base = `http://localhost:${(server.address() as AddressInfo).port}`;
    const call = (method: string, path: string, body?: unknown, cookie?: string) =>
      fetch(`${base}/api/app${path}`, {
        method,
        headers: {
          Origin: base,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
          ...(cookie ? { Cookie: `pp_session=${cookie}` } : {}),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    return { call, close: () => new Promise<void>(r => server.close(() => r())) };
  }

  const GENERIC = { error: "The request could not be completed. Please try again." };

  it("registration: a failing INSERT returns the generic 500 and logs only a safe summary", async () => {
    const { call, close } = await boot({
      async createUser() {
        throw queryError();
      },
    });
    try {
      const res = await call("POST", "/register", {
        name: SECRETS.name,
        email: SECRETS.email,
        password: SECRETS.password,
      });
      expect(res.status).toBe(500);
      const body = await res.json();
      expect(body).toEqual(GENERIC);
      expect(leaksIn(JSON.stringify(body))).toEqual([]);

      const errors = logs.filter(l => l.includes("Request failed"));
      expect(errors).toHaveLength(1);
      expect(errors[0]).toBe(
        "[PortfolioPilot API] Request failed: category=database-query code=ER_NO_SUCH_TABLE errno=1146 sqlState=42S02 type=DrizzleQueryError"
      );
      expect(leaksIn(logs.join("\n"))).toEqual([]);
    } finally {
      await close();
    }
  });

  it("login: a failing lookup is logged safely and the response stays generic", async () => {
    const { call, close } = await boot({
      async getUserByEmail() {
        throw queryError("ER_ACCESS_DENIED_ERROR", 1045, "28000");
      },
    });
    try {
      const res = await call("POST", "/login", { email: SECRETS.email, password: SECRETS.password });
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(GENERIC);
      expect(logs.join("\n")).toContain("category=database-query code=ER_ACCESS_DENIED_ERROR errno=1045 sqlState=28000");
      expect(leaksIn(logs.join("\n"))).toEqual([]);
    } finally {
      await close();
    }
  });

  it("authenticated route: 'Database is not available' is reported by category", async () => {
    const { call, close } = await boot({
      async findActiveSession() {
        throw new Error(DB_UNAVAILABLE_MESSAGE);
      },
    });
    try {
      const res = await call("GET", "/state", undefined, COOKIE);
      expect(res.status).toBe(500);
      expect(await res.json()).toEqual(GENERIC);
      expect(logs.join("\n")).toContain("category=database-unavailable");
      expect(leaksIn(logs.join("\n"))).toEqual([]);
    } finally {
      await close();
    }
  });

  it("a duplicate email is still a 409 for the client, logs nothing, and never echoes the address", async () => {
    const { call, close } = await boot({
      async createUser() {
        throw Object.assign(new Error(`Duplicate entry '${SECRETS.email}' for key 'users.users_email_unique'`), {
          code: "ER_DUP_ENTRY",
          errno: 1062,
        });
      },
    });
    try {
      const res = await call("POST", "/register", {
        name: SECRETS.name,
        email: SECRETS.email,
        password: SECRETS.password,
      });
      expect(res.status).toBe(409);
      expect(leaksIn(JSON.stringify(await res.json()))).toEqual([]);
      expect(logs.filter(l => l.includes("Request failed"))).toEqual([]);
    } finally {
      await close();
    }
  });
});

describe("server/db.ts logging", () => {
  let logs: string[];

  beforeEach(() => {
    logs = [];
    for (const level of ["error", "warn", "log", "info"] as const)
      vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
        logs.push(args.map(String).join(" "));
      });
    vi.resetModules();
    vi.stubEnv("DATABASE_URL", SECRETS.url); // a made-up URL: drizzle is mocked, nothing connects
  });
  afterEach(() => {
    vi.doUnmock("drizzle-orm/mysql2");
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    vi.resetModules();
  });

  it("getDb: a failure to create the pool is logged without the URL, host or password", async () => {
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: () => {
        throw Object.assign(new Error(`cannot open ${SECRETS.url}`), { code: "ECONNREFUSED" });
      },
    }));
    const { getDb } = await import("./db");
    expect(await getDb()).toBeNull();
    const text = logs.join("\n");
    expect(text).toContain("[Database] Failed to connect: category=database-connection code=ECONNREFUSED");
    expect(leaksIn(text)).toEqual([]);
  });

  it("upsertUser: a failed write is logged without SQL or parameters (and the error still propagates)", async () => {
    vi.doMock("drizzle-orm/mysql2", () => ({
      drizzle: () => ({
        insert: () => ({
          values: () => ({ onDuplicateKeyUpdate: () => Promise.reject(queryError()) }),
        }),
      }),
    }));
    const { upsertUser } = await import("./db");
    await expect(upsertUser({ openId: "open-id-1", email: SECRETS.email, name: SECRETS.name })).rejects.toBeDefined();
    const text = logs.join("\n");
    expect(text).toContain("[Database] Failed to upsert user: category=database-query code=ER_NO_SUCH_TABLE");
    expect(leaksIn(text)).toEqual([]);
  });
});
