# PortfolioPilot

**Your portfolio. Your goals. Your all-weather strategy.**

PortfolioPilot is an educational WealthTech prototype for Indian retail investors. It brings holdings and goals into one view, explains concentration and diversification, and supports illustrative stress scenarios and an All-Weather-inspired allocation review. It is not a broker, does not connect to live accounts or prices, and cannot execute trades or transfer money.

> PortfolioPilot is an educational and analytical prototype. Simulations and recommendations are illustrative and do not constitute personalized investment advice or a guarantee of future returns.

## Product capabilities

- **Guest demo:** fictional sample portfolios for Vikram Nair and Meghna Sharma, clearly marked Demo Data. Demo positions, values, and synthetic correlations are illustrative; no historical return series is bundled.
- **Portfolio analytics:** search, filter and sort holdings; inspect allocation, sectors, market cap, geography, gain/loss, concentration and HHI. Demo-only correlations are labeled synthetic. Account correlation cells are calculated only from sufficient complete user-uploaded monthly returns; otherwise they are unavailable.
- **Holdings CSV import:** accepts `.csv` files up to 2 MB with aliases for symbol/security and market-value headers. Valid rows are normalized and row errors are explained.
- **Goal mapping:** create and edit multiple goals with target/current amount, date, monthly contribution, return and inflation assumptions. Show inflation-adjusted targets and deterministic projections; no heuristic goal likelihood/probability is displayed.
- **Stress testing:** apply explicitly illustrative 2008-style, COVID-style, taper-tantrum, inflation, interest-rate, equity-correction and custom asset-bucket shocks to current holdings, with holding and goal sensitivity.
- **All-Weather-inspired review:** compare current mix with editable targets across growth-, inflation-, deflation- and recession-sensitive exposures. Currency adjustments are review-only; no trade is placed.
- **Historical comparison (`/backtest`):** users can import a wide monthly bucket-return CSV, retain source/date/currency/basis/missing-data provenance, edit baseline and comparison weights and shared assumptions, and calculate metrics only on a complete common period. Metrics include total return, CAGR, volatility, Sharpe, drawdown, recovery, selected periods and available event windows. The engine never substitutes synthetic returns. Details and limitations are in [backtest methodology](docs/venture/backtest-methodology.md).
- **Coach and reports:** deterministic explanations work without an LLM. Signed-in users may separately opt in to Coach AI and report commentary. AI is server-only, uses minimized calculated context and falls back to deterministic output. Reports can be printed from the browser and downloaded as Markdown.
- **Family plans (`/family-plans`):** collaborative household plans with server-enforced role-based access control (Owner, Editor, Viewer). Secure cryptographic invitation flow, shared portfolio state with strict isolation from personal portfolios, and joint milestone tracking.
- **Accounts and preferences:** email/password accounts, account-scoped state, secure session handling, profile and risk onboarding, password/session controls, export/deletion and local notifications.

## Routes

`/`, `/login`, `/register`, `/onboarding`, `/dashboard`, `/portfolio`, `/backtest`, `/stress-test`, `/goals`, `/goals/:id`, `/family-plans`, `/rebalance`, `/ai-coach`, `/reports`, `/notifications`, `/settings`, and `/help`.

## Architecture

| Area | Responsibility |
| --- | --- |
| `client/src/App.tsx` | Wouter routes, product views, forms, visualizations and the persistent disclaimer. |
| `client/src/BacktestPage.tsx` | User-return CSV import, comparison assumptions, provenance and shared result presentation. |
| `client/src/contexts/AppContext.tsx` | Guest/local state, session hydration, account API integration and validated save status. |
| `client/src/data/demo.ts` | Fictional personas, portfolio positions, scenarios, snapshots and demo-only synthetic correlations. |
| `shared/portfolio.ts` | Typed portfolio contracts and bounded, backward-compatible saved provenance/configuration. |
| `shared/finance.ts` | Deterministic goal, risk, diversification/HHI, stress, rebalance, holdings CSV, report and Coach calculations. |
| `shared/backtest.ts` | Historical-return CSV normalization, common-period checks, rebalance simulation, metric and correlation calculations. |
| `server/app-api.ts` | `/api/app` registration/login/session/state APIs and consent-gated Coach/report commentary. |
| `server/app-security.ts` | State/return validation, password and session safeguards, and minimized numeric AI context. |
| `server/app-repository.ts` | Drizzle persistence scoped by authenticated user id. |
| `server/_core/index.ts` | Express, health, Vite development/static serving and API mounting. |
| `server/_core/llm.ts` | Server-only helper for the optional Coach/report AI. It calls an OpenAI-style HTTP API at the URL you configure (`MANUS_API_URL`); see *Accounts, privacy and AI consent*. |
| `drizzle/` | MySQL schema (Drizzle ORM) and checked-in migrations. |

## Technology and development

React 19, TypeScript, Vite, Tailwind CSS v4, Wouter, Recharts, Lucide, Express, Drizzle ORM, MySQL (any MySQL 8-compatible server that you run) and Vitest. Deterministic analytics require neither an LLM nor an external market-data provider.

From the project root:

```bash
pnpm dev       # Full application on PORT (default 3000)
pnpm check     # TypeScript
pnpm test      # Vitest suites
pnpm build     # Vite frontend and Express bundle
pnpm start     # Serve the production bundle
```

In the original managed WebDev environment the mapped `users`, `app_sessions` and `portfolio_states` tables pre-exist. For a fresh local database, see **Local setup** below. The application does not reseed or overwrite user state on startup. Avoid destructive migrations and `db:push` unless a deliberate schema change is planned. `/api/health` is the unauthenticated health endpoint. Browser-facing requests stay relative; this was designed for the original cross-site hosted Preview iframe and is not needed for local development.

## Local setup (Windows, macOS, Linux)

Requires Node.js and pnpm 10.18 (`corepack enable` provides it). This project has been developed and tested on Node.js 24.13; the Dockerfile uses Node 22, which has not been run here. No Manus account or service is needed. The only optional feature that can contact a third-party service is Coach/report AI (see below).

1. `pnpm install`
2. Copy `.env.example` to `.env` and set `DATABASE_URL` for a MySQL 8 / MariaDB server you control. Leave `MANUS_API_URL` and `MANUS_API_KEY` blank unless you are configuring the optional Coach AI (see the last note below).
3. Create an **empty** database, e.g. `CREATE DATABASE portfolio_pilot CHARACTER SET utf8mb4;`
4. `pnpm db:migrate` applies the checked-in migrations (`drizzle/0000_*.sql`, `drizzle/0001_*.sql`) to that empty database.
5. `pnpm dev`, then open http://localhost:3000.

Notes:

- **Demo mode and the analytics need no database.** Only registration, sign-in and saved account state need `DATABASE_URL`.
- **Run `db:migrate` only on a new, empty database.** `0001` creates `app_sessions` and `portfolio_states` and adds `users.passwordHash`; it will fail on a database that already has them (such as the original managed one). Do not use `pnpm db:push` for setup, because it also runs `drizzle-kit generate`.
- The session cookie is `HttpOnly; Secure; SameSite=None; Partitioned`. Chromium-based browsers and Firefox are documented to treat `http://localhost` as a secure context for `Secure` cookies, so use one of those for local sign-in; Safari is expected to need HTTPS. The project owner reports that registration, sign-in and reload persistence worked in Chrome on `http://localhost`; other browsers have not been tested (see `HANDOFF.md`).
- Coach/report AI is optional and off unless `MANUS_API_URL` and `MANUS_API_KEY` are set. The names are historical: the code calls an OpenAI-style API (`GET /v1/models`, `POST /v1/chat/completions`) at whatever URL you give it, and it was written for the Manus-hosted endpoint, with hard-coded model names (`gpt-5-mini`, `gpt-5-nano`, `gemini-3-flash-preview`) that another provider may not offer. It has not been tested against a real provider. Deterministic answers always work without it.

## Demo access

Open `/` and choose **Explore Demo**. Select Vikram or Meghna from the persona control. Demo state stays local to the browser; no login or brokerage access is required. **Exit workspace** returns to the public landing page. Newly registered accounts begin with an empty account-scoped portfolio and proceed through onboarding.

## Monthly return CSV for `/backtest`

This is separate from the holdings CSV. Use one row per monthly period and one percentage-point simple-return column per asset bucket:

```csv
month,Equity (%),Mutual Funds (%),Gold (%),Debt (%),Cash (%)
2022-01,-2.1,-1.4,0.7,0.2,0.1
2022-02,1.3,1.0,-0.2,0.3,0.1
```

The example above is only a format illustration, not market history or an app-provided dataset. Enter `1.2` for 1.2%, not `0.012`. Import up to 360 months / 1 MB, with source name, optional HTTPS reference, INR, frequency and return basis. The original file is parsed locally and discarded; only normalized monthly bucket values and provenance are stored. The source remains user-uploaded and unverified. Missing cells are not filled. Internal gaps in the selected common window block comparison results. Read the [methodology](docs/venture/backtest-methodology.md) before interpreting any metric.

## Accounts, privacy and AI consent

Account state is validated server-side and stored per authenticated user. Passwords use scrypt hashes; random session tokens are hashed at rest. The browser receives an `HttpOnly; Secure; SameSite=None; Partitioned` cookie for eligible cross-site Preview contexts. Private account responses are marked no-store. AI Coach and report commentary are distinct opt-ins, off by default. When the saved preference *and* the per-request consent are both present, and an AI endpoint is configured, the server may send the **external AI provider**: (a) a minimized numeric portfolio summary, which excludes names, account identifiers, holding/security names, source URLs and raw history rows; and (b) for Coach only, **the user's free-text question exactly as typed (up to 500 characters)**. The question is not filtered, so anything typed into it, including names or identifiers, is sent. Report commentary sends the numeric summary only. How the provider stores or uses that data is outside this project's control and has not been reviewed. The in-app consent labels do not yet name the provider. If AI is not configured, consent is missing, or the provider fails, the app returns the deterministic answer. Guest/demo explanations stay deterministic and local.

The app has no live broker, CAMS/KFintech, Account Aggregator, verified price-feed, execution, payment or external market-data integration. Provider integrations would be separate future work subject to legal, data-rights, consent and security review.

## Venture documentation

- [Opportunity and business model](docs/venture/opportunity-and-business-model.md): problem, validation method, user personas, ecosystem, competitor context, market assumptions, concept, revenue hypotheses and roadmap.
- [Backtest methodology](docs/venture/backtest-methodology.md): data contract, metric definitions, costs, missing-data rules and limitations.
- [Regulatory, privacy and data boundaries](docs/venture/regulatory-and-data-boundaries.md): cited sources reviewed, prototype boundaries and launch gates.
- [Research source notes](docs/venture/research-notes.md): source-by-source evidence, dates and verification caveats.

## Limitations

- Demo portfolio values, synthetic demo correlations, crisis shocks and recovery assumptions are illustrative, not observed market performance.
- Historical backtest results rely on unverified user-provided monthly asset-bucket returns. No point-in-time constituent, delisted-security, corporate-action, dividend, slippage, tax or liquidity data is supplied.
- Goal projections use constant user-entered assumptions and a deterministic end-of-month contribution convention. They are not guarantees or probabilities.
- The diversification score is a disclosed internal heuristic, not an official rating. The risk questionnaire is not a professional suitability assessment.
- Rebalancing is review-only. No personalized security trade instruction is issued.
- No native PDF-generation engine or verified market-data provider is included; report print uses the browser and export is Markdown.

## Tests

`pnpm check` verifies TypeScript. `pnpm test` exercises account security, saved-state/privacy contracts, deterministic financial engines, CSV parsing, missing/extreme history, backtest metrics and provenance. The suite includes HTTP-level tests of the `/api/app` routes that use an in-memory repository (they do not touch MySQL) and Coach AI tests that use a stubbed provider (they never contact a real one). These automated checks do not replace legal review, independent market-data validation, browser usability/accessibility testing or a security audit.
