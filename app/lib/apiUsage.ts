import type { SupabaseClient } from "@supabase/supabase-js";
import type { LanguageModelUsage } from "ai";

export const DAILY_TOKEN_LIMIT = 10_000;
export const DAILY_TOKEN_LIMIT_MESSAGE =
  "Dzienny limit tokenów (10k) został wyczerpany. Wróć jutro!";

type TokenBudgetStatus =
  | {
      allowed: true;
      usedTokens: number;
    }
  | {
      allowed: false;
      usedTokens: number;
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

export async function checkDailyTokenBudget(
  supabase: SupabaseClient,
  userId: string,
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

  return usedTokens >= DAILY_TOKEN_LIMIT
    ? { allowed: false, usedTokens }
    : { allowed: true, usedTokens };
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
