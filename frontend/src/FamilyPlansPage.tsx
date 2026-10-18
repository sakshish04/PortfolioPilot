import React, { useCallback, useEffect, useState } from "react";
import { Link, useLocation } from "wouter";
import { useApp } from "./contexts/AppContext";
import {
  ASSET_BUCKETS,
  GOAL_CATEGORIES,
  type AssetType,
  type FamilyInvitation,
  type FamilyMember,
  type FamilyPlan,
  type FamilyRole,
  type Goal,
  type Holding,
  type PortfolioState,
} from "@shared/portfolio";
import {
  assetAllocation,
  goalProjection,
  portfolioTotal,
} from "@shared/finance";
import {
  AlertCircle,
  BriefcaseBusiness,
  Check,
  ChevronRight,
  Copy,
  Edit3,
  Eye,
  Lock,
  Mail,
  Plus,
  RefreshCw,
  ShieldCheck,
  Target,
  Trash2,
  Users,
  X,
} from "lucide-react";

const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);

interface FamilyPlansPageProps {
  initialFamilyId?: string;
}

export default function FamilyPlansPage({
  initialFamilyId,
}: FamilyPlansPageProps) {
  const { user, api } = useApp();
  const [, setLoc] = useLocation();

  const [families, setFamilies] = useState<FamilyPlan[]>([]);
  const [invitations, setInvitations] = useState<
    (FamilyInvitation & { familyName?: string })[]
  >([]);
  const [activePlanId, setActivePlanId] = useState<string | null>(
    initialFamilyId ?? null
  );

  // Active plan state
  const [activePlan, setActivePlan] = useState<FamilyPlan | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [planInvitations, setPlanInvitations] = useState<FamilyInvitation[]>(
    []
  );
  const [userRole, setUserRole] = useState<FamilyRole | null>(null);
  const [familyState, setFamilyState] = useState<PortfolioState | null>(null);

  // UI status
  const [loading, setLoading] = useState<boolean>(true);
  const [planLoading, setPlanLoading] = useState<boolean>(false);
  const [savingState, setSavingState] = useState<boolean>(false);
  const [error, setError] = useState<string>("");
  const [successMsg, setSuccessMsg] = useState<string>("");

  // Modals & form state
  const [createOpen, setCreateOpen] = useState<boolean>(false);
  const [newPlanName, setNewPlanName] = useState<string>("");
  const [inviteOpen, setInviteOpen] = useState<boolean>(false);
  const [inviteEmail, setInviteEmail] = useState<string>("");
  const [inviteRole, setInviteRole] = useState<"editor" | "viewer">("viewer");
  const [createdInvite, setCreatedInvite] = useState<{
    token: string;
    recipientEmail: string;
    role: string;
  } | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  // Sub-tabs in detail view
  const [activeTab, setActiveTab] = useState<
    "portfolio" | "members" | "settings"
  >("portfolio");

  // Add holding form in family portfolio
  const [addHoldingOpen, setAddHoldingOpen] = useState<boolean>(false);
  const [holdingSymbol, setHoldingSymbol] = useState("");
  const [holdingName, setHoldingName] = useState("");
  const [holdingType, setHoldingType] = useState<AssetType>("Equity");
  const [holdingQty, setHoldingQty] = useState("");
  const [holdingAvgPrice, setHoldingAvgPrice] = useState("");
  const [holdingCurPrice, setHoldingCurPrice] = useState("");

  // Add goal form in family portfolio
  const [addGoalOpen, setAddGoalOpen] = useState<boolean>(false);
  const [goalName, setGoalName] = useState("");
  const [goalCategory, setGoalCategory] = useState<string>(
    GOAL_CATEGORIES[0] ?? "Wealth Creation"
  );
  const [goalTarget, setGoalTarget] = useState("");
  const [goalCurrent, setGoalCurrent] = useState("");
  const [goalMonthly, setGoalMonthly] = useState("");
  const [goalDate, setGoalDate] = useState("");

  // Load family plans list
  const loadFamilies = useCallback(async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    try {
      const data = await api("/api/app/families");
      setFamilies(data.families ?? []);
      setInvitations(data.invitations ?? []);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Failed to load family plans."
      );
    } finally {
      setLoading(false);
    }
  }, [user, api]);

  useEffect(() => {
    loadFamilies();
  }, [loadFamilies]);

  // Load active plan detail and state
  const loadPlanDetail = useCallback(
    async (planId: string) => {
      setPlanLoading(true);
      setError("");
      try {
        const [detailData, stateData] = await Promise.all([
          api(`/api/app/families/${planId}`),
          api(`/api/app/families/${planId}/state`),
        ]);
        setActivePlan(detailData.family);
        setMembers(detailData.members ?? []);
        setPlanInvitations(detailData.invitations ?? []);
        setUserRole(detailData.role);
        setFamilyState(stateData.state);
      } catch (e) {
        setError(
          e instanceof Error ? e.message : "Failed to load family plan details."
        );
      } finally {
        setPlanLoading(false);
      }
    },
    [api]
  );

  useEffect(() => {
    if (activePlanId) {
      loadPlanDetail(activePlanId);
    } else {
      setActivePlan(null);
      setFamilyState(null);
    }
  }, [activePlanId, loadPlanDetail]);

  // Create plan
  const handleCreatePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newPlanName.trim()) return;
    setError("");
    try {
      const res = await api("/api/app/families", {
        method: "POST",
        body: JSON.stringify({ name: newPlanName.trim() }),
      });
      setNewPlanName("");
      setCreateOpen(false);
      setSuccessMsg(`Family plan "${res.family.name}" created successfully!`);
      await loadFamilies();
      setActivePlanId(res.family.id);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to create family plan."
      );
    }
  };

  // Accept invitation
  const handleAcceptInvite = async (token: string) => {
    setError("");
    try {
      const res = await api("/api/app/families/invitations/accept", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setSuccessMsg(`Joined family plan "${res.familyName}"!`);
      await loadFamilies();
      if (res.familyId) setActivePlanId(res.familyId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to accept invitation."
      );
    }
  };

  // Decline invitation
  const handleDeclineInvite = async (token: string) => {
    setError("");
    try {
      await api("/api/app/families/invitations/decline", {
        method: "POST",
        body: JSON.stringify({ token }),
      });
      setSuccessMsg("Invitation declined.");
      await loadFamilies();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to decline invitation."
      );
    }
  };

  // Send invitation
  const handleSendInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePlanId || !inviteEmail.trim()) return;
    setError("");
    try {
      const res = await api(
        `/api/app/families/${activePlanId}/invitations`,
        {
          method: "POST",
          body: JSON.stringify({
            email: inviteEmail.trim(),
            role: inviteRole,
          }),
        }
      );
      setCreatedInvite({
        token: res.token,
        recipientEmail: res.invitation.recipientEmail,
        role: res.invitation.role,
      });
      setInviteEmail("");
      setSuccessMsg("Invitation generated successfully!");
      if (activePlanId) loadPlanDetail(activePlanId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to send invitation."
      );
    }
  };

  // Revoke invitation
  const handleRevokeInvite = async (invId: string) => {
    if (!activePlanId) return;
    setError("");
    try {
      await api(
        `/api/app/families/${activePlanId}/invitations/${invId}/revoke`,
        {
          method: "POST",
          body: JSON.stringify({}),
        }
      );
      setSuccessMsg("Invitation revoked.");
      loadPlanDetail(activePlanId);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to revoke invitation."
      );
    }
  };

  // Remove member
  const handleRemoveMember = async (userId: number, memberName?: string) => {
    if (!activePlanId) return;
    if (
      !window.confirm(
        `Are you sure you want to remove ${memberName || "this member"} from the family plan?`
      )
    ) {
      return;
    }
    setError("");
    try {
      await api(
        `/api/app/families/${activePlanId}/members/${userId}`,
        {
          method: "DELETE",
        }
      );
      setSuccessMsg("Member removed.");
      loadPlanDetail(activePlanId);
      loadFamilies();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove member."
      );
    }
  };

  // Delete plan
  const handleDeletePlan = async () => {
    if (!activePlanId || !activePlan) return;
    if (
      !window.confirm(
        `Are you sure you want to permanently delete "${activePlan.name}"? All shared portfolio data, member roles, and pending invitations will be deleted.`
      )
    ) {
      return;
    }
    setError("");
    try {
      await api(`/api/app/families/${activePlanId}`, {
        method: "DELETE",
      });
      setSuccessMsg("Family plan deleted.");
      setActivePlanId(null);
      loadFamilies();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to delete family plan."
      );
    }
  };

  // Save shared state (Owner / Editor only)
  const handleSaveState = async (newState: PortfolioState) => {
    if (!activePlanId) return;
    setSavingState(true);
    setError("");
    try {
      const res = await api(`/api/app/families/${activePlanId}/state`, {
        method: "PUT",
        body: JSON.stringify({ state: newState }),
      });
      setFamilyState(res.state);
      setSuccessMsg("Shared portfolio state saved successfully.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to save portfolio state."
      );
    } finally {
      setSavingState(false);
    }
  };

  // Add holding to shared state
  const handleAddHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyState || userRole === "viewer") return;
    const qty = Number(holdingQty);
    const avg = Number(holdingAvgPrice);
    const cur = Number(holdingCurPrice);
    if (!holdingSymbol.trim() || !holdingName.trim() || qty <= 0 || cur <= 0) {
      setError("Please provide valid holding details.");
      return;
    }
    const newHoldingItem: Holding = {
      id: `h_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      symbol: holdingSymbol.trim().toUpperCase(),
      name: holdingName.trim(),
      assetType: holdingType,
      sector: "Diversified",
      geography: "India",
      marketCap: "Not specified",
      quantity: qty,
      averagePrice: avg > 0 ? avg : cur,
      currentPrice: cur,
      currentValue: qty * cur,
    };
    const updated: PortfolioState = {
      ...familyState,
      holdings: [...familyState.holdings, newHoldingItem],
    };
    await handleSaveState(updated);
    setHoldingSymbol("");
    setHoldingName("");
    setHoldingQty("");
    setHoldingAvgPrice("");
    setHoldingCurPrice("");
    setAddHoldingOpen(false);
  };

  // Delete holding from shared state
  const handleDeleteHolding = async (holdingId: string) => {
    if (!familyState || userRole === "viewer") return;
    const updated: PortfolioState = {
      ...familyState,
      holdings: familyState.holdings.filter(h => h.id !== holdingId),
    };
    await handleSaveState(updated);
  };

  // Add goal to shared state
  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!familyState || userRole === "viewer") return;
    const targetAmt = Number(goalTarget);
    if (!goalName.trim() || targetAmt <= 0 || !goalDate) {
      setError("Please provide goal name, positive target amount, and target date.");
      return;
    }
    const newGoalItem: Goal = {
      id: `g_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      name: goalName.trim(),
      category: goalCategory as any,
      targetAmount: targetAmt,
      currentAmount: Math.max(0, Number(goalCurrent) || 0),
      monthlyContribution: Math.max(0, Number(goalMonthly) || 0),
      targetDate: goalDate,
      expectedReturnPct: 10,
      inflationPct: 6,
      createdAt: new Date().toISOString(),
    };
    const updated: PortfolioState = {
      ...familyState,
      goals: [...familyState.goals, newGoalItem],
    };
    await handleSaveState(updated);
    setGoalName("");
    setGoalTarget("");
    setGoalCurrent("");
    setGoalMonthly("");
    setGoalDate("");
    setAddGoalOpen(false);
  };

  // Delete goal from shared state
  const handleDeleteGoal = async (goalId: string) => {
    if (!familyState || userRole === "viewer") return;
    const updated: PortfolioState = {
      ...familyState,
      goals: familyState.goals.filter(g => g.id !== goalId),
    };
    await handleSaveState(updated);
  };

  // Copy invitation link
  const copyInvite = (token: string) => {
    const link = `${window.location.origin}/family-plans?invite=${token}`;
    navigator.clipboard.writeText(token);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  // Guest view: prompt user to sign in
  if (!user) {
    return (
      <div className="page-shell">
        <header className="page-title">
          <div className="eyebrow">HOUSEHOLD WEALTH</div>
          <h1>Family Plans & Shared Portfolios</h1>
          <p>
            Collaborate on joint goals, track shared investments, and set
            role-based permissions (Owner, Editor, Viewer).
          </p>
        </header>
        <section className="card family-guest-card">
          <div className="family-guest-hero">
            <div className="guest-icon-badge">
              <Users size={32} />
            </div>
            <h2>Collaborative Household Wealth Management</h2>
            <p className="guest-desc">
              Family Plans allow couples, families, and financial collaborators
              to combine or link portfolios into a shared household view.
              Keep your personal portfolio completely private while building
              joint plans for retirement, home purchases, and children's
              education.
            </p>
            <div className="family-feature-pills">
              <span className="pill good">
                <ShieldCheck size={14} /> Server-Enforced Roles (Owner, Editor, Viewer)
              </span>
              <span className="pill blue">
                <Lock size={14} /> Private by Default (Zero Personal Data Leakage)
              </span>
              <span className="pill outline">
                <Mail size={14} /> Secure Cryptographic Invitations
              </span>
            </div>
            <div className="button-row" style={{ marginTop: 20 }}>
              <button
                type="button"
                className="button primary"
                onClick={() => setLoc("/settings")}
              >
                Sign In or Register to Access Family Plans
              </button>
            </div>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="page-shell">
      {/* Global Page Header */}
      <header className="page-title">
        <div className="eyebrow">HOUSEHOLD WEALTH</div>
        <div className="family-header-flex">
          <div>
            <h1>Family Plans</h1>
            <p>
              Collaborate on joint household goals and shared portfolios with
              role-based permissions.
            </p>
          </div>
          {!activePlanId && (
            <button
              type="button"
              className="button primary"
              onClick={() => {
                setCreateOpen(!createOpen);
                setError("");
                setSuccessMsg("");
              }}
            >
              <Plus size={16} /> Create Family Plan
            </button>
          )}
        </div>
      </header>

      {/* Alerts & Messages */}
      {error && (
        <div className="family-alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
          <button
            type="button"
            className="alert-dismiss"
            onClick={() => setError("")}
          >
            <X size={14} />
          </button>
        </div>
      )}
      {successMsg && (
        <div className="family-alert success">
          <Check size={18} />
          <span>{successMsg}</span>
          <button
            type="button"
            className="alert-dismiss"
            onClick={() => setSuccessMsg("")}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* Create Family Plan Card */}
      {createOpen && !activePlanId && (
        <section className="card family-create-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">NEW COLLABORATIVE PLAN</span>
              <h2>Name Your Family Plan</h2>
            </div>
            <button
              type="button"
              className="icon-button"
              onClick={() => setCreateOpen(false)}
            >
              <X size={16} />
            </button>
          </div>
          <form onSubmit={handleCreatePlan} className="family-form">
            <div className="field">
              <label htmlFor="family-name">Family / Household Plan Name</label>
              <input
                id="family-name"
                type="text"
                value={newPlanName}
                onChange={e => setNewPlanName(e.target.value)}
                placeholder="e.g. Sharma Household Wealth or Joint Retirement"
                required
                maxLength={120}
              />
              <small className="note">
                You will be designated as the Owner and can invite other members as
                Editors or Viewers.
              </small>
            </div>
            <div className="button-row">
              <button type="submit" className="button primary">
                Create Plan
              </button>
              <button
                type="button"
                className="button outline"
                onClick={() => setCreateOpen(false)}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      )}

      {/* Pending Invitations Section (if any received) */}
      {!activePlanId && invitations.length > 0 && (
        <section className="card family-invites-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">INCOMING INVITATIONS</span>
              <h2>Pending Family Invitations</h2>
            </div>
            <span className="pill blue">{invitations.length} pending</span>
          </div>
          <div className="invitations-list">
            {invitations.map(inv => (
              <div key={inv.id} className="invitation-item">
                <div className="inv-info">
                  <strong>{inv.familyName || "Family Plan"}</strong>
                  <div className="inv-meta">
                    Role offered:{" "}
                    <span className="pill outline">{inv.role}</span> ·
                    Expires: {new Date(inv.expiresAt).toLocaleDateString()}
                  </div>
                </div>
                <div className="inv-actions">
                  {/* Note: The user can accept by pasting token or clicking link */}
                  <span className="note">
                    Check your email or enter invitation code below to accept.
                  </span>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Accept Invitation Code Input */}
      {!activePlanId && (
        <section className="card family-code-card">
          <div className="card-heading">
            <div>
              <span className="eyebrow">HAVE AN INVITATION CODE?</span>
              <h3>Join an Existing Family Plan</h3>
            </div>
          </div>
          <div className="invite-code-row">
            <input
              type="text"
              id="invite-token-input"
              placeholder="Paste invitation code here (e.g. inv_...)"
              className="invite-token-input"
            />
            <button
              type="button"
              className="button primary"
              onClick={() => {
                const el = document.getElementById(
                  "invite-token-input"
                ) as HTMLInputElement;
                if (el && el.value.trim()) {
                  handleAcceptInvite(el.value.trim());
                  el.value = "";
                }
              }}
            >
              Accept & Join
            </button>
          </div>
        </section>
      )}

      {/* Main Family Plans View */}
      {!activePlanId ? (
        <section className="family-plans-grid-section">
          {loading ? (
            <div className="loading-state">
              <RefreshCw className="spin" size={24} />
              <p>Loading your family plans…</p>
            </div>
          ) : families.length === 0 ? (
            <section className="card empty-card">
              <Users size={40} className="empty-icon" />
              <h3>No family plans yet</h3>
              <p>
                Create your first family plan to collaborate on shared
                investments and joint goals with your partner or family.
              </p>
              <button
                type="button"
                className="button primary"
                onClick={() => setCreateOpen(true)}
              >
                <Plus size={16} /> Create Family Plan
              </button>
            </section>
          ) : (
            <div className="family-grid">
              {families.map(plan => (
                <div
                  key={plan.id}
                  className="card family-plan-card"
                  onClick={() => setActivePlanId(plan.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={e => {
                    if (e.key === "Enter") setActivePlanId(plan.id);
                  }}
                >
                  <div className="card-heading">
                    <div>
                      <span className="eyebrow">FAMILY PLAN</span>
                      <h2>{plan.name}</h2>
                    </div>
                    <span
                      className={`pill ${plan.role === "owner" ? "good" : plan.role === "editor" ? "blue" : "outline"}`}
                    >
                      {plan.role?.toUpperCase() || "MEMBER"}
                    </span>
                  </div>
                  <div className="plan-meta-stats">
                    <span>
                      Members: <strong>{plan.memberCount ?? 1}</strong>
                    </span>
                    <span>
                      Created:{" "}
                      <strong>
                        {new Date(plan.createdAt).toLocaleDateString()}
                      </strong>
                    </span>
                  </div>
                  <div className="plan-card-footer">
                    <span className="open-link">
                      Open shared plan <ChevronRight size={16} />
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : (
        /* Plan Detail View */
        <div className="family-detail-view">
          {/* Breadcrumb / Back button */}
          <div className="family-back-bar">
            <button
              type="button"
              className="button outline small"
              onClick={() => setActivePlanId(null)}
            >
              ← Back to all family plans
            </button>
          </div>

          {planLoading || !activePlan ? (
            <div className="loading-state">
              <RefreshCw className="spin" size={24} />
              <p>Loading family plan details…</p>
            </div>
          ) : (
            <>
              {/* Detail Header Banner */}
              <section className="card family-detail-header-card">
                <div className="family-header-content">
                  <div>
                    <div className="family-badge-row">
                      <span className="eyebrow">COLLABORATIVE PLAN</span>
                      <span
                        className={`pill ${userRole === "owner" ? "good" : userRole === "editor" ? "blue" : "outline"}`}
                      >
                        {userRole === "owner" ? (
                          <>
                            <ShieldCheck size={13} /> OWNER
                          </>
                        ) : userRole === "editor" ? (
                          <>
                            <Edit3 size={13} /> EDITOR
                          </>
                        ) : (
                          <>
                            <Eye size={13} /> VIEWER (READ-ONLY)
                          </>
                        )}
                      </span>
                      <span className="pill outline">
                        <Users size={13} /> {members.length} {members.length === 1 ? "Member" : "Members"}
                      </span>
                    </div>
                    <h2>{activePlan.name}</h2>
                  </div>
                  {userRole === "owner" && (
                    <button
                      type="button"
                      className="button primary"
                      onClick={() => setInviteOpen(true)}
                    >
                      <Plus size={16} /> Invite Collaborator
                    </button>
                  )}
                </div>

                {/* Sub-nav tabs */}
                <div className="family-tabs">
                  <button
                    type="button"
                    className={`family-tab ${activeTab === "portfolio" ? "active" : ""}`}
                    onClick={() => setActiveTab("portfolio")}
                  >
                    <BriefcaseBusiness size={16} /> Shared Portfolio
                  </button>
                  <button
                    type="button"
                    className={`family-tab ${activeTab === "members" ? "active" : ""}`}
                    onClick={() => setActiveTab("members")}
                  >
                    <Users size={16} /> Members & Permissions ({members.length})
                  </button>
                  {userRole === "owner" && (
                    <button
                      type="button"
                      className={`family-tab ${activeTab === "settings" ? "active" : ""}`}
                      onClick={() => setActiveTab("settings")}
                    >
                      <Lock size={16} /> Plan Settings
                    </button>
                  )}
                </div>
              </section>

              {/* TAB 1: Shared Portfolio */}
              {activeTab === "portfolio" && familyState && (
                <div className="family-tab-content">
                  {/* Role Guidance Banner */}
                  {userRole === "viewer" ? (
                    <div className="family-notice-banner viewer">
                      <Eye size={18} />
                      <div>
                        <strong>Read-Only Viewer Access:</strong> You can view all
                        shared holdings, targets, and goals. Only the Plan Owner and
                        Editors can modify portfolio data.
                      </div>
                    </div>
                  ) : (
                    <div className="family-notice-banner editor">
                      <Edit3 size={18} />
                      <div>
                        <strong>Editor Access:</strong> Changes made here update
                        the shared family portfolio for all members. Your personal
                        account portfolio remains completely separate and private.
                      </div>
                    </div>
                  )}

                  {/* Summary Metric Cards */}
                  <div className="kpi-grid">
                    <section className="card kpi">
                      <span className="eyebrow">SHARED PORTFOLIO VALUE</span>
                      <div className="kpi-value">
                        {money(portfolioTotal(familyState.holdings))}
                      </div>
                      <small className="note">
                        Across {familyState.holdings.length} shared assets
                      </small>
                    </section>
                    <section className="card kpi">
                      <span className="eyebrow">SHARED GOALS</span>
                      <div className="kpi-value">
                        {familyState.goals.length}
                      </div>
                      <small className="note">Joint household milestones</small>
                    </section>
                    <section className="card kpi">
                      <span className="eyebrow">YOUR PERMISSION</span>
                      <div className="kpi-value" style={{ textTransform: "capitalize" }}>
                        {userRole}
                      </div>
                      <small className="note">
                        {userRole === "viewer"
                          ? "Can view and inspect"
                          : "Can add & modify holdings"}
                      </small>
                    </section>
                  </div>

                  {/* Shared Holdings Section */}
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow">ASSETS</span>
                        <h2>Shared Holdings</h2>
                      </div>
                      {userRole !== "viewer" && (
                        <button
                          type="button"
                          className="button primary small"
                          onClick={() => setAddHoldingOpen(!addHoldingOpen)}
                        >
                          <Plus size={14} /> Add Holding
                        </button>
                      )}
                    </div>

                    {/* Add Holding Form */}
                    {addHoldingOpen && userRole !== "viewer" && (
                      <form onSubmit={handleAddHolding} className="inline-add-form">
                        <h4>Add Asset to Shared Portfolio</h4>
                        <div className="grid-3">
                          <div className="field">
                            <label>Symbol / Ticker</label>
                            <input
                              type="text"
                              value={holdingSymbol}
                              onChange={e => setHoldingSymbol(e.target.value)}
                              placeholder="e.g. INFY or NIFTYBEES"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Asset Name</label>
                            <input
                              type="text"
                              value={holdingName}
                              onChange={e => setHoldingName(e.target.value)}
                              placeholder="e.g. Infosys Ltd"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Asset Class</label>
                            <select
                              value={holdingType}
                              onChange={e =>
                                setHoldingType(e.target.value as AssetType)
                              }
                            >
                              <option value="Equity">Equity</option>
                              <option value="Mutual Fund">Mutual Fund</option>
                              <option value="ETF">ETF</option>
                              <option value="Gold">Gold</option>
                              <option value="Debt">Debt</option>
                              <option value="Cash">Cash</option>
                            </select>
                          </div>
                        </div>
                        <div className="grid-3">
                          <div className="field">
                            <label>Quantity</label>
                            <input
                              type="number"
                              min="0.001"
                              step="any"
                              value={holdingQty}
                              onChange={e => setHoldingQty(e.target.value)}
                              placeholder="10"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Average Buy Price (₹)</label>
                            <input
                              type="number"
                              min="0"
                              step="any"
                              value={holdingAvgPrice}
                              onChange={e => setHoldingAvgPrice(e.target.value)}
                              placeholder="1450"
                            />
                          </div>
                          <div className="field">
                            <label>Current Price (₹)</label>
                            <input
                              type="number"
                              min="0.01"
                              step="any"
                              value={holdingCurPrice}
                              onChange={e => setHoldingCurPrice(e.target.value)}
                              placeholder="1600"
                              required
                            />
                          </div>
                        </div>
                        <div className="button-row">
                          <button
                            type="submit"
                            className="button primary"
                            disabled={savingState}
                          >
                            {savingState ? "Saving…" : "Add Holding"}
                          </button>
                          <button
                            type="button"
                            className="button outline"
                            onClick={() => setAddHoldingOpen(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {familyState.holdings.length === 0 ? (
                      <p className="empty-text">
                        No holdings added to this shared portfolio yet.
                        {userRole !== "viewer" &&
                          " Click 'Add Holding' above to get started."}
                      </p>
                    ) : (
                      <div className="table-responsive">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Asset</th>
                              <th>Class</th>
                              <th>Quantity</th>
                              <th>Current Price</th>
                              <th>Current Value</th>
                              {userRole !== "viewer" && <th>Actions</th>}
                            </tr>
                          </thead>
                          <tbody>
                            {familyState.holdings.map(h => (
                              <tr key={h.id}>
                                <td>
                                  <strong>{h.symbol}</strong>
                                  <div className="table-sub">{h.name}</div>
                                </td>
                                <td>
                                  <span className="pill outline">{h.assetType}</span>
                                </td>
                                <td>{h.quantity}</td>
                                <td>{money(h.currentPrice)}</td>
                                <td>
                                  <strong>{money(h.currentValue)}</strong>
                                </td>
                                {userRole !== "viewer" && (
                                  <td>
                                    <button
                                      type="button"
                                      className="icon-button danger"
                                      title="Remove holding"
                                      onClick={() => handleDeleteHolding(h.id)}
                                    >
                                      <Trash2 size={14} />
                                    </button>
                                  </td>
                                )}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>

                  {/* Shared Goals Section */}
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow">MILESTONES</span>
                        <h2>Shared Household Goals</h2>
                      </div>
                      {userRole !== "viewer" && (
                        <button
                          type="button"
                          className="button primary small"
                          onClick={() => setAddGoalOpen(!addGoalOpen)}
                        >
                          <Plus size={14} /> Add Shared Goal
                        </button>
                      )}
                    </div>

                    {/* Add Goal Form */}
                    {addGoalOpen && userRole !== "viewer" && (
                      <form onSubmit={handleAddGoal} className="inline-add-form">
                        <h4>Add Shared Household Goal</h4>
                        <div className="grid-2">
                          <div className="field">
                            <label>Goal Name</label>
                            <input
                              type="text"
                              value={goalName}
                              onChange={e => setGoalName(e.target.value)}
                              placeholder="e.g. Dream Family Home or Kids College"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Category</label>
                            <select
                              value={goalCategory}
                              onChange={e => setGoalCategory(e.target.value)}
                            >
                              {GOAL_CATEGORIES.map(cat => (
                                <option key={cat} value={cat}>
                                  {cat}
                                </option>
                              ))}
                            </select>
                          </div>
                        </div>
                        <div className="grid-3">
                          <div className="field">
                            <label>Target Amount (₹)</label>
                            <input
                              type="number"
                              min="1"
                              value={goalTarget}
                              onChange={e => setGoalTarget(e.target.value)}
                              placeholder="5000000"
                              required
                            />
                          </div>
                          <div className="field">
                            <label>Current Amount Saved (₹)</label>
                            <input
                              type="number"
                              min="0"
                              value={goalCurrent}
                              onChange={e => setGoalCurrent(e.target.value)}
                              placeholder="500000"
                            />
                          </div>
                          <div className="field">
                            <label>Target Date</label>
                            <input
                              type="date"
                              value={goalDate}
                              onChange={e => setGoalDate(e.target.value)}
                              required
                            />
                          </div>
                        </div>
                        <div className="button-row">
                          <button
                            type="submit"
                            className="button primary"
                            disabled={savingState}
                          >
                            {savingState ? "Saving…" : "Add Goal"}
                          </button>
                          <button
                            type="button"
                            className="button outline"
                            onClick={() => setAddGoalOpen(false)}
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    )}

                    {familyState.goals.length === 0 ? (
                      <p className="empty-text">
                        No shared goals set yet.
                        {userRole !== "viewer" &&
                          " Add goals like Home Purchase or Retirement to track progress together."}
                      </p>
                    ) : (
                      <div className="goal-cards">
                        {familyState.goals.map(g => {
                          const p = goalProjection(g);
                          return (
                            <div key={g.id} className="goal-card card">
                              <div className="card-heading">
                                <div>
                                  <span className="eyebrow">{g.category}</span>
                                  <h3>{g.name}</h3>
                                </div>
                                <span
                                  className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}
                                >
                                  {p.status}
                                </span>
                              </div>
                              <div className="goal-target">
                                {money(g.targetAmount)}{" "}
                                <small>target corpus</small>
                              </div>
                              <div className="progress">
                                <i style={{ width: `${p.progressPct}%` }} />
                              </div>
                              <div className="split-stats">
                                <span>
                                  Saved now<strong>{money(g.currentAmount)}</strong>
                                </span>
                                <span>
                                  Target date
                                  <strong>{g.targetDate}</strong>
                                </span>
                                <span>
                                  Required SIP
                                  <strong>
                                    {p.requiredMonthlyContribution === null
                                      ? "Unavailable"
                                      : money(p.requiredMonthlyContribution)}
                                  </strong>
                                </span>
                              </div>
                              {userRole !== "viewer" && (
                                <div className="button-row" style={{ marginTop: 12 }}>
                                  <button
                                    type="button"
                                    className="button outline small"
                                    onClick={() => handleDeleteGoal(g.id)}
                                  >
                                    <Trash2 size={13} /> Remove Goal
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* TAB 2: Members & Permissions */}
              {activeTab === "members" && (
                <div className="family-tab-content">
                  {/* Member List */}
                  <section className="card">
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow">ACCESS CONTROL</span>
                        <h2>Family Members ({members.length})</h2>
                      </div>
                      {userRole === "owner" && (
                        <button
                          type="button"
                          className="button primary small"
                          onClick={() => setInviteOpen(true)}
                        >
                          <Plus size={14} /> Invite Collaborator
                        </button>
                      )}
                    </div>
                    <div className="table-responsive">
                      <table className="data-table">
                        <thead>
                          <tr>
                            <th>User</th>
                            <th>Email</th>
                            <th>Role</th>
                            <th>Joined</th>
                            {userRole === "owner" && <th>Actions</th>}
                          </tr>
                        </thead>
                        <tbody>
                          {members.map(m => (
                            <tr key={m.id}>
                              <td>
                                <strong>{m.name || "Collaborator"}</strong>
                                {m.userId === user.id && (
                                  <span className="pill outline small" style={{ marginLeft: 6 }}>
                                    You
                                  </span>
                                )}
                              </td>
                              <td>{m.email || "—"}</td>
                              <td>
                                <span
                                  className={`pill ${m.role === "owner" ? "good" : m.role === "editor" ? "blue" : "outline"}`}
                                >
                                  {m.role.toUpperCase()}
                                </span>
                              </td>
                              <td>
                                {new Date(m.joinedAt).toLocaleDateString()}
                              </td>
                              {userRole === "owner" && (
                                <td>
                                  {m.role !== "owner" && (
                                    <button
                                      type="button"
                                      className="button outline small danger"
                                      onClick={() =>
                                        handleRemoveMember(m.userId, m.name || m.email)
                                      }
                                    >
                                      Remove
                                    </button>
                                  )}
                                </td>
                              )}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>

                  {/* Owner-only: Pending / Sent Invitations */}
                  {userRole === "owner" && (
                    <section className="card">
                      <div className="card-heading">
                        <div>
                          <span className="eyebrow">OUTGOING</span>
                          <h2>Sent Invitations</h2>
                        </div>
                      </div>
                      {planInvitations.length === 0 ? (
                        <p className="empty-text">
                          No pending invitations for this family plan.
                        </p>
                      ) : (
                        <div className="table-responsive">
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>Recipient Email</th>
                                <th>Role</th>
                                <th>Status</th>
                                <th>Expires At</th>
                                <th>Actions</th>
                              </tr>
                            </thead>
                            <tbody>
                              {planInvitations.map(inv => (
                                <tr key={inv.id}>
                                  <td>
                                    <strong>{inv.recipientEmail}</strong>
                                  </td>
                                  <td>
                                    <span className="pill outline">
                                      {inv.role}
                                    </span>
                                  </td>
                                  <td>
                                    <span
                                      className={`pill ${inv.status === "pending" ? "blue" : inv.status === "accepted" ? "good" : "outline"}`}
                                    >
                                      {inv.status}
                                    </span>
                                  </td>
                                  <td>
                                    {new Date(inv.expiresAt).toLocaleDateString()}
                                  </td>
                                  <td>
                                    {inv.status === "pending" && (
                                      <button
                                        type="button"
                                        className="button outline small danger"
                                        onClick={() =>
                                          handleRevokeInvite(inv.id)
                                        }
                                      >
                                        Revoke
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </section>
                  )}
                </div>
              )}

              {/* TAB 3: Plan Settings (Owner Only) */}
              {activeTab === "settings" && userRole === "owner" && (
                <div className="family-tab-content">
                  <section className="card danger-card">
                    <div className="card-heading">
                      <div>
                        <span className="eyebrow" style={{ color: "#d9534f" }}>
                          DANGER ZONE
                        </span>
                        <h2>Delete Family Plan</h2>
                      </div>
                    </div>
                    <p className="danger-desc">
                      Permanently delete <strong>"{activePlan.name}"</strong>.
                      This will revoke access for all {members.length} members,
                      cancel pending invitations, and permanently delete the
                      shared portfolio. Personal portfolios will not be affected.
                    </p>
                    <div className="button-row" style={{ marginTop: 16 }}>
                      <button
                        type="button"
                        className="button danger"
                        onClick={handleDeletePlan}
                      >
                        <Trash2 size={16} /> Delete Family Plan
                      </button>
                    </div>
                  </section>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Invite Collaborator Modal */}
      {inviteOpen && (
        <div className="family-modal-overlay">
          <div className="family-modal card">
            <div className="card-heading">
              <div>
                <span className="eyebrow">COLLABORATION</span>
                <h2>Invite Family Member</h2>
              </div>
              <button
                type="button"
                className="icon-button"
                onClick={() => {
                  setInviteOpen(false);
                  setCreatedInvite(null);
                }}
              >
                <X size={18} />
              </button>
            </div>

            {createdInvite ? (
              <div className="invite-success-view">
                <div className="success-icon-badge">
                  <Check size={28} />
                </div>
                <h3>Invitation Generated!</h3>
                <p>
                  Share this invitation code with{" "}
                  <strong>{createdInvite.recipientEmail}</strong>. They can
                  paste it into PortfolioPilot to join with{" "}
                  <strong>{createdInvite.role}</strong> permissions.
                </p>
                <div className="token-box">
                  <code>{createdInvite.token}</code>
                  <button
                    type="button"
                    className="button outline small"
                    onClick={() => copyInvite(createdInvite.token)}
                  >
                    <Copy size={14} /> {copied ? "Copied!" : "Copy Code"}
                  </button>
                </div>
                <div className="button-row" style={{ marginTop: 20 }}>
                  <button
                    type="button"
                    className="button primary"
                    onClick={() => {
                      setInviteOpen(false);
                      setCreatedInvite(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleSendInvite} className="family-form">
                <div className="field">
                  <label htmlFor="invite-email">Recipient Email Address</label>
                  <input
                    id="invite-email"
                    type="email"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                    placeholder="partner@example.com"
                    required
                  />
                  <small className="note">
                    The recipient must sign in to an account with this exact
                    email to accept.
                  </small>
                </div>
                <div className="field">
                  <label htmlFor="invite-role">Permissions Role</label>
                  <select
                    id="invite-role"
                    value={inviteRole}
                    onChange={e =>
                      setInviteRole(e.target.value as "editor" | "viewer")
                    }
                  >
                    <option value="editor">
                      Editor (Can view and modify shared portfolio & goals)
                    </option>
                    <option value="viewer">
                      Viewer (Read-only access to shared portfolio)
                    </option>
                  </select>
                </div>
                <div className="button-row">
                  <button type="submit" className="button primary">
                    Generate Invitation
                  </button>
                  <button
                    type="button"
                    className="button outline"
                    onClick={() => setInviteOpen(false)}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
