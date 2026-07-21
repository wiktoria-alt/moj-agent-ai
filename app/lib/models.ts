export const aiModelOptions = [
  {
    id: "lite",
    label: "Lite",
    badge: "Lite",
    detail: "najniższy",
    modelId: "gemini-2.5-flash-lite",
  },
  {
    id: "flash",
    label: "Flash",
    badge: "⚡ Flash",
    detail: "szybki",
    modelId: "gemini-2.5-flash",
  },
  {
    id: "pro",
    label: "Pro",
    badge: "🧠 Pro",
    detail: "dokładniejszy",
    modelId: "gemini-3.1-pro-preview",
  },
] as const;

export type AiModel = (typeof aiModelOptions)[number]["id"];

export const googleModelIds: Record<AiModel, string> = {
  lite: "gemini-2.5-flash-lite",
  flash: "gemini-2.5-flash",
  pro: "gemini-3.1-pro-preview",
};

export const googleImageModelIds: Record<AiModel, string> = {
  lite: "gemini-2.5-flash-image",
  flash: "gemini-3.1-flash-image",
  pro: "gemini-3-pro-image",
};

export function getAiModel(value: unknown): AiModel {
  if (value === "lite" || value === "pro") {
    return value;
  }

  return "flash";
}

export function getAiModelDetails(model: AiModel) {
  return aiModelOptions.find((option) => option.id === model) ?? aiModelOptions[0];
}
