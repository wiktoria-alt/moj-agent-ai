import { type AiModel } from "./models";

const genericModelError =
  "Nie udało się teraz pobrać odpowiedzi z modelu Google. Spróbuj ponownie za moment.";

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value != null
    ? (value as Record<string, unknown>)
    : null;
}

function collectErrorCandidates(error: unknown) {
  const candidates: unknown[] = [error];

  for (let index = 0; index < candidates.length; index += 1) {
    const record = asRecord(candidates[index]);

    if (!record) {
      continue;
    }

    for (const key of ["cause", "lastError", "data"]) {
      if (record[key] != null) {
        candidates.push(record[key]);
      }
    }

    const data = asRecord(record.data);
    if (data?.error != null) {
      candidates.push(data.error);
    }

    if (Array.isArray(record.errors)) {
      candidates.push(...record.errors);
    }

    if (typeof record.responseBody === "string") {
      candidates.push(record.responseBody);
    }
  }

  return candidates;
}

function getErrorStatus(error: unknown) {
  for (const candidate of collectErrorCandidates(error)) {
    const record = asRecord(candidate);

    if (!record) {
      continue;
    }

    for (const key of ["status", "statusCode", "code"]) {
      if (typeof record[key] === "number") {
        return record[key];
      }
    }
  }

  return null;
}

function getErrorText(error: unknown) {
  const messages = collectErrorCandidates(error)
    .map((candidate) => {
      if (typeof candidate === "string") {
        return candidate;
      }

      if (candidate instanceof Error) {
        return candidate.message;
      }

      const record = asRecord(candidate);
      return typeof record?.message === "string" ? record.message : "";
    })
    .filter(Boolean);

  return [...new Set(messages)].join(" ");
}

export function getModelErrorMessage(error: unknown, model?: AiModel) {
  const status = getErrorStatus(error);
  const text = getErrorText(error);
  const normalized = text.toLowerCase();
  const modelName =
    model === "pro"
      ? "Pro"
      : model === "flash"
        ? "Flash"
        : model === "lite"
          ? "Lite"
          : "wybranego modelu";

  if (
    status === 429 ||
    normalized.includes("quota") ||
    normalized.includes("resource_exhausted") ||
    normalized.includes("rate-limit")
  ) {
    return `Limit Google API dla modelu ${modelName} jest teraz wyczerpany. Przełącz na Lite/Flash/Pro albo spróbuj później.`;
  }

  if (
    status === 401 ||
    status === 403 ||
    normalized.includes("api key") ||
    normalized.includes("permission")
  ) {
    return "Klucz Google API nie ma dostępu do tego modelu albo jest niepoprawny. Sprawdź GOOGLE_API_KEY lub GOOGLE_GENERATIVE_AI_API_KEY.";
  }

  if (
    status === 503 ||
    normalized.includes("overloaded") ||
    normalized.includes("unavailable")
  ) {
    return "Model Google jest chwilowo przeciążony. Spróbuj ponownie za moment albo przełącz Lite/Flash/Pro.";
  }

  return genericModelError;
}

export function getReadableErrorMessage(
  error: unknown,
  fallback = "Nie udało się pobrać odpowiedzi. Spróbuj ponownie.",
) {
  const text = getErrorText(error).trim();

  if (text && text !== "An error occurred.") {
    return text;
  }

  return fallback;
}
