import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageModelUsage } from "ai";

export const DAILY_TOKEN_LIMIT = 10_000;
export const ADMIN_DAILY_TOKEN_LIMIT = 20_000;
export const TOKEN_WARNING_THRESHOLD = 0.8;
export const DAILY_TOKEN_LIMIT_MESSAGE =
  "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";

type TokenBudgetStatus =
  | {
      allowed: true;
      limit: number;
      usedTokens: number;
      warning: boolean;
    }
  | {
      allowed: false;
      limit: number;
      usedTokens: number;
      warning: boolean;
    };

type ApiUsageInsert = {
  endpoint: string;
  model: string;
  tokens_input: number;
  tokens_output: number;
  user_id: string;
};

function getStartOfTodayIso() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return today.toISOString();
}

function normalizeTokenCount(value: number | undefined) {
  return Number.isFinite(value) && value != null && value > 0
    ? Math.floor(value)
    : 0;
}

export function isAdminEmail(email: string | null | undefined) {
  const normalizedEmail = email?.trim().toLowerCase();

  if (!normalizedEmail) {
    return false;
  }

  return new Set(
    (process.env.ADMIN_EMAILS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean),
  ).has(normalizedEmail);
}

export function getDailyTokenLimit(email?: string | null) {
  return isAdminEmail(email) ? ADMIN_DAILY_TOKEN_LIMIT : DAILY_TOKEN_LIMIT;
}

export function getDailyTokenLimitMessage(limit: number) {
  return `Dzienny limit tokenów (${Math.round(limit / 1000)}k) został wyczerpany. Wróć jutro!`;
}

export function getTokenLimitWarningMessage(usedTokens: number, limit: number) {
  const remaining = Math.max(0, limit - usedTokens);
  const percent = Math.round((usedTokens / limit) * 100);

  return `⚠️ Uwaga: wykorzystano około ${percent}% dziennego limitu tokenów. Zostało około ${remaining.toLocaleString("pl-PL")} tokenów.`;
}

export async function checkDailyTokenBudget(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
): Promise<TokenBudgetStatus> {
  const { data, error } = await supabase
    .from("api_usage")
    .select("tokens_input, tokens_output")
    .eq("user_id", userId)
    .gte("created_at", getStartOfTodayIso());

  if (error) {
    throw new Error(`Nie udalo sie sprawdzic limitu tokenow: ${error.message}`);
  }

  const usedTokens = (data ?? []).reduce((sum, row) => {
    const tokensInput = typeof row.tokens_input === "number" ? row.tokens_input : 0;
    const tokensOutput =
      typeof row.tokens_output === "number" ? row.tokens_output : 0;

    return sum + tokensInput + tokensOutput;
  }, 0);

  const limit = getDailyTokenLimit(email);
  const warning = usedTokens >= limit * TOKEN_WARNING_THRESHOLD;

  return usedTokens >= limit
    ? { allowed: false, limit, usedTokens, warning }
    : { allowed: true, limit, usedTokens, warning };
}

export async function logApiUsage(
  supabase: SupabaseClient,
  usage: LanguageModelUsage,
  details: Pick<ApiUsageInsert, "endpoint" | "model" | "user_id">,
) {
  const payload: ApiUsageInsert = {
    endpoint: details.endpoint,
    model: details.model,
    tokens_input: normalizeTokenCount(usage.inputTokens),
    tokens_output: normalizeTokenCount(usage.outputTokens),
    user_id: details.user_id,
  };

  const { error } = await supabase.from("api_usage").insert(payload);

  if (error) {
    console.error("Nie udalo sie zapisac api_usage:", error.message);
  }
}
