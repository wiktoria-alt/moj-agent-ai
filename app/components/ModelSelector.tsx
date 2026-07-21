"use client";

import { aiModelOptions, type AiModel } from "../lib/models";

type ModelSelectorProps = {
  disabled?: boolean;
  label?: string;
  onChange: (model: AiModel) => void;
  value: AiModel;
};

export function ModelSelector({
  disabled = false,
  label = "Model AI",
  onChange,
  value,
}: ModelSelectorProps) {
  return (
    <div className="model-control">
      <span>{label}</span>
      <div className="model-pills" aria-label={label}>
        {aiModelOptions.map((option) => (
          <button
            aria-pressed={value === option.id}
            className={value === option.id ? "active" : ""}
            disabled={disabled}
            key={option.id}
            onClick={() => onChange(option.id)}
            type="button"
          >
            <strong>{option.label}</strong>
            <em>{option.detail}</em>
          </button>
        ))}
      </div>
    </div>
  );
}
