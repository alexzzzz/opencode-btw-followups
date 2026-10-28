import { describe, expect, test } from "bun:test"
import { ctrlDown, ctrlUp, opensFromSession } from "../src/keys.ts"

describe("ctrlUp", () => {
  test("a window with the list down opens it", () => {
    expect(ctrlUp(false)).toBe("open")
  })

  test("a window with the list up closes it", () => {
    expect(ctrlUp(true)).toBe("close")
  })
})

describe("ctrlDown", () => {
  test("the list goes down before the window does", () => {
    expect(ctrlDown(true)).toBe("close")
  })

  test("a window with the list down closes", () => {
    expect(ctrlDown(false)).toBe("close-window")
  })
})

describe("opensFromSession", () => {
  test("an open session with no window opens one", () => {
    expect(opensFromSession("ses_1", undefined)).toBe(true)
  })

  test("a window already up keeps the key to itself", () => {
    expect(opensFromSession("ses_1", "ses_1")).toBe(false)
    expect(opensFromSession("ses_1", "ses_2")).toBe(false)
  })

  test("no open session takes the key nowhere", () => {
    expect(opensFromSession(undefined, undefined)).toBe(false)
  })
})
