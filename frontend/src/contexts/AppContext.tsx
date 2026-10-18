import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GOAL_CATEGORIES } from "@shared/portfolio";
import type { AccountUser, PortfolioState } from "@shared/portfolio";
import { createEmptyState, DEMO_PERSONAS } from "../data/demo";
const KEY = "portfoliopilot.guest.v1";
type Status = "idle" | "saving" | "saved" | "error";
interface ContextValue {
  state: PortfolioState;
  user: AccountUser | null;
  demo: boolean;
  status: Status;
  error: string;
  ready: boolean;
  setState: (s: PortfolioState) => void;
  patch: (fn: (s: PortfolioState) => PortfolioState) => void;
  enterDemo: (id?: string) => Promise<boolean>;
  logout: () => Promise<void>;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  saveAccountState: (s: PortfolioState) => Promise<void>;
  api: (path: string, options?: RequestInit) => Promise<any>;
  setError: (s: string) => void;
}
const C = createContext<ContextValue | null>(null);
export function isPortfolioState(x: any): x is PortfolioState {
  const buckets = ["Equity", "Mutual Funds", "Gold", "Debt", "Cash"],
    risk = ["Conservative", "Moderate", "Growth", "Aggressive"],
    types = ["Equity", "Mutual Fund", "ETF", "Gold", "Debt", "Cash"],
    goalTypes = GOAL_CATEGORIES,
    noticeTypes = [
      "goal",
      "drift",
      "concentration",
      "report",
      "stress",
      "rebalance",
    ];
  const profile = x?.profile,
    prefs = x?.preferences;
  const isNum = (v: any) => typeof v === "number" && Number.isFinite(v);
  const allocation = (v: any) => v && buckets.every(k => isNum(v[k]));
  const monthText = (v: any) =>
    typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
  const history = x?.historicalReturns,
    historyRows = history?.observations,
    historicalValid =
      history === undefined ||
      history === null ||
      (history.sourceType === "user-uploaded" &&
        history.verificationStatus === "unverified" &&
        typeof history.sourceName === "string" &&
        history.sourceName.length > 0 &&
        history.sourceName.length <= 120 &&
        (history.sourceUrl === null ||
          (typeof history.sourceUrl === "string" &&
            history.sourceUrl.length <= 500 &&
            (() => {
              try {
                return new URL(history.sourceUrl).protocol === "https:";
              } catch {
                return false;
              }
            })())) &&
        typeof history.uploadedAt === "string" &&
        Number.isFinite(Date.parse(history.uploadedAt)) &&
        history.currency === "INR" &&
        history.frequency === "monthly" &&
        ["total-return", "price-only", "unknown"].includes(history.returnBasis) &&
        monthText(history.startMonth) &&
        monthText(history.endMonth) &&
        typeof history.missingDataTreatment === "string" &&
        history.missingDataTreatment.length > 0 &&
        history.missingDataTreatment.length <= 300 &&
        Array.isArray(historyRows) &&
        historyRows.length > 0 &&
        historyRows.length <= 360 &&
        historyRows[0]?.month === history.startMonth &&
        historyRows[historyRows.length - 1]?.month === history.endMonth &&
        historyRows.every(
          (row: any, index: number) =>
            monthText(row?.month) &&
            (index === 0 || row.month > historyRows[index - 1].month) &&
            row.returns &&
            buckets.every(
              bucket =>
                row.returns[bucket] === null ||
                (isNum(row.returns[bucket]) &&
                  row.returns[bucket] > -100 &&
                  row.returns[bucket] <= 500)
            )
        )),
    config = x?.backtestConfig,
    validWeights = (value: any) =>
      allocation(value) &&
      buckets.every((key: string) => value[key] >= 0 && value[key] <= 100) &&
      Math.abs(buckets.reduce((sum: number, key: string) => sum + value[key], 0) - 100) <= 0.05,
    backtestValid =
      config === undefined ||
      config === null ||
      (!!history &&
        validWeights(config.baselineWeights) &&
        validWeights(config.allWeatherWeights) &&
        ["monthly", "quarterly", "annual", "none"].includes(
          config.rebalanceFrequency
        ) &&
        isNum(config.transactionCostBps) &&
        config.transactionCostBps >= 0 &&
        config.transactionCostBps <= 1000 &&
        isNum(config.riskFreeAnnualPct) &&
        config.riskFreeAnnualPct > -100 &&
        config.riskFreeAnnualPct <= 100 &&
        monthText(config.startMonth) &&
        monthText(config.endMonth) &&
        config.startMonth <= config.endMonth);
  return (
    !!x &&
    x.schemaVersion === 1 &&
    !!profile &&
    typeof profile.name === "string" &&
    (profile.age === null || isNum(profile.age)) &&
    typeof profile.employment === "string" &&
    isNum(profile.annualIncome) &&
    isNum(profile.monthlyIncome) &&
    isNum(profile.monthlyInvestment) &&
    isNum(profile.existingAssets) &&
    (profile.riskProfile === null || risk.includes(profile.riskProfile)) &&
    (profile.riskScore === null || isNum(profile.riskScore)) &&
    ["", "New", "Some experience", "Experienced", "Professional"].includes(
      profile.experience
    ) &&
    !!prefs &&
    prefs.currency === "INR" &&
    prefs.notificationTypes &&
    noticeTypes.every(k => typeof prefs.notificationTypes[k] === "boolean") &&
    ["Off", "Monthly", "Quarterly"].includes(prefs.reportFrequency) &&
    typeof prefs.aiCoachConsent === "boolean" &&
    typeof prefs.aiReportConsent === "boolean" &&
    Array.isArray(x.holdings) &&
    x.holdings.every(
      (h: any) =>
        h &&
        typeof h.id === "string" &&
        typeof h.symbol === "string" &&
        typeof h.name === "string" &&
        types.includes(h.assetType) &&
        typeof h.sector === "string" &&
        typeof h.geography === "string" &&
        isNum(h.quantity) &&
        isNum(h.averagePrice) &&
        isNum(h.currentPrice) &&
        isNum(h.currentValue)
    ) &&
    Array.isArray(x.goals) &&
    x.goals.every(
      (g: any) =>
        g &&
        typeof g.id === "string" &&
        typeof g.name === "string" &&
        goalTypes.includes(g.category) &&
        isNum(g.targetAmount) &&
        g.targetAmount > 0 &&
        isNum(g.currentAmount) &&
        g.currentAmount >= 0 &&
        isNum(g.monthlyContribution) &&
        g.monthlyContribution >= 0 &&
        isNum(g.expectedReturnPct) &&
        g.expectedReturnPct >= -100 &&
        g.expectedReturnPct <= 100 &&
        isNum(g.inflationPct) &&
        g.inflationPct >= -100 &&
        g.inflationPct <= 100 &&
        typeof g.targetDate === "string" &&
        Number.isFinite(Date.parse(g.targetDate)) &&
        typeof g.createdAt === "string" &&
        Number.isFinite(Date.parse(g.createdAt))
    ) &&
    Array.isArray(x.snapshots) &&
    x.snapshots.every(
      (s: any) =>
        s &&
        typeof s.id === "string" &&
        typeof s.date === "string" &&
        typeof s.label === "string" &&
        isNum(s.totalValue) &&
        ["demo", "import", "manual"].includes(s.source)
    ) &&
    Array.isArray(x.notifications) &&
    x.notifications.every(
      (n: any) =>
        n &&
        typeof n.id === "string" &&
        noticeTypes.includes(n.type) &&
        typeof n.title === "string" &&
        typeof n.message === "string" &&
        typeof n.createdAt === "string" &&
        typeof n.read === "boolean"
    ) &&
    Array.isArray(x.reports) &&
    x.reports.every(
      (r: any) =>
        r &&
        typeof r.id === "string" &&
        typeof r.createdAt === "string" &&
        typeof r.title === "string" &&
        Array.isArray(r.sections) &&
        r.sections.every(
          (section: any) =>
            typeof section.heading === "string" &&
            typeof section.body === "string"
        ) &&
        ["deterministic", "ai"].includes(r.commentarySource)
    ) &&
    Array.isArray(x.coachMessages) &&
    x.coachMessages.every(
      (m: any) =>
        m &&
        typeof m.id === "string" &&
        typeof m.question === "string" &&
        typeof m.answer === "string" &&
        ["deterministic", "ai"].includes(m.source) &&
        typeof m.createdAt === "string"
    ) &&
    allocation(x.allocationTargets) &&
    allocation(x.tolerancesPct) &&
    historicalValid &&
    backtestValid &&
    ["demo", "import", "manual", "account"].includes(x.dataOrigin) &&
    typeof x.createdAt === "string" &&
    typeof x.updatedAt === "string"
  );
}
async function request(path: string, options: RequestInit = {}) {
  const r = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(options.headers || {}) },
  });
  const body = await r.json().catch(() => ({}));
  if (!r.ok)
    throw new Error(
      body.error || body.message || `Request failed (${r.status})`
    );
  return body;
}
export function AppProvider({ children }: { children: React.ReactNode }) {
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionAttempt = useRef(0);
  const pendingAccountSave = useRef<Promise<void> | null>(null);
  const [state, setStateValue] = useState<PortfolioState>(() => {
      try {
        const v = JSON.parse(localStorage.getItem(KEY) || "null");
        return isPortfolioState(v) ? v : createEmptyState();
      } catch {
        return createEmptyState();
      }
    }),
    [user, setUser] = useState<AccountUser | null>(null),
    [demo, setDemo] = useState(false),
    [status, setStatus] = useState<Status>("idle"),
    [error, setErr] = useState(""),
    [ready, setReady] = useState(false);
  const setState = useCallback(
    (s: PortfolioState) => {
      setStateValue(s);
      if (!user) {
        try {
          localStorage.setItem(KEY, JSON.stringify(s));
        } catch {}
      }
    },
    [user]
  );
  const patch = useCallback(
    (fn: (s: PortfolioState) => PortfolioState) =>
      setState({ ...fn(state), updatedAt: new Date().toISOString() }),
    [state, setState]
  );
  const api = useCallback(
    (path: string, options?: RequestInit) => request(path, options),
    []
  );
  useEffect(() => {
    let live = true;
    const attempt = sessionAttempt.current;
    request("/api/app/session")
      .then(({ user: u, state: s }) => {
        if (!live || attempt !== sessionAttempt.current) return;
        if (u && isPortfolioState(s)) {
          setUser(u);
          setStateValue(s);
        } else if (!u) {
          setUser(null);
        }
      })
      .catch(() => {})
      .finally(() => live && setReady(true));
    return () => {
      live = false;
    };
  }, []);
  const saveAccountState = useCallback(
    async (s: PortfolioState) => {
      if (!user) {
        setState(s);
        return;
      }
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      setStatus("saving");
      setErr("");
      const previous = pendingAccountSave.current;
      const pending = (async () => {
        if (previous) {
          try {
            await previous;
          } catch {}
        }
        try {
          const result = await request("/api/app/state", {
            method: "PUT",
            body: JSON.stringify({ state: s }),
          });
          if (!isPortfolioState(result.state))
            throw new Error("The server returned invalid portfolio state.");
          setStateValue(result.state);
          setStatus("saved");
        } catch (e) {
          setStatus("error");
          setErr(e instanceof Error ? e.message : "Could not save changes.");
          throw e;
        }
      })();
      pendingAccountSave.current = pending;
      try {
        await pending;
      } finally {
        if (pendingAccountSave.current === pending)
          pendingAccountSave.current = null;
      }
    },
    [user, setState]
  );
  const enterDemo = useCallback(
    async (id = "vikram"): Promise<boolean> => {
      sessionAttempt.current += 1;
      if (saveTimer.current) {
        clearTimeout(saveTimer.current);
        saveTimer.current = null;
      }
      try {
        if (user) {
          if (pendingAccountSave.current)
            await pendingAccountSave.current;
          const saved = await request("/api/app/state", {
            method: "PUT",
            body: JSON.stringify({ state }),
          });
          if (!isPortfolioState(saved.state))
            throw new Error("The server returned invalid portfolio state.");
          setStateValue(saved.state);
        }
        // Idempotent logout also clears a cookie not yet reflected in React
        // while the initial session hydration is still in flight.
        await request("/api/app/logout", {
          method: "POST",
          body: "{}",
        });
      } catch (e) {
        setStatus("error");
        setErr(
          e instanceof Error
            ? `Could not switch safely to demo: ${e.message}`
            : "Could not switch safely to demo. Please try again."
        );
        return false;
      }
      const p = DEMO_PERSONAS.find(x => x.id === id) || DEMO_PERSONAS[0];
      setUser(null);
      setDemo(true);
      setReady(true);
      const demoState = structuredClone(p.state);
      setStateValue(demoState);
      try {
        localStorage.setItem(KEY, JSON.stringify(demoState));
      } catch {}
      setStatus("idle");
      setErr("");
      return true;
    },
    [user, state]
  );
  const save = useCallback(
    (s: PortfolioState) => {
      setStateValue(s);
      if (!user) {
        try {
          localStorage.setItem(KEY, JSON.stringify(s));
        } catch {}
        return;
      }
      if (saveTimer.current) clearTimeout(saveTimer.current);
      setStatus("saving");
      setErr("");
      saveTimer.current = setTimeout(() => {
        saveTimer.current = null;
        void saveAccountState(s).catch(() => {});
      }, 650);
    },
    [user, saveAccountState]
  );
  const login = useCallback(async (email: string, password: string) => {
    const out = await request("/api/app/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
    if (!out.user || !isPortfolioState(out.state))
      throw new Error("Invalid account response.");
    setUser(out.user);
    setDemo(false);
    setStateValue(out.state);
  }, []);
  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const out = await request("/api/app/register", {
        method: "POST",
        body: JSON.stringify({ name, email, password }),
      });
      if (!out.user || !isPortfolioState(out.state))
        throw new Error("Invalid account response.");
      setUser(out.user);
      setDemo(false);
      setStateValue(out.state);
    },
    []
  );
  const logout = useCallback(async () => {
    await request("/api/app/logout", { method: "POST", body: "{}" });
    setUser(null);
    setDemo(false);
    setStateValue(createEmptyState());
  }, []);
  const value = useMemo(
    () => ({
      state,
      user,
      demo,
      status,
      error,
      ready,
      setState: save,
      patch,
      enterDemo,
      logout,
      login,
      register,
      saveAccountState,
      api,
      setError: setErr,
    }),
    [
      state,
      user,
      demo,
      status,
      error,
      ready,
      save,
      patch,
      enterDemo,
      logout,
      login,
      register,
      saveAccountState,
      api,
    ]
  );
  return <C.Provider value={value}>{children}</C.Provider>;
}
export function useApp() {
  const c = useContext(C);
  if (!c) throw new Error("AppProvider missing");
  return c;
}
