type DiagnosticPart = {
  errorText?: string;
  input?: unknown;
  output?: unknown;
  state?: string;
  toolCallId?: string;
  toolName?: string;
  type: string;
};

type DiagnosticsPanelProps = {
  elapsedSeconds?: number;
  isLoading: boolean;
  maxSteps?: number;
  toolParts: DiagnosticPart[];
};

function isToolPart(part: DiagnosticPart) {
  return part.type === "dynamic-tool" || part.type.startsWith("tool-");
}

function getToolName(part: DiagnosticPart) {
  if (part.type === "dynamic-tool") {
    return part.toolName ?? "tool";
  }

  return part.type.replace(/^tool-/, "");
}

function valueToPreview(value: unknown, maxLength = 80): string {
  if (value == null) {
    return "";
  }

  if (typeof value === "string") {
    const clean = value.replace(/\s+/g, " ").trim();
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  try {
    const clean = JSON.stringify(value) ?? "";
    return clean.length > maxLength ? `${clean.slice(0, maxLength - 1)}…` : clean;
  } catch {
    return "[dane]";
  }
}

function formatArgs(input: unknown) {
  if (input == null) {
    return "";
  }

  if (typeof input !== "object" || Array.isArray(input)) {
    return valueToPreview(input);
  }

  return Object.entries(input)
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${valueToPreview(value, 42)}`)
    .join(", ");
}

function getOutputObject(output: unknown) {
  return typeof output === "object" && output != null
    ? (output as Record<string, unknown>)
    : null;
}

function getToolError(part: DiagnosticPart) {
  if (part.state === "output-error") {
    return part.errorText ?? "Narzędzie zwróciło błąd.";
  }

  const output = getOutputObject(part.output);
  const error = output?.error;

  return typeof error === "string" && error.trim() ? error : "";
}

function getProgressClass(stepCount: number) {
  if (stepCount >= 5) {
    return "danger";
  }

  if (stepCount >= 4) {
    return "warning";
  }

  return "ok";
}

export function DiagnosticsPanel({
  elapsedSeconds,
  isLoading,
  maxSteps = 5,
  toolParts,
}: DiagnosticsPanelProps) {
  const tools = toolParts.filter(isToolPart);
  const stepCount = Math.min(maxSteps, tools.length);
  const progressPercent = maxSteps > 0 ? (stepCount / maxSteps) * 100 : 0;
  const toolCounts = tools.reduce<Record<string, number>>((counts, part) => {
    const name = getToolName(part);
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
  const errors = tools
    .map((part) => ({
      args: formatArgs(part.input),
      message: getToolError(part),
      name: getToolName(part),
    }))
    .filter((error) => error.message);
  const status = isLoading
    ? stepCount >= maxSteps
      ? "⚠️ Limit kroków"
      : "W trakcie..."
    : "✅ Status: Zadanie ukończone";
  const progressClass = getProgressClass(stepCount);
  const toolsSummary =
    Object.entries(toolCounts)
      .map(([name, count]) => `${name}(${count})`)
      .join(", ") || "brak";

  return (
    <section className="diagnostics-panel" aria-label="Diagnostyka">
      <div className="diagnostics-header">
        <h2>🛡️ Diagnostyka</h2>
        <span>{status}</span>
      </div>

      <div className="diagnostics-row">
        <span>Kroki</span>
        <div className={`diagnostics-progress ${progressClass}`} aria-hidden="true">
          <span style={{ width: `${progressPercent}%` }} />
        </div>
        <strong>
          {stepCount}/{maxSteps}
        </strong>
      </div>

      <p>
        <strong>Narzędzia:</strong> {toolsSummary}
      </p>
      <p>
        <strong>Błędy:</strong> {errors.length}
      </p>
      <p>
        <strong>Czas:</strong>{" "}
        {elapsedSeconds == null ? "0.0s" : `${elapsedSeconds.toFixed(1)}s`}
      </p>

      {errors.length > 0 && (
        <div className="diagnostics-alerts" role="alert">
          {errors.map((error, index) => (
            <p key={`${error.name}-${index}`}>
              🔴 {error.name}
              {error.args ? `(${error.args})` : ""} — {error.message}
            </p>
          ))}
        </div>
      )}
    </section>
  );
}
