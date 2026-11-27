import { Plugin } from "@opencode/plugin"
import contract from "./contract.ts"
import { isSideQuestion } from "./prompt.ts"
import { reasoningOptions } from "./reasoning.ts"

const KEY = "btw-followups.reasoning"

const enabledOf = (value: unknown) => {
  if (typeof value !== "object" || value === null) return undefined
  const enabled = (value as { enabled?: unknown }).enabled
  return typeof enabled === "boolean" ? enabled : undefined
}

export default Plugin.define({
  id: "btw-followups",
  async setup(context) {
    let reasoning = { enabled: enabledOf(await context.storage.get(KEY)) ?? true }

    const rpc = await context.rpc.register(contract, {
      get: async () => reasoning,
      set: async (input) => {
        reasoning = { enabled: enabledOf(input) ?? reasoning.enabled }
        await context.storage.set(KEY, reasoning)
        return reasoning
      },
    })

    const generate = await context.session.hook("generate", async (input) => {
      if (reasoning.enabled) return
      const last = [...input.messages].reverse().find((entry) => entry.role === "user")
      if (!last || last.role !== "user") return
      const text = last.content.find((part) => part.type === "text")
      if (!text || text.type !== "text" || !isSideQuestion(text.text)) return
      const models = await context.model.list()
      const model = models.data.find(
        (entry) => entry.providerID === input.model.providerID && entry.modelID === input.model.id,
      )
      if (!model) return
      const decision = reasoningOptions(model, reasoning.enabled)
      if (decision.state !== "applied") return
      Object.assign(input.options, decision.options)
    })

    return async () => {
      await generate.dispose()
      await rpc.dispose()
    }
  },
})
