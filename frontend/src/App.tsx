import React, { useMemo, useState } from "react";
import { Route, Switch, useLocation } from "wouter";
import { AppProvider, useApp } from "./contexts/AppContext";
import BacktestPage from "./BacktestPage";
import { ReportDownload } from "./components/ReportDownload";
import { downloadBytes, exportSettingsXlsx } from "./lib/reportExports";
import {
  calculateReturnCorrelations,
  runHistoricalComparison,
} from "@shared/backtest";
import {
  DEMO_PERSONAS,
  SCENARIOS,
  SYNTHETIC_CORRELATIONS,
  createEmptyState,
} from "./data/demo";
import {
  allocationReview,
  assetAllocation,
  calculateStress,
  deterministicCoachAnswer,
  generatePortfolioReport,
  goalProjection,
  parseHoldingsCSV,
  portfolioTotal,
  scoreDiversification,
  weatherExposure,
  assetBucketFor,
} from "@shared/finance";
import type {
  Goal,
  PortfolioState,
  StressScenario,
  AssetBucket,
  Holding,
  RiskProfile,
} from "@shared/portfolio";
import { ASSET_BUCKETS, GOAL_CATEGORIES } from "@shared/portfolio";
import {
  EXPERIENCE_LEVELS,
  PROFILE_LIMITS,
  RISK_QUESTIONS,
  assessRisk,
  draftFromProfile,
  emptyRiskAnswers,
  validateProfileDraft,
  type ProfileDraft,
  type ProfileField,
  type ProfileValidation,
  type RiskAnswers,
} from "@shared/onboarding";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip as ChartTooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  BookOpen,
  BriefcaseBusiness,
  Check,
  ChevronDown,
  CircleHelp,
  CloudSun,
  Compass,
  Download,
  FileText,
  Heart,
  Home,
  Layers,
  LogOut,
  Menu,
  MessageCircle,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Sparkles,
  Target,
  Trash2,
  Upload,
  Wallet,
  X,
} from "lucide-react";
import { Link } from "wouter";
const DISCLAIMER =
  "PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.";
const money = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Number.isFinite(n) ? n : 0);
const number = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(n);
const nav = [
  { to: "/dashboard", label: "Overview", icon: Home },
  { to: "/portfolio", label: "Portfolio", icon: BriefcaseBusiness },
  { to: "/backtest", label: "Backtest", icon: BarChart3 },
  { to: "/goals", label: "Goals", icon: Target },
  { to: "/stress-test", label: "Stress test", icon: Activity },
  { to: "/rebalance", label: "All-weather", icon: CloudSun },
  { to: "/ai-coach", label: "Coach", icon: MessageCircle },
  { to: "/notifications", label: "Notifications", icon: Bell },
  { to: "/settings", label: "Settings", icon: Settings },
  { to: "/help", label: "Help", icon: CircleHelp },
];
function Disclaimer() {
  return <p className="disclaimer">{DISCLAIMER}</p>;
}
function Mark({ small = false }: { small?: boolean }) {
  return (
    <a
      className={`brand ${small ? "brand-small" : ""}`}
      href="/"
      aria-label="PortfolioPilot home"
    >
      <img src="/portfolio-pilot.svg" alt="" />
      <span>
        Portfolio<span className="brand-light">Pilot</span>
      </span>
    </a>
  );
}
function Button({
  children,
  onClick,
  href,
  kind = "primary",
  type = "button",
  disabled = false,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  kind?: string;
  type?: "button" | "submit";
  disabled?: boolean;
}) {
  const c = `button ${kind}`;
  return href ? (
    <Link href={href} className={c}>
      {children}
    </Link>
  ) : (
    <button type={type} className={c} onClick={onClick} disabled={disabled}>
      {children}
    </button>
  );
}
function Card({
  children,
  className = "",
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <section className={`card ${className}`}>{children}</section>;
}
function Title({
  eyebrow,
  title,
  sub,
}: {
  eyebrow?: string;
  title: string;
  sub?: string;
}) {
  return (
    <header className="page-title">
      {eyebrow && <div className="eyebrow">{eyebrow}</div>}
      <h1>{title}</h1>
      {sub && <p>{sub}</p>}
    </header>
  );
}
function Status() {
  const { status, error } = useApp();
  return status === "saving" ? (
    <span className="status">Saving…</span>
  ) : status === "saved" ? (
    <span className="status good">
      <Check size={14} /> Saved
    </span>
  ) : status === "error" ? (
    <span className="status bad" role="alert">
      Not saved: {error}
    </span>
  ) : null;
}
function Layout({ children }: { children: React.ReactNode }) {
  const [loc, setLoc] = useLocation();
  const { state, user, demo, logout, enterDemo } = useApp();
  const usePersona = enterDemo;
  const [open, setOpen] = useState(false);
  return (
    <div className="app-shell">
      <aside className={`sidebar ${open ? "is-open" : ""}`}>
        <div className="side-head">
          <Mark small />
          <button
            className="icon-btn mobile-close"
            aria-label="Close navigation"
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
        </div>
        <div className="workspace">
          <div className="avatar">
            {(user?.name || state.profile.name || "G")
              .slice(0, 1)
              .toUpperCase()}
          </div>
          <div>
            <strong>
              {user?.name || state.profile.name || "Guest workspace"}
            </strong>
            <small>
              {demo
                ? "Demo portfolio"
                : user
                  ? "Saved account"
                  : "Local workspace"}
            </small>
          </div>
          <ChevronDown size={15} />
        </div>
        <nav aria-label="Main navigation">
          {nav.map(item => (
            <Link
              key={item.to}
              href={item.to}
              className={`nav-link ${loc === item.to || (item.to === "/goals" && loc.startsWith("/goals/")) ? "active" : ""}`}
              onClick={() => setOpen(false)}
            >
              <item.icon size={18} />
              <span>{item.label}</span>
              {item.to === "/notifications" &&
                state.notifications.some(n => !n.read) && (
                  <i aria-label="Unread notification" />
                )}
            </Link>
          ))}
        </nav>
        <div className="side-bottom">
          <div className="trust">
            <ShieldCheck size={16} />
            <span>
              No broker connection
              <br />
              No trades or transfers
            </span>
          </div>
          <button
            className="nav-link logout"
            onClick={() =>
              user ? void logout().then(() => setLoc("/")) : setLoc("/")
            }
          >
            <LogOut size={17} />
            {user ? "Sign out" : "Exit workspace"}
          </button>
        </div>
      </aside>
      <main className="main">
        <div className="topbar">
          <button
            className="icon-btn menu-btn"
            aria-label="Open navigation"
            onClick={() => setOpen(true)}
          >
            <Menu />
          </button>
          <div className="crumb">
            PortfolioPilot <span>/</span>{" "}
            <b>{nav.find(n => n.to === loc)?.label || "Workspace"}</b>
          </div>
          <div className="top-actions">
            <Status />
            {demo && (
              <>
                <select
                  className="persona-select"
                  aria-label="Choose demo persona"
                  value={state.profile.name}
                  onChange={e => {
                    const p = DEMO_PERSONAS.find(
                      x => x.name === e.target.value
                    );
                    if (p) usePersona(p.id);
                  }}
                >
                  {DEMO_PERSONAS.map(p => (
                    <option key={p.id} value={p.name}>
                      {p.name}
                    </option>
                  ))}
                </select>
                <span className="demo-badge">
                  <i /> Demo Data
                </span>
              </>
            )}
            {user && <span className="account-badge">Saved account</span>}
          </div>
        </div>
        <div className="page-wrap">
          {children}
          <Disclaimer />
        </div>
      </main>
      <nav className="mobile-nav" aria-label="Mobile navigation">
        {nav.slice(0, 5).map(item => (
          <Link
            key={item.to}
            href={item.to}
            aria-label={item.label}
            className={loc === item.to ? "active" : ""}
          >
            <item.icon size={20} />
            <span>{item.label}</span>
          </Link>
        ))}
      </nav>
      {open && (
        <button
          className="scrim"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
        />
      )}
    </div>
  );
}
function Landing() {
  const { enterDemo } = useApp();
  const setLoc = useLocation()[1];
  const stat = [
    {
      n: money(portfolioTotal(DEMO_PERSONAS[0].state.holdings)),
      l: "Sample portfolio value",
    },
    { n: String(DEMO_PERSONAS[0].state.goals.length), l: "Life goals mapped" },
    {
      n: `${scoreDiversification(DEMO_PERSONAS[0].state.holdings, SYNTHETIC_CORRELATIONS).total} / 100`,
      l: "Diversification method score",
    },
  ];
  return (
    <div className="landing">
      <header className="landing-nav">
        <Mark />
        <div>
          <Link href="/login">Sign in</Link>
          <Button kind="outline" href="/register">
            Create account
          </Button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-copy">
          <div className="eyebrow">Portfolio intelligence, made personal</div>
          <h1>Your Portfolio. Your Goals. Your All-Weather Strategy.</h1>
          <p className="hero-lead">
            Know what your portfolio is carrying—and how it connects to the life
            you’re building. Explore goals, diversification and illustrative
            stress scenarios without linking a broker.
          </p>
          <div className="hero-actions">
            <Button onClick={() => setLoc("/onboarding")}>
              Analyze My Portfolio <ArrowRight size={16} />
            </Button>
            <Button
              kind="outline"
              onClick={async () => {
                if (await enterDemo("vikram")) setLoc("/dashboard");
              }}
            >
              Explore Demo
            </Button>
          </div>
          <div className="hero-foot">
            <ShieldCheck size={17} /> Educational analysis only · No trading ·
            No account connection
          </div>
        </div>
        <div className="hero-visual">
          <div className="visual-top">
            <div>
              <span className="demo-badge">
                <i /> DEMO DATA
              </span>
              <h3>A clearer view of the whole picture.</h3>
            </div>
            <Compass size={26} />
          </div>
          <div className="sample-value">
            <small>Illustrative portfolio value</small>
            <b>{money(portfolioTotal(DEMO_PERSONAS[0].state.holdings))}</b>
            <span>Across 22 synthetic holdings</span>
          </div>
          <div
            className="mini-chart"
            aria-label="Illustrative portfolio value history"
          >
            <svg viewBox="0 0 600 145" role="img">
              <title>Illustrative sample portfolio trend</title>
              <path
                d="M0 116 C65 100 75 119 126 86 S205 90 250 70 306 92 354 48 415 58 467 34 533 44 600 15"
                fill="none"
                stroke="#8cb4c7"
                strokeWidth="4"
              />
              <path
                d="M0 116 C65 100 75 119 126 86 S205 90 250 70 306 92 354 48 415 58 467 34 533 44 600 15 L600 145 L0 145Z"
                fill="#8cb4c7"
                opacity=".09"
              />
            </svg>
            <div>
              <span>Jan ’21</span>
              <span>Sample value snapshots · not market data</span>
              <span>Apr ’26</span>
            </div>
          </div>
          <div className="visual-stats">
            {stat.map(s => (
              <div key={s.l}>
                <b>{s.n}</b>
                <small>{s.l}</small>
              </div>
            ))}
          </div>
          <div className="allocation-preview">
            <span>Asset mix</span>
            {[
              ["Equity", 40],
              ["Mutual funds", 25],
              ["Debt", 20],
              ["Gold", 10],
              ["Cash", 5],
            ].map(([n, v]) => (
              <div key={n}>
                <span>{n}</span>
                <div className="allocation-line">
                  <i style={{ width: `${v}%` }} />
                </div>
                <b>{v}%</b>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section intro-section">
        <div>
          <span className="eyebrow">A better starting point</span>
          <h2>
            Investing has many moving parts.
            <br />
            Your decisions don’t have to.
          </h2>
        </div>
        <p>
          PortfolioPilot brings your holdings, goals and risk scenarios into one
          calm workspace. It explains what is known, what is assumed, and where
          a closer look may help.
        </p>
      </section>
      <section className="feature-grid">
        {[
          [
            Target,
            "01",
            "Goal Mapping",
            "Connect today’s savings and monthly contributions to dates and future costs.",
          ],
          [
            Activity,
            "02",
            "Stress Testing",
            "Explore how illustrative market shocks may change portfolio value and goal sensitivity.",
          ],
          [
            Layers,
            "03",
            "Diversification Health",
            "See exposure by asset class, sector, holding and synthetic correlation.",
          ],
          [
            CloudSun,
            "04",
            "All-Weather Rebalancing",
            "Review an all-weather-inspired framework and compare editable target ranges.",
          ],
        ].map(([Icon, n, title, body]: any) => (
          <Card key={title} className="feature-card">
            <div className="feature-num">{n}</div>
            <Icon size={22} />
            <h3>{title}</h3>
            <p>{body}</p>
            <span className="feature-link">
              Explore the analysis <ArrowRight size={14} />
            </span>
          </Card>
        ))}
      </section>
      <section className="how section">
        <div className="eyebrow">A useful review in three steps</div>
        <h2>Understand first. Decide for yourself.</h2>
        <div className="how-grid">
          {[
            [
              "01",
              "Bring a picture",
              "Add holdings manually, import a CSV or start with synthetic demo data.",
            ],
            [
              "02",
              "Make it about your goals",
              "Set targets, dates and contributions to see transparent projections.",
            ],
            [
              "03",
              "Explore the what-ifs",
              "Review stress sensitivities and allocation drift. Nothing is traded.",
            ],
          ].map(x => (
            <div key={x[0]}>
              <span>{x[0]}</span>
              <h3>{x[1]}</h3>
              <p>{x[2]}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="coach-example">
        <div>
          <div className="eyebrow">A grounded coach, not a crystal ball</div>
          <h2>Questions deserve context.</h2>
          <p>
            The Coach explains calculations using the portfolio you entered.
            Guest answers stay local in your browser; account AI is opt-in.
          </p>
          <Button
            kind="light"
            onClick={async () => {
              if (await enterDemo("vikram")) setLoc("/ai-coach");
            }}
          >
            See a Coach example <ArrowRight size={16} />
          </Button>
        </div>
        <div className="chat-sample">
          <small>EXAMPLE · SYNTHETIC PORTFOLIO</small>
          <p className="question">
            “What happens to my portfolio if equities fall 20%?”
          </p>
          <p className="answer">
            “Using an illustrative −20% equity and −14% mutual-fund
            assumption—with other buckets unchanged—the estimated change is
            shown as a sensitivity, not a forecast.”
          </p>
          <span>Assumptions shown · No trading</span>
        </div>
      </section>
      <section className="privacy section">
        <ShieldCheck size={24} />
        <div>
          <h2>Your data stays yours.</h2>
          <p>
            No brokerage credentials. No money movement. No trades. Guest/demo
            activity stays in this browser; an account saves to PortfolioPilot
            only through the account API.
          </p>
        </div>
        <Button kind="outline" href="/help">
          How privacy works
        </Button>
      </section>
      <footer className="landing-footer">
        <Mark small />
        <p>{DISCLAIMER}</p>
      </footer>
    </div>
  );
}
function Auth({ mode }: { mode: "login" | "register" }) {
  const { login, register, enterDemo } = useApp();
  const [, setLoc] = useLocation();
  const [name, setName] = useState(""),
    [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    if (mode === "register" && name.trim().length < 2) {
      setErr("Enter a name with at least 2 characters.");
      return;
    }
    if (!/^\S+@\S+\.\S+$/.test(email)) {
      setErr("Enter a valid email address.");
      return;
    }
    if (password.length < 12) {
      setErr("Use a password of at least 12 characters.");
      return;
    }
    setBusy(true);
    try {
      if (mode === "login") await login(email, password);
      else await register(name, email, password);
      setLoc(mode === "register" ? "/onboarding" : "/dashboard");
    } catch (e) {
      setErr(
        e instanceof Error ? e.message : "We could not complete that request."
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-shell">
      <div className="auth-art">
        <Mark />
        <div>
          <span className="eyebrow">A considered view of your finances</span>
          <h1>Build clarity around the goals that matter.</h1>
          <p>
            Explore with a private local demo—or create an account when you’re
            ready to save.
          </p>
        </div>
        <p>PortfolioPilot is not a broker and does not trade.</p>
      </div>
      <div className="auth-main">
        <Link href="/" className="back-link">
          ← Back to PortfolioPilot
        </Link>
        <Card className="auth-card">
          <span className="eyebrow">
            {mode === "login" ? "Welcome back" : "Get started"}
          </span>
          <h2>{mode === "login" ? "Sign in" : "Create your account"}</h2>
          <p>
            Accounts start with an empty portfolio. You’ll add your profile and
            holdings during onboarding.
          </p>
          <form onSubmit={submit}>
            {mode === "register" && (
              <label>
                Full name
                <input
                  required
                  autoComplete="name"
                  value={name}
                  onChange={e => setName(e.target.value)}
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={e => setEmail(e.target.value)}
              />
            </label>
            <label>
              Password
              <input
                type="password"
                required
                minLength={12}
                autoComplete={
                  mode === "login" ? "current-password" : "new-password"
                }
                value={password}
                onChange={e => setPassword(e.target.value)}
              />
              <small>At least 12 characters</small>
            </label>
            {err && (
              <p className="error-box" role="alert">
                {err}
              </p>
            )}
            <button className="button primary full" disabled={busy}>
              {busy
                ? "Please wait…"
                : mode === "login"
                  ? "Sign in"
                  : "Create account"}
            </button>
          </form>
          <div className="auth-sep">or</div>
          <Button
            kind="outline full"
            onClick={async () => {
              if (await enterDemo()) setLoc("/dashboard");
            }}
          >
            Explore a demo instead
          </Button>
          <p className="auth-switch">
            {mode === "login" ? (
              <>
                New to PortfolioPilot?{" "}
                <Link href="/register">Create account</Link>
              </>
            ) : (
              <>
                Already have an account? <Link href="/login">Sign in</Link>
              </>
            )}
          </p>
        </Card>
        <Disclaimer />
      </div>
    </div>
  );
}
function Onboarding() {
  const { state, setState, user, demo, enterDemo } = useApp();
  const [, setLoc] = useLocation();
  const [step, setStep] = useState(0),
    [draft, setDraft] = useState<ProfileDraft>(() =>
      draftFromProfile(state.profile)
    ),
    [profileErrors, setProfileErrors] = useState<
      ProfileValidation["errors"]
    >({}),
    [warnings, setWarnings] = useState<string[]>([]),
    [answers, setAnswers] = useState<RiskAnswers>(emptyRiskAnswers),
    [showMissing, setShowMissing] = useState(false),
    [done, setDone] = useState(false),
    [msg, setMsg] = useState("");
  const editDraft = (field: ProfileField, value: string) => {
    setDraft(d => ({ ...d, [field]: value }));
    setProfileErrors(({ [field]: _cleared, ...rest }) => rest);
  };
  const fieldError = (field: ProfileField) =>
    profileErrors[field] ? (
      <small className="field-error" role="alert">
        {profileErrors[field]}
      </small>
    ) : null;
  function continueToRisk() {
    const result = validateProfileDraft(draft);
    setProfileErrors(result.errors);
    setWarnings(result.warnings);
    if (!result.profile) return;
    setState({
      ...state,
      profile: { ...state.profile, ...result.profile },
      dataOrigin: user ? ("account" as const) : ("manual" as const),
    });
    setStep(1);
  }
  function finish() {
    const result = assessRisk(answers);
    if (!result) {
      setShowMissing(true);
      return;
    }
    const updated = {
      ...state,
      profile: {
        ...state.profile,
        riskProfile: result.profile,
        riskScore: result.score,
      },
      dataOrigin: user ? ("account" as const) : ("manual" as const),
    };
    setState(updated);
    setDone(true);
    setMsg(
      `Your Portfolio Risk Profile: ${result.profile}. This is a self-reported educational result, not a professional assessment.`
    );
    setTimeout(() => setLoc("/portfolio"), 800);
  }
  return (
    <Layout>
      <Title
        eyebrow={`Setup · Step ${step + 1} of 2`}
        title={
          step === 0 ? "Start with your picture" : "A few questions about risk"
        }
        sub="Your account starts empty. This information stays editable in Settings."
      />
      <Card className="onboard-card">
        {step === 0 ? (
          <div className="form-grid">
            <label>
              Name
              <input
                value={draft.name}
                maxLength={PROFILE_LIMITS.nameMax}
                aria-invalid={Boolean(profileErrors.name)}
                onChange={e => editDraft("name", e.target.value)}
                placeholder="Your name"
              />
              {fieldError("name")}
            </label>
            <label>
              Age
              <input
                type="number"
                inputMode="numeric"
                min={PROFILE_LIMITS.ageMin}
                max={PROFILE_LIMITS.ageMax}
                step="1"
                value={draft.age}
                aria-invalid={Boolean(profileErrors.age)}
                onChange={e => editDraft("age", e.target.value)}
              />
              {fieldError("age")}
            </label>
            <label>
              Employment (optional)
              <input
                value={draft.employment}
                maxLength={PROFILE_LIMITS.employmentMax}
                aria-invalid={Boolean(profileErrors.employment)}
                onChange={e => editDraft("employment", e.target.value)}
                placeholder="Role or employment"
              />
              {fieldError("employment")}
            </label>
            <label>
              Annual income (₹, optional)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={draft.annualIncome}
                aria-invalid={Boolean(profileErrors.annualIncome)}
                onChange={e => editDraft("annualIncome", e.target.value)}
              />
              {fieldError("annualIncome")}
            </label>
            <label>
              Monthly investment (₹, optional)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={draft.monthlyInvestment}
                aria-invalid={Boolean(profileErrors.monthlyInvestment)}
                onChange={e => editDraft("monthlyInvestment", e.target.value)}
              />
              {fieldError("monthlyInvestment")}
            </label>
            <label>
              Investing experience
              <select
                value={draft.experience}
                aria-invalid={Boolean(profileErrors.experience)}
                onChange={e => editDraft("experience", e.target.value)}
              >
                <option value="">Choose…</option>
                {EXPERIENCE_LEVELS.map(x => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
              {fieldError("experience")}
            </label>
            <label>
              Existing assets (₹, optional)
              <input
                type="number"
                inputMode="decimal"
                min="0"
                value={draft.existingAssets}
                aria-invalid={Boolean(profileErrors.existingAssets)}
                onChange={e => editDraft("existingAssets", e.target.value)}
              />
              {fieldError("existingAssets")}
            </label>
            {Object.keys(profileErrors).length > 0 && (
              <p className="wide error-box" role="alert">
                Please fix the highlighted fields to continue.
              </p>
            )}
            <p className="wide note">
              Add holdings after setup or use CSV import. No brokerage login is
              requested.
            </p>
          </div>
        ) : (
          <div className="question-list">
            {warnings.map(w => (
              <p key={w} className="note">
                {w}
              </p>
            ))}
            {RISK_QUESTIONS.map((q, i) => (
              <label key={q.prompt} className="question-row">
                <span>
                  {i + 1}. {q.prompt}
                </span>
                <select
                  aria-label={`Answer ${i + 1}`}
                  aria-invalid={showMissing && answers[i] === null}
                  value={answers[i] ?? ""}
                  disabled={done}
                  onChange={e =>
                    setAnswers(
                      answers.map((a, j) =>
                        j === i
                          ? e.target.value === ""
                            ? null
                            : Number(e.target.value)
                          : a
                      )
                    )
                  }
                >
                  <option value="">Choose an answer…</option>
                  {q.options.map((label, score) => (
                    <option key={label} value={score}>
                      {label}
                    </option>
                  ))}
                </select>
                {showMissing && answers[i] === null && (
                  <small className="field-error" role="alert">
                    Please answer this question.
                  </small>
                )}
              </label>
            ))}
            <p className="note">
              This questionnaire returns a “Portfolio Risk Profile” from your
              answers. It is educational, not a professional assessment.
            </p>
          </div>
        )}
        {msg && <p className="success-box">{msg}</p>}
        <div className="form-actions">
          <Button
            kind="outline"
            onClick={() => setStep(0)}
            disabled={step === 0 || done}
          >
            Back
          </Button>
          {step === 0 ? (
            <Button onClick={continueToRisk}>
              Continue <ArrowRight size={16} />
            </Button>
          ) : (
            <Button onClick={finish} disabled={done}>
              Complete setup
            </Button>
          )}
        </div>
        <p className="note">
          Want sample data instead?{" "}
          <button
            className="text-button"
            onClick={async () => {
              if (await enterDemo("vikram")) setLoc("/dashboard");
            }}
          >
            Explore demo portfolio
          </button>
        </p>
      </Card>
    </Layout>
  );
}
function Empty({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">
        <Layers />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {action}
    </div>
  );
}
function Kpi({
  label,
  value,
  detail,
  icon: Icon,
}: {
  label: string;
  value: string;
  detail?: string;
  icon: any;
}) {
  return (
    <Card className="kpi">
      <div className="kpi-top">
        <span>{label}</span>
        <Icon size={18} />
      </div>
      <b>{value}</b>
      <small>{detail}</small>
    </Card>
  );
}
function Donut({ data }: { data: { name: string; value: number }[] }) {
  const colors = ["#55799a", "#78a6ac", "#b8a27b", "#91a5b7", "#d6dbd8"];
  if (!data.some(d => d.value))
    return (
      <Empty
        title="No allocation to show"
        body="Add holdings to see the mix across asset buckets."
      />
    );
  return (
    <div className="chart-wrap">
      <ResponsiveContainer width="100%" height={230}>
        <PieChart>
          <Pie
            data={data}
            dataKey="value"
            nameKey="name"
            innerRadius={58}
            outerRadius={86}
            paddingAngle={2}
            label={({ name, percent }: any) =>
              `${name} ${(percent * 100).toFixed(0)}%`
            }
          >
            {data.map((d, i) => (
              <Cell key={d.name} fill={colors[i % colors.length]} />
            ))}
          </Pie>
          <ChartTooltip
            formatter={(v: any, n: any) => [`${Number(v).toFixed(1)}%`, n]}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="chart-legend">
        {data.map((d, i) => (
          <span key={d.name}>
            <i style={{ background: colors[i % colors.length] }} />
            {d.name}: {d.value.toFixed(1)}%
          </span>
        ))}
      </div>
    </div>
  );
}
function Dashboard() {
  const { state, setState, demo, user, api, saveAccountState } = useApp();
  const [reportBusy, setReportBusy] = useState(false), [reportError, setReportError] = useState("");
  const total = portfolioTotal(state.holdings),
    alloc = assetAllocation(state.holdings),
    correlationMatrix =
      state.dataOrigin === "demo"
        ? SYNTHETIC_CORRELATIONS
        : calculateReturnCorrelations(state.historicalReturns)?.values,
    div = scoreDiversification(state.holdings, correlationMatrix),
    backtestResult = runHistoricalComparison(
      state.historicalReturns,
      state.backtestConfig
    ),
    topGoals = state.goals.slice(0, 3);
  const rows = state.snapshots.map(s => ({
    label: s.label,
    value: s.totalValue,
  }));
  async function generateReport() {
    setReportError("");
    let report = generatePortfolioReport(state, backtestResult);
    if (user && state.preferences.aiReportConsent) {
      setReportBusy(true);
      try {
        await saveAccountState(state);
        const out = await api("/api/app/report-commentary", { method: "POST", body: JSON.stringify({ aiConsent: true }) });
        if (typeof out.commentary !== "string" || !["ai", "deterministic"].includes(out.source)) throw new Error("Invalid report commentary response.");
        report = { ...report, aiCommentary: out.commentary, commentarySource: out.source === "ai" ? "ai" : "deterministic" };
      } catch (e) {
        setReportError(e instanceof Error ? e.message : "AI commentary request failed; deterministic report is available.");
      } finally { setReportBusy(false); }
    }
    setState({ ...state, reports: [report, ...state.reports] });
  }
  function downloadMarkdown() {
    const report: any = state.reports[0] || generatePortfolioReport(state, backtestResult);
    const md = `# ${report.title}\n\n${report.sections.map((section: any) => `## ${section.heading}\n\n${section.body}`).join("\n\n")}${report.aiCommentary ? `\n\n## Commentary (${report.commentarySource})\n\n${report.aiCommentary}` : ""}\n\n${DISCLAIMER}\n`;
    downloadBytes(new TextEncoder().encode(md), "portfoliopilot-report.md", "text/markdown");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow={
            demo ? "DEMO WORKSPACE · SYNTHETIC DATA" : "PORTFOLIO OVERVIEW"
          }
          title={`Good ${new Date().getHours() < 12 ? "morning" : "day"}${state.profile.name ? `, ${state.profile.name.split(" ")[0]}` : ""}.`}
          sub="A considered view of your portfolio, progress and potential pressure points."
        />
        <ReportDownload state={state} section="overview" title="Portfolio overview" />
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Portfolio value"
          value={money(total)}
          detail={`${state.holdings.length} holdings · ${demo ? "synthetic demo values" : "entered/user-supplied values"}`}
          icon={Wallet}
        />
        <Kpi
          label="Diversification method score"
          value={`${div.total} / 100`}
          detail={`${div.coveragePct}% methodology-weight coverage · not an official rating`}
          icon={Layers}
        />
        <Kpi
          label="Portfolio risk profile"
          value={state.profile.riskProfile || "Not set"}
          detail="Self-reported educational profile"
          icon={ShieldCheck}
        />
        <Kpi
          label="Monthly investment"
          value={money(state.profile.monthlyInvestment)}
          detail="Profile input · editable in settings"
          icon={Activity}
        />
      </div>
      {!state.holdings.length ? (
        <Card>
          <Empty
            title="Your portfolio starts here"
            body="Add a holding, import a CSV or use the demo to explore the analytics."
            action={
              <div className="button-row">
                <Button href="/portfolio">Add holdings</Button>
                <Button kind="outline" href="/portfolio">
                  Import a CSV in Portfolio
                </Button>
              </div>
            }
          />
        </Card>
      ) : (
        <>
          <div className="dashboard-grid">
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">01 · VALUE HISTORY</span>
                  <h2>Portfolio snapshots</h2>
                  <p>Synthetic historical snapshots; not live market data.</p>
                </div>
                <Link href="/portfolio">
                  View portfolio <ArrowRight size={14} />
                </Link>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={245}>
                  <AreaChart data={rows}>
                    <defs>
                      <linearGradient id="fillBlue" x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#55799a"
                          stopOpacity={0.24}
                        />
                        <stop
                          offset="100%"
                          stopColor="#55799a"
                          stopOpacity={0}
                        />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e7ebed" />
                    <XAxis dataKey="label" />
                    <YAxis
                      tickFormatter={v => `${(v / 10000000).toFixed(1)}Cr`}
                      width={50}
                    />
                    <ChartTooltip formatter={(v: any) => money(Number(v))} />
                    <Area
                      type="monotone"
                      dataKey="value"
                      stroke="#55799a"
                      fill="url(#fillBlue)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
                <p className="chart-caption">
                  Past snapshots are synthetic examples and are not investment
                  performance.
                </p>
              </div>
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">02 · ALLOCATION</span>
                  <h2>Asset mix</h2>
                </div>
                <Link href="/portfolio">
                  Details <ArrowRight size={14} />
                </Link>
              </div>
              <Donut
                data={Object.entries(alloc).map(([name, v]) => ({
                  name,
                  value: total ? (v / total) * 100 : 0,
                }))}
              />
            </Card>
          </div>
          <div className="dashboard-grid">
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">03 · GOALS</span>
                  <h2>Goals in view</h2>
                </div>
                <Link href="/goals">
                  All goals <ArrowRight size={14} />
                </Link>
              </div>
              {topGoals.length ? (
                <div className="goal-list">
                  {topGoals.map(g => (
                    <GoalTile key={g.id} goal={g} />
                  ))}
                </div>
              ) : (
                <Empty
                  title="No goals yet"
                  body="Add a target and date to connect savings to your priorities."
                  action={<Button href="/goals">Create a goal</Button>}
                />
              )}
            </Card>
            <Card>
              <div className="card-heading">
                <div>
                  <span className="eyebrow">04 · ONE THING TO REVIEW</span>
                  <h2>Know what you’re carrying</h2>
                </div>
                <Sparkles size={19} />
              </div>
              <p className="body-copy">
                {state.holdings.length
                  ? `Your largest current holding is ${[...state.holdings].sort((a, b) => b.currentValue - a.currentValue)[0].name}, at ${((Math.max(...state.holdings.map(h => h.currentValue)) / total) * 100).toFixed(1)}% of the portfolio. The diversification score uses five disclosed components.`
                  : "Add holdings to see a state-grounded concentration note."}
              </p>
              <p className="note">
                This description is based only on the values in this workspace.
                It is not a recommendation.
              </p>
              <div className="link-stack">
                <Link href="/stress-test">
                  Explore an illustrative shock <ArrowRight size={15} />
                </Link>
                <Link href="/ai-coach">
                  Ask the PortfolioPilot Coach <ArrowRight size={15} />
                </Link>
              </div>
            </Card>
          </div>
        </>
      )}
      <Card className="backtest-dashboard-card">
        <div className="card-heading">
          <div>
            <span className="eyebrow">HISTORICAL RESEARCH</span>
            <h2>Compare strategy history</h2>
            {backtestResult?.status === "ready" &&
            backtestResult.baseline &&
            backtestResult.allWeather ? (
              <p>
                {backtestResult.source.nObs} user-uploaded months · baseline
                CAGR {backtestResult.baseline.metrics.cagr.value === null
                  ? "unavailable"
                  : `${backtestResult.baseline.metrics.cagr.value.toFixed(2)}%`}
                {" · "}All-Weather-inspired CAGR{" "}
                {backtestResult.allWeather.metrics.cagr.value === null
                  ? "unavailable"
                  : `${backtestResult.allWeather.metrics.cagr.value.toFixed(2)}%`}
              </p>
            ) : state.historicalReturns ? (
              <p>Monthly data is imported but a complete comparison is not yet saved.</p>
            ) : (
              <p>No historical market returns are bundled or inferred for this workspace.</p>
            )}
          </div>
          <Link href="/backtest">
            Open research <ArrowRight size={14} />
          </Link>
        </div>
        <p className="note">
          Historical outputs use only user-uploaded monthly returns, are marked
          unverified and are not forecasts. Demo stress scenarios are separate
          illustrative sensitivities.
        </p>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">REPORT HISTORY</span>
            <h2>Keep a portfolio note</h2>
            <p>Generate a deterministic report from this workspace. Account AI commentary needs explicit opt-in on the Reports page.</p>
          </div>
        </div>
        <div className="report-actions">
          <Button onClick={generateReport} disabled={reportBusy}>{reportBusy ? "Generating…" : "Generate report"}</Button>
          <Button kind="outline" onClick={() => window.print()}>Print / Save as PDF</Button>
          <Button kind="outline" onClick={downloadMarkdown}>Download Markdown</Button>
          <Button kind="outline" href="/reports">Open full report</Button>
        </div>
        {reportError && <p className="error-box" role="alert">{reportError} The deterministic report is still available.</p>}
        {!user && <p className="note">Guest/demo reports use local deterministic commentary only; no report API is called.</p>}
        {state.reports.length ? <div className="history-item"><b>{state.reports[0]!.title}</b><small>{new Date(state.reports[0]!.createdAt).toLocaleString()} · {state.reports[0]!.commentarySource} commentary</small></div> : <p className="note">No saved report yet.</p>}
      </Card>
    </>
  );
}
function GoalTile({ goal }: { goal: Goal }) {
  const p = goalProjection(goal);
  return (
    <Link href={`/goals/${goal.id}`} className="goal-tile">
      <div className="goal-tile-head">
        <div>
          <strong>{goal.name}</strong>
          <small>
            {goal.category} · {p.years.toFixed(1)} years
          </small>
        </div>
        <span className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}>
          {p.status}
        </span>
      </div>
      <div className="progress">
        <i style={{ width: `${p.progressPct}%` }} />
      </div>
      <div className="goal-tile-foot">
        <span>{money(goal.currentAmount)} saved</span>
        <b>{p.progressPct.toFixed(0)}%</b>
      </div>
    </Link>
  );
}
function Portfolio() {
  const { state, setState, demo } = useApp(),
    [search, setSearch] = useState(""),
    [filter, setFilter] = useState("All"),
    [sort, setSort] = useState("currentValue"),
    [fileError, setFileError] = useState(""),
    [notice, setNotice] = useState("");
  const [newSymbol, setNewSymbol] = useState(""),
    [newValue, setNewValue] = useState("");
  const alloc = assetAllocation(state.holdings),
    total = portfolioTotal(state.holdings),
    correlationData = demo
      ? null
      : calculateReturnCorrelations(state.historicalReturns),
    correlationMatrix = demo
      ? SYNTHETIC_CORRELATIONS
      : (correlationData?.values ?? null),
    correlationCounts = demo
      ? null
      : (correlationData?.pairObservationCounts ?? null),
    hasMeasuredCorrelations =
      demo ||
      Boolean(
        correlationMatrix?.some((row, i) =>
          row.some((value, j) => i !== j && value !== null)
        )
      ),
    div = scoreDiversification(state.holdings, correlationMatrix ?? undefined);
  let filtered = state.holdings.filter(
    h =>
      (h.name + h.symbol + h.sector)
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (filter === "All" || assetBucketFor(h) === filter)
  );
  filtered = [...filtered].sort((a, b) =>
    sort === "name"
      ? a.name.localeCompare(b.name)
      : Number(b[sort as keyof Holding]) - Number(a[sort as keyof Holding])
  );
function importCsv(e: React.ChangeEvent<HTMLInputElement>) {
  const f = e.target.files?.[0];
  if (!f) return;

  setFileError("");

  if (!/\.csv$/i.test(f.name)) {
    setFileError("Choose a .csv file.");
    e.target.value = "";
    return;
  }

  if (f.size > 2 * 1024 * 1024) {
    setFileError("CSV must be under 2 MB.");
    e.target.value = "";
    return;
  }

  const reader = new FileReader();

  reader.onload = () => {
    const parsed = parseHoldingsCSV(String(reader.result || ""));
    setFileError(parsed.errors.join(" "));

    if (!parsed.holdings.length) {
      setNotice("No valid holdings found in the CSV.");
      return;
    }

    const existingIds = new Set(state.holdings.map((holding) => holding.id));

    const newHoldings = parsed.holdings.filter(
      (holding) => !existingIds.has(holding.id)
    );

    if (newHoldings.length === 0) {
      setNotice("No new holdings imported; these holdings already exist.");
      return;
    }

    setState({
      ...state,
      holdings: [...state.holdings, ...newHoldings],
      dataOrigin: demo ? "demo" : "import",
    });

    setNotice(
      `${newHoldings.length} new holding(s) imported; ${
        parsed.holdings.length - newHoldings.length
      } duplicate(s) skipped; rows with errors were skipped.`
    );
  };

  reader.onerror = () => {
    setFileError("Unable to read the CSV file. Please try again.");
  };

  reader.readAsText(f);
  e.target.value = "";
}

  function add() {
    if (!newSymbol || !Number(newValue)) return;
    const h: Holding = {
      id: `manual-${Date.now()}`,
      symbol: newSymbol.toUpperCase(),
      name: newSymbol.toUpperCase(),
      assetType: "Equity",
      sector: "Unspecified",
      geography: "India",
      marketCap: "Not specified",
      quantity: 1,
      averagePrice: Number(newValue),
      currentPrice: Number(newValue),
      currentValue: Number(newValue),
    };
    setState({
      ...state,
      holdings: [...state.holdings, h],
      dataOrigin: demo ? "demo" : "manual",
    });
    setNewSymbol("");
    setNewValue("");
    setNotice("Holding added to this workspace.");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="PORTFOLIO ANALYTICS"
          title="Your holdings, in context."
          sub="Search, compare and review exposure. Demo holdings are fictional; imported values are user supplied."
        />
        <ReportDownload state={state} section="holdings" title="Holdings report" scopes={[{ value: "all", label: "All holdings" }, ...state.holdings.map(h => ({ value: h.id, label: h.symbol }))]} />
      </div>
      <div className="kpi-grid compact">
        <Kpi
          label="Portfolio value"
          value={money(total)}
          detail={`${state.holdings.length} holdings`}
          icon={Wallet}
        />
        <Kpi
          label="Largest asset class"
          value={
            Object.entries(alloc).sort((a, b) => b[1] - a[1])[0]?.[0] || "—"
          }
          detail={
            total
              ? `${((Math.max(...Object.values(alloc)) / total) * 100) | 0}% of current value`
              : "No holdings yet"
          }
          icon={Layers}
        />
        <Kpi
          label="Diversification method score"
          value={`${div.total}/100`}
          detail={`${div.coveragePct}% methodology-weight coverage · not official`}
          icon={Activity}
        />
      </div>
      {notice && <p className="success-box">{notice}</p>}
      <div className="portfolio-grid">
        <Card>
          <div className="card-heading">
            <div>
              <span className="eyebrow">HOLDINGS</span>
              <h2>Current positions</h2>
            </div>
            <label className="button outline upload-button">
              <Upload size={16} /> Import CSV
              <input
                type="file"
                accept=".csv,text/csv"
                onChange={importCsv}
                aria-label="Import holdings from CSV"
              />
            </label>
          </div>
          {fileError && (
            <p className="error-box" role="alert">
              {fileError}
            </p>
          )}
          <div className="toolbar">
            <label className="search-box">
              <Search size={16} />
              <input
                aria-label="Search holdings"
                placeholder="Search name, ticker, sector"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </label>
            <select
              aria-label="Filter asset bucket"
              value={filter}
              onChange={e => setFilter(e.target.value)}
            >
              <option>All</option>
              {["Equity", "Mutual Funds", "Gold", "Debt", "Cash"].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
            <select
              aria-label="Sort holdings"
              value={sort}
              onChange={e => setSort(e.target.value)}
            >
              <option value="currentValue">Sort by value</option>
              <option value="name">Sort by name</option>
              <option value="quantity">Sort by quantity</option>
            </select>
          </div>
          {state.holdings.length ? (
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Holding</th>
                    <th>Asset type</th>
                    <th>Sector</th>
                    <th>Units</th>
                    <th>Avg. price</th>
                    <th>Current value</th>
                    <th>Gain / loss</th>
                    <th>Weight</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(h => {
                    const gain = (h.currentPrice - h.averagePrice) * h.quantity;
                    return (
                      <tr key={h.id}>
                        <td>
                          <b>{h.symbol}</b>
                          <small>{h.name}</small>
                        </td>
                        <td>{h.assetType}</td>
                        <td>{h.sector}</td>
                        <td>{number(h.quantity)}</td>
                        <td>{money(h.averagePrice)}</td>
                        <td>
                          <b>{money(h.currentValue)}</b>
                        </td>
                        <td className={gain >= 0 ? "positive" : "negative"}>
                          {gain >= 0 ? "+" : "−"}
                          {money(Math.abs(gain))}
                        </td>
                        <td>
                          {total
                            ? ((h.currentValue / total) * 100).toFixed(1)
                            : 0}
                          %
                        </td>
                        <td>
                          <button
                            className="icon-btn danger"
                            aria-label={`Remove ${h.name}`}
                            onClick={() =>
                              setState({
                                ...state,
                                holdings: state.holdings.filter(
                                  x => x.id !== h.id
                                ),
                              })
                            }
                          >
                            <Trash2 size={15} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length === 0 && (
                <p className="note">No holdings match the current search.</p>
              )}
            </div>
          ) : (
            <Empty
              title="No holdings yet"
              body="Add one position or import CSV. Imported values stay in this browser unless you are signed in."
            />
          )}
          <details className="methodology">
            <summary>About this diversification score</summary>
            <p>
              Methodology only (not an official rating): asset class 30%, sector
              20%, security concentration 20%, correlation 20%, geography 10%.
              In an empty portfolio the score is 0. Correlation observations in
              demo mode are synthetic.
            </p>
          </details>
        </Card>
        <Card>
          <span className="eyebrow">ADD A POSITION</span>
          <h2>Manual holding</h2>
          <form
            className="manual-form"
            onSubmit={e => {
              e.preventDefault();
              add();
            }}
          >
            <label>
              Symbol or name
              <input
                value={newSymbol}
                onChange={e => setNewSymbol(e.target.value)}
                placeholder="e.g. NIFTYBEES"
                required
              />
            </label>
            <label>
              Current value (₹)
              <input
                type="number"
                min="1"
                value={newValue}
                onChange={e => setNewValue(e.target.value)}
                required
              />
            </label>
            <Button type="submit">
              <Plus size={16} /> Add holding
            </Button>
          </form>
          <p className="note">
            Manual holding is treated as one unit. Add detailed units and cost
            basis by CSV.
          </p>
          <hr />
          <h3>Allocation overview</h3>
          <Donut
            data={Object.entries(alloc).map(([name, v]) => ({
              name,
              value: total ? (v / total) * 100 : 0,
            }))}
          />
        </Card>
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">EXPOSURE CHECK</span>
            <h2>Concentration, without a verdict</h2>
          </div>
          <Link href="/ai-coach">
            Ask Coach <ArrowRight size={14} />
          </Link>
        </div>
        <div className="stat-row">
          {[1, 3, 5].map(n => {
            const share =
              (state.holdings
                .slice()
                .sort((a, b) => b.currentValue - a.currentValue)
                .slice(0, n)
                .reduce((s, h) => s + h.currentValue, 0) /
                (total || 1)) *
              100;
            return (
              <div key={n}>
                <b>Top {n}</b>
                <strong>
                  {state.holdings.length ? share.toFixed(1) : "0.0"}%
                </strong>
                <small>of portfolio value</small>
              </div>
            );
          })}
          <div>
            <b>Equity concentration</b>
            <strong>
              {total
                ? (
                    ((alloc.Equity + alloc["Mutual Funds"]) / total) *
                    100
                  ).toFixed(1)
                : "0.0"}
              %
            </strong>
            <small>Equity + mutual funds</small>
          </div>
        </div>
        <div className="hhi-summary">
          <div>
            <span>Security HHI</span>
            <strong>
              {div.concentration.holdingHHI === null
                ? "Unavailable"
                : div.concentration.holdingHHI.toFixed(4)}
            </strong>
            <small>
              0–1 concentration measure · {div.concentration.holdingHHI10k === null
                ? "—"
                : `${Math.round(div.concentration.holdingHHI10k).toLocaleString("en-IN")} / 10,000`}
            </small>
          </div>
          <div>
            <span>Sector HHI</span>
            <strong>
              {div.concentration.sectorHHI === null
                ? "Unavailable"
                : div.concentration.sectorHHI.toFixed(4)}
            </strong>
            <small>
              Effective holdings ≈ {div.concentration.effectiveHoldings === null
                ? "—"
                : div.concentration.effectiveHoldings.toFixed(1)}
            </small>
          </div>
        </div>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">
              {demo
                ? "DEMO-ONLY SYNTHETIC MATRIX"
                : hasMeasuredCorrelations
                  ? "USER-UPLOADED · UNVERIFIED"
                  : "CORRELATION UNAVAILABLE"}
            </span>
            <h2>
              {demo
                ? "Illustrative bucket correlations"
                : "Measured bucket correlations"}
            </h2>
            <p>
              {demo
                ? "Synthetic values; −1 to +1. Not observed market correlations."
                : hasMeasuredCorrelations
                  ? `Pairwise Pearson correlations from complete monthly observations; minimum 12 per pair. ${correlationData?.startMonth || ""}–${correlationData?.endMonth || ""}.`
                  : "No measured correlation is inferred. Upload at least 12 complete monthly return observations per pair to calculate a matrix."}
            </p>
          </div>
        </div>
        {correlationMatrix && hasMeasuredCorrelations ? (
          <div className="table-scroll">
            <table className="matrix">
              <thead>
                <tr>
                  <th scope="col">Bucket</th>
                  {ASSET_BUCKETS.map(bucket => (
                    <th key={bucket} scope="col">{bucket}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ASSET_BUCKETS.map((bucket, i) => (
                  <tr key={bucket}>
                    <th scope="row">{bucket}</th>
                    {correlationMatrix[i]!.map((value, j) => {
                      const observations = correlationCounts?.[i]?.[j] ?? null;
                      return (
                        <td
                          key={`${bucket}-${ASSET_BUCKETS[j]}`}
                          title={demo ? "Synthetic demo value" : `${observations ?? 0} pairwise complete months`}
                          aria-label={`${bucket} with ${ASSET_BUCKETS[j]}: ${value === null ? "unavailable" : value.toFixed(2)}${demo ? ", synthetic demo value" : `, ${observations ?? 0} complete monthly observations`}`}
                        >
                          {value === null ? "—" : value.toFixed(2)}
                          {!demo && observations !== null && <small>{observations}m</small>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty
            title="No observed matrix yet"
            body="No synthetic values are substituted for an account. Upload complete monthly return data to calculate correlations."
            action={<Button href="/backtest">Upload monthly returns</Button>}
          />
        )}
        <p className="note">
          {demo
            ? "Illustrative synthetic correlations are demo-only, not predictive and not an official rating component."
            : hasMeasuredCorrelations
              ? "Correlations are descriptive pairwise Pearson calculations on user-uploaded, unverified returns; missing rows are excluded per pair. They are not predictive."
              : "The correlation component is excluded from the diversification score until sufficient measured pairs exist; displayed coverage shows the available score weight."}
        </p>
        <div className="card-heading sector-heading">
          <div>
            <span className="eyebrow">CURRENT SECTOR EXPOSURE</span>
            <h2>Sector mix</h2>
          </div>
        </div>
        <div className="sector-list">
          {[
            ...state.holdings.reduce(
              (m, h) =>
                m.set(h.sector, (m.get(h.sector) || 0) + h.currentValue),
              new Map<string, number>()
            ),
          ]
            .sort((a, b) => b[1] - a[1])
            .slice(0, 8)
            .map(([sector, value]) => (
              <div key={sector}>
                <span>{sector}</span>
                <i>
                  <b
                    style={{ width: `${total ? (value / total) * 100 : 0}%` }}
                  />
                </i>
                <strong>
                  {total ? ((value / total) * 100).toFixed(1) : "0.0"}%
                </strong>
              </div>
            ))}
        </div>
      </Card>
    </>
  );
}
function Goals() {
  const { state, setState } = useApp(),
    [, setLoc] = useLocation();
  const [form, setForm] = useState(false),
    [name, setName] = useState(""),
    [target, setTarget] = useState(""),
    [date, setDate] = useState("2035-01-01"),
    [monthly, setMonthly] = useState(""),
    [current, setCurrent] = useState("0"),
    [expectedReturn, setExpectedReturn] = useState("8"),
    [inflation, setInflation] = useState("5"),
    [category, setCategory] = useState<Goal["category"]>("Other");
  function add(e: React.FormEvent) {
    e.preventDefault();
    const g: Goal = {
      id: `goal-${Date.now()}`,
      name,
      category,
      targetAmount: Number(target),
      currentAmount: Number(current),
      targetDate: date,
      monthlyContribution: Number(monthly),
      expectedReturnPct: Number(expectedReturn),
      inflationPct: Number(inflation),
      createdAt: new Date().toISOString(),
    };
    setState({ ...state, goals: [...state.goals, g] });
    setForm(false);
    setName("");
    setTarget("");
    setMonthly("");
    setCurrent("0");
    setExpectedReturn("8");
    setInflation("5");
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="GOAL MAPPING"
          title="Keep the future in view."
          sub="Projections are illustrative, based on editable return, inflation and contribution assumptions."
        />
        <ReportDownload state={state} section="goals" title="Goals report" scopes={[{ value: "all", label: "All goals" }, ...state.goals.map(g => ({ value: g.id, label: g.name }))]} />
      </div>
      <div className="page-tools">
        <span>{state.goals.length} goals · Values in INR</span>
        <Button onClick={() => setForm(!form)}>
          <Plus size={16} /> Add a goal
        </Button>
      </div>
      {form && (
        <Card>
          <form className="form-grid" onSubmit={add}>
            <label>
              Goal name
              <input
                required
                value={name}
                onChange={e => setName(e.target.value)}
              />
            </label>
            <label>
              Category
              <select
                value={category}
                onChange={e => setCategory(e.target.value as any)}
              >
                {GOAL_CATEGORIES.map(x => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Target amount (₹)
              <input
                type="number"
                min="1"
                required
                value={target}
                onChange={e => setTarget(e.target.value)}
              />
            </label>
            <label>
              Current amount saved (₹)
              <input
                type="number"
                min="0"
                value={current}
                onChange={e => setCurrent(e.target.value)}
              />
            </label>
            <label>
              Target date
              <input
                type="date"
                required
                value={date}
                onChange={e => setDate(e.target.value)}
              />
            </label>
            <label>
              Monthly contribution (₹)
              <input
                type="number"
                min="0"
                value={monthly}
                onChange={e => setMonthly(e.target.value)}
              />
            </label>
            <label>
              Expected return (% p.a.)
              <input
                type="number"
                min="-100"
                max="100"
                step="0.1"
                value={expectedReturn}
                onChange={e => setExpectedReturn(e.target.value)}
              />
            </label>
            <label>
              Inflation (% p.a.)
              <input
                type="number"
                min="-100"
                max="100"
                step="0.1"
                value={inflation}
                onChange={e => setInflation(e.target.value)}
              />
            </label>
            <p className="wide note">
              Projection horizon starts today ({new Date().toLocaleDateString("en-IN")}); return and inflation are editable assumptions, not forecasts.
            </p>
            <div className="form-actions wide">
              <Button type="submit">Save goal</Button>
              <Button kind="outline" onClick={() => setForm(false)}>
                Cancel
              </Button>
            </div>
          </form>
        </Card>
      )}
      {state.goals.length ? (
        <div className="goal-cards">
          {state.goals.map(g => {
            const p = goalProjection(g);
            return (
              <Card key={g.id} className="goal-card">
                <div className="card-heading">
                  <div>
                    <span className="eyebrow">{g.category.toUpperCase()}</span>
                    <h2>{g.name}</h2>
                  </div>
                  <span
                    className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}
                  >
                    {p.status}
                  </span>
                </div>
                <div className="goal-target">
                  {money(g.targetAmount)} <small>target amount</small>
                </div>
                <div className="progress">
                  <i style={{ width: `${p.progressPct}%` }} />
                </div>
                <div className="split-stats">
                  <span>
                    Saved now<strong>{money(g.currentAmount)}</strong>
                  </span>
                  <span>
                    Time remaining<strong>{p.years.toFixed(1)} years</strong>
                  </span>
                  <span>
                    Required SIP
                    <strong>
                      {p.requiredMonthlyContribution === null
                        ? "Unavailable"
                        : money(p.requiredMonthlyContribution)}
                    </strong>
                  </span>
                  <span>
                    Projected corpus<strong>{money(p.projectedCorpus)}</strong>
                  </span>
                </div>
                <p className="note">
                  Inflation adjusted target {money(p.targetInflationAdjusted)} ·
                  Assumed return {g.expectedReturnPct}% · Inflation{" "}
                  {g.inflationPct}%
                </p>
                <div className="button-row">
                  <Button
                    kind="outline"
                    onClick={() => setLoc(`/goals/${g.id}`)}
                  >
                    View projection
                  </Button>
                  <Button
                    kind="text"
                    onClick={() => {
                      if (confirm(`Delete “${g.name}”?`))
                        setState({
                          ...state,
                          goals: state.goals.filter(x => x.id !== g.id),
                        });
                    }}
                  >
                    Delete goal
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card>
          <Empty
            title="Goals make the numbers meaningful"
            body="Add a target amount, date and monthly contribution to see a transparent projection."
            action={
              <Button onClick={() => setForm(true)}>
                Create your first goal
              </Button>
            }
          />
        </Card>
      )}
    </>
  );
}
function GoalDetail({ id }: { id: string }) {
  const { state, setState } = useApp(),
    goal = state.goals.find(g => g.id === id);
  if (!goal)
    return (
      <>
        <Title title="Goal not found" />
        <Button href="/goals">Return to goals</Button>
      </>
    );
  const p = goalProjection(goal),
    series = Array.from({ length: Math.min(p.months, 240) + 1 }, (_, i) => {
      const t = Math.min(i, p.months),
        r = Math.pow(1 + goal.expectedReturnPct / 100, 1 / 12) - 1,
        years = i / 12,
        corpus =
          goal.currentAmount * Math.pow(1 + r, t) +
          goal.monthlyContribution * (r ? (Math.pow(1 + r, t) - 1) / r : t);
      return {
        year: years.toFixed(1),
        projected: corpus,
        target:
          goal.targetAmount * Math.pow(1 + goal.inflationPct / 100, years),
      };
    });
  return (
    <>
      <Title
        eyebrow={goal.category.toUpperCase()}
        title={goal.name}
        sub="Illustrative goal projection · assumes regular monthly contributions and constant rates."
      />
      <div className="page-tools">
        <Button kind="outline" href="/goals">
          ← All goals
        </Button>
        <span className={`pill ${p.status.toLowerCase().replace(" ", "-")}`}>
          {p.status}
        </span>
      </div>
      <div className="kpi-grid">
        <Kpi
          label="Inflation-adjusted target"
          value={money(p.targetInflationAdjusted)}
          detail={`Original target ${money(goal.targetAmount)}`}
          icon={Target}
        />
        <Kpi
          label="Projected corpus"
          value={money(p.projectedCorpus)}
          detail="Deterministic projection · constant-rate assumption · no probability estimate"
          icon={Activity}
        />
        <Kpi
          label="Monthly contribution"
          value={money(goal.monthlyContribution)}
          detail={`Required estimate ${p.requiredMonthlyContribution === null ? "unavailable after target date" : money(p.requiredMonthlyContribution)}`}
          icon={Wallet}
        />
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">PROJECTION PATH</span>
            <h2>Current path vs target</h2>
            <p>
              Target grows at the entered inflation rate; projection assumes
              constant return.
            </p>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={320}>
          <AreaChart data={series}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="year"
              label={{
                value: "Years from now",
                position: "insideBottom",
                offset: -5,
              }}
            />
            <YAxis tickFormatter={v => `${(v / 100000).toFixed(0)}L`} />
            <ChartTooltip formatter={(v: any) => money(Number(v))} />
            <Area
              dataKey="projected"
              name="Illustrative projected corpus"
              stroke="#55799a"
              fill="#55799a"
              fillOpacity={0.15}
            />
            <Area
              dataKey="target"
              name="Inflation-adjusted target"
              stroke="#b17a37"
              fill="#b17a37"
              fillOpacity={0.06}
            />
          </AreaChart>
        </ResponsiveContainer>
        <div className="chart-legend">
          <span>
            <i />
            Projected corpus
          </span>
          <span>
            <i className="amber-dot" />
            Inflation-adjusted target
          </span>
        </div>
      </Card>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">EDIT ASSUMPTIONS</span>
            <h2>Make the inputs yours</h2>
          </div>
        </div>
        <div className="form-grid">
          <label>
            Goal name
            <input
              required
              maxLength={120}
              value={goal.name}
              onChange={e =>
                setState({
                  ...state,
                  goals: state.goals.map(g =>
                    g.id === id ? { ...g, name: e.target.value } : g
                  ),
                })
              }
            />
          </label>
          <label>
            Category
            <select
              value={goal.category}
              onChange={e =>
                setState({
                  ...state,
                  goals: state.goals.map(g =>
                    g.id === id
                      ? { ...g, category: e.target.value as Goal["category"] }
                      : g
                  ),
                })
              }
            >
              {GOAL_CATEGORIES.map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          {[
            ["Saved currently (₹)", "currentAmount"],
            ["Target amount (₹)", "targetAmount"],
            ["Monthly contribution (₹)", "monthlyContribution"],
            ["Expected return (% p.a.)", "expectedReturnPct"],
            ["Inflation (% p.a.)", "inflationPct"],
          ].map(([label, key]) => (
            <label key={key}>
              {label}
              <input
                type="number"
                value={(goal as any)[key]}
                onChange={e =>
                  setState({
                    ...state,
                    goals: state.goals.map(g =>
                      g.id === id ? { ...g, [key]: Number(e.target.value) } : g
                    ),
                  })
                }
              />
            </label>
          ))}
        </div>
        <label className="date-input">
          Target date
          <input
            type="date"
            value={goal.targetDate}
            onChange={e =>
              setState({
                ...state,
                goals: state.goals.map(g =>
                  g.id === id ? { ...g, targetDate: e.target.value } : g
                ),
              })
            }
          />
        </label>
        <p className="note">
          Status thresholds: on track at projected corpus ≥ inflation-adjusted
          target; needs attention at 75–99%; behind below 75%. Constant returns
          are an assumption, never a promise.
        </p>
      </Card>
    </>
  );
}
function StressTest() {
  const { state, setState } = useApp();
  const [id, setId] = useState("correction"),
    [name, setName] = useState("My custom scenario"),
    [shocks, setShocks] = useState<Record<AssetBucket, number>>({
      Equity: -20,
      "Mutual Funds": -14,
      Gold: 2,
      Debt: 0,
      Cash: 0,
    });
  const total = portfolioTotal(state.holdings),
    scenario =
      id === "custom"
        ? {
            id: "custom",
            name,
            description: "User-defined illustrative scenario",
            returnsPct: shocks,
            recoveryMonths: 18,
            isCustom: true,
          }
        : SCENARIOS.find(x => x.id === id)!;
  const result = calculateStress(state.holdings, scenario, state.goals);
  const savedResult = state.stressResult;
  const visibleResult =
    savedResult &&
    savedResult.scenarioId === result.scenarioId &&
    savedResult.scenarioName === result.scenarioName &&
    savedResult.beforeValue === result.beforeValue &&
    savedResult.afterValue === result.afterValue &&
    savedResult.changeValue === result.changeValue &&
    savedResult.lossPct === result.lossPct &&
    savedResult.recoveryMonths === result.recoveryMonths &&
    JSON.stringify(savedResult.assumptions) ===
      JSON.stringify(result.assumptions) &&
    JSON.stringify(savedResult.holdingImpacts) ===
      JSON.stringify(result.holdingImpacts) &&
    JSON.stringify(savedResult.goalImpacts) === JSON.stringify(result.goalImpacts)
      ? savedResult
      : null;
  function run() {
    setState({
      ...state,
      stressResult: result,
      notifications: [
        {
          id: `stress-${Date.now()}`,
          type: "stress",
          title: "Stress scenario completed",
          message: `${scenario.name} sensitivity updated.`,
          createdAt: new Date().toISOString(),
          read: false,
        },
        ...state.notifications,
      ],
    });
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="STRESS TEST · ILLUSTRATIVE SENSITIVITY"
          title="Explore what could move."
          sub="Apply a disclosed percentage-point shock to current holding values. Scenarios are not historical reconstructions or predictions."
        />
        <ReportDownload state={state} section="stress" title="Saved stress scenario" unavailable={!visibleResult ? "Export is available only for the last saved scenario matching the current portfolio." : undefined} />
      </div>
      <Card>
        <div className="scenario-grid">
          {SCENARIOS.map(s => (
            <button
              key={s.id}
              className={`scenario-choice ${id === s.id ? "selected" : ""}`}
              onClick={() => setId(s.id)}
            >
              <span>{s.name}</span>
              <small>{s.description}</small>
            </button>
          ))}
          <button
            className={`scenario-choice ${id === "custom" ? "selected" : ""}`}
            onClick={() => setId("custom")}
          >
            <span>Custom scenario</span>
            <small>Edit per-bucket assumptions.</small>
          </button>
        </div>
        {id === "custom" && (
          <div className="custom-scenario">
            <label>
              Scenario name
              <input value={name} onChange={e => setName(e.target.value)} />
            </label>
            <div className="shock-inputs">
              {Object.entries(shocks).map(([b, v]) => (
                <label key={b}>
                  {b} return (%)
                  <input
                    type="number"
                    value={v}
                    onChange={e =>
                      setShocks({ ...shocks, [b]: Number(e.target.value) })
                    }
                  />
                </label>
              ))}
            </div>
          </div>
        )}
        <div className="assumptions">
          <strong>Assumptions: </strong>
          {Object.entries(scenario.returnsPct).map(([k, v]) => (
            <span key={k}>
              {k}{" "}
              <b>
                {v > 0 ? "+" : ""}
                {v}%
              </b>
            </span>
          ))}
          <small>
            Percentage points · {scenario.recoveryMonths} illustrative recovery
            months
          </small>
        </div>
        <Button onClick={run}>
          <Activity size={16} /> Run sensitivity
        </Button>
        {!visibleResult && (
          <p className="note" role="status">
            {savedResult
              ? `The previous run (${savedResult.scenarioName}) does not match the current scenario or portfolio data. `
              : "No matching sensitivity has been run yet. "}
            Run sensitivity to show results for these inputs.
          </p>
        )}
      </Card>
      {visibleResult && (
        <>
          <div className="kpi-grid">
            <Kpi
              label="Current value"
              value={money(result.beforeValue)}
              detail={`${state.holdings.length} holdings analyzed`}
              icon={Wallet}
            />
            <Kpi
              label="After scenario"
              value={money(result.afterValue)}
              detail={
                result.changeValue < 0
                  ? `Estimated decline ${money(Math.abs(result.changeValue))}`
                  : `Estimated increase ${money(result.changeValue)}`
              }
              icon={ArrowDownRight}
            />
            <Kpi
              label="Portfolio change"
              value={`${result.changeValue < 0 ? "−" : "+"}${result.lossPct.toFixed(1)}%`}
              detail="Weighted by current holding values"
              icon={Activity}
            />
            <Kpi
              label="Recovery horizon"
              value={`${result.recoveryMonths} months`}
              detail="Scenario assumption, not a forecast"
              icon={Activity}
            />
          </div>
          <div className="two-col">
            <Card>
              <h2>Impact by holding</h2>
              <div className="table-scroll">
                <table>
                  <thead>
                    <tr>
                      <th>Holding</th>
                      <th>Before</th>
                      <th>Change</th>
                      <th>After</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.holdingImpacts
                      .slice()
                      .sort((a, b) => a.changeValue - b.changeValue)
                      .map(x => (
                        <tr key={x.holdingId}>
                          <td>
                            <b>{x.symbol}</b>
                            <small>{x.name}</small>
                          </td>
                          <td>{money(x.beforeValue)}</td>
                          <td
                            className={
                              x.changeValue < 0 ? "negative" : "positive"
                            }
                          >
                            {money(x.changeValue)}
                          </td>
                          <td>{money(x.afterValue)}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card>
              <h2>Goal sensitivity</h2>
              {result.goalImpacts.length ? (
                result.goalImpacts.map(g => (
                  <div key={g.goalId} className="impact-row">
                    <b>{g.goalName}</b>
                    <span>
                      {money(g.beforeCorpus)} → {money(g.afterCorpus)}
                    </span>
                    <small>
                      Additional monthly contribution estimate:{" "}
                      {g.additionalMonthlyContribution === null
                        ? "unavailable after target date"
                        : money(g.additionalMonthlyContribution)}
                    </small>
                  </div>
                ))
              ) : (
                <Empty
                  title="No goals to compare"
                  body="Add goals to see their sensitivity."
                />
              )}
              <p className="note">
                This simplified sensitivity scales current goal capital by
                portfolio change; it is not a full plan recalculation.
              </p>
            </Card>
          </div>
        </>
      )}
    </>
  );
}
function Rebalance() {
  const { state, setState } = useApp();
  const alloc = assetAllocation(state.holdings),
    total = portfolioTotal(state.holdings),
    weather = weatherExposure(state.holdings),
    rows = allocationReview(
      state.holdings,
      state.allocationTargets,
      state.tolerancesPct
    ),
    primaryGoal = state.goals
      .slice()
      .sort((a, b) => a.targetDate.localeCompare(b.targetDate))[0],
    riskFocus: Record<AssetBucket, string> = {
      Equity: "equity drawdown and single-bucket concentration",
      "Mutual Funds": "market exposure and possible fund overlap",
      Gold: "inflation sensitivity and non-equity diversification",
      Debt: "interest-rate, credit and defensive-allocation balance",
      Cash: "liquidity needs versus long-term inflation drag",
    };
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="ALL-WEATHER-INSPIRED SCENARIO FRAMEWORK"
          title="Review balance across regimes."
          sub="A descriptive framework for growth, inflation, deflation and recession-sensitive exposures—not an exact named-investor portfolio."
        />
        <ReportDownload state={state} section="allocation" title="Allocation report" scopes={[{ value: "all", label: "Complete allocation" }, ...ASSET_BUCKETS.map(bucket => ({ value: bucket, label: bucket }))]} unavailable={!state.holdings.length ? "Add holdings before exporting allocation." : undefined} />
      </div>
      {!state.holdings.length ? (
        <Card>
          <Empty
            title="Add holdings before reviewing allocation"
            body="There is no portfolio mix to compare yet. Add positions in Portfolio."
            action={<Button href="/portfolio">Add holdings</Button>}
          />
        </Card>
      ) : (
        <>
          <div className="weather-grid">
            {Object.entries(weather).map(([k, v]) => (
              <Card key={k} className="weather-card">
                <span>
                  {k
                    .replace(/([A-Z])/g, " $1")
                    .replace(/^./, s => s.toUpperCase())}
                  -sensitive
                </span>
                <b>{v.toFixed(1)}%</b>
                <small>Current exposure proxy · heuristic</small>
              </Card>
            ))}
          </div>
          <Card>
            <div className="card-heading">
              <div>
                <span className="eyebrow">ILLUSTRATIVE TARGET REVIEW</span>
                <h2>Current mix and your ranges</h2>
                <p>
                  Targets/tolerances are editable. Allocations shown in
                  percentage points; no trades are placed.
                </p>
              </div>
              <Button
                kind="outline"
                onClick={() =>
                  setState({
                    ...state,
                    allocationTargets: {
                      Equity: 35,
                      "Mutual Funds": 25,
                      Gold: 10,
                      Debt: 25,
                      Cash: 5,
                    },
                  })
                }
              >
                Load balanced example
              </Button>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Asset bucket</th>
                    <th>Current</th>
                    <th>Target</th>
                    <th>Drift</th>
                    <th>Tolerance</th>
                    <th>Illustrative value adjustment</th>
                    <th>Review</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.bucket}>
                      <td>
                        <b>{r.bucket}</b>
                      </td>
                      <td>
                        {(total ? (alloc[r.bucket] / total) * 100 : 0).toFixed(
                          1
                        )}
                        %
                      </td>
                      <td>
                        <input
                          className="small-number"
                          aria-label={`${r.bucket} target percent`}
                          type="number"
                          min="0"
                          max="100"
                          value={state.allocationTargets[r.bucket]}
                          onChange={e =>
                            setState({
                              ...state,
                              allocationTargets: {
                                ...state.allocationTargets,
                                [r.bucket]: Number(e.target.value),
                              },
                            })
                          }
                        />
                        %
                      </td>
                      <td className={r.driftPct > 0 ? "positive" : "negative"}>
                        {r.driftPct > 0 ? "+" : ""}
                        {r.driftPct.toFixed(1)} pp
                      </td>
                      <td>
                        <input
                          className="small-number"
                          aria-label={`${r.bucket} tolerance percentage points`}
                          type="number"
                          min="0"
                          value={state.tolerancesPct[r.bucket]}
                          onChange={e =>
                            setState({
                              ...state,
                              tolerancesPct: {
                                ...state.tolerancesPct,
                                [r.bucket]: Number(e.target.value),
                              },
                            })
                          }
                        />{" "}
                        pp
                      </td>
                      <td>
                        {r.adjustmentValue < 0 ? "−" : "+"}
                        {money(Math.abs(r.adjustmentValue))}
                      </td>
                      <td>
                        {r.outsideTolerance ? (
                          <>
                            <span className="pill attention">
                              Outside tolerance
                            </span>
                            <small className="note">
                              Consider {r.adjustmentValue > 0 ? "increasing" : "reducing"} this bucket by {money(Math.abs(r.adjustmentValue))}: drift is {r.driftPct > 0 ? "+" : ""}{r.driftPct.toFixed(1)} pp beyond the ±{state.tolerancesPct[r.bucket]} pp tolerance. Risk lens: {riskFocus[r.bucket]}. Goal context: {primaryGoal ? `nearest-dated goal is ${primaryGoal.name} (${primaryGoal.targetDate}); this is portfolio-level, not a goal-specific asset mapping` : "no saved goal is linked to this review"}. Assumptions: total value × (target − current share); no taxes, transaction costs or security-level constraints.
                            </small>
                          </>
                        ) : (
                          <>
                            <span className="pill neutral">Within range</span>
                            <small className="note">
                              No change suggested. Risk lens: {riskFocus[r.bucket]}. Goal context: {primaryGoal ? `${primaryGoal.name} (${primaryGoal.targetDate}); no goal-specific asset mapping` : "no saved goal linked"}. Assumptions: illustrative percentage-point comparison only; no taxes, transaction costs or security-level constraints.
                            </small>
                          </>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="note">
              Bucket targets currently total{" "}
              {Object.values(state.allocationTargets).reduce(
                (a, b) => a + b,
                0
              )}
              %. Illustrative currency adjustment = total current portfolio ×
              (target − current share). Taxes, transaction costs and
              security-level constraints are excluded. “Review adjustment” does
              not execute a trade.
            </p>
            <div className="button-row">
              <Button
                kind="outline"
                onClick={() =>
                  alert(
                    "Review only. No broker connection or trade execution is available."
                  )
                }
              >
                Review adjustment
              </Button>
              <Button
                kind="text"
                onClick={() =>
                  setState({
                    ...state,
                    allocationTargets: {
                      Equity: 40,
                      "Mutual Funds": 25,
                      Gold: 10,
                      Debt: 20,
                      Cash: 5,
                    },
                  })
                }
              >
                Restore example targets
              </Button>
            </div>
          </Card>
        </>
      )}
    </>
  );
}
function Coach() {
  const { state, setState, user, demo, api, saveAccountState } = useApp();
  const backtestResult = runHistoricalComparison(
    state.historicalReturns,
    state.backtestConfig
  );
  const [q, setQ] = useState(""),
    [answer, setAnswer] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const prompts = [
    "How diversified is my portfolio?",
    "Which sector has the most exposure?",
    "How are my goals progressing?",
    "What if equities fall 20%?",
    "How much gold do I hold?",
    "What if I invest more each month?",
    "What changed in my portfolio?",
    "How did these allocations compare historically?",
  ];
  async function ask(question = q) {
    if (!question.trim()) return;
    setQ(question);
    setBusy(true);
    setError("");
    try {
      let result: { answer: string; source: "ai" | "deterministic" };
      if (user) {
        if (state.preferences.aiCoachConsent) await saveAccountState(state);
        const out = await api("/api/app/coach", {
          method: "POST",
          body: JSON.stringify({
            question,
            aiConsent: state.preferences.aiCoachConsent,
          }),
        });
        if (
          typeof out.answer !== "string" ||
          !["ai", "deterministic"].includes(out.source)
        )
          throw new Error("Invalid Coach response.");
        result = out;
      } else
        result = {
          answer: deterministicCoachAnswer(question, state, backtestResult),
          source: "deterministic",
        };
      setAnswer(result.answer);
      const msg = {
        id: `coach-${Date.now()}`,
        question,
        answer: result.answer,
        source:
          result.source === "ai" ? ("ai" as const) : ("deterministic" as const),
        createdAt: new Date().toISOString(),
      };
      setState({ ...state, coachMessages: [...state.coachMessages, msg] });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Coach request failed.");
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="PORTFOLIOPILOT COACH"
          title="Ask about this portfolio."
          sub="Answers use the values and goals in the active workspace. The Coach explains; it does not invent positions or make trades."
        />
        <ReportDownload state={state} section="coach" title="Coach conversation" />
      </div>
      <div className="coach-layout">
        <Card className="coach-panel">
          <div className="card-heading">
            <div>
              <span className="eyebrow">CONTEXTUAL EXPLANATIONS</span>
              <h2>What would you like to understand?</h2>
            </div>
            <MessageCircle />
          </div>
          <form
            onSubmit={e => {
              e.preventDefault();
              void ask();
            }}
          >
            <label className="sr-only" htmlFor="coach-q">
              Ask about your portfolio
            </label>
            <textarea
              id="coach-q"
              rows={3}
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="For example: What happens if equities fall 20%?"
            />
            <div className="form-actions">
              <label className="checkbox-label">
                <input
                  type="checkbox"
                  checked={state.preferences.aiCoachConsent}
                  onChange={e =>
                    setState({
                      ...state,
                      preferences: {
                        ...state.preferences,
                        aiCoachConsent: e.target.checked,
                      },
                    })
                  }
                  disabled={!user}
                />{" "}
                Allow account AI for this question{" "}
                {user ? "(optional)" : "(account only)"}
              </label>
              <Button type="submit" disabled={busy || !q.trim()}>
                {busy ? "Thinking…" : "Explain this"}
              </Button>
            </div>
          </form>
          {error && <p className="error-box">{error}</p>}
          {answer && (
            <div className="coach-answer">
              <b>
                Grounded explanation ·{" "}
                {state.preferences.aiCoachConsent && user
                  ? "server response"
                  : "deterministic"}
              </b>
              <p>{answer}</p>
              <small>
                Assumptions can be incomplete. This is educational, not
                personalized investment advice.
              </small>
            </div>
          )}
          <div className="prompt-grid">
            {prompts.map(p => (
              <button key={p} className="prompt-chip" onClick={() => void ask(p)}>
                {p}
              </button>
            ))}
          </div>
          {demo && (
            <p className="note">
              Demo Coach runs locally in this browser. It does not call the
              Coach API.
            </p>
          )}
        </Card>
        <Card>
          <span className="eyebrow">RECENT QUESTIONS</span>
          <h2>Your conversation</h2>
          {state.coachMessages.length ? (
            state.coachMessages
              .slice()
              .reverse()
              .map(m => (
                <div key={m.id} className="history-item">
                  <b>{m.question}</b>
                  <small>
                    {m.source} explanation ·{" "}
                    {new Date(m.createdAt).toLocaleString()}
                  </small>
                  <p>{m.answer}</p>
                </div>
              ))
          ) : (
            <Empty
              title="A private, useful starting point"
              body="Ask a question or choose a prompt. Guest answers stay local."
            />
          )}
        </Card>
      </div>
    </>
  );
}
function Reports() {
  const { state, setState, user, api, demo, saveAccountState } = useApp();
  const backtestResult = runHistoricalComparison(
    state.historicalReturns,
    state.backtestConfig
  );
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false),
    [current, setCurrent] = useState<any>(null);
  async function generate() {
    setErr("");
    let report = generatePortfolioReport(state, backtestResult);
    if (user && state.preferences.aiReportConsent) {
      setBusy(true);
      try {
        await saveAccountState(state);
        const out = await api("/api/app/report-commentary", {
          method: "POST",
          body: JSON.stringify({ aiConsent: true }),
        });
        if (
          typeof out.commentary !== "string" ||
          !["ai", "deterministic"].includes(out.source)
        )
          throw new Error("Invalid report commentary response.");
        report = {
          ...report,
          aiCommentary: out.commentary,
          commentarySource: out.source === "ai" ? "ai" : "deterministic",
        };
      } catch (e) {
        setErr(
          e instanceof Error
            ? e.message
            : "AI commentary request failed; deterministic report is available."
        );
      } finally {
        setBusy(false);
      }
    }
    setCurrent(report);
    setState({ ...state, reports: [report, ...state.reports] });
  }
  function download() {
    const r =
        current ||
        state.reports[0] ||
        generatePortfolioReport(state, backtestResult),
      md = `# ${r.title}\n\n${r.sections.map((s: any) => `## ${s.heading}\n\n${s.body}`).join("\n\n")}${r.aiCommentary ? `\n\n## Commentary (${r.commentarySource})\n\n${r.aiCommentary}` : ""}\n\n${DISCLAIMER}\n`;
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([md], { type: "text/markdown" }));
    a.download = "portfoliopilot-report.md";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  return (
    <>
      <div className="page-title-with-tools">
        <Title
          eyebrow="PORTFOLIO BRIEFING"
          title="A review you can keep."
          sub="Generate an on-demand report. Commentary is deterministic by default; account AI commentary needs explicit opt-in."
        />
        <ReportDownload state={state} section="combined" title="PortfolioPilot combined report" scopes={[{ value: "all", label: "Combined report" }]} />
      </div>
      <Card>
        <div className="card-heading">
          <div>
            <span className="eyebrow">REPORT CONTROLS</span>
            <h2>Build a portfolio note</h2>
            <p>
              Uses current saved or local state. Values remain synthetic when in
              demo mode.
            </p>
          </div>
          <FileText size={22} />
        </div>
        <div className="report-actions">
          <Button onClick={generate} disabled={busy}>
            {busy ? "Generating…" : "Generate report"}
          </Button>
          <Button kind="outline" onClick={() => window.print()}>
            <Download size={16} /> Print / Save as PDF
          </Button>
          <Button kind="outline" onClick={download}>
            Download Markdown
          </Button>
        </div>
        <div className="button-row report-section-downloads">
          {(["overview", "holdings", "allocation", "goals", "diversification", "stress", "backtest", "snapshots"] as const).map(section => (
            <ReportDownload
              key={section}
              state={state}
              section={section}
              title={`${section} report`}
              scopes={[{ value: "all", label: `${section[0]!.toUpperCase()}${section.slice(1)} section` }]}
              unavailable={
                section === "backtest" && (!backtestResult || backtestResult.status !== "ready")
                  ? backtestResult?.message || "No ready saved comparison exists."
                  : section === "stress" && !state.stressResult
                    ? "No saved stress scenario exists."
                    : undefined
              }
            />
          ))}
        </div>
        <label className="checkbox-label">
          <input
            type="checkbox"
            checked={state.preferences.aiReportConsent}
            onChange={e =>
              setState({
                ...state,
                preferences: {
                  ...state.preferences,
                  aiReportConsent: e.target.checked,
                },
              })
            }
            disabled={!user}
          />{" "}
          Request account AI commentary when generating (separate explicit
          consent)
        </label>
        {!user && (
          <p className="note">
            Guest/demo reports use local deterministic commentary only; no
            report API is called.
          </p>
        )}
        {err && (
          <p className="error-box" role="alert">
            {err} The deterministic report is still available.
          </p>
        )}
      </Card>
      <div className="report-document">
        <div className="report-brand">
          <Mark small />
          <span>
            {new Date().toLocaleDateString("en-IN")} ·{" "}
            {demo ? "DEMO DATA" : "PRIVATE PORTFOLIO"}
          </span>
        </div>
        {current || state.reports[0] ? (
          <>
            <Title
              eyebrow="PORTFOLIO REVIEW"
              title={(current || state.reports[0]).title}
            />
            {(current || state.reports[0]).sections.map((s: any) => (
              <section key={s.heading} className="report-section">
                <h2>{s.heading}</h2>
                <p>{s.body}</p>
              </section>
            ))}
            {(current || state.reports[0]).aiCommentary && (
              <section className="report-section">
                <h2>
                  Commentary · {(current || state.reports[0]).commentarySource}
                </h2>
                <p>{(current || state.reports[0]).aiCommentary}</p>
              </section>
            )}
            <p className="note">
              Methodology: current data and assumptions from this workspace;
              goal projections assume constant annual return/inflation and
              monthly payments. Synthetic correlation and scenario data are not
              market history. No tax, transaction costs, trading or security
              constraints are included.
            </p>
            <Disclaimer />
          </>
        ) : (
          <Empty
            title="No saved report yet"
            body="Generate a review to create a structured note with goal, allocation and stress sections."
          />
        )}
      </div>
      <Card>
        <h2>Previous reports</h2>
        {state.reports.map(r => (
          <div key={r.id} className="history-item">
            <b>{r.title}</b>
            <small>
              {new Date(r.createdAt).toLocaleString()} · {r.commentarySource}{" "}
              commentary
            </small>
          </div>
        ))}
      </Card>
    </>
  );
}
function Notifications() {
  const { state, setState } = useApp();
  return (
    <>
      <Title
        eyebrow="IN-APP NOTICES"
        title="Signals worth a look."
        sub="These are local product notifications only. No email or SMS is sent."
      />
      <div className="page-tools">
        <span>{state.notifications.filter(n => !n.read).length} unread</span>
        <Button
          kind="outline"
          onClick={() =>
            setState({
              ...state,
              notifications: state.notifications.map(n => ({
                ...n,
                read: true,
              })),
            })
          }
        >
          Mark all as read
        </Button>
      </div>
      {state.notifications.length ? (
        <div className="notice-list">
          {state.notifications.map(n => (
            <Card key={n.id} className={`notice-card ${n.read ? "read" : ""}`}>
              <div className="notice-icon">
                <Bell size={18} />
              </div>
              <div>
                <div className="notice-title">
                  <b>{n.title}</b>
                  {!n.read && <span className="pill attention">New</span>}
                </div>
                <p>{n.message}</p>
                <small>{new Date(n.createdAt).toLocaleDateString()}</small>
              </div>
              <button
                className="text-button"
                onClick={() =>
                  setState({
                    ...state,
                    notifications: state.notifications.map(x =>
                      x.id === n.id ? { ...x, read: !x.read } : x
                    ),
                  })
                }
              >
                {n.read ? "Mark unread" : "Mark read"}
              </button>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <Empty
            title="You’re all caught up"
            body="Relevant local notices will appear here when available."
          />
        </Card>
      )}
    </>
  );
}
function SettingsPage() {
  const { state, setState, user, api, logout } = useApp();
  const [msg, setMsg] = useState(""),
    [err, setErr] = useState(""),
    [sessions, setSessions] = useState<any[]>([]),
    [passwords, setPasswords] = useState(["", ""]),
    [busy, setBusy] = useState(false);
  async function sessionsLoad() {
    if (!user) return;
    try {
      const out = await api("/api/app/sessions");
      setSessions(Array.isArray(out.sessions) ? out.sessions : []);
    } catch (e) {
      setErr(String(e));
    }
  }
  async function passwordChange(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    try {
      await api("/api/app/password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword: passwords[0],
          newPassword: passwords[1],
        }),
      });
      setMsg("Password updated.");
      setPasswords(["", ""]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Password update failed.");
    }
  }
  function exportState() {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(
      new Blob([JSON.stringify(state, null, 2)], { type: "application/json" })
    );
    a.download = "portfoliopilot-data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
  async function deleteAccount() {
    const pw = prompt(
      "Enter your password to confirm permanent account deletion:"
    );
    if (pw === null) return;
    try {
      await api("/api/app/account", {
        method: "DELETE",
        body: JSON.stringify({ password: pw }),
      });
      await logout();
      setMsg("Account deletion request completed.");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not delete account.");
    }
  }
  return (
    <>
      <Title
        eyebrow="PREFERENCES & PRIVACY"
        title="Settings that stay in your hands."
        sub="Profile and preferences are editable. INR is the current supported currency."
      />
      {msg && <p className="success-box">{msg}</p>}
      {err && (
        <p className="error-box" role="alert">
          {err}
        </p>
      )}
      <Card>
        <span className="eyebrow">PROFILE</span>
        <h2>Your details</h2>
        <div className="form-grid">
          {[
            ["Name", "name"],
            ["Age", "age"],
            ["Employment", "employment"],
            ["Annual income (₹)", "annualIncome"],
            ["Monthly income (₹)", "monthlyIncome"],
            ["Monthly investment (₹)", "monthlyInvestment"],
            ["Existing assets (₹)", "existingAssets"],
          ].map(([label, key]) => (
            <label key={key}>
              {label}
              <input
                type={
                  key === "age" ||
                  key.includes("Income") ||
                  key.includes("investment") ||
                  key.includes("assets")
                    ? "number"
                    : "text"
                }
                value={(state.profile as any)[key] ?? ""}
                onChange={e => {
                  const value =
                    e.target.type === "number"
                      ? Number(e.target.value)
                      : e.target.value;
                  setState({
                    ...state,
                    profile: { ...state.profile, [key]: value },
                  });
                }}
              />
            </label>
          ))}
          <label>
            Experience
            <select
              value={state.profile.experience}
              onChange={e =>
                setState({
                  ...state,
                  profile: {
                    ...state.profile,
                    experience: e.target.value as any,
                  },
                })
              }
            >
              {[
                "",
                "New",
                "Some experience",
                "Experienced",
                "Professional",
              ].map(x => (
                <option key={x || "empty"} value={x}>
                  {x || "Choose…"}
                </option>
              ))}
            </select>
          </label>
          <label>
            Portfolio Risk Profile
            <select
              value={state.profile.riskProfile || ""}
              onChange={e =>
                setState({
                  ...state,
                  profile: {
                    ...state.profile,
                    riskProfile: (e.target.value || null) as any,
                  },
                })
              }
            >
              <option value="">Not set</option>
              {["Conservative", "Moderate", "Growth", "Aggressive"].map(x => (
                <option key={x} value={x}>
                  {x}
                </option>
              ))}
            </select>
          </label>
          <label>
            Currency
            <input value="INR (₹)" disabled />
          </label>
        </div>
      </Card>
      <Card>
        <span className="eyebrow">PREFERENCES</span>
        <h2>Notifications and reports</h2>
        <div className="setting-list">
          {Object.entries(state.preferences.notificationTypes).map(
            ([key, v]) => (
              <label key={key}>
                <input
                  type="checkbox"
                  checked={v}
                  onChange={e =>
                    setState({
                      ...state,
                      preferences: {
                        ...state.preferences,
                        notificationTypes: {
                          ...state.preferences.notificationTypes,
                          [key]: e.target.checked,
                        },
                      },
                    })
                  }
                />
                {key[0].toUpperCase() + key.slice(1)} notifications
              </label>
            )
          )}
        </div>
        <label className="field-inline">
          Report frequency
          <select
            value={state.preferences.reportFrequency}
            onChange={e =>
              setState({
                ...state,
                preferences: {
                  ...state.preferences,
                  reportFrequency: e.target.value as any,
                },
              })
            }
          >
            {["Off", "Monthly", "Quarterly"].map(x => (
              <option key={x} value={x}>
                {x}
              </option>
            ))}
          </select>
        </label>
        <p className="note">
          Reports are generated in-app; no email delivery is implemented.
        </p>
      </Card>
      <Card>
        <span className="eyebrow">DATA & SECURITY</span>
        <h2>Export, sessions and account</h2>
        <div className="button-row">
          <Button kind="outline" onClick={exportState}>
            <Download size={16} /> Export workspace data
          </Button>
          <Button kind="outline" onClick={() => exportSettingsXlsx(state)}>
            <Download size={16} /> Export Settings to Excel
          </Button>
          {user && (
            <Button kind="outline" onClick={sessionsLoad}>
              View account sessions
            </Button>
          )}
        </div>
        {sessions.map(s => (
          <div key={s.id} className="session-row">
            <span>
              {s.userAgent || "Active session"}
              <small>
                {s.current ? "Current session" : "Other session"} ·{" "}
                {s.lastSeenAt}
              </small>
            </span>
            {!s.current && (
              <Button
                kind="text"
                onClick={async () => {
                  try {
                    await api(`/api/app/sessions/${s.id}`, {
                      method: "DELETE",
                    });
                    await sessionsLoad();
                  } catch (e) {
                    setErr(String(e));
                  }
                }}
              >
                Revoke
              </Button>
            )}
          </div>
        ))}
        {user && (
          <form className="password-form" onSubmit={passwordChange}>
            <h3>Change password</h3>
            <label>
              Current password
              <input
                type="password"
                autoComplete="current-password"
                value={passwords[0]}
                onChange={e => setPasswords([e.target.value, passwords[1]])}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                minLength={8}
                autoComplete="new-password"
                value={passwords[1]}
                onChange={e => setPasswords([passwords[0], e.target.value])}
                required
              />
            </label>
            <Button type="submit">Update password</Button>
          </form>
        )}
        {user && (
          <div className="danger-zone">
            <div>
              <b>Delete account and saved data</b>
              <p>
                This is permanent and cannot be undone. Confirm in the browser
                prompt and enter your password.
              </p>
            </div>
            <Button
              kind="danger"
              onClick={() => {
                if (
                  confirm(
                    "Permanently delete your account and saved portfolio data? This cannot be undone."
                  )
                )
                  void deleteAccount();
              }}
            >
              Delete account
            </Button>
          </div>
        )}
      </Card>
    </>
  );
}
function Help() {
  return (
    <>
      <Title
        eyebrow="HELP & LIMITATIONS"
        title="How PortfolioPilot works."
        sub="A prototype for understanding—not executing—portfolio decisions."
      />
      <div className="help-grid">
        {[
          [
            "What data does it use?",
            "Demo data is synthetic. Guest workspaces and demo edits stay in local browser storage. Account state is sent only to the relative same-origin app API.",
          ],
          [
            "Does it connect to my broker?",
            "No. PortfolioPilot does not ask for broker credentials, access live brokerage accounts, move money or place trades.",
          ],
          [
            "Are projections predictions?",
            "No. Goal estimates use a fixed annual return, inflation and monthly-contribution assumption. Stress scenarios apply percentage-point shocks to current holding values.",
          ],
          [
            "What does the health score mean?",
            "It is a product methodology score, not an official rating: asset class 30%, sector 20%, security concentration 20%, correlation 20%, geography 10%. Demo correlations are synthetic.",
          ],
          [
            "How do account AI explanations work?",
            "The account Coach requires explicit opt-in in the prompt. The server returns its source. Guest/demo answers are deterministic and local; they do not call the Coach API.",
          ],
          [
            "What are the limitations?",
            "No live prices, broker data, trades, tax/transaction cost calculation, security constraints, guaranteed returns or personalized investment advice. User imports are not independently verified.",
          ],
        ].map(([q, a]) => (
          <Card key={q}>
            <h2>{q}</h2>
            <p>{a}</p>
          </Card>
        ))}
      </div>
    </>
  );
}
function NotFoundPage() {
  return (
    <Layout>
      <Title
        title="Page not found"
        sub="That route is not part of this workspace."
      />
      <Button href="/dashboard">Go to overview</Button>
    </Layout>
  );
}
function ApplicationRoute() {
  const [loc] = useLocation();
  const { user, demo, ready, state } = useApp();
  const path = loc.replace(/\/$/, "") || "/";
  const onboarded = typeof state.profile.riskScore === "number";

  if (!ready && path !== "/")
    return (
      <div className="loading">
        <Mark />
        <p>Loading your workspace…</p>
      </div>
    );
  if (path === "/") return <Landing />;
  if (path === "/login" || path === "/register")
    return user ? (
      <Redirect to={onboarded ? "/dashboard" : "/onboarding"} replace />
    ) : (
      <Auth />
    );
  if (!user && !demo) return <Auth />;
  if (path === "/onboarding") return <Onboarding />;
  if (user && !onboarded) return <Redirect to="/onboarding" replace />;

  let page: ReactNode;
  if (path === "/dashboard") page = <Dashboard />;
  else if (path === "/portfolio") page = <Portfolio />;
  else if (path === "/backtest") page = <BacktestPage />;
  else if (path === "/goals") page = <Goals />;
  else if (path.startsWith("/goals/"))
    page = <GoalDetail id={decodeURIComponent(path.split("/")[2])} />;
  else if (path === "/stress-test") page = <StressTest />;
  else if (path === "/rebalance") page = <Rebalance />;
  else if (path === "/ai-coach") page = <Coach />;
  else if (path === "/reports") page = <Reports />;
  else if (path === "/notifications") page = <Notifications />;
  else if (path === "/settings") page = <SettingsPage />;
  else if (path === "/help") page = <Help />;
  else return <NotFoundPage />;
  return <Layout>{page}</Layout>;
}

export default function App() {
  return (
    <AppProvider>
      <Switch>
        <Route component={ApplicationRoute} />
      </Switch>
    </AppProvider>
  );
}
