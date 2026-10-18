import { useApp } from "@/contexts/AppContext";
import { runHistoricalComparison } from "@shared/backtest";
import { generatePortfolioReport } from "@shared/finance";
import { Download, FileText } from "lucide-react";
import { useState } from "react";
import { Button, Card, Disclaimer, Empty, Mark, Title } from "@/components/common";
import { DISCLAIMER } from "@/lib/format";

export function Reports() {
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
      <Title
        eyebrow="PORTFOLIO BRIEFING"
        title="A review you can keep."
        sub="Generate an on-demand report. Commentary is deterministic by default; account AI commentary needs explicit opt-in."
      />
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
