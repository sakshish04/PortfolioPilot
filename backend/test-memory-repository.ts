import type {
  ActiveSession,
  AppRepository,
  AppUserRow,
  SessionRow,
} from "./app-repository";
import type {
  FamilyInvitation,
  FamilyMember,
  FamilyPlan,
  FamilyRole,
  PortfolioState,
} from "../shared/portfolio";

export function createMemoryRepository() {
  const users = new Map<number, AppUserRow>();
  const sessions: SessionRow[] = [];
  const states = new Map<number, PortfolioState>();
  const plans = new Map<string, FamilyPlan>();
  const members: FamilyMember[] = [];
  const invitations: (FamilyInvitation & { tokenHash: string })[] = [];
  const familyStates = new Map<string, PortfolioState>();
  let nextId = 1;
  let nextMemberId = 1;

  const repo: AppRepository = {
    async getUserByEmail(email) {
      return [...users.values()].find(u => u.email === email) ?? null;
    },
    async getUserById(id) {
      return users.get(id) ?? null;
    },
    async createUser(values) {
      if (
        [...users.values()].some(
          u => u.email === values.email || u.openId === values.openId
        )
      )
        throw Object.assign(new Error("Duplicate entry"), {
          code: "ER_DUP_ENTRY",
        });
      const now = new Date();
      const user: AppUserRow = {
        id: nextId++,
        openId: values.openId,
        name: values.name,
        email: values.email,
        loginMethod: values.loginMethod,
        passwordHash: values.passwordHash,
        role: "user",
        createdAt: now,
        updatedAt: now,
        lastSignedIn: now,
      };
      users.set(user.id, user);
      return user;
    },
    async setPassword(userId, passwordHash) {
      const u = users.get(userId);
      if (u) {
        u.passwordHash = passwordHash;
        u.updatedAt = new Date();
      }
    },
    async touchUser(userId) {
      const u = users.get(userId);
      if (u) u.lastSignedIn = new Date();
    },
    async createSession(userId, id, tokenHash, expiresAt) {
      sessions.push({
        id,
        userId,
        tokenHash,
        expiresAt,
        createdAt: new Date(),
        revokedAt: null,
      });
    },
    async findActiveSession(tokenHash, now) {
      const s = sessions.find(
        x => x.tokenHash === tokenHash && !x.revokedAt && x.expiresAt > now
      );
      if (!s) return null;
      const u = users.get(s.userId);
      if (!u) return null;
      return { ...s, user: u };
    },
    async revokeSession(id, userId, now) {
      const s = sessions.find(
        x => x.id === id && x.userId === userId && !x.revokedAt
      );
      if (!s) return false;
      s.revokedAt = now;
      return true;
    },
    async revokeOtherSessions(userId, keepId, now) {
      for (const s of sessions)
        if (s.userId === userId && s.id !== keepId && !s.revokedAt)
          s.revokedAt = now;
    },
    async revokeAllSessions(userId, now) {
      for (const s of sessions)
        if (s.userId === userId && !s.revokedAt) s.revokedAt = now;
    },
    async listSessions(userId) {
      const now = new Date();
      return sessions.filter(
        s => s.userId === userId && !s.revokedAt && s.expiresAt > now
      );
    },
    async getState(userId) {
      const s = states.get(userId);
      return s ? structuredClone(s) : null;
    },
    async saveState(userId, state) {
      states.set(userId, structuredClone(state));
    },
    async deleteUser(userId) {
      users.delete(userId);
      states.delete(userId);
      for (let i = sessions.length - 1; i >= 0; i--)
        if (sessions[i]!.userId === userId) sessions.splice(i, 1);
    },

    // Family Plans
    async createFamilyPlan({ id, name, ownerId, initialState }) {
      const now = new Date().toISOString();
      const plan: FamilyPlan = {
        id,
        name,
        ownerId,
        createdAt: now,
        updatedAt: now,
        role: "owner",
        memberCount: 1,
      };
      plans.set(id, plan);
      const ownerUser = users.get(ownerId);
      members.push({
        id: nextMemberId++,
        familyId: id,
        userId: ownerId,
        role: "owner",
        joinedAt: now,
        email: ownerUser?.email ?? undefined,
        name: ownerUser?.name ?? undefined,
      });
      familyStates.set(id, structuredClone(initialState));
      return plan;
    },

    async getFamilyPlan(familyId) {
      const p = plans.get(familyId);
      return p ? structuredClone(p) : null;
    },

    async listFamilyPlansForUser(userId) {
      const userMemberships = members.filter(m => m.userId === userId);
      const result: (FamilyPlan & { role: FamilyRole; memberCount: number })[] =
        [];
      for (const mem of userMemberships) {
        const p = plans.get(mem.familyId);
        if (p) {
          const totalMembers = members.filter(
            m => m.familyId === mem.familyId
          ).length;
          result.push({
            ...structuredClone(p),
            role: mem.role,
            memberCount: totalMembers,
          });
        }
      }
      return result;
    },

    async deleteFamilyPlan(familyId, ownerId) {
      const p = plans.get(familyId);
      if (!p || p.ownerId !== ownerId) return false;
      plans.delete(familyId);
      familyStates.delete(familyId);
      for (let i = members.length - 1; i >= 0; i--) {
        if (members[i]!.familyId === familyId) members.splice(i, 1);
      }
      for (let i = invitations.length - 1; i >= 0; i--) {
        if (invitations[i]!.familyId === familyId) invitations.splice(i, 1);
      }
      return true;
    },

    async getFamilyMembership(familyId, userId) {
      const m = members.find(
        x => x.familyId === familyId && x.userId === userId
      );
      if (!m) return null;
      const u = users.get(userId);
      return {
        ...structuredClone(m),
        email: u?.email ?? m.email,
        name: u?.name ?? m.name,
      };
    },

    async listFamilyMembers(familyId) {
      return members
        .filter(m => m.familyId === familyId)
        .map(m => {
          const u = users.get(m.userId);
          return {
            ...structuredClone(m),
            email: u?.email ?? m.email,
            name: u?.name ?? m.name,
          };
        });
    },

    async removeFamilyMember(familyId, userId) {
      const idx = members.findIndex(
        m => m.familyId === familyId && m.userId === userId
      );
      if (idx === -1) return false;
      members.splice(idx, 1);
      return true;
    },

    async createFamilyInvitation(values) {
      const now = new Date().toISOString();
      const inv: FamilyInvitation & { tokenHash: string } = {
        id: values.id,
        familyId: values.familyId,
        inviterId: values.inviterId,
        recipientEmail: values.recipientEmail,
        role: values.role,
        status: "pending",
        expiresAt: values.expiresAt.toISOString(),
        createdAt: now,
        respondedAt: null,
        tokenHash: values.tokenHash,
      };
      invitations.push(inv);
      return structuredClone(inv);
    },

    async getFamilyInvitationByTokenHash(tokenHash) {
      const inv = invitations.find(x => x.tokenHash === tokenHash);
      if (!inv) return null;
      const plan = plans.get(inv.familyId);
      return {
        ...structuredClone(inv),
        familyName: plan?.name ?? "Family Plan",
      };
    },

    async getFamilyInvitationById(invitationId) {
      const inv = invitations.find(x => x.id === invitationId);
      return inv ? structuredClone(inv) : null;
    },

    async listFamilyInvitations(familyId) {
      return invitations
        .filter(x => x.familyId === familyId)
        .map(x => structuredClone(x));
    },

    async listPendingInvitationsForEmail(email, now) {
      const matching = invitations.filter(
        x =>
          x.recipientEmail.toLowerCase() === email.toLowerCase() &&
          x.status === "pending" &&
          new Date(x.expiresAt) > now
      );
      return matching.map(x => {
        const plan = plans.get(x.familyId);
        return {
          ...structuredClone(x),
          familyName: plan?.name ?? "Family Plan",
        };
      });
    },

    async revokeFamilyInvitation(invitationId, familyId) {
      const inv = invitations.find(
        x =>
          x.id === invitationId &&
          x.familyId === familyId &&
          x.status === "pending"
      );
      if (!inv) return false;
      inv.status = "revoked";
      inv.respondedAt = new Date().toISOString();
      return true;
    },

    async acceptFamilyInvitation(invitationId, userId, now) {
      const inv = invitations.find(
        x =>
          x.id === invitationId &&
          x.status === "pending" &&
          new Date(x.expiresAt) > now
      );
      if (!inv) return false;
      inv.status = "accepted";
      inv.respondedAt = now.toISOString();
      const u = users.get(userId);
      members.push({
        id: nextMemberId++,
        familyId: inv.familyId,
        userId,
        role: inv.role,
        joinedAt: now.toISOString(),
        email: u?.email ?? undefined,
        name: u?.name ?? undefined,
      });
      return true;
    },

    async declineFamilyInvitation(invitationId, now) {
      const inv = invitations.find(
        x => x.id === invitationId && x.status === "pending"
      );
      if (!inv) return false;
      inv.status = "declined";
      inv.respondedAt = now.toISOString();
      return true;
    },

    async getFamilyState(familyId) {
      const s = familyStates.get(familyId);
      return s ? structuredClone(s) : null;
    },

    async saveFamilyState(familyId, state, _updatedBy) {
      familyStates.set(familyId, structuredClone(state));
    },
  };

  return { repo, users, sessions, states, plans, members, invitations, familyStates };
}
