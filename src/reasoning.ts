export type ReasoningModel = {
  readonly providerID: string
  readonly modelID: string
  readonly package?: string
  readonly compatibility?: Record<string, unknown>
}

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

const familyFromPackage = (pkg: string | undefined): Family | undefined => {
  if (!pkg) return undefined
  const name = pkg.toLowerCase()
  if (name.includes("anthropic")) return "anthropic"
  if (name.includes("bedrock")) return "bedrock"
  if (name.includes("google") || name.includes("gemini")) return "gemini"
  if (name.includes("cohere")) return "cohere"
  if (name.includes("alibaba") || name.includes("dashscope")) return "alibaba"
  if (name.includes("zai") || name.includes("zhipu")) return "zai"
  if (name.includes("venice")) return "venice"
  if (
    name.includes("openai") ||
    name.includes("azure") ||
    name.includes("xai") ||
    name.includes("mistral")
  ) {
    return "effort"
  }
  return undefined
}

const familyFromProvider = (providerID: string): Family => {
  const id = providerID.toLowerCase()
  if (id.includes("anthropic") || id.includes("claude")) return "anthropic"
  if (id.includes("bedrock")) return "bedrock"
  if (id.includes("google") || id.includes("gemini") || id.includes("vertex")) return "gemini"
  if (id.includes("cohere")) return "cohere"
  if (id.includes("alibaba") || id.includes("dashscope") || id.includes("qwen")) return "alibaba"
  if (id.includes("zai") || id.includes("zhipu") || id.includes("glm")) return "zai"
  if (id.includes("venice")) return "venice"
  if (
    id.includes("openai") ||
    id.includes("azure") ||
    id.includes("xai") ||
    id.includes("mistral") ||
    id.includes("copilot")
  ) {
    return "effort"
  }
  return "unknown"
}

const familyOf = (model: ReasoningModel): Family =>
  familyFromPackage(model.package) ?? familyFromProvider(model.providerID)

const claude = (model: ReasoningModel) => /claude|anthropic/i.test(model.modelID)

const decisionFor = (family: Family, model: ReasoningModel): ReasoningDecision => {
  if (family === "anthropic") {
    return { state: "applied", options: { thinking: { type: "disabled" } } }
  }
  if (family === "gemini") {
    return {
      state: "applied",
      options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    }
  }
  if (family === "cohere" || family === "zai") {
    return { state: "applied", options: { thinking: { type: "disabled" } } }
  }
  if (family === "alibaba") {
    return { state: "applied", options: { enableThinking: false } }
  }
  if (family === "venice") {
    return { state: "applied", options: { reasoning: { enabled: false } } }
  }
  if (family === "bedrock") {
    return claude(model)
      ? { state: "applied", options: { thinking: { type: "disabled" } } }
      : { state: "unsupported" }
  }
  if (family === "effort") {
    return ALWAYS_REASONS.some((pattern) => pattern.test(model.modelID))
      ? { state: "unsupported" }
      : { state: "applied", options: { reasoningEffort: "none" } }
  }
  return { state: "unsupported" }
}

export const reasoningOptions = (model: ReasoningModel, enabled: boolean): ReasoningDecision => {
  if (enabled) return { state: "unchanged" }
  if (model.compatibility?.requireReasoning === true) return { state: "unsupported" }
  return decisionFor(familyOf(model), model)
}

export const reasoningSupport = (model: ReasoningModel): "supported" | "unsupported" =>
  reasoningOptions(model, false).state === "applied" ? "supported" : "unsupported"
