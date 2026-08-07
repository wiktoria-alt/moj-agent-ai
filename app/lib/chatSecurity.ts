import type {
  StreamTextTransform,
  TextStreamPart,
  ToolSet,
} from "ai";

export const INPUT_BLOCKED_MESSAGE =
  "Ta wiadomość została zablokowana z powodów bezpieczeństwa.";
export const OUTPUT_BLOCKED_MESSAGE =
  "Przepraszam, nie mogę udostępnić tych informacji.";

const MAX_INPUT_LENGTH = 2_000;
const RATE_LIMIT = 50;
const RATE_LIMIT_WINDOW_MS = 60 * 60 * 1_000;

const forbiddenInputPatterns = [
  /ignore\s*previous/iu,
  /syst[e]?m\s*prompt/iu,
  /prompt\s*systemow(?:y|ego|e|ą|a)?/iu,
  /(?:poka[zż]|podaj|ujawnij|wyświetl|zdradź).{0,40}(?:prompt|instrukcj)/iu,
  /(?:ukryt|tajne|wewn[eę]trzn).{0,40}instrukcj/iu,
  /ignore\s*instructions/iu,
  /(?:show|give|reveal|display|print|tell).{0,40}(?:instruction|instructions|developer\s*message|system\s*message)/iu,
  /(?:hidden|internal|secret|developer|system).{0,40}(?:instruction|instructions|message|messages)/iu,
  /(?:zignoruj|olej|pomi[nń]).{0,40}(?:instrukcj|zasad|ogranicze[nń])/iu,
  /\breveal\b/iu,
  /show\s*me\s*your/iu,
  /translate\s*your\s*prompt/iu,
];

const dataExfiltrationInputPatterns = [
  /(?:show|give|list|export|dump|download|print|send|reveal|extract|exfiltrate).{0,80}(?:user\s*data|users?|emails?|e-mails?|database|db|tables?|rows?|records?|message[_\s-]*logs?|api[_\s-]*usage|conversation\s*history|all\s*conversations?|tokens?|profiles?|private\s*data|customer\s*data|client\s*data|cases?|documents?|briefings)/iu,
  /(?:poka[zż]|podaj|wypisz|wyeksportuj|eksportuj|zrzuc|zrzuć|pobierz|sciagnij|ściągnij|wydrukuj|ujawnij|wyslij|wyślij|wyciagnij|wyciągnij).{0,90}(?:dane\s*uzytkownik(?:a|ow)|dane\s+użytkownik(?:a|ów)|uzytkownik(?:a|ow)|użytkownik(?:a|ów)|maile|e-maile|emaile|adresy\s*e-mail|baze|bazę|bazy|tabele|tabelę|rekordy?|wiadomosci|wiadomości|historie\s*rozmow|historię\s*rozmów|wszystkie\s*rozmowy|tokeny?|profile|dane\s*klient(?:a|ow|ów)|sprawy\s*klient(?:a|ow|ów)|briefingi|dokumenty)/iu,
  /(?:all|full|complete)\s+(?:user\s*data|database|db|message\s*logs|conversation\s*history|private\s*data|customer\s*data|client\s*data)/iu,
  /(?:cala|cała|pelna|pełna|wszystkie)\s+(?:baza|bazę|dane|wiadomosci|wiadomości|rozmowy|logi|rekordy|maile|emaile)/iu,
  /\bselect\s+\*\s+from\s+(?:auth\.users|users|profiles|user_profiles|message_logs|api_usage|conversations?|cases?|documents?|briefings)\b/iu,
  /(?:cudze|innych\s+uzytkownik(?:ow|ow)|innych\s+użytkownik(?:ów|ow)|other\s+users?).{0,70}(?:dane|wiadomosci|wiadomości|rozmowy|maile|emails?|cases?|sprawy|documents?|dokumenty)/iu,
];

const forbiddenOutputPatterns = [
  /system\s*prompt/iu,
  /\bapi[\s_-]*key\b/iu,
  /\bsupabase[\s_-]*url\b/iu,
  /\bsupabase[\s_-]*(?:anon|service[\s_-]*role)[\s_-]*key\b/iu,
  /\bgoogle[\s_-]*generative[\s_-]*ai[\s_-]*api[\s_-]*key\b/iu,
  /\bprocess\.env\b/iu,
  /\b(?:message_logs|user_profiles|webhook_events|api_usage|auth\.users)\b/iu,
  /(?:lista|wykaz|export|zrzut|dump).{0,80}(?:uzytkownik|użytkownik|mail|email|rozmow|rozmów|wiadomosci|wiadomości|danych|bazy)/iu,
  /(?:user\s*data|database\s*dump|message\s*logs|conversation\s*history|private\s*data|customer\s*data|client\s*data)/iu,
];

type InputValidation =
  | { ok: true; value: string }
  | { ok: false; reason: "forbidden-content" | "data-exfiltration" | "too-long" };

type RateLimitResult =
  | { allowed: true; remaining: number }
  | { allowed: false; retryAfterMinutes: number };

declare global {
  // The store survives hot reloads and route module re-evaluations in one server instance.
  // A shared database/Redis store should replace it when the app runs on many instances.
  var chatRateLimitStore: Map<string, number[]> | undefined;
}

const rateLimitStore =
  globalThis.chatRateLimitStore ?? new Map<string, number[]>();
globalThis.chatRateLimitStore = rateLimitStore;

export function sanitizeInput(value: string): string {
  return value
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200d\u2060\ufeff]/gu, "");
}

export function validateInput(value: string): InputValidation {
  if (value.length > MAX_INPUT_LENGTH) {
    return { ok: false, reason: "too-long" };
  }

  const sanitized = sanitizeInput(value);
  if (dataExfiltrationInputPatterns.some((pattern) => pattern.test(sanitized))) {
    return { ok: false, reason: "data-exfiltration" };
  }

  if (forbiddenInputPatterns.some((pattern) => pattern.test(sanitized))) {
    return { ok: false, reason: "forbidden-content" };
  }

  return { ok: true, value: sanitized };
}

export function checkRateLimit(
  userId: string,
  now = Date.now(),
): RateLimitResult {
  const windowStart = now - RATE_LIMIT_WINDOW_MS;
  const recentTimestamps = (rateLimitStore.get(userId) ?? []).filter(
    (timestamp) => timestamp > windowStart,
  );

  if (recentTimestamps.length >= RATE_LIMIT) {
    rateLimitStore.set(userId, recentTimestamps);
    const retryAfterMs =
      recentTimestamps[0] + RATE_LIMIT_WINDOW_MS - now;

    return {
      allowed: false,
      retryAfterMinutes: Math.max(1, Math.ceil(retryAfterMs / 60_000)),
    };
  }

  recentTimestamps.push(now);
  rateLimitStore.set(userId, recentTimestamps);

  return {
    allowed: true,
    remaining: RATE_LIMIT - recentTimestamps.length,
  };
}

function normalizeForComparison(value: string): string {
  return value.normalize("NFKC").replace(/\s+/gu, " ").trim().toLowerCase();
}

function containsPromptFragment(
  output: string,
  protectedPrompts: string[],
): boolean {
  const normalizedOutput = normalizeForComparison(output);

  return protectedPrompts.some((prompt) =>
    prompt
      .split(/\r?\n/u)
      .map(normalizeForComparison)
      .filter((line) => line.length >= 32)
      .some((line) => normalizedOutput.includes(line)),
  );
}

export function filterOutput(
  value: string,
  protectedPrompts: string[] = [],
): string {
  const hasForbiddenPattern = forbiddenOutputPatterns.some((pattern) =>
    pattern.test(value),
  );

  if (hasForbiddenPattern || containsPromptFragment(value, protectedPrompts)) {
    return OUTPUT_BLOCKED_MESSAGE;
  }

  return value;
}

export function createOutputFilterTransform<TOOLS extends ToolSet>(
  protectedPrompts: string[],
): StreamTextTransform<TOOLS> {
  return () => {
    const pendingText = new Map<
      string,
      { start: TextStreamPart<TOOLS>; text: string }
    >();

    return new TransformStream<
      TextStreamPart<TOOLS>,
      TextStreamPart<TOOLS>
    >({
      transform(chunk, controller) {
        if (chunk.type === "text-start") {
          pendingText.set(chunk.id, { start: chunk, text: "" });
          return;
        }

        if (chunk.type === "text-delta") {
          const pending = pendingText.get(chunk.id);
          if (pending) {
            pending.text += chunk.text;
            return;
          }
        }

        if (chunk.type === "text-end") {
          const pending = pendingText.get(chunk.id);
          if (pending) {
            controller.enqueue(pending.start);
            controller.enqueue({
              type: "text-delta",
              id: chunk.id,
              text: filterOutput(pending.text, protectedPrompts),
            });
            controller.enqueue(chunk);
            pendingText.delete(chunk.id);
            return;
          }
        }

        controller.enqueue(chunk);
      },
    });
  };
}
