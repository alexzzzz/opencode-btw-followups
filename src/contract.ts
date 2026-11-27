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

export default Rpc.define({
  id: "btw-followups.reasoning",
  methods: {
    get: { input: empty, output: enabled },
    set: { input: enabled, output: enabled },
  },
  events: {},
})
