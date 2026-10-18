import { and, eq, gt, isNull, ne, desc } from "drizzle-orm";
import {
  appSessions,
  portfolioStates,
  users,
  familyPlans,
  familyMembers,
  familyInvitations,
  familyPortfolioStates,
} from "./drizzle/schema";
import { getDb } from "./db";
import type {
  PortfolioState,
  FamilyPlan,
  FamilyMember,
  FamilyInvitation,
  FamilyRole,
} from "../shared/portfolio";

export type AppUserRow = typeof users.$inferSelect;
export type SessionRow = typeof appSessions.$inferSelect;
export type PublicUser = { id: number; name: string; email: string };
export type ActiveSession = SessionRow & { user: AppUserRow };
export type SessionView = {
  id: string;
  createdAt: string;
  lastSeenAt: string;
  current: boolean;
  userAgent: string;
};

export interface AppRepository {
  getUserByEmail(email: string): Promise<AppUserRow | null>;
  getUserById(id: number): Promise<AppUserRow | null>;
  createUser(values: {
    openId: string;
    name: string;
    email: string;
    loginMethod: string;
    passwordHash: string;
  }): Promise<AppUserRow>;
  setPassword(userId: number, passwordHash: string): Promise<void>;
  touchUser(userId: number): Promise<void>;
  createSession(
    userId: number,
    id: string,
    tokenHash: string,
    expiresAt: Date
  ): Promise<void>;
  findActiveSession(
    tokenHash: string,
    now: Date
  ): Promise<ActiveSession | null>;
  revokeSession(id: string, userId: number, now: Date): Promise<boolean>;
  revokeOtherSessions(userId: number, keepId: string, now: Date): Promise<void>;
  revokeAllSessions(userId: number, now: Date): Promise<void>;
  listSessions(userId: number): Promise<SessionRow[]>;
  getState(userId: number): Promise<PortfolioState | null>;
  saveState(userId: number, state: PortfolioState): Promise<void>;
  deleteUser(userId: number): Promise<void>;

  // Family Plans
  createFamilyPlan(values: {
    id: string;
    name: string;
    ownerId: number;
    initialState: PortfolioState;
  }): Promise<FamilyPlan>;
  getFamilyPlan(familyId: string): Promise<FamilyPlan | null>;
  listFamilyPlansForUser(
    userId: number
  ): Promise<(FamilyPlan & { role: FamilyRole; memberCount: number })[]>;
  deleteFamilyPlan(familyId: string, ownerId: number): Promise<boolean>;

  // Family Members
  getFamilyMembership(
    familyId: string,
    userId: number
  ): Promise<FamilyMember | null>;
  listFamilyMembers(familyId: string): Promise<FamilyMember[]>;
  removeFamilyMember(familyId: string, userId: number): Promise<boolean>;

  // Family Invitations
  createFamilyInvitation(values: {
    id: string;
    familyId: string;
    inviterId: number;
    recipientEmail: string;
    tokenHash: string;
    role: "editor" | "viewer";
    expiresAt: Date;
  }): Promise<FamilyInvitation>;
  getFamilyInvitationByTokenHash(
    tokenHash: string
  ): Promise<(FamilyInvitation & { familyName: string }) | null>;
  getFamilyInvitationById(
    invitationId: string
  ): Promise<FamilyInvitation | null>;
  listFamilyInvitations(familyId: string): Promise<FamilyInvitation[]>;
  listPendingInvitationsForEmail(
    email: string,
    now: Date
  ): Promise<(FamilyInvitation & { familyName: string })[]>;
  revokeFamilyInvitation(
    invitationId: string,
    familyId: string
  ): Promise<boolean>;
  acceptFamilyInvitation(
    invitationId: string,
    userId: number,
    now: Date
  ): Promise<boolean>;
  declineFamilyInvitation(invitationId: string, now: Date): Promise<boolean>;

  // Family State
  getFamilyState(familyId: string): Promise<PortfolioState | null>;
  saveFamilyState(
    familyId: string,
    state: PortfolioState,
    updatedBy: number
  ): Promise<void>;
}

/** Reads only the requested owner's record; callers must pass the authenticated user id. */
export function readAccountState(
  repository: Pick<AppRepository, "getState">,
  authenticatedUserId: number
) {
  return repository.getState(authenticatedUserId);
}

async function database() {
  const db = await getDb();
  if (!db) throw new Error("Database is not available");
  return db;
}

export const appRepository: AppRepository = {
  async getUserByEmail(email) {
    const db = await database();
    const rows = await db
      .select()
      .from(users)
      .where(eq(users.email, email))
      .limit(1);
    return rows[0] ?? null;
  },
  async getUserById(id) {
    const db = await database();
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return rows[0] ?? null;
  },
  async createUser(values) {
    const db = await database();
    const result = await db
      .insert(users)
      .values({ ...values, role: "user", lastSignedIn: new Date() });
    const id = Number(result[0].insertId);
    const rows = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!rows[0]) throw new Error("Could not load created user");
    return rows[0];
  },
  async setPassword(userId, passwordHash) {
    const db = await database();
    await db
      .update(users)
      .set({ passwordHash, updatedAt: new Date() })
      .where(eq(users.id, userId));
  },
  async touchUser(userId) {
    const db = await database();
    await db
      .update(users)
      .set({ lastSignedIn: new Date() })
      .where(eq(users.id, userId));
  },
  async createSession(userId, id, tokenHash, expiresAt) {
    const db = await database();
    await db.insert(appSessions).values({ id, userId, tokenHash, expiresAt });
  },
  async findActiveSession(tokenHash, now) {
    const db = await database();
    const rows = await db
      .select({ session: appSessions, user: users })
      .from(appSessions)
      .innerJoin(users, eq(appSessions.userId, users.id))
      .where(
        and(
          eq(appSessions.tokenHash, tokenHash),
          isNull(appSessions.revokedAt),
          gt(appSessions.expiresAt, now)
        )
      )
      .limit(1);
    const row = rows[0];
    return row ? { ...row.session, user: row.user } : null;
  },
  async revokeSession(id, userId, now) {
    const db = await database();
    const result = await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appSessions.id, id),
          eq(appSessions.userId, userId),
          isNull(appSessions.revokedAt)
        )
      );
    return Number(result[0].affectedRows ?? 0) > 0;
  },
  async revokeOtherSessions(userId, keepId, now) {
    const db = await database();
    await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(
          eq(appSessions.userId, userId),
          ne(appSessions.id, keepId),
          isNull(appSessions.revokedAt)
        )
      );
  },
  async revokeAllSessions(userId, now) {
    const db = await database();
    await db
      .update(appSessions)
      .set({ revokedAt: now })
      .where(
        and(eq(appSessions.userId, userId), isNull(appSessions.revokedAt))
      );
  },
  async listSessions(userId) {
    const db = await database();
    return db
      .select()
      .from(appSessions)
      .where(
        and(
          eq(appSessions.userId, userId),
          isNull(appSessions.revokedAt),
          gt(appSessions.expiresAt, new Date())
        )
      )
      .orderBy(appSessions.createdAt);
  },
  async getState(userId) {
    const db = await database();
    const rows = await db
      .select()
      .from(portfolioStates)
      .where(eq(portfolioStates.userId, userId))
      .limit(1);
    if (!rows[0]) return null;
    const parsed = JSON.parse(rows[0].stateJson);
    const { validatePortfolioState } = await import("./app-security");
    const valid = validatePortfolioState(parsed);
    if (!valid.success) throw new Error("Saved portfolio state is invalid");
    return valid.data;
  },
  async saveState(userId, state) {
    const db = await database();
    await db
      .insert(portfolioStates)
      .values({
        userId,
        stateJson: JSON.stringify(state),
        updatedAt: new Date(),
      })
      .onDuplicateKeyUpdate({
        set: { stateJson: JSON.stringify(state), updatedAt: new Date() },
      });
  },
  async deleteUser(userId) {
    const db = await database();
    // Existing schema uses user_id foreign keys with cascades for account-owned rows.
    await db.delete(users).where(eq(users.id, userId));
  },

  async createFamilyPlan({ id, name, ownerId, initialState }) {
    const db = await database();
    const now = new Date();
    await db.insert(familyPlans).values({
      id,
      name,
      ownerId,
      createdAt: now,
      updatedAt: now,
    });
    await db.insert(familyMembers).values({
      familyId: id,
      userId: ownerId,
      role: "owner",
      joinedAt: now,
    });
    await db.insert(familyPortfolioStates).values({
      familyId: id,
      stateJson: JSON.stringify(initialState),
      updatedBy: ownerId,
      updatedAt: now,
    });
    return {
      id,
      name,
      ownerId,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      role: "owner",
      memberCount: 1,
    };
  },

  async getFamilyPlan(familyId) {
    const db = await database();
    const rows = await db
      .select()
      .from(familyPlans)
      .where(eq(familyPlans.id, familyId))
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].id,
      name: rows[0].name,
      ownerId: rows[0].ownerId,
      createdAt: rows[0].createdAt.toISOString(),
      updatedAt: rows[0].updatedAt.toISOString(),
    };
  },

  async listFamilyPlansForUser(userId) {
    const db = await database();
    const memberships = await db
      .select({
        plan: familyPlans,
        member: familyMembers,
      })
      .from(familyMembers)
      .innerJoin(familyPlans, eq(familyMembers.familyId, familyPlans.id))
      .where(eq(familyMembers.userId, userId))
      .orderBy(desc(familyPlans.updatedAt));

    const allMembers = await db.select().from(familyMembers);
    const countMap = new Map<string, number>();
    for (const m of allMembers) {
      countMap.set(m.familyId, (countMap.get(m.familyId) ?? 0) + 1);
    }

    return memberships.map(({ plan, member }) => ({
      id: plan.id,
      name: plan.name,
      ownerId: plan.ownerId,
      createdAt: plan.createdAt.toISOString(),
      updatedAt: plan.updatedAt.toISOString(),
      role: member.role as FamilyRole,
      memberCount: countMap.get(plan.id) ?? 1,
    }));
  },

  async deleteFamilyPlan(familyId, ownerId) {
    const db = await database();
    const result = await db
      .delete(familyPlans)
      .where(
        and(eq(familyPlans.id, familyId), eq(familyPlans.ownerId, ownerId))
      );
    return Number(result[0].affectedRows ?? 0) > 0;
  },

  async getFamilyMembership(familyId, userId) {
    const db = await database();
    const rows = await db
      .select({ member: familyMembers, user: users })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(
        and(
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.userId, userId)
        )
      )
      .limit(1);
    if (!rows[0]) return null;
    return {
      id: rows[0].member.id,
      familyId: rows[0].member.familyId,
      userId: rows[0].member.userId,
      role: rows[0].member.role as FamilyRole,
      joinedAt: rows[0].member.joinedAt.toISOString(),
      email: rows[0].user.email ?? undefined,
      name: rows[0].user.name ?? undefined,
    };
  },

  async listFamilyMembers(familyId) {
    const db = await database();
    const rows = await db
      .select({ member: familyMembers, user: users })
      .from(familyMembers)
      .innerJoin(users, eq(familyMembers.userId, users.id))
      .where(eq(familyMembers.familyId, familyId));
    return rows.map(r => ({
      id: r.member.id,
      familyId: r.member.familyId,
      userId: r.member.userId,
      role: r.member.role as FamilyRole,
      joinedAt: r.member.joinedAt.toISOString(),
      email: r.user.email ?? undefined,
      name: r.user.name ?? undefined,
    }));
  },

  async removeFamilyMember(familyId, userId) {
    const db = await database();
    const result = await db
      .delete(familyMembers)
      .where(
        and(
          eq(familyMembers.familyId, familyId),
          eq(familyMembers.userId, userId)
        )
      );
    return Number(result[0].affectedRows ?? 0) > 0;
  },

  async createFamilyInvitation(values) {
    const db = await database();
    const now = new Date();
    await db.insert(familyInvitations).values({
      id: values.id,
      familyId: values.familyId,
      inviterId: values.inviterId,
      recipientEmail: values.recipientEmail,
      tokenHash: values.tokenHash,
      role: values.role,
      status: "pending",
      expiresAt: values.expiresAt,
      createdAt: now,
    });
    return {
      id: values.id,
      familyId: values.familyId,
      inviterId: values.inviterId,
      recipientEmail: values.recipientEmail,
      role: values.role,
      status: "pending",
      expiresAt: values.expiresAt.toISOString(),
      createdAt: now.toISOString(),
      respondedAt: null,
    };
  },

  async getFamilyInvitationByTokenHash(tokenHash) {
    const db = await database();
    const rows = await db
      .select({
        inv: familyInvitations,
        plan: familyPlans,
      })
      .from(familyInvitations)
      .innerJoin(familyPlans, eq(familyInvitations.familyId, familyPlans.id))
      .where(eq(familyInvitations.tokenHash, tokenHash))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.inv.id,
      familyId: r.inv.familyId,
      inviterId: r.inv.inviterId,
      recipientEmail: r.inv.recipientEmail,
      role: r.inv.role as "editor" | "viewer",
      status: r.inv.status as any,
      expiresAt: r.inv.expiresAt.toISOString(),
      createdAt: r.inv.createdAt.toISOString(),
      respondedAt: r.inv.respondedAt ? r.inv.respondedAt.toISOString() : null,
      familyName: r.plan.name,
    };
  },

  async getFamilyInvitationById(invitationId) {
    const db = await database();
    const rows = await db
      .select()
      .from(familyInvitations)
      .where(eq(familyInvitations.id, invitationId))
      .limit(1);
    if (!rows[0]) return null;
    const r = rows[0];
    return {
      id: r.id,
      familyId: r.familyId,
      inviterId: r.inviterId,
      recipientEmail: r.recipientEmail,
      role: r.role as "editor" | "viewer",
      status: r.status as any,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    };
  },

  async listFamilyInvitations(familyId) {
    const db = await database();
    const rows = await db
      .select()
      .from(familyInvitations)
      .where(eq(familyInvitations.familyId, familyId))
      .orderBy(desc(familyInvitations.createdAt));
    return rows.map(r => ({
      id: r.id,
      familyId: r.familyId,
      inviterId: r.inviterId,
      recipientEmail: r.recipientEmail,
      role: r.role as "editor" | "viewer",
      status: r.status as any,
      expiresAt: r.expiresAt.toISOString(),
      createdAt: r.createdAt.toISOString(),
      respondedAt: r.respondedAt ? r.respondedAt.toISOString() : null,
    }));
  },

  async listPendingInvitationsForEmail(email, now) {
    const db = await database();
    const rows = await db
      .select({
        inv: familyInvitations,
        plan: familyPlans,
      })
      .from(familyInvitations)
      .innerJoin(familyPlans, eq(familyInvitations.familyId, familyPlans.id))
      .where(
        and(
          eq(familyInvitations.recipientEmail, email),
          eq(familyInvitations.status, "pending"),
          gt(familyInvitations.expiresAt, now)
        )
      )
      .orderBy(desc(familyInvitations.createdAt));
    return rows.map(r => ({
      id: r.inv.id,
      familyId: r.inv.familyId,
      inviterId: r.inv.inviterId,
      recipientEmail: r.inv.recipientEmail,
      role: r.inv.role as "editor" | "viewer",
      status: r.inv.status as any,
      expiresAt: r.inv.expiresAt.toISOString(),
      createdAt: r.inv.createdAt.toISOString(),
      respondedAt: r.inv.respondedAt ? r.inv.respondedAt.toISOString() : null,
      familyName: r.plan.name,
    }));
  },

  async revokeFamilyInvitation(invitationId, familyId) {
    const db = await database();
    const result = await db
      .update(familyInvitations)
      .set({ status: "revoked", respondedAt: new Date() })
      .where(
        and(
          eq(familyInvitations.id, invitationId),
          eq(familyInvitations.familyId, familyId),
          eq(familyInvitations.status, "pending")
        )
      );
    return Number(result[0].affectedRows ?? 0) > 0;
  },

  async acceptFamilyInvitation(invitationId, userId, now) {
    const db = await database();
    const invRows = await db
      .select()
      .from(familyInvitations)
      .where(
        and(
          eq(familyInvitations.id, invitationId),
          eq(familyInvitations.status, "pending"),
          gt(familyInvitations.expiresAt, now)
        )
      )
      .limit(1);
    if (!invRows[0]) return false;
    const inv = invRows[0];

    await db.insert(familyMembers).values({
      familyId: inv.familyId,
      userId,
      role: inv.role,
      joinedAt: now,
    });

    await db
      .update(familyInvitations)
      .set({ status: "accepted", respondedAt: now })
      .where(eq(familyInvitations.id, invitationId));
    return true;
  },

  async declineFamilyInvitation(invitationId, now) {
    const db = await database();
    const result = await db
      .update(familyInvitations)
      .set({ status: "declined", respondedAt: now })
      .where(
        and(
          eq(familyInvitations.id, invitationId),
          eq(familyInvitations.status, "pending")
        )
      );
    return Number(result[0].affectedRows ?? 0) > 0;
  },

  async getFamilyState(familyId) {
    const db = await database();
    const rows = await db
      .select()
      .from(familyPortfolioStates)
      .where(eq(familyPortfolioStates.familyId, familyId))
      .limit(1);
    if (!rows[0]) return null;
    const parsed = JSON.parse(rows[0].stateJson);
    const { validatePortfolioState } = await import("./app-security");
    const valid = validatePortfolioState(parsed);
    if (!valid.success)
      throw new Error("Saved family portfolio state is invalid");
    return valid.data;
  },

  async saveFamilyState(familyId, state, updatedBy) {
    const db = await database();
    const now = new Date();
    await db
      .insert(familyPortfolioStates)
      .values({
        familyId,
        stateJson: JSON.stringify(state),
        updatedBy,
        updatedAt: now,
      })
      .onDuplicateKeyUpdate({
        set: {
          stateJson: JSON.stringify(state),
          updatedBy,
          updatedAt: now,
        },
      });
  },
};

export const publicUser = (user: AppUserRow): PublicUser => ({
  id: user.id,
  name: user.name ?? "",
  email: user.email ?? "",
});
export function toSessionView(
  row: SessionRow,
  currentId: string,
  userAgent = "Browser session"
): SessionView {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    lastSeenAt: row.createdAt.toISOString(),
    current: row.id === currentId,
    userAgent,
  };
}
