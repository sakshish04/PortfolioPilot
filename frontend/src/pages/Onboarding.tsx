import { useApp } from "@/contexts/AppContext";
import React, { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { Button, Card } from "@/components/common";
import { ONBOARDING_QUESTIONS, calculateRiskArchetype, type EngineResult } from "@shared/onboarding";

export function Onboarding() {
  const { state, saveAccountState } = useApp();
  const [, setLoc] = useLocation();

  const [step, setStep] = useState<1 | 2 | 3>(1);
  const [profileName, setProfileName] = useState(state.profile?.name || "");
  const [income, setIncome] = useState(state.profile?.annualIncome?.toString() || "1200000");
  const [investment, setInvestment] = useState(state.profile?.existingAssets?.toString() || "50000");
  const [err, setErr] = useState("");

  const [tags, setTags] = useState<string[]>(
    (state.profile as any)?.preferences?.tags || ["Exclude Crypto & High Volatility"]
  );

  const [answers, setAnswers] = useState<Record<string, string>>({
    q_horizon: "h3",
    q_emergency_runway: "e3",
    q_income_stability: "i3",
    q_age_stage: "a1",
    q_drawdown_reaction: "d3",
    q_volatility_comfort: "v3",
    q_investing_experience: "x2",
    q_inflation_attitude: "p3",
  });

  const engineResult: EngineResult = useMemo(() => {
    return calculateRiskArchetype(answers);
  }, [answers]);

  function toggleTag(tag: string) {
    setTags((prev) =>
      prev.includes(tag) ? prev.filter((t) => t !== tag) : [...prev, tag]
    );
  }

  function handleStep1(e: React.FormEvent) {
    e.preventDefault();
    setErr("");
    const inc = Number(income);
    const inv = Number(investment);

    if (isNaN(inc) || inc <= 0) {
      setErr("Please enter a valid positive annual income.");
      return;
    }
    if (isNaN(inv) || inv < 10000) {
      setErr("Minimum investment amount must be at least ₹10,000.");
      return;
    }
    setStep(2);
  }

  async function handleComplete() {
    const inc = Number(income);
    const inv = Number(investment);

    const updatedProfile = {
      ...state.profile,
      name: profileName || state.profile?.name || "Investor",
      annualIncome: inc,
      existingAssets: inv,
      riskProfile: engineResult.archetype.tier,
      riskScore: engineResult.compositeScore,
      riskTier: engineResult.archetype.tier,
      archetype: engineResult.archetype.name,
      preferences: {
        tags,
      },
      targetAllocation: {
        equity: engineResult.archetype.recommendedEquityPct,
        debt: engineResult.archetype.recommendedDebtPct,
        cash: engineResult.archetype.recommendedCashPct,
        gold: engineResult.archetype.recommendedGoldPct,
      },
    };

    try {
      await saveAccountState({
        ...state,
        profile: updatedProfile as any,
      });
      setLoc("/dashboard");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save your answers. Please try again.");
    }
  }

  return (
    <div className="onboarding-shell" style={{ maxWidth: "780px", margin: "40px auto", padding: "0 20px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "32px" }}>
        <div>
          <span className="eyebrow">STEP {step} OF 3</span>
          <h1>
            {step === 1 && "Personal & Financial Parameters"}
            {step === 2 && "Exclusions & Preferences"}
            {step === 3 && "Risk Archetype Discovery"}
          </h1>
        </div>
        <div style={{ display: "flex", gap: "8px" }}>
          {[1, 2, 3].map((s) => (
            <div
              key={s}
              style={{
                width: "36px",
                height: "6px",
                borderRadius: "3px",
                backgroundColor: s <= step ? "#2563eb" : "#e2e8f0",
              }}
            />
          ))}
        </div>
      </div>

      {step === 1 && (
        <Card style={{ padding: "32px" }}>
          <form onSubmit={handleStep1}>
            {err && (
              <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", fontWeight: 500 }}>
                {err}
              </div>
            )}
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Your Name</label>
              <input
                type="text"
                value={profileName}
                onChange={(e) => setProfileName(e.target.value)}
                placeholder="e.g. Vikram Sharma"
                style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>Annual Income (₹)</label>
              <input
                type="number"
                value={income}
                onChange={(e) => setIncome(e.target.value)}
                placeholder="1200000"
                min="1"
                required
                style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <div style={{ marginBottom: "28px" }}>
              <label style={{ display: "block", marginBottom: "8px", fontWeight: 600 }}>
                Initial Investable Capital (₹) <span style={{ color: "#64748b", fontWeight: 400 }}>(Min ₹10,000)</span>
              </label>
              <input
                type="number"
                value={investment}
                onChange={(e) => setInvestment(e.target.value)}
                placeholder="50000"
                min="10000"
                required
                style={{ width: "100%", padding: "12px", borderRadius: "6px", border: "1px solid #cbd5e1" }}
              />
            </div>
            <Button type="submit">Continue to Preferences</Button>
          </form>
        </Card>
      )}

      {step === 2 && (
        <Card style={{ padding: "32px" }}>
          <p style={{ color: "#64748b", marginBottom: "24px" }}>
            Select portfolio preferences and sector tilts that reflect your investment style:
          </p>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "12px", marginBottom: "32px" }}>
            {[
              "Exclude Crypto & High Volatility",
              "Prefer Gold / Inflation Hedges",
              "Exclude Tobacco & Gambling (ESG)",
              "Tech & Digital Innovation Focus",
              "High Dividend Yield Priority",
              "Domestic Equity Bias",
            ].map((tag) => {
              const active = tags.includes(tag);
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggleTag(tag)}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "20px",
                    border: active ? "1.5px solid #2563eb" : "1.5px solid #cbd5e1",
                    backgroundColor: active ? "#eff6ff" : "#ffffff",
                    color: active ? "#1d4ed8" : "#334155",
                    cursor: "pointer",
                    fontWeight: active ? 600 : 400,
                  }}
                >
                  {active ? "✓ " : "+ "} {tag}
                </button>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: "12px" }}>
            <Button kind="outline" onClick={() => setStep(1)}>
              Back
            </Button>
            <Button onClick={() => setStep(3)}>Continue to Risk Questions</Button>
          </div>
        </Card>
      )}

      {step === 3 && (
        <div>
          {/* Live Archetype Preview Banner */}
          <Card
            style={{
              padding: "24px",
              marginBottom: "28px",
              background: "linear-gradient(135deg, #0f172a 0%, #1e293b 100%)",
              color: "#ffffff",
              borderRadius: "12px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "12px" }}>
              <div>
                <span
                  style={{
                    fontSize: "12px",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    background: "#2563eb",
                    padding: "4px 10px",
                    borderRadius: "4px",
                    fontWeight: 700,
                  }}
                >
                  {engineResult.archetype.tier} Tier
                </span>
                <h2 style={{ fontSize: "24px", marginTop: "8px", color: "#ffffff" }}>
                  {engineResult.archetype.name}
                </h2>
              </div>
              <div style={{ textAlign: "right" }}>
                <span style={{ fontSize: "28px", fontWeight: 800, color: "#60a5fa" }}>
                  {engineResult.compositeScore}
                </span>
                <span style={{ color: "#94a3b8", fontSize: "14px" }}> / 100</span>
                <div style={{ fontSize: "12px", color: "#94a3b8" }}>
                  Capacity: {engineResult.capacityScore} | Tolerance: {engineResult.toleranceScore}
                </div>
              </div>
            </div>

            <p style={{ color: "#cbd5e1", fontSize: "14px", lineHeight: "1.5", marginBottom: "16px" }}>
              {engineResult.archetype.tagline}
            </p>

            {engineResult.overridesApplied.length > 0 && (
              <div
                style={{
                  background: "rgba(239, 68, 68, 0.15)",
                  border: "1px solid #ef4444",
                  padding: "8px 12px",
                  borderRadius: "6px",
                  marginBottom: "16px",
                  fontSize: "13px",
                  color: "#fca5a5",
                }}
              >
                {engineResult.overridesApplied.map((ov, idx) => (
                  <div key={idx}>⚠️ {ov}</div>
                ))}
              </div>
            )}

            <div style={{ display: "flex", gap: "20px", borderTop: "1px solid #334155", paddingTop: "12px" }}>
              <div>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>TARGET EQUITY</span>
                <div style={{ fontWeight: 700, color: "#38bdf8" }}>{engineResult.archetype.recommendedEquityPct}%</div>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>TARGET DEBT</span>
                <div style={{ fontWeight: 700, color: "#34d399" }}>{engineResult.archetype.recommendedDebtPct}%</div>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>CASH RESERVE</span>
                <div style={{ fontWeight: 700, color: "#fbbf24" }}>{engineResult.archetype.recommendedCashPct}%</div>
              </div>
              <div>
                <span style={{ fontSize: "11px", color: "#94a3b8" }}>GOLD / HEDGE</span>
                <div style={{ fontWeight: 700, color: "#e879f9" }}>{engineResult.archetype.recommendedGoldPct}%</div>
              </div>
            </div>
          </Card>

          {/* Questionnaire list */}
          <div style={{ display: "flex", flexDirection: "column", gap: "20px", marginBottom: "32px" }}>
            {ONBOARDING_QUESTIONS.map((q, idx) => (
              <Card key={q.id} style={{ padding: "24px" }}>
                <span style={{ fontSize: "12px", fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>
                  Question {idx + 1} • {q.dimension === "capacity" ? "Financial Capacity" : "Risk Tolerance"}
                </span>
                <h4 style={{ margin: "8px 0 16px 0", fontSize: "16px" }}>{q.prompt}</h4>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  {q.options.map((opt) => {
                    const isSelected = answers[q.id] === opt.id;
                    return (
                      <div
                        key={opt.id}
                        onClick={() => setAnswers((prev) => ({ ...prev, [q.id]: opt.id }))}
                        style={{
                          padding: "12px 16px",
                          borderRadius: "8px",
                          border: isSelected ? "2px solid #2563eb" : "1px solid #e2e8f0",
                          backgroundColor: isSelected ? "#eff6ff" : "#ffffff",
                          cursor: "pointer",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          transition: "all 0.15s ease",
                        }}
                      >
                        <input
                          type="radio"
                          name={q.id}
                          checked={isSelected}
                          onChange={() => {}}
                          style={{ accentColor: "#2563eb", cursor: "pointer" }}
                        />
                        <span style={{ fontSize: "14px", fontWeight: isSelected ? 600 : 400 }}>
                          {opt.text}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>

          {err && (
            <div style={{ color: "#ef4444", marginBottom: "16px", fontSize: "14px", fontWeight: 500 }}>
              {err}
            </div>
          )}
          <div style={{ display: "flex", gap: "12px" }}>
            <Button kind="outline" onClick={() => setStep(2)}>
              Back
            </Button>
            <Button onClick={handleComplete}>Complete setup & Enter Dashboard</Button>
          </div>
        </div>
      )}
    </div>
  );
}
