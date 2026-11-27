import { describe, expect, test } from "bun:test"
import {
  modelEntry,
  reasoningOptions,
  reasoningStateLabel,
  reasoningSupport,
  type ReasoningModel,
} from "../src/reasoning.ts"

const model = (over: Partial<ReasoningModel> = {}): ReasoningModel => ({
  providerID: "anthropic",
  modelID: "claude-sonnet-4-5",
  package: "@opencode/ai/providers/anthropic",
  ...over,
})

const bare = (providerID: string, modelID = "unknown"): ReasoningModel => ({ providerID, modelID })

const off = (over: Partial<ReasoningModel> = {}) => reasoningOptions(model(over), false)

describe("reasoningOptions", () => {
  test("reasoning left on sends no override", () => {
    expect(reasoningOptions(model(), true)).toEqual({ state: "unchanged" })
  })

  test("a provider with no known control is unsupported", () => {
    expect(reasoningOptions(bare("mystery"), false)).toEqual({ state: "unsupported" })
  })

  test("an Anthropic model disables thinking", () => {
    expect(off()).toEqual({ state: "applied", options: { thinking: { type: "disabled" } } })
  })

  test("an Anthropic-compatible endpoint disables thinking", () => {
    expect(off({ providerID: "qwen", package: "@opencode/ai/providers/anthropic-compatible" })).toEqual({
      state: "applied",
      options: { thinking: { type: "disabled" } },
    })
  })

  test("an OpenAI model sends the effort off value", () => {
    expect(
      off({ providerID: "openai", modelID: "gpt-5.1", package: "@opencode/ai/providers/openai" }),
    ).toEqual({ state: "applied", options: { reasoningEffort: "none" } })
  })

  test("an OpenAI-compatible endpoint sends the effort off value", () => {
    expect(
      off({
        providerID: "gateway",
        modelID: "gpt-5.1",
        package: "@opencode/ai/providers/openai-compatible",
      }),
    ).toEqual({ state: "applied", options: { reasoningEffort: "none" } })
  })

  test("a Mistral model sends the effort off value", () => {
    expect(
      off({ providerID: "mistral", modelID: "mistral-large", package: "@opencode/ai/providers/mistral" }),
    ).toEqual({ state: "applied", options: { reasoningEffort: "none" } })
  })

  test("a Gemini model zeroes the budget and omits thoughts", () => {
    expect(
      off({ providerID: "google", modelID: "gemini-2.5-flash", package: "@opencode/ai/providers/google" }),
    ).toEqual({
      state: "applied",
      options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    })
  })

  test("a Z.ai model disables thinking", () => {
    expect(off({ providerID: "zai", modelID: "glm-5", package: "@opencode/ai/providers/zai" })).toEqual({
      state: "applied",
      options: { thinking: { type: "disabled" } },
    })
  })

  test("an Alibaba model turns thinking off", () => {
    expect(
      off({ providerID: "alibaba", modelID: "qwen3-max", package: "@opencode/ai/providers/alibaba" }),
    ).toEqual({ state: "applied", options: { enableThinking: false } })
  })

  test("a Venice model turns reasoning off", () => {
    expect(
      off({ providerID: "venice", modelID: "venice-uncensored", package: "@opencode/ai/providers/venice" }),
    ).toEqual({ state: "applied", options: { reasoning: { enabled: false } } })
  })

  test("a Cohere model disables thinking", () => {
    expect(
      off({ providerID: "cohere", modelID: "command-a", package: "@opencode/ai/providers/cohere" }),
    ).toEqual({ state: "applied", options: { thinking: { type: "disabled" } } })
  })

  test("a Claude model on Bedrock disables thinking", () => {
    expect(
      off({
        providerID: "amazon-bedrock",
        modelID: "anthropic.claude-sonnet-4-5",
        package: "@opencode/ai/providers/amazon-bedrock",
      }),
    ).toEqual({ state: "applied", options: { thinking: { type: "disabled" } } })
  })

  test("a Bedrock model whose effort list has no off value is unsupported", () => {
    expect(
      off({
        providerID: "amazon-bedrock",
        modelID: "amazon.nova-pro-v1:0",
        package: "@opencode/ai/providers/amazon-bedrock",
      }),
    ).toEqual({ state: "unsupported" })
  })

  test("an o-series model that always reasons is unsupported", () => {
    expect(
      off({ providerID: "openai", modelID: "o3-mini", package: "@opencode/ai/providers/openai" }),
    ).toEqual({ state: "unsupported" })
  })

  test("an OpenAI model without reasoning is unsupported", () => {
    expect(
      off({ providerID: "openai", modelID: "gpt-4o", package: "@opencode/ai/providers/openai" }),
    ).toEqual({ state: "unsupported" })
  })

  test("an unknown model on an OpenAI provider is unsupported", () => {
    expect(off(bare("openai"))).toEqual({ state: "unsupported" })
  })

  test("an older Claude model without a thinking switch is unsupported", () => {
    expect(off({ providerID: "anthropic", modelID: "claude-3-haiku-20240307" })).toEqual({
      state: "unsupported",
    })
  })

  test("an older Gemini model without a thinking budget is unsupported", () => {
    expect(off(bare("google", "gemini-1.5-pro"))).toEqual({ state: "unsupported" })
  })

  test("a base GPT-5 model that always reasons is unsupported", () => {
    expect(
      off({ providerID: "openai", modelID: "gpt-5", package: "@opencode/ai/providers/openai" }),
    ).toEqual({ state: "unsupported" })
  })

  test("a model that requires its reasoning field is unsupported", () => {
    expect(off({ compatibility: { requireReasoning: true } })).toEqual({ state: "unsupported" })
  })

  test("the package decides before the provider id", () => {
    expect(off({ providerID: "opencode", package: "@opencode/ai/providers/anthropic" })).toEqual({
      state: "applied",
      options: { thinking: { type: "disabled" } },
    })
  })

  test("a provider id decides when the package is missing", () => {
    expect(reasoningOptions(bare("google", "gemini-2.5-flash"), false)).toEqual({
      state: "applied",
      options: { thinkingConfig: { thinkingBudget: 0, includeThoughts: false } },
    })
  })
})

describe("reasoningSupport", () => {
  test("a provider with a known control is supported", () => {
    expect(reasoningSupport(model())).toBe("supported")
  })

  test("a provider with no known control is unsupported", () => {
    expect(reasoningSupport(bare("mystery"))).toBe("unsupported")
  })

  test("a model that always reasons is unsupported", () => {
    expect(
      reasoningSupport({ providerID: "openai", modelID: "o3-mini", package: "@opencode/ai/providers/openai" }),
    ).toBe("unsupported")
  })
})

describe("reasoningStateLabel", () => {
  test("a supported model follows the toggle", () => {
    expect(reasoningStateLabel(true, "supported")).toBe("on")
    expect(reasoningStateLabel(false, "supported")).toBe("off")
  })

  test("an unsupported model reads unsupported whatever the toggle says", () => {
    expect(reasoningStateLabel(true, "unsupported")).toBe("unsupported")
    expect(reasoningStateLabel(false, "unsupported")).toBe("unsupported")
  })
})

describe("modelEntry", () => {
  const entry: ReasoningModel = {
    providerID: "openai",
    modelID: "gpt-5.1",
    package: "@opencode/ai/providers/openai",
  }

  test("the catalogue entry wins over the compact ref", () => {
    expect(modelEntry({ providerID: "openai", modelID: "gpt-5.1" }, [entry])).toBe(entry)
  })

  test("a ref the catalogue does not know resolves to nothing", () => {
    expect(modelEntry({ providerID: "openai", modelID: "gpt-4o" }, [entry])).toBeUndefined()
    expect(modelEntry(undefined, [entry])).toBeUndefined()
  })
})
