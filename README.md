# PortfolioPilot

*Intelligent Wealth Analytics, Goal-Oriented Engineering & Stochastic Simulation for Indian Markets.*

PortfolioPilot is an educational WealthTech and computational finance platform designed for Indian retail investors and multi-asset portfolios. It consolidates portfolio holdings, evaluates risk and concentration, tracks financial goals, analyzes historical market stress scenarios, and explores potential portfolio outcomes using statistical and stochastic simulation models.

The platform combines deterministic investor profiling, portfolio analytics, historical backtesting, and computational finance techniques, including Monte Carlo simulation, Markov chains, and Hidden Markov Models (HMMs).

> **Academic and Regulatory Notice:** PortfolioPilot is developed strictly for analytical, research, and educational purposes. It is not a SEBI-registered investment adviser, broker, or Portfolio Management Services (PMS) provider. It does not execute trades, provide regulated personalized investment advice, or guarantee future returns.

---

## Table of Contents

- [System Architecture](#system-architecture)
- [Core Features](#core-features)
- [Computational Finance Methodology](#computational-finance-methodology)
- [Technology Stack](#technology-stack)
- [Project Structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Local Setup and Installation](#local-setup-and-installation)
- [Environment Configuration](#environment-configuration)
- [Database Setup](#database-setup)
- [Security and Session Management](#security-and-session-management)
- [Available Scripts](#available-scripts)
- [Testing and Validation](#testing-and-validation)
- [Limitations and Disclaimers](#limitations-and-disclaimers)

---

## System Architecture

PortfolioPilot follows a full-stack architecture that separates the frontend, backend services, shared financial logic, and database persistence.

The frontend communicates with the Express backend through REST APIs. The backend manages authentication, session validation, portfolio persistence, and application services. Drizzle ORM provides database access, while shared TypeScript modules maintain consistent financial calculations and data contracts across the application.

The database is hosted on TiDB Cloud Serverless, using MySQL-compatible connectivity and encrypted transport.

### Architecture Overview

```text
                 PortfolioPilot
                        |
          +-------------+-------------+
          |                           |
     React Frontend              Express Backend
          |                           |
          |                     REST API Layer
          |                           |
          |              +------------+------------+
          |              |            |            |
          |          Authentication Portfolio    Coach
          |          & Sessions     Services     Services
          |              |            |
          |              +------------+
          |                           |
          |                    Repository Layer
          |                           |
          |                       Drizzle ORM
          |                           |
          |                    TiDB Cloud Database
          |
     Shared Financial Logic
     - Risk Scoring
     - Portfolio Analytics
     - Goal Projections
     - Historical Backtesting
```

---

## Core Features

### 1. Investor Onboarding and Deterministic Risk Profiling

PortfolioPilot uses a structured onboarding questionnaire to establish an investor's financial profile and investment constraints.

- **Structured Assessment:** Captures investment horizon, financial runway, income stability, and tolerance for market drawdowns.
- **Deterministic Risk Engine:** Converts assessment responses into a normalized risk score on a 0–100 scale using predefined rules rather than unconstrained model-generated classifications.
- **Investor Classification:** Maps the resulting score to one of five investor profiles:
  - Conservative
  - Moderately Conservative
  - Moderate
  - Growth
  - Aggressive
- **Dynamic Constraint Initialization:** Establishes baseline allocation targets and tolerance bands based on the calculated investor profile.
- **Persistent User Profiles:** Stores assessment results against the authenticated user profile to support consistent application behavior across sessions.

### 2. Multi-Asset Portfolio Analytics

The portfolio module consolidates investment holdings into a unified view of asset allocation, concentration, and diversification.

- **Asset Class Normalization:** Supports portfolio records across equities, mutual funds, gold, debt, and cash.
- **Portfolio Consolidation:** Organizes holdings and allocation data for portfolio-level analysis.
- **Concentration Analysis:** Uses the Herfindahl-Hirschman Index (HHI) to evaluate concentration across supported dimensions, such as individual securities, sectors, market capitalization categories, and geographies, where the required data is available.
- **Diversification Assessment:** Identifies potential concentration risks and deviations from baseline allocation targets.
- **Goal-Based Projections:** Estimates future portfolio values using expected returns, inflation assumptions, and recurring monthly contributions.

### 3. Financial Goal Planning

The goal-planning module connects investment assumptions with long-term financial objectives.

- Models potential corpus growth over a selected investment horizon.
- Incorporates recurring monthly contributions.
- Supports inflation-adjusted projections.
- Helps evaluate whether an estimated investment trajectory aligns with a target corpus.
- Provides deterministic estimates based on explicitly defined assumptions.

These projections are scenario-based calculations and should not be interpreted as guaranteed investment outcomes.

### 4. Crisis Stress Testing and Portfolio Resilience

PortfolioPilot evaluates how portfolio allocations may respond to adverse market conditions.

- **Historical Crisis Scenarios:** Examines selected market stress periods, including the 2008 Global Financial Crisis and the 2020 COVID-19 market shock.
- **Asset-Level Stress Testing:** Applies configurable shocks to supported asset classes and holdings.
- **Portfolio Impact Analysis:** Estimates the effect of adverse scenarios on portfolio value and financial goals.
- **Allocation Benchmarking:** Compares portfolio allocations with an All-Weather-style reference allocation across different economic conditions.

The accuracy of stress-test results depends on the assumptions, historical series, and asset-level exposure data supplied to the system.

### 5. Historical Portfolio Backtesting

The `/backtest` module evaluates portfolio performance over historical market data.

Key features include:

- Historical portfolio return calculations.
- Common-period validation across selected assets.
- Rebalancing logic for supported portfolio configurations.
- Source metadata, including data source, frequency, return basis, and missing-data treatment.
- Performance and risk metrics calculated over eligible historical periods.

The principal metrics include:

| Metric | Purpose |
|---|---|
| CAGR | Measures annualized compounded growth |
| Annualized Volatility | Estimates the variability of returns |
| Sharpe Ratio | Evaluates excess return relative to volatility |
| Maximum Drawdown | Measures the largest peak-to-trough decline |
| Recovery Period | Estimates the time required to recover from a drawdown |

**Data integrity:** Backtesting should use complete, validated common observation periods. Missing returns must not be silently replaced with synthetic observations. Any exclusions or data transformations should be documented so that results remain interpretable and reproducible.

### 6. Computational Finance and Market Regime Analysis

The computational finance module extends the platform into statistical modeling and stochastic simulation for Indian financial markets.

The research pipeline is designed around historical price and fundamental data extracted from CMIE databases, including ProwessIQ and Economic Outlook, subject to data access and licensing permissions.

The pipeline explores:

- Monte Carlo simulation of potential asset-price and portfolio-value trajectories.
- Markov-chain estimation of transitions between market regimes.
- Hidden Markov Models for identifying latent market states.
- Regime-dependent calibration of expected returns and volatility.
- Probabilistic portfolio risk estimation using Value-at-Risk and Conditional Value-at-Risk.

See [Computational Finance Methodology](#computational-finance-methodology) for the underlying modeling concepts.

---

## Computational Finance Methodology

### 1. Data Extraction and Preparation

Historical market data forms the input to the simulation pipeline.

The intended workflow is:

1. Extract relevant historical price and fundamental observations from authorized CMIE data sources.
2. Validate dates, instrument identifiers, frequencies, and numerical values.
3. Apply consistent return definitions and corporate-action adjustments where the source data supports them.
4. Handle missing observations explicitly and document exclusions.
5. Calculate historical return and volatility series.
6. Prepare validated time-series datasets for regime estimation and simulation.

The resulting dataset should retain source metadata, observation frequency, adjustment conventions, and preprocessing decisions to support reproducibility.

### 2. Monte Carlo Simulation

Monte Carlo simulation generates multiple possible future price or portfolio-value trajectories from specified statistical assumptions.

Under the Geometric Brownian Motion (GBM) model, an asset price follows:

\[
dS_t = \mu S_t\,dt + \sigma S_t\,dW_t
\]

Where:

- \(S_t\) is the asset price at time \(t\).
- \(\mu\) is the assumed annualized drift.
- \(\sigma\) is the annualized volatility.
- \(W_t\) is a standard Brownian motion.

For a discrete time step \(\Delta t\), the corresponding GBM update is:

\[
S_{t+\Delta t}
=
S_t\exp\left[
\left(\mu-\frac{\sigma^2}{2}\right)\Delta t
+
\sigma\sqrt{\Delta t}\,Z_t
\right]
\]

where \(Z_t\) is a standard normally distributed random variable.

Repeated simulation produces a distribution of possible outcomes rather than a single forecast. These paths can be used to investigate potential portfolio growth, losses, and tail-risk exposure under the model assumptions.

### 3. Market Regime Modeling with Markov Chains

Market behavior can be modeled using discrete regimes such as:

- Bull
- Bear
- Stagnant

A Markov-chain model estimates the probability of transitioning from one regime to another using observed historical regime sequences.

The transition matrix \(P\) is defined as:

\[
P_{ij} = \Pr(R_{t+1}=j \mid R_t=i)
\]

where \(R_t\) represents the market regime at time \(t\).

Each row of the transition matrix sums to one. The estimated probabilities can be used to simulate possible sequences of market regimes and examine how persistent or transitional market conditions affect portfolio risk.

### 4. Hidden Markov Models

Hidden Markov Models extend regime analysis by treating market regimes as latent states that cannot be observed directly.

Instead, the model infers the underlying states from observable data, such as asset returns and volatility estimates.

The HMM pipeline includes:

1. **Observation preparation:** Construct return and volatility features from historical market data.
2. **Parameter estimation:** Estimate transition probabilities and emission-distribution parameters using the Baum-Welch algorithm.
3. **State decoding:** Use the Viterbi algorithm to estimate the most likely sequence of hidden market states.
4. **Regime characterization:** Analyze the estimated states using their return, volatility, and persistence characteristics.
5. **Simulation calibration:** Use regime-specific parameter estimates to inform subsequent stochastic simulations.

HMM outputs are statistical estimates, not definitive identifications of real economic regimes. Their reliability depends on data quality, model assumptions, feature selection, and validation.

### 5. Regime-Aware Monte Carlo Simulation

The regime-aware simulation pipeline combines stochastic price evolution with changing market conditions.

At each simulation step, the model can:

1. Determine or sample the current market regime.
2. Sample the next regime using the estimated transition matrix.
3. Select the drift and volatility parameters associated with the active regime.
4. Generate the next return or price observation.
5. Repeat the process across multiple paths and simulation periods.
6. Aggregate the resulting portfolio outcomes into risk and performance distributions.

Unlike a simulation with fixed parameters, a regime-aware model allows the assumed return and volatility characteristics to change as the simulated market state changes.

### 6. Value-at-Risk and Conditional Value-at-Risk

The simulated distribution of portfolio losses can be used to estimate tail-risk measures.

- **Value-at-Risk (VaR):** Estimates a loss threshold that is exceeded with a specified probability over a defined horizon.
- **Conditional Value-at-Risk (CVaR):** Also known as Expected Shortfall, measures the average loss in the tail beyond the corresponding VaR threshold, under the selected convention.

PortfolioPilot's research direction includes estimating VaR at the 95% and 99% confidence levels and evaluating CVaR using simulated portfolio-loss distributions.

These measures are conditional on the selected horizon, confidence level, return assumptions, dependence structure, and simulation methodology. They do not represent guaranteed maximum losses.

---

## Technology Stack

| Layer | Technologies |
|---|---|
| Frontend | React 19, TypeScript, Vite |
| Styling | Tailwind CSS v4 |
| UI Components | Radix UI primitives, Lucide icons |
| Client Routing | Wouter |
| Charts | Recharts |
| Backend | Node.js, Express |
| Database ORM | Drizzle ORM |
| Database Driver | `mysql2` |
| Database | TiDB Cloud Serverless, MySQL-compatible |
| Database Security | TLS-encrypted database connections |
| Testing | Vitest |
| Build Tools | Vite, esbuild |
| Package Manager | pnpm |

---

## Project Structure

```text
PortfolioPilot/
├── backend/
│   ├── _core/
│   │   └── Express application setup,
│   │       environment validation, and Vite middleware
│   ├── certs/
│   │   └── tidb-ca.pem
│   ├── drizzle/
│   │   └── Database schema and SQL migrations
│   ├── app-api.ts
│   │   └── REST API endpoints
│   ├── app-repository.ts
│   │   └── Database persistence and repository operations
│   ├── app-security.ts
│   │   └── Password hashing and authentication helpers
│   └── db.ts
│       └── MySQL connection pool and TLS configuration
│
├── frontend/
│   └── src/
│       ├── components/
│       │   └── Reusable UI components
│       ├── context/
│       │   └── Application state and session handling
│       ├── pages/
│       │   └── Dashboard, onboarding, backtesting,
│       │       goals, and stress testing
│       └── App.tsx
│           └── Routing, authentication guards, and redirects
│
├── shared/
│   ├── backtest.ts
│   │   └── Historical performance and rebalancing logic
│   ├── finance.ts
│   │   └── Risk scoring, concentration, and goal projections
│   └── portfolio.ts
│       └── Shared TypeScript types and data contracts
│
├── docs/
│   ├── HANDOFF.md
│   ├── plan.md
│   ├── ideas.md
│   └── TODO.md
│
├── .env.example
├── package.json
├── pnpm-lock.yaml
└── README.md
```

*Note: The tree describes the intended organization based on the documented architecture. Individual filenames and directories should be checked against the current repository.*

---

## Prerequisites

Before setting up the project, ensure the following are installed and configured:

- **Node.js:** Version 20 or later, compatible with the project's dependencies.
- **pnpm:** Version 10 or later recommended.
- **Git:** For cloning and managing the repository.
- **Database:** A TiDB Cloud Serverless instance or a compatible MySQL 8 database.
- **Database credentials:** Valid connection details and the required CA certificate for verified TLS connections to TiDB Cloud.

---

## Local Setup and Installation

### 1. Clone the Repository

Replace the placeholder with the actual repository URL.

```bash
git clone https://github.com/<your-username>/PortfolioPilot.git
cd PortfolioPilot
```

### 2. Install Dependencies

```bash
pnpm install
```

### 3. Configure Environment Variables

Create a `.env` file in the project root and configure the required application and database settings.

```env
PORT=3000
NODE_ENV=development
DATABASE_URL=mysql://<username>:<password>@<host>:4000/<database_name>
```

Use the actual connection details provided by your database service. Do not commit `.env` or expose database credentials in source control.

### 4. Configure the Database

Ensure the database exists and the TLS certificate configuration matches the connection settings expected by the backend.

Apply the schema using Drizzle Kit:

```bash
pnpm exec drizzle-kit push --config=backend/drizzle.config.ts
```

Use the migration workflow appropriate to your environment, particularly for production databases. Review schema changes before applying them to existing data.

### 5. Run Tests

```bash
pnpm test
```

### 6. Start the Development Server

```bash
pnpm dev
```

Open the application in your browser:

```text
http://localhost:3000
```

The development server is expected to serve the application and support the configured frontend development workflow.

---

## Environment Configuration

The following variables describe the expected configuration. Additional variables may be required by the actual application.

| Variable | Description |
|---|---|
| `PORT` | Port used by the application server |
| `NODE_ENV` | Runtime environment, such as `development` or `production` |
| `DATABASE_URL` | MySQL-compatible database connection URL |

### Database Connection Requirements

For TiDB Cloud Serverless:

- Use the connection endpoint and port provided by TiDB.
- Configure the correct database name and credentials.
- Enable certificate verification and secure TLS transport.
- Ensure the configured CA certificate is accessible to the backend.
- Keep database credentials and certificates protected.
- Never disable certificate verification as a workaround for TLS configuration errors.

The exact environment-variable names and certificate-loading behavior must match the implementation in `backend/db.ts` and the project's environment configuration.

---

## Database Setup

PortfolioPilot uses Drizzle ORM with a MySQL-compatible database connection.

The documented persistence architecture includes:

- User records.
- Application session records.
- Portfolio state and related user-specific data.

The repository and schema modules separate database operations from API request handling.

### Schema Management

Use the project's configured Drizzle Kit command to synchronize or manage the database schema.

```bash
pnpm exec drizzle-kit push --config=backend/drizzle.config.ts
```

For production deployments, prefer a reviewed and version-controlled migration process when appropriate. Back up important data before applying potentially destructive schema changes.

---

## Security and Session Management

PortfolioPilot incorporates security measures for authentication, session persistence, and database communication.

### Password Security

- Passwords are hashed using Node.js `crypto.scrypt`.
- Random salts are used for password hashing.
- Authentication comparisons use timing-safe operations where applicable.
- Plaintext passwords should never be stored in the database or included in logs.

### Session Management

The documented session architecture uses opaque, high-entropy session tokens.

- Session tokens are generated using cryptographically secure randomness.
- Browser sessions are maintained through appropriately configured cookies.
- Session cookies use `HttpOnly`, `Secure` in HTTPS deployments, and `SameSite=Lax` settings as appropriate to the deployment environment.
- SHA-256 digests of session tokens are stored in the database rather than the original tokens.
- Session validation is handled by the backend.

### Database Transport Security

- Remote database communication uses TLS encryption.
- The TiDB CA certificate is configured for certificate verification.
- Database connection settings are managed by the backend database module.

### Sensitive Data Handling

- Authentication and portfolio APIs should return only the data required by the client.
- Sensitive responses use `Cache-Control: no-store` where appropriate.
- Session tokens, passwords, and database credentials must not be exposed through API responses or application logs.

Security settings should be verified against the actual runtime configuration, particularly when moving from local development to production.

---

## Available Scripts

The following commands describe the documented project workflow. Their availability depends on the scripts defined in `package.json`.

| Command | Purpose |
|---|---|
| `pnpm dev` | Starts the development server |
| `pnpm test` | Runs the configured Vitest test suites |
| `pnpm check` | Runs TypeScript type checking |
| `pnpm build` | Builds the frontend and production server bundle |
| `pnpm start` | Starts the production application |

Run the commands from the project root.

---

## Testing and Validation

PortfolioPilot uses Vitest for automated testing of application logic.

The testing strategy should cover the following areas:

- **Financial calculations:** Risk scores, concentration metrics, goal projections, and portfolio calculations.
- **Backtesting:** Common-period validation, return calculations, and missing-data handling.
- **Authentication:** Password verification, session creation, and session validation.
- **Input validation:** Malformed portfolio records, invalid questionnaire inputs, and unsupported data formats.
- **Data integrity:** Persistence and retrieval of user-specific assessment and portfolio information.
- **Simulation methodology:** Parameter validation, reproducibility under controlled random seeds, regime-transition probabilities, and risk-metric calculations.

Run the available tests with:

```bash
pnpm test
```

Type checking and production builds can be validated separately:

```bash
pnpm check
pnpm build
```

Tests should distinguish between verified implementation behavior and planned functionality that has not yet been completed.

---

## Documentation

Project documentation is organized under `docs/`.

| File | Purpose |
|---|---|
| `docs/HANDOFF.md` | Engineering handoff and operational context |
| `docs/plan.md` | Feature planning and architectural roadmap |
| `docs/ideas.md` | Research ideas and exploratory computational finance concepts |
| `docs/TODO.md` | Outstanding engineering tasks and implementation priorities |

Refer to these documents for implementation details, current development status, and future enhancements.

---

## Limitations and Disclaimers

### Modeling Assumptions

Goal projections depend on assumed returns, inflation, contribution schedules, and compounding conventions. Deterministic projections do not capture the full uncertainty of real financial markets.

### Historical Data Limitations

Historical and backtesting results depend on the quality and coverage of the input data. Results may be affected by survivorship bias, transaction costs, slippage, liquidity constraints, taxes, and corporate actions unless these factors are explicitly modeled.

### Simulation Limitations

Monte Carlo, Markov-chain, and HMM outputs depend on the selected models, historical observations, calibration methods, and parameter assumptions. Simulated outcomes are not predictions of guaranteed future performance.

### Data Access and Licensing

CMIE datasets may require institutional access or specific licensing permissions. Data extraction and use must comply with the applicable access conditions and licensing terms.

### Academic Scope

PortfolioPilot is intended for educational, analytical, and research use. It is not a trading or order-execution platform and should not be treated as a substitute for qualified financial advice.

---

## Future Development

Potential areas for further development include:

- Expanding market-regime detection and validation.
- Integrating additional authorized Indian market datasets.
- Enhancing multi-asset portfolio simulation.
- Comparing fixed-parameter and regime-aware Monte Carlo models.
- Improving risk reporting and model diagnostics.
- Adding reproducible research workflows and experiment tracking.
- Strengthening automated tests for financial calculations and data pipelines.

---

## License

Add the applicable license and usage terms before distributing or publishing the repository.

---

**PortfolioPilot — Bringing portfolio analytics, financial goal planning, and computational finance together in one platform.**
