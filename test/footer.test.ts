import { describe, expect, test } from "bun:test"
import {
  belowLabel,
  clearLabel,
  copyLabel,
  countLabel,
  FOOTER_GAP,
  FOOTER_PAD,
  footerMode,
  keyHints,
  type FooterMode,
  type HintInput,
} from "../src/footer.ts"

const PANEL_WIDTH = 88

describe("countLabel", () => {
  test("a session with nothing asked and nothing queued says nothing", () => {
    expect(countLabel(0, 0)).toBe("")
  })

  test("a queue with no answer yet says how many wait", () => {
    expect(countLabel(0, 2)).toBe("2 waiting")
  })

  test("answers alone say how many", () => {
    expect(countLabel(3, 0)).toBe("3 answered")
  })

  test("answers and a queue are named together", () => {
    expect(countLabel(3, 2)).toBe("3 answered, 2 waiting")
  })
})

describe("copyLabel", () => {
  test("an empty thread has nothing to copy", () => {
    expect(copyLabel(0)).toBe("nothing to copy")
  })

  test("a thread with a turn offers the copy", () => {
    expect(copyLabel(1)).toBe("copy thread")
  })
})

describe("belowLabel", () => {
  test("nothing new and nothing below says nothing", () => {
    expect(belowLabel(0, 0)).toBe("")
  })

  test("one new answer offers the way down", () => {
    expect(belowLabel(1, 4)).toBe("↓ 1 new answer, click to read")
  })

  test("several new answers are plural", () => {
    expect(belowLabel(3, 4)).toBe("↓ 3 new answers, click to read")
  })

  test("rows below with nothing new count rows", () => {
    expect(belowLabel(0, 4)).toBe("↓ 4 below")
  })
})

describe("clearLabel", () => {
  test("a wide panel names the count and the escape", () => {
    expect(clearLabel(1, PANEL_WIDTH)).toBe("delete again to clear 1 question · esc keeps them")
  })

  test("more than one question is plural", () => {
    expect(clearLabel(2, PANEL_WIDTH)).toBe("delete again to clear 2 questions · esc keeps them")
  })

  test("a narrow panel drops the reassurance rather than cut it", () => {
    expect(clearLabel(2, 20)).toBe("delete again to clear 2")
  })
})

describe("footerMode", () => {
  test("the row reads two facts: a question is out, and the composer holds text", () => {
    expect(footerMode(false, false)).toBe("idle")
    expect(footerMode(false, true)).toBe("idle-typed")
    expect(footerMode(true, false)).toBe("waiting")
    expect(footerMode(true, true)).toBe("waiting-typed")
  })
})

const MODES = ["idle", "idle-typed", "waiting", "waiting-typed"] as const

const hints = (mode: FooterMode, over: Partial<HintInput> = {}) =>
  keyHints({
    panelWidth: PANEL_WIDTH,
    copy: "copy thread",
    right: "",
    mode,
    canClear: true,
    canJump: true,
    ...over,
  })

const keys = (mode: FooterMode, over: Partial<HintInput> = {}) => hints(mode, over).map(([key]) => key)

describe("keyHints", () => {
  test("the hints a panel gets fit the room the row has left", () => {
    for (const mode of MODES) {
      for (const panelWidth of [20, 40, 51, 60, 88, 140]) {
        for (const right of ["", "↓ 4 below", "↓ 2 new answers, click to read"]) {
          for (const copy of ["copy thread", "nothing to copy"]) {
            const room = Math.max(
              0,
              panelWidth -
                (2 * FOOTER_PAD + copy.length + right.length + FOOTER_GAP * (right ? 3 : 2)),
            )
            const used = keyHints({
              panelWidth,
              copy,
              right,
              mode,
              canClear: true,
              canJump: true,
            }).reduce((sum, [key, rest]) => sum + key.length + rest.length, 0)
            expect(used).toBeLessThanOrEqual(room)
          }
        }
      }
    }
  })

  test("every key the row names is one the window binds", () => {
    const bound = new Set(["ctrl+up/down", "ctrl+home/end", "delete", "enter"])
    for (const mode of MODES) {
      for (const [key] of hints(mode, { panelWidth: 200 })) expect(bound.has(key)).toBe(true)
    }
  })

  test("a panel too narrow for a hint draws none", () => {
    expect(keys("idle", { panelWidth: 20, copy: "nothing to copy" })).toEqual([])
    expect(keys("idle", { panelWidth: 0 })).toEqual([])
  })
})

describe("the hints of a mode", () => {
  test("a reading window names the list, the jump and the clear", () => {
    expect(keys("idle")).toEqual(["ctrl+up/down", "ctrl+home/end", "delete"])
  })

  test("a thread with nothing in it drops the clear", () => {
    expect(keys("idle", { copy: "nothing to copy", canClear: false })).toEqual([
      "ctrl+up/down",
      "ctrl+home/end",
    ])
  })

  test("a transcript that fits drops the jump, because there is nowhere to jump", () => {
    expect(keys("idle", { canJump: false })).toEqual(["ctrl+up/down", "delete"])
    expect(keys("idle-typed", { canJump: false })).toEqual([])
  })

  test("a typed question names the jump alone, since Enter needs no teaching", () => {
    expect(keys("idle-typed")).toEqual(["ctrl+home/end"])
  })

  test("a waiting window with an empty composer names the list and the jump", () => {
    expect(keys("waiting")).toEqual(["ctrl+up/down", "ctrl+home/end"])
  })

  test("a waiting window with a question typed names the queue", () => {
    expect(keys("waiting-typed")).toEqual(["enter", "ctrl+home/end"])
  })

  test("no row names a key the reader already knows", () => {
    for (const mode of MODES) {
      for (const [key, rest] of hints(mode, { panelWidth: 200 })) {
        expect(key).not.toBe("page up/down")
        expect(key).not.toBe("wheel")
        expect(key).not.toContain("esc")
        expect(rest).not.toContain("scroll")
      }
    }
  })

  test("the prompt list is named only over an empty composer", () => {
    expect(keys("idle")).toContain("ctrl+up/down")
    expect(keys("waiting")).toContain("ctrl+up/down")
    expect(keys("idle-typed")).not.toContain("ctrl+up/down")
    expect(keys("waiting-typed")).not.toContain("ctrl+up/down")
  })

  test("the clear is named only over a thread with a turn in it", () => {
    expect(keys("idle")).toContain("delete")
    expect(keys("idle", { canClear: false })).not.toContain("delete")
  })

  test("the jump is named whenever the transcript runs past the window", () => {
    for (const mode of MODES) expect(keys(mode, { canJump: true })).toContain("ctrl+home/end")
  })

  test("a narrow reading window keeps the list, because that is what an empty composer is for", () => {
    expect(keys("idle", { panelWidth: 48, copy: "nothing to copy" })).toEqual(["ctrl+up/down"])
  })
})
