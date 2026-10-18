import express from "express";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createPortfolioAppRouter } from "./app-api";
import type { AppRepository } from "./app-repository";
import { createMemoryRepository } from "./test-memory-repository";
import { createEmptyPortfolioState } from "../shared/portfolio";

async function startServer(repo: AppRepository) {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use(
    express.urlencoded({ limit: "256kb", extended: true, parameterLimit: 1000 })
  );
  app.use("/api/app", createPortfolioAppRouter(repo));
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
};

const sessionCookie = (res: Response) =>
  res.headers.getSetCookie().find(c => c.startsWith("pp_session=")) ?? null;

describe("Family Plans API (/api/app/families)", () => {
  const mem = createMemoryRepository();
  let base = "";
  let closeServer: () => Promise<void>;

  const api = (
    method: string,
    path: string,
    options: CallOptions = {}
  ): Promise<Response> => {
    const headers: Record<string, string> = {
      Origin: base,
      "Sec-Fetch-Site": "same-origin",
      ...options.headers,
    };
    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    if (options.cookie) {
      headers.Cookie = options.cookie;
    }
    return fetch(`${base}${path}`, {
      method,
      headers,
      body:
        options.body !== undefined ? JSON.stringify(options.body) : undefined,
    });
  };

  let ownerCookie = "";
  let editorCookie = "";
  let viewerCookie = "";
  let strangerCookie = "";

  beforeAll(async () => {
    const s = await startServer(mem.repo);
    base = s.base;
    closeServer = s.close;

    // Register test accounts
    const rOwner = await api("POST", "/api/app/register", {
      body: {
        name: "Alice Owner",
        email: "alice@example.com",
        password: "Password1234!Owner",
      },
    });
    ownerCookie = sessionCookie(rOwner)!;

    const rEditor = await api("POST", "/api/app/register", {
      body: {
        name: "Bob Editor",
        email: "bob@example.com",
        password: "Password1234!Editor",
      },
    });
    editorCookie = sessionCookie(rEditor)!;

    const rViewer = await api("POST", "/api/app/register", {
      body: {
        name: "Carol Viewer",
        email: "carol@example.com",
        password: "Password1234!Viewer",
      },
    });
    viewerCookie = sessionCookie(rViewer)!;

    const rStranger = await api("POST", "/api/app/register", {
      body: {
        name: "Dave Stranger",
        email: "dave@example.com",
        password: "Password1234!Stranger",
      },
    });
    strangerCookie = sessionCookie(rStranger)!;
  });

  afterAll(async () => {
    await closeServer?.();
  });

  let createdFamilyId = "";
  let editorInviteToken = "";
  let viewerInviteToken = "";

  it("1. Allows authenticated user to create a family plan", async () => {
    const res = await api("POST", "/api/app/families", {
      cookie: ownerCookie,
      body: { name: "The Wealthy Family" },
    });
    expect(res.status).toBe(201);
    const data = await res.json();
    expect(data.family).toBeDefined();
    expect(data.family.name).toBe("The Wealthy Family");
    expect(data.family.role).toBe("owner");
    expect(data.family.memberCount).toBe(1);
    createdFamilyId = data.family.id;
  });

  it("2. Lists family plans for owner", async () => {
    const res = await api("GET", "/api/app/families", { cookie: ownerCookie });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.families).toHaveLength(1);
    expect(data.families[0].id).toBe(createdFamilyId);
    expect(data.families[0].role).toBe("owner");
    expect(data.families[0].memberCount).toBe(1);
  });

  it("3. Owner can invite Bob as editor and Carol as viewer", async () => {
    // Invite Bob
    const resBob = await api(
      "POST",
      `/api/app/families/${createdFamilyId}/invitations`,
      {
        cookie: ownerCookie,
        body: { email: "bob@example.com", role: "editor" },
      }
    );
    expect(resBob.status).toBe(201);
    const dataBob = await resBob.json();
    expect(dataBob.invitation.recipientEmail).toBe("bob@example.com");
    expect(dataBob.invitation.role).toBe("editor");
    expect(dataBob.token).toBeTruthy();
    editorInviteToken = dataBob.token;

    // Invite Carol
    const resCarol = await api(
      "POST",
      `/api/app/families/${createdFamilyId}/invitations`,
      {
        cookie: ownerCookie,
        body: { email: "carol@example.com", role: "viewer" },
      }
    );
    expect(resCarol.status).toBe(201);
    const dataCarol = await resCarol.json();
    expect(dataCarol.invitation.recipientEmail).toBe("carol@example.com");
    expect(dataCarol.invitation.role).toBe("viewer");
    expect(dataCarol.token).toBeTruthy();
    viewerInviteToken = dataCarol.token;
  });

  it("4. Prevents duplicate pending invitations to the same email", async () => {
    const res = await api(
      "POST",
      `/api/app/families/${createdFamilyId}/invitations`,
      {
        cookie: ownerCookie,
        body: { email: "bob@example.com", role: "viewer" },
      }
    );
    expect(res.status).toBe(409);
  });

  it("5. Prevents non-owner from inviting members", async () => {
    const res = await api(
      "POST",
      `/api/app/families/${createdFamilyId}/invitations`,
      {
        cookie: strangerCookie,
        body: { email: "someone@example.com", role: "viewer" },
      }
    );
    expect(res.status).toBe(403);
  });

  it("6. Prevents user from accepting invitation sent to a different email", async () => {
    // Dave Stranger tries to use Bob's invitation token
    const res = await api("POST", "/api/app/families/invitations/accept", {
      cookie: strangerCookie,
      body: { token: editorInviteToken },
    });
    expect(res.status).toBe(403);
  });

  it("7. Bob accepts his editor invitation", async () => {
    const res = await api("POST", "/api/app/families/invitations/accept", {
      cookie: editorCookie,
      body: { token: editorInviteToken },
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.ok).toBe(true);
    expect(data.familyId).toBe(createdFamilyId);
  });

  it("8. Carol accepts her viewer invitation", async () => {
    const res = await api("POST", "/api/app/families/invitations/accept", {
      cookie: viewerCookie,
      body: { token: viewerInviteToken },
    });
    expect(res.status).toBe(200);
  });

  it("9. Detail view returns all members and correct roles", async () => {
    const res = await api("GET", `/api/app/families/${createdFamilyId}`, {
      cookie: ownerCookie,
    });
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.members).toHaveLength(3);
    const roles = data.members.map((m: any) => m.role).sort();
    expect(roles).toEqual(["editor", "owner", "viewer"]);
  });

  it("10. Shared Portfolio State isolation and role-based permissions", async () => {
    // Initial state read by viewer
    const rReadViewer = await api(
      "GET",
      `/api/app/families/${createdFamilyId}/state`,
      {
        cookie: viewerCookie,
      }
    );
    expect(rReadViewer.status).toBe(200);
    const viewerState = await rReadViewer.json();
    expect(viewerState.role).toBe("viewer");
    expect(viewerState.state.holdings).toHaveLength(0);

    // Viewer tries to modify family portfolio -> 403 Forbidden
    const updatedState = structuredClone(viewerState.state);
    updatedState.holdings.push({
      id: "h-test-1",
      symbol: "TCS",
      name: "Tata Consultancy Services",
      assetType: "Equity",
      sector: "Information Technology",
      geography: "India",
      marketCap: "Large",
      quantity: 10,
      averagePrice: 3500,
      currentPrice: 3800,
      currentValue: 38000,
    });

    const rViewerWrite = await api(
      "PUT",
      `/api/app/families/${createdFamilyId}/state`,
      {
        cookie: viewerCookie,
        body: { state: updatedState },
      }
    );
    expect(rViewerWrite.status).toBe(403);

    // Editor (Bob) CAN modify family portfolio state -> 200 OK
    const rEditorWrite = await api(
      "PUT",
      `/api/app/families/${createdFamilyId}/state`,
      {
        cookie: editorCookie,
        body: { state: updatedState },
      }
    );
    expect(rEditorWrite.status).toBe(200);

    // Stranger CANNOT read family portfolio state -> 403
    const rStrangerRead = await api(
      "GET",
      `/api/app/families/${createdFamilyId}/state`,
      {
        cookie: strangerCookie,
      }
    );
    expect(rStrangerRead.status).toBe(403);

    // Strict Personal Isolation: Check that Bob's personal portfolio is unchanged
    const rBobSession = await api("GET", "/api/app/session", {
      cookie: editorCookie,
    });
    expect(rBobSession.status).toBe(200);
    const bobSessionData = await rBobSession.json();
    expect(bobSessionData.state.holdings).toHaveLength(0);

    // Check that Alice's personal portfolio is also unchanged
    const rAliceSession = await api("GET", "/api/app/session", {
      cookie: ownerCookie,
    });
    expect(rAliceSession.status).toBe(200);
    const aliceSessionData = await rAliceSession.json();
    expect(aliceSessionData.state.holdings).toHaveLength(0);
  });

  it("11. Owner can remove a member, but non-owner cannot", async () => {
    // Get members list to find Carol's userId
    const rDetail = await api("GET", `/api/app/families/${createdFamilyId}`, {
      cookie: ownerCookie,
    });
    const detail = await rDetail.json();
    const carolMember = detail.members.find(
      (m: any) => m.email === "carol@example.com"
    );
    expect(carolMember).toBeDefined();

    // Bob (editor) tries to remove Carol -> 403
    const rBobRemove = await api(
      "DELETE",
      `/api/app/families/${createdFamilyId}/members/${carolMember.userId}`,
      { cookie: editorCookie }
    );
    expect(rBobRemove.status).toBe(403);

    // Owner (Alice) removes Carol -> 200
    const rOwnerRemove = await api(
      "DELETE",
      `/api/app/families/${createdFamilyId}/members/${carolMember.userId}`,
      { cookie: ownerCookie }
    );
    expect(rOwnerRemove.status).toBe(200);

    // Verify Carol is no longer in the member list
    const rAfter = await api("GET", `/api/app/families/${createdFamilyId}`, {
      cookie: ownerCookie,
    });
    const afterData = await rAfter.json();
    expect(afterData.members).toHaveLength(2);
    expect(
      afterData.members.some((m: any) => m.email === "carol@example.com")
    ).toBe(false);
  });

  it("12. Non-owner cannot delete family plan, owner can", async () => {
    // Bob (editor) tries to delete family plan -> 403
    const rBobDelete = await api(
      "DELETE",
      `/api/app/families/${createdFamilyId}`,
      { cookie: editorCookie }
    );
    expect(rBobDelete.status).toBe(403);

    // Alice (owner) deletes family plan -> 200
    const rAliceDelete = await api(
      "DELETE",
      `/api/app/families/${createdFamilyId}`,
      { cookie: ownerCookie }
    );
    expect(rAliceDelete.status).toBe(200);

    // After deletion, family plan is gone
    const rList = await api("GET", "/api/app/families", {
      cookie: ownerCookie,
    });
    const listData = await rList.json();
    expect(listData.families).toHaveLength(0);
  });
});
