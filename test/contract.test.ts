import { expect, test } from "bun:test"
import contract from "../src/contract.ts"

test("the reasoning contract names one definition with a get and a set", () => {
  expect(contract.id).toBe("btw-followups.reasoning")
  expect(Object.keys(contract.methods).sort()).toEqual(["get", "set"])
  expect(contract.events).toEqual({})
})

test("the reasoning contract carries portable JSON schemas for both methods", () => {
  expect(contract.methods.get.input).toEqual({
    type: "object",
    properties: {},
    additionalProperties: false,
  })
  expect(contract.methods.get.output).toEqual({
    type: "object",
    properties: { enabled: { type: "boolean" } },
    required: ["enabled"],
    additionalProperties: false,
  })
  expect(contract.methods.set.input).toEqual(contract.methods.get.output)
  expect(contract.methods.set.output).toEqual(contract.methods.get.output)
})
