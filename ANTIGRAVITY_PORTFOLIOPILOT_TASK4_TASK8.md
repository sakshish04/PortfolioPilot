# Antigravity Handoff: PortfolioPilot Tasks 4 and 8

**Purpose:** Give Antigravity the product context, current codebase
facts, implementation order, constraints, and acceptance criteria needed
to finish Task 4 (Goal Planning) and Task 8 (Family Plans) without
damaging existing functionality.

**Primary instruction:** Treat the checked-out repository as the source
of truth. Inspect the actual files and run the existing checks before
editing. Do not assume a feature is complete merely because it appears
in this document; verify it in code and tests.

------------------------------------------------------------------------

## 1. Product overview

PortfolioPilot is an educational WealthTech prototype for Indian retail
investors. It helps users understand holdings, portfolio risk and
diversification, set financial goals, explore illustrative stress
scenarios, review allocations, compare historical return series uploaded
by users, and read deterministic explanations/reports.

It is **not** a broker. It does not connect to live brokerage accounts,
execute trades, transfer money, or guarantee returns. Keep financial
calculations illustrative and show assumptions and disclaimers where
relevant.

Product principles: - INR-first experience and Indian retail-investor
context. - Clear assumptions, deterministic calculations where possible,
honest uncertainty. - Never fabricate market data or imply simulated
data is real. - Preserve existing guest/demo behavior and signed-in
account isolation. - Reuse existing UI patterns, form validation, API
conventions, types and database abstractions. - Avoid unrelated
redesigns or broad refactors while implementing Tasks 4 and 8.

## 2. Repository facts and stack

The uploaded repository snapshot is `PortfolioPilot-main`. It uses: -
React 19 + TypeScript + Vite - Express backend - Drizzle ORM and MySQL
(`mysql2`) - Vitest tests - Wouter routing, Tailwind CSS v4, Recharts
and Lucide - `pnpm` (package manager declared as `pnpm@10.18.0`)

Key files observed in the uploaded repository: - `README.md` --- product
scope, setup and routes. - `HANDOFF.md` --- cumulative engineering
notes; read its **Current state** section first and distinguish current
from historical notes. - `TODO.md` and `plan.md` --- inspect for
outstanding work and constraints. - `package.json` --- scripts and
dependencies. - `frontend/src/App.tsx` --- frontend routes and page
composition. - `frontend/src/contexts/AppContext.tsx` --- client state,
session hydration and API integration. - `shared/finance.ts` ---
deterministic financial calculations, including goal-related logic. -
`shared/finance.test.ts` --- tests for shared financial calculations. -
`shared/portfolio.ts` --- shared portfolio contracts/types. -
`backend/app-api.ts` --- Express API routes and account/session/state
handling. - `backend/app-repository.ts` --- Drizzle-backed
persistence. - `backend/app-security.ts` --- validation and security
boundaries. - `backend/drizzle/schema.ts` --- current Drizzle schema. -
`backend/drizzle/0000_initial_users.sql`,
`backend/drizzle/0001_local_auth_and_state.sql` --- existing SQL
migrations. - `backend/app-api.http.test.ts`,
`backend/app-security.test.ts`, `backend/coach-ai.test.ts`,
`backend/platform.test.ts`, `backend/safe-error.test.ts` --- existing
backend test suites.

Important: Some older text in `README.md`/`HANDOFF.md` may refer to
paths from earlier project iterations. Follow the real checked-out tree
and current imports, not stale paths in historical documentation.

Existing package scripts: - `pnpm dev` - `pnpm check` - `pnpm test` -
`pnpm build` - `pnpm db:migrate` - `pnpm db:push`

Do not run a database migration against a populated/production database
until the current schema, migration history, and target environment have
been verified. Do not use `db:push` as a shortcut for a carefully
planned schema change.

## 3. Current product baseline (verify before editing)

The source snapshot describes or contains: - Email/password
authentication and server-managed sessions. - Account-scoped persisted
state in MySQL through `portfolio_states`. - Guest/demo data and
portfolio analytics. - CSV holdings import. - Goal mapping with multiple
goals, target/current amounts, target date, monthly contribution,
return/inflation assumptions, inflation-adjusted targets and
deterministic projections. - Stress-test, allocation/rebalance,
historical comparison, Coach/report features. - Deterministic fallback
behavior for Coach/report explanations.

The team believes Tasks 1 (Authentication & Database) and 2 (CSV Import)
are complete. Treat that as a team-reported status, **not an
independently verified guarantee**. Avoid destabilizing them and run
relevant regression tests.

### Known gaps for this work

-   **Task 4:** A goal-planning foundation already exists. First audit
    the actual goal UI, types, calculations and persistence. Do not
    replace existing goal planning wholesale. Add personalization and
    edge-case correctness only where missing.
-   **Task 8:** In the inspected source, a database-backed family
    membership and invitation workflow was not found. Implement it
    end-to-end rather than creating a UI-only mockup.

## 4. Task 4 --- Goal Planning

### Objective

Add useful personalized financial-goal suggestions and verify goal
projections and edge cases while retaining existing goal CRUD and
projection behavior.

### First step: audit current implementation

Before editing, inspect: 1. Goal routes and components in
`frontend/src/App.tsx` and any imported goal components. 2. Goal data
types and serialization in `shared/portfolio.ts`. 3. Goal formulas and
validation in `shared/finance.ts`. 4. State hydration/save paths in
`frontend/src/contexts/AppContext.tsx`. 5. API validation and
persistence in `backend/app-api.ts`, `backend/app-security.ts`, and
`backend/app-repository.ts`. 6. Existing goal tests in
`shared/finance.test.ts` and any goal-specific tests. 7. `TODO.md`,
`plan.md`, and the current section of `HANDOFF.md`.

Write a short audit note: what already works, what is missing, files to
change, and regression risks. Then implement only the gaps.

### Personalization requirements

-   Provide deterministic, explainable suggestions relevant to a user's
    available profile/financial data. Possible categories include
    emergency savings, education, home purchase, retirement and general
    wealth creation.
-   Use only profile fields that genuinely exist in the current app. Do
    not invent data or assume income/age/risk fields are populated.
-   Clearly explain why a suggestion appears and how any suggested
    amount was derived.
-   Let users edit the suggested name, target amount, current savings,
    contribution and date before saving.
-   Suggestions should be optional and must not silently create goals.
-   If the profile is incomplete, show a useful empty/setup state rather
    than fabricating personalization.
-   Do not present heuristics as an ML model. Do not add an ML
    dependency unless explicitly justified and approved.

### Projection and validation requirements

Review and test at least: - Target amount must be finite and greater
than zero. - Current savings and monthly contribution must be finite and
non-negative. - Return and inflation assumptions must be finite and
within defensible documented bounds. - Target date must be valid and in
the future for a new, not-yet-funded goal; handle already-funded and
completed goals consistently. - Handle zero monthly return without
division by zero. - Handle already-funded goals without negative
required contributions. - Handle zero remaining months, past dates,
malformed dates, very large values and invalid numeric input. - Keep
monthly/annual rate conversions consistent with the chosen formula and
disclose the assumption. - If inflation-adjusted target is shown, make
the compounding period and annual/monthly conversion explicit and
consistent. - Do not display a probability/likelihood of success unless
there is a defensible, documented model. Deterministic projections are
not predictions or guarantees. - Avoid `NaN`, `Infinity`, negative
contributions, or silently misleading outputs in the UI.

If using an end-of-month monthly contribution model, a conventional
future-value relationship is: - Future value of existing savings:
`currentSavings * (1 + monthlyRate) ^ months` - Future value of monthly
contributions:
`monthlyContribution * (((1 + monthlyRate) ^ months - 1) / monthlyRate)`
when `monthlyRate != 0` - For `monthlyRate == 0`, contribution future
value is `monthlyContribution * months`. Use the repository's
established conventions if they are mathematically sound; do not create
a second inconsistent formula path.

### Task 4 acceptance criteria

-   A user can view relevant suggestions, understand the reason,
    customize one and explicitly save it.
-   Existing create/edit/delete and goal views continue working.
-   Goal calculations are deterministic and use consistent assumptions.
-   Edge cases above have unit tests.
-   Invalid data is rejected at the appropriate boundary (UI and
    server/shared validation as architecture warrants), not only hidden
    in the UI.
-   No regressions to guest/demo mode, saved account state or unrelated
    portfolio engines.
-   `pnpm check`, relevant tests and `pnpm build` pass.

## 5. Task 8 --- Family Plans

### Objective

Implement collaborator invitations and shared family portfolios with
robust, server-enforced permissions.

### Design before coding

Inspect existing user/session identifiers, Drizzle relations,
account-state persistence, API conventions and migration strategy. Then
propose a small schema/API plan before implementing. Keep personal
portfolios private by default.

A reasonable minimal model may include: - `family_plans`: family id,
name, owner user id, created/updated timestamps. - `family_members`:
family id, user id, role/status, joined timestamp; enforce uniqueness
for `(familyId, userId)`. - `family_invitations`: family id, normalized
recipient identity (e.g. email), token hash, inviter user id, status,
expiry, accepted/revoked timestamps. - Shared family portfolio state or
explicitly selected shared resources, separate from personal account
state.

This is a design proposal, not permission to blindly create these exact
tables. Align with existing schema conventions and explain any
alternative. Add foreign keys, indexes, uniqueness constraints and
deletion behavior intentionally. Store only a hash of a high-entropy
invitation token if a bearer token is used; never store a raw long-lived
invitation secret.

### Invitation workflow

-   An authenticated owner creates an invitation for a specified
    recipient.
-   Only the intended authenticated recipient may accept it. Verify
    recipient identity against the authenticated account.
-   Use a cryptographically secure, high-entropy token if the workflow
    uses token links; store its hash, expire it, and never log it.
-   Support pending, accepted, declined, revoked and expired states as
    appropriate to the chosen UX.
-   Prevent duplicate active invitations and duplicate family
    membership.
-   Acceptance must be atomic/transactional where supported to prevent
    race conditions.
-   Owner can revoke invitations and remove members, subject to safe
    ownership rules.
-   Handle unknown email, already-a-member, expired/revoked token,
    replay, repeated acceptance, unauthorized inviter and concurrent
    requests without leaking unnecessary account information.
-   Do not implement email delivery unless an existing mail provider is
    configured. If no mail provider exists, provide a safe
    development/demo invitation presentation or copyable invitation flow
    and document the limitation; do not pretend an email was sent.

### Authorization and privacy requirements

-   Enforce permissions on the server for every family endpoint and
    every shared-data read/write.
-   Never rely on hiding frontend buttons or client-provided `familyId`,
    `userId`, role or owner flags.
-   Derive actor identity from the validated session.
-   Check membership and role for the target family on each request.
-   A user must not access another family's plan by changing an ID in
    the URL/body.
-   A family member must not automatically gain access to another
    member's private personal portfolio.
-   Separate shared family data from private portfolio state. Only
    explicitly shared data/resources may be visible to collaborators.
-   Default to least privilege. Suggested default: owner can manage
    family/membership; collaborator can view shared family data; editing
    shared data requires explicit permission.
-   Revoked/removed users lose access immediately.
-   Do not expose invitation tokens, password hashes, session tokens,
    database URLs or secrets in responses/logs.
-   Return consistent, safe error responses without leaking whether
    unrelated users/accounts exist.

### API and UI requirements

-   Follow the project's existing Express API conventions and
    request/response validation patterns.
-   Add endpoints for family creation/listing, member listing,
    invitation creation/listing/revocation, invitation
    acceptance/decline, member removal, and shared portfolio read/update
    only as needed.
-   Validate every request body and route parameter. Use transactions
    where multiple writes must succeed together.
-   Add a Family Plans page that shows empty/loading/error/success
    states, family membership, invitations and shared portfolio state.
-   Clearly distinguish personal portfolio data from family-shared data.
-   Keep the UI consistent with the existing design system and mobile
    responsive.
-   Do not create fake collaborator data or use localStorage as the
    security boundary.

### Task 8 acceptance criteria

-   Owner can create a family plan and invite a collaborator.
-   Intended recipient can accept an unexpired invitation while
    authenticated.
-   Duplicate/replayed/expired/revoked invitations are handled safely.
-   Family members can see only families and resources they are
    authorized to access.
-   Non-members cannot read or mutate family data, even with guessed
    IDs.
-   Revocation/removal immediately removes access.
-   Personal portfolio state remains private unless a resource is
    explicitly shared.
-   Database constraints and server-side authorization protect against
    duplicate membership and race conditions.
-   Tests cover positive workflows and negative authorization cases.
-   Migrations are versioned, reviewed and tested against a
    disposable/local database first.
-   `pnpm check`, tests and production build pass.

## 6. Recommended implementation order

Follow this sequence and report progress after each stage.

### Stage 0 --- Establish a safe baseline (do this first)

1.  Inspect the repository tree, `README.md`, current `HANDOFF.md`,
    `TODO.md`, `plan.md`, package scripts, schema and existing tests.
2.  Check git status and current branch; preserve existing user changes.
3.  Inspect `.env.example` and `.gitignore`; never print or copy secrets
    into logs or this handoff.
4.  Install dependencies using the declared package manager if needed.
5.  Run baseline `pnpm check`, `pnpm test` and `pnpm build`; record
    existing failures separately from new failures.
6.  Do not connect to or migrate a production database as part of
    baseline checks.

### Stage 1 --- Complete Task 4

1.  Produce a concise goal-feature audit with exact file paths.
2.  Identify the smallest missing features and incorrect edge cases.
3.  Implement suggestion logic using shared, typed, deterministic
    functions.
4.  Connect suggestions to the existing goal UI without duplicating
    state or formulas.
5.  Validate at UI/API/shared boundaries consistent with the
    architecture.
6.  Add unit tests for suggestions, formula correctness and edge cases.
7.  Run targeted tests, then full checks/build.
8.  Review the diff and document assumptions/limitations.

### Stage 2 --- Design and implement Task 8

1.  Map current auth/session identity and repository transaction
    capabilities.
2.  Propose schema, migrations, permission matrix and endpoint contract
    before editing.
3.  Implement schema and migration files; do not rewrite old migrations
    already used by others. Add a new migration.
4.  Implement repository functions and transaction-safe
    invitation/membership operations.
5.  Implement server-side authorization and safe errors.
6.  Add API tests for owners, collaborators, non-members, cross-family
    access and revocation.
7.  Build the Family Plans UI and connect it to real APIs.
8.  Test migration on a disposable empty database matching the expected
    MySQL/TiDB compatibility. Do not apply to production without
    explicit approval.
9.  Run full checks/build and inspect the final diff.

### Stage 3 --- Integration and handoff

1.  Test goal and family flows in a browser, including
    empty/loading/error states.
2.  Verify guest/demo flows and Tasks 1/2 still work.
3.  Review secrets, logs, private cache behavior and API responses.
4.  Update `README.md` or a focused documentation file with setup,
    routes, schema/migration instructions, permissions and limitations.
5.  Update `HANDOFF.md` with a dated, factual summary: files changed,
    migration name, tests actually run, known failures, manual
    verification and remaining work.
6.  Provide a final summary with changed files, commands/results, how to
    test manually, and any decisions that require team approval.

## 7. Commands and operational safety

Use the package scripts from the repository:

``` bash
pnpm install
pnpm check
pnpm test
pnpm build
```

For database work: - First inspect `backend/drizzle.config.ts`,
`backend/db.ts`, existing migration journal and the configured database
target. - Use a disposable/local database for migration verification. -
Do not run `pnpm db:push` casually; it generates schema changes and
applies migrations. - Never use the credential-bearing database URL in
client code, source control, test fixtures, screenshots, Antigravity
prompts or logs. - If credentials were exposed in chat or a shared
artifact, rotate them and update the local environment securely. - Do
not run destructive SQL, truncate tables, drop tables, or alter a
populated database without explicit user approval and a verified
backup. - Do not claim a command passed unless it was actually executed
and its output inspected.

## 8. Out of scope unless explicitly approved

-   Rebuilding authentication or CSV import.
-   Changing existing analytics formulas unrelated to these tasks.
-   Adding a third-party email service, LLM, financial data API or ML
    dependency.
-   Trading, payments, brokerage integrations or automated financial
    transactions.
-   Granting family members automatic access to all private user data.
-   Applying schema changes to a production database.
-   Large-scale UI redesign or unrelated refactoring.

## 9. How Antigravity should work

Act as a careful senior engineer working in an existing collaborative
codebase: 1. **Inspect before editing.** 2. **Summarize findings and
propose a small plan.** 3. **Make incremental changes with clear
diffs.** 4. **Test each layer and report actual results.** 5. **Keep the
team informed about files, schema changes, risks and decisions.** 6. If
a requirement conflicts with the existing implementation, explain the
conflict and choose the smallest safe change; ask before making a
product/security decision that changes permissions or data sharing. 7.
Never replace working functionality with mock data just to make a screen
look complete. 8. Do not commit, push, merge, or deploy unless
explicitly requested.

## 10. Definition of done

Task 4 and Task 8 are done only when: - Required UI, domain logic,
persistence and API behavior are connected end-to-end. - Server-side
validation and authorization are in place. - Automated tests cover
normal behavior and important failure/abuse cases. - Existing tests,
type-check and production build pass, or any pre-existing failures are
explicitly documented and distinguished. - Database migrations are
reviewed and verified on a disposable/local database. - No secrets are
added to source control or client bundles. - Documentation describes
actual implementation and limitations. - The final response lists
changed files, test commands/results, manual test steps, migration
instructions and unresolved risks.

**First action for Antigravity:** complete Stage 0, then return a short
audit of the existing Goal Planning implementation and the proposed
smallest changes for Task 4. Do not start Task 8 schema changes until
the current authentication/session model and database migration strategy
have been inspected.
