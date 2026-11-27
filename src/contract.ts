import { Rpc } from "@opencode/plugin/rpc"

const enabled = {
  type: "object",
  properties: { enabled: { type: "boolean" } },
  required: ["enabled"],
  additionalProperties: false,
} as const

const empty = {
  type: "object",
  properties: {},
  additionalProperties: false,
} as const

export const enabledOf = (value: unknown): boolean | undefined => {
  if (typeof value !== "object" || value === null) return undefined
  const enabled = (value as { enabled?: unknown }).enabled
  return typeof enabled === "boolean" ? enabled : undefined
}

export default Rpc.define({
  id: "btw-followups.reasoning",
  methods: {
    get: { input: empty, output: enabled },
    set: { input: enabled, output: enabled },
  },
  events: {},
})
