import { describe, expect, it } from "vitest";
import {
  RISK_QUESTIONS,
  assessRisk,
  draftFromProfile,
  emptyRiskAnswers,
  unansweredRiskQuestions,
  validateProfileDraft,
  type ProfileDraft,
} from "./onboarding";
import { createEmptyPortfolioState } from "./portfolio";

const valid: ProfileDraft = {
  name: "Asha Rao",
  age: "34",
  employment: "Engineer",
  annualIncome: "1200000",
  monthlyInvestment: "25000",
  existingAssets: "500000",
  experience: "Some experience",
};

describe("profile step validation", () => {
  it("accepts a complete profile and derives monthly income", () => {
    const out = validateProfileDraft(valid);
    expect(out.errors).toEqual({});
    expect(out.profile).toMatchObject({
      name: "Asha Rao",
      age: 34,
      annualIncome: 1_200_000,
      monthlyIncome: 100_000,
      monthlyInvestment: 25_000,
      existingAssets: 500_000,
      experience: "Some experience",
    });
    expect(out.warnings).toEqual([]);
  });

  it("requires name, age and experience", () => {
    const out = validateProfileDraft({
      ...valid,
      name: "  ",
      age: "",
      experience: "",
    });
    expect(Object.keys(out.errors).sort()).toEqual([
      "age",
      "experience",
      "name",
    ]);
    expect(out.profile).toBeUndefined();
  });

  it("enforces the same age bounds as the server (18-120, whole number)", () => {
    const err = (age: string) => validateProfileDraft({ ...valid, age }).errors.age;
    expect(err("17")).toMatch(/at least 18/);
    expect(err("18")).toBeUndefined();
    expect(err("120")).toBeUndefined();
    expect(err("121")).toMatch(/120 or less/);
    expect(err("30.5")).toMatch(/whole number/);
    expect(err("abc")).toMatch(/whole number/);
  });

  it("rejects negative, non-numeric and absurd money; blank money means 0", () => {
    expect(
      validateProfileDraft({ ...valid, annualIncome: "-1" }).errors.annualIncome
    ).toMatch(/negative/);
    expect(
      validateProfileDraft({ ...valid, monthlyInvestment: "12k" }).errors
        .monthlyInvestment
    ).toMatch(/number/);
    expect(
      validateProfileDraft({ ...valid, existingAssets: "1e15" }).errors
        .existingAssets
    ).toMatch(/too large/);
    expect(
      validateProfileDraft({ ...valid, annualIncome: "Infinity" }).errors
        .annualIncome
    ).toMatch(/number/);
    const blank = validateProfileDraft({
      ...valid,
      annualIncome: "",
      monthlyInvestment: "",
      existingAssets: "",
    });
    expect(blank.errors).toEqual({});
    expect(blank.profile).toMatchObject({
      annualIncome: 0,
      monthlyIncome: 0,
      monthlyInvestment: 0,
      existingAssets: 0,
    });
  });

  it("warns, without blocking, when yearly investing exceeds income", () => {
    const out = validateProfileDraft({
      ...valid,
      annualIncome: "100000",
      monthlyInvestment: "10000",
    });
    expect(out.errors).toEqual({});
    expect(out.warnings).toHaveLength(1);
  });

  it("round-trips an empty profile into a draft that fails only required fields", () => {
    const draft = draftFromProfile(createEmptyPortfolioState("").profile);
    expect(Object.keys(validateProfileDraft(draft).errors).sort()).toEqual([
      "age",
      "experience",
      "name",
    ]);
  });
});

describe("risk questionnaire", () => {
  it("has 8 questions, each with 5 distinct ordered options", () => {
    expect(RISK_QUESTIONS).toHaveLength(8);
    for (const q of RISK_QUESTIONS) {
      expect(q.options).toHaveLength(5);
      expect(new Set(q.options).size).toBe(5);
    }
  });

  it("does not score an untouched questionnaire", () => {
    expect(assessRisk(emptyRiskAnswers())).toBeNull();
    expect(unansweredRiskQuestions(emptyRiskAnswers())).toHaveLength(8);
  });

  it("does not score partial or out-of-range answers", () => {
    const partial = emptyRiskAnswers();
    partial[0] = 3;
    expect(assessRisk(partial)).toBeNull();
    expect(unansweredRiskQuestions(partial)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(assessRisk([0, 0, 0, 0, 0, 0, 0, 5])).toBeNull();
    expect(assessRisk([0, 0, 0, 0, 0, 0, 0, 1.5])).toBeNull();
    expect(assessRisk([0, 0, 0, 0, 0, 0, 0, -1])).toBeNull();
  });

  it("maps complete answers to the documented bands at their boundaries", () => {
    const of = (sum: number) => {
      const a = Array(8).fill(0);
      for (let i = 0; sum > 0; i++, sum--) a[i % 8] += 1;
      return assessRisk(a)!;
    };
    // score = round(sum / 32 * 100); bands <25, <50, <75, else
    expect(of(0)).toEqual({ score: 0, profile: "Conservative" });
    expect(of(7)).toMatchObject({ score: 22, profile: "Conservative" });
    expect(of(8)).toEqual({ score: 25, profile: "Moderate" });
    expect(of(15)).toMatchObject({ score: 47, profile: "Moderate" });
    expect(of(16)).toEqual({ score: 50, profile: "Growth" });
    expect(of(23)).toMatchObject({ score: 72, profile: "Growth" });
    expect(of(24)).toEqual({ score: 75, profile: "Aggressive" });
    expect(of(32)).toEqual({ score: 100, profile: "Aggressive" });
  });
});
