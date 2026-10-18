import { riskProfileFromAnswers } from "./finance";
import type { RiskProfile, UserProfile } from "./portfolio";

/** Mirrors the server's saved-profile limits (server/app-security.ts). */
export const PROFILE_LIMITS = {
  nameMax: 100,
  employmentMax: 120,
  ageMin: 18,
  ageMax: 120,
  moneyMax: 1e12,
} as const;

export const EXPERIENCE_LEVELS = [
  "New",
  "Some experience",
  "Experienced",
  "Professional",
] as const;

/** Raw text from the form, so "empty" can be told apart from "0". */
export interface ProfileDraft {
  name: string;
  age: string;
  employment: string;
  annualIncome: string;
  monthlyInvestment: string;
  existingAssets: string;
  experience: string;
}

export type ProfileField = keyof ProfileDraft;

export interface ProfileValidation {
  errors: Partial<Record<ProfileField, string>>;
  /** Non-blocking notes shown to the user. */
  warnings: string[];
  /** Present only when `errors` is empty. */
  profile?: Pick<
    UserProfile,
    | "name"
    | "age"
    | "employment"
    | "annualIncome"
    | "monthlyIncome"
    | "monthlyInvestment"
    | "existingAssets"
    | "experience"
  >;
}

export function draftFromProfile(p: UserProfile): ProfileDraft {
  const text = (n: number) => (n ? String(n) : "");
  return {
    name: p.name,
    age: p.age ? String(p.age) : "",
    employment: p.employment,
    annualIncome: text(p.annualIncome),
    monthlyInvestment: text(p.monthlyInvestment),
    existingAssets: text(p.existingAssets),
    experience: p.experience,
  };
}

/** Optional money field: blank means 0; otherwise a finite, non-negative number. */
function parseMoney(
  raw: string,
  label: string
): { value: number; error?: string } {
  const text = raw.trim();
  if (!text) return { value: 0 };
  const value = Number(text);
  if (!Number.isFinite(value)) return { value: 0, error: `${label} must be a number.` };
  if (value < 0) return { value: 0, error: `${label} cannot be negative.` };
  if (value > PROFILE_LIMITS.moneyMax)
    return { value: 0, error: `${label} is too large.` };
  return { value };
}

export function validateProfileDraft(draft: ProfileDraft): ProfileValidation {
  const errors: ProfileValidation["errors"] = {};
  const warnings: string[] = [];

  const name = draft.name.trim();
  if (!name) errors.name = "Enter your name.";
  else if (name.length > PROFILE_LIMITS.nameMax)
    errors.name = `Name must be ${PROFILE_LIMITS.nameMax} characters or fewer.`;

  const ageText = draft.age.trim();
  const ageNumber = Number(ageText);
  let age: number | null = null;
  if (!ageText) errors.age = "Enter your age.";
  else if (!Number.isInteger(ageNumber))
    errors.age = "Age must be a whole number.";
  else if (ageNumber < PROFILE_LIMITS.ageMin)
    errors.age = `You must be at least ${PROFILE_LIMITS.ageMin} to use PortfolioPilot.`;
  else if (ageNumber > PROFILE_LIMITS.ageMax)
    errors.age = `Age must be ${PROFILE_LIMITS.ageMax} or less.`;
  else age = ageNumber;

  const employment = draft.employment.trim();
  if (employment.length > PROFILE_LIMITS.employmentMax)
    errors.employment = `Keep this to ${PROFILE_LIMITS.employmentMax} characters or fewer.`;

  const income = parseMoney(draft.annualIncome, "Annual income");
  if (income.error) errors.annualIncome = income.error;
  const invest = parseMoney(draft.monthlyInvestment, "Monthly investment");
  if (invest.error) errors.monthlyInvestment = invest.error;
  const assets = parseMoney(draft.existingAssets, "Existing assets");
  if (assets.error) errors.existingAssets = assets.error;

  if (!(EXPERIENCE_LEVELS as readonly string[]).includes(draft.experience))
    errors.experience = "Choose your investing experience.";

  if (
    !errors.annualIncome &&
    !errors.monthlyInvestment &&
    income.value > 0 &&
    invest.value * 12 > income.value
  )
    warnings.push(
      "Your yearly investing is higher than your stated annual income. That is allowed, but please check the amounts."
    );

  if (Object.keys(errors).length > 0) return { errors, warnings };
  return {
    errors,
    warnings,
    profile: {
      name,
      age,
      employment,
      annualIncome: income.value,
      monthlyIncome: income.value / 12,
      monthlyInvestment: invest.value,
      existingAssets: assets.value,
      experience: draft.experience as UserProfile["experience"],
    },
  };
}

export interface RiskQuestion {
  prompt: string;
  /** Index is the score: 0 = lowest risk tolerance … 4 = highest. */
  options: readonly [string, string, string, string, string];
}

export const RISK_QUESTIONS: readonly RiskQuestion[] = [
  {
    prompt: "How would you respond if your portfolio fell 10%?",
    options: [
      "Sell everything to stop further losses",
      "Sell part of it",
      "Hold and wait",
      "Hold and review whether to invest a little more",
      "Invest more while prices are lower",
    ],
  },
  {
    prompt: "How would you respond to a 20% decline?",
    options: [
      "Move everything to safe assets",
      "Reduce my riskier holdings",
      "Hold and wait for recovery",
      "Add to my investments gradually",
      "Add significantly to my investments",
    ],
  },
  {
    prompt: "When will you need most of this money?",
    options: [
      "Within 1 year",
      "In 1 to 3 years",
      "In 3 to 5 years",
      "In 5 to 10 years",
      "In more than 10 years",
    ],
  },
  {
    prompt: "How steady is your income?",
    options: [
      "Uncertain or likely to stop",
      "Irregular",
      "Mostly steady",
      "Steady and growing",
      "Very secure, with other income sources",
    ],
  },
  {
    prompt: "How familiar are you with investing?",
    options: [
      "Brand new to it",
      "Know the basics",
      "Have invested for a few years",
      "Comfortable with different asset types",
      "Very experienced",
    ],
  },
  {
    prompt: "Would you accept a lower return for less volatility?",
    options: [
      "Yes, stability matters most",
      "Usually yes",
      "It depends",
      "Usually no, I prefer growth",
      "No, I want maximum growth and accept big swings",
    ],
  },
  {
    prompt: "Do you have an emergency reserve?",
    options: [
      "None",
      "Less than 3 months of expenses",
      "3 to 6 months of expenses",
      "6 to 12 months of expenses",
      "More than 12 months of expenses",
    ],
  },
  {
    prompt: "How comfortable are you with uncertainty?",
    options: [
      "Very uncomfortable",
      "Somewhat uncomfortable",
      "Neutral",
      "Somewhat comfortable",
      "Very comfortable",
    ],
  },
];

export type RiskAnswers = (number | null)[];

export const emptyRiskAnswers = (): RiskAnswers =>
  RISK_QUESTIONS.map(() => null);

/** Zero-based indexes of questions that are missing or out of range. */
export function unansweredRiskQuestions(answers: RiskAnswers): number[] {
  return RISK_QUESTIONS.flatMap((_, i) => {
    const a = answers[i];
    return Number.isInteger(a) && a! >= 0 && a! <= 4 ? [] : [i];
  });
}

/** Null until every question has a valid answer; never scores defaults. */
export function assessRisk(
  answers: RiskAnswers
): { profile: RiskProfile; score: number } | null {
  if (unansweredRiskQuestions(answers).length > 0) return null;
  return riskProfileFromAnswers(answers as number[]);
}
