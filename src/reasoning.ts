export type ReasoningModel = {
  readonly providerID: string
  readonly modelID: string
  readonly package?: string
  readonly compatibility?: Record<string, unknown>
}

export type ModelRef = {
  readonly providerID: string
  readonly modelID: string
}

export type ReasoningSupport = "supported" | "unsupported"

export type ReasoningState = "on" | "off" | "unsupported"

export type ReasoningDecision =
  | { readonly state: "unchanged" }
  | { readonly state: "unsupported" }
  | { readonly state: "applied"; readonly options: Record<string, unknown> }

type Family =
  | "anthropic"
  | "effort"
  | "gemini"
  | "cohere"
  | "alibaba"
  | "zai"
  | "venice"
  | "bedrock"
  | "unknown"

const ALWAYS_REASONS = [
  /^o[134](?:$|[-.])/,
  /^gpt-5(?:$|-)/,
  /^gpt-oss(?:$|-)/,
  /^codex(?:$|-)/,
  /^deepseek-(?:r1|reasoner)(?:$|[-.])/,
]

const CLAUDE_REASONER = /claude-(?:opus|sonnet|haiku)-(?:3[.-]7|[4-9])/i

const REASONING_MODELS: Partial<Record<Family, RegExp>> = {
  anthropic: CLAUDE_REASONER,
  bedrock: CLAUDE_REASONER,
  effort: /^(?:gpt-5\.\d|magistral|mistral-large|grok-[3-9])/i,
  gemini: /^gemini-(?:2\.5|[3-9])/i,
  cohere: /^command-a/i,
  alibaba: /^qwen3/i,
  zai: /^glm-(?:4\.[5-9]|[5-9])/i,
}

const DISABLED_THINKING: Record<string, unknown> = { thinking: { type: "disabled" } }

const FAMILY_HINTS: readonly { readonly family: Family; readonly words: readonly string[] }[] = [
  { family: "anthropic", words: ["anthropic", "claude"] },
  { family: "bedrock", words: ["bedrock"] },
  { family: "gemini", words: ["google", "gemini", "vertex"] },
  { family: "cohere", words: ["cohere"] },
  { family: "alibaba", words: ["alibaba", "dashscope", "qwen"] },
  { family: "zai", words: ["zai", "zhipu", "glm"] },
  { family: "venice", words: ["venice"] },
  { family: "effort", words: ["openai", "azure", "xai", "mistral", "copilot"] },
]

const familyFrom = (hint: string | undefined): Family | undefined => {
  if (!hint) return undefined
  const name = hint.toLowerCase()
  return FAMILY_HINTS.find((entry) => entry.words.some((word) => name.includes(word)))?.family
}

const familyOf = (model: ReasoningModel): Family =>
  familyFrom(model.package) ?? familyFrom(model.providerID) ?? "unknown"

const knownReasoner = (family: Family, model: ReasoningModel) =>
  REASONING_MODELS[family]?.test(model.modelID) ?? true

const disabledThinking = (): ReasoningDecision => ({
  state: "applied",
  options: { ...DISABLED_THINKING },
})

const decisionFor = (family: Family, model: ReasoningModel): ReasoningDecision => {
  if (!knownReasoner(family, model)) return { state: "unsupported" }
  if (family === "anthropic" || family === "bedrock" || family === "cohere" || family === "zai") {
    return disabledThinking()
  }
  if (family === "gemini") {
    return {
      state: "applied",
      options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    }
  }
  if (family === "alibaba") {
    return { state: "applied", options: { enableThinking: false } }
  }
  if (family === "venice") {
    return { state: "applied", options: { reasoning: { enabled: false } } }
  }
  if (family === "effort") {
    return ALWAYS_REASONS.some((pattern) => pattern.test(model.modelID))
      ? { state: "unsupported" }
      : { state: "applied", options: { reasoningEffort: "none" } }
  }
  return { state: "unsupported" }
}

export const modelEntry = (
  ref: ModelRef | undefined,
  known: readonly ReasoningModel[] | undefined,
): ReasoningModel | undefined =>
  ref && known?.find((item) => item.providerID === ref.providerID && item.modelID === ref.modelID)

export const reasoningOptions = (model: ReasoningModel, enabled: boolean): ReasoningDecision => {
  if (enabled) return { state: "unchanged" }
  if (model.compatibility?.requireReasoning === true) return { state: "unsupported" }
  return decisionFor(familyOf(model), model)
}

export const reasoningSupport = (model: ReasoningModel): ReasoningSupport =>
  reasoningOptions(model, false).state === "applied" ? "supported" : "unsupported"

export const reasoningStateLabel = (
  enabled: boolean,
  support: ReasoningSupport,
): ReasoningState =>
  support === "unsupported" ? "unsupported" : enabled ? "on" : "off"
