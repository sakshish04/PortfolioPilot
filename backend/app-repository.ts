import { and, eq, gt, isNull, ne } from "drizzle-orm";
import { appSessions, portfolioStates, users } from "./drizzle/schema";
import { getDb } from "./db";
import type { PortfolioState } from "../shared/portfolio";

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
    const row = rows[0];
    const parsed = JSON.parse(row.stateJson);
    const { validatePortfolioState } = await import("./app-security");
    const valid = validatePortfolioState(parsed);
    if (!valid.success) throw new Error("Saved portfolio state is invalid");

    const state = valid.data;
    if (row.riskProfile || row.riskScore !== null || row.archetype || row.preferencesJson) {
      let prefTags: string[] = [];
      try {
        if (row.preferencesJson) prefTags = JSON.parse(row.preferencesJson);
      } catch {
        // Fallback to empty if parse fails
      }

      state.profile = {
        ...state.profile,
        riskProfile: (row.riskProfile as any) ?? state.profile.riskProfile,
        riskScore: row.riskScore ?? state.profile.riskScore,
        ...((row.riskTier || row.archetype || prefTags.length) && {
          riskTier: row.riskTier ?? (state.profile as any).riskTier,
          archetype: row.archetype ?? (state.profile as any).archetype,
          preferences: {
            ...((state.profile as any).preferences || {}),
            tags: prefTags.length ? prefTags : ((state.profile as any).preferences?.tags || []),
          },
        }),
      } as any;
    }

    return state;
  },
  async saveState(userId, state) {
    const db = await database();
    const profile = state.profile as any;
    const riskProfile = profile?.riskProfile ?? null;
    const riskScore = typeof profile?.riskScore === "number" ? profile.riskScore : null;
    const riskTier = profile?.riskTier ?? null;
    const archetype = profile?.archetype ?? null;
    const preferencesJson = profile?.preferences?.tags
      ? JSON.stringify(profile.preferences.tags)
      : null;

    const valuesToSet = {
      userId,
      stateJson: JSON.stringify(state),
      riskProfile,
      riskScore,
      riskTier,
      archetype,
      preferencesJson,
      updatedAt: new Date(),
    };

    await db
      .insert(portfolioStates)
      .values(valuesToSet)
      .onDuplicateKeyUpdate({
        set: {
          stateJson: valuesToSet.stateJson,
          riskProfile: valuesToSet.riskProfile,
          riskScore: valuesToSet.riskScore,
          riskTier: valuesToSet.riskTier,
          archetype: valuesToSet.archetype,
          preferencesJson: valuesToSet.preferencesJson,
          updatedAt: new Date(),
        },
      });
  },
  async deleteUser(userId) {
    const db = await database();
    await db.delete(users).where(eq(users.id, userId));
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