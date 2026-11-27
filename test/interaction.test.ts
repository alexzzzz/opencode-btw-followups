import { describe, expect, test } from "bun:test"
import {
  bindings,
  footerMode,
  hints,
  opensFromSession,
  SESSION_OPEN_BIND,
  type InteractionMode,
} from "../src/interaction.ts"
import {
  belowLabel,
  clearLabel,
  copyLabel,
  countLabel,
  footerHints,
  FOOTER_GAP,
  FOOTER_PAD,
} from "../src/footer.ts"

const mode = (over: Partial<InteractionMode> = {}): InteractionMode => ({
  waiting: false,
  typed: false,
  listed: false,
  canClear: true,
  canRetry: false,
  canJump: true,
  ...over,
})

const enabledIntents = (m: InteractionMode) =>
  new Set(bindings(() => m).filter((binding) => binding.enabled()).map((binding) => binding.intent))

describe("the key table", () => {
  test("one table builds every bind of the dialog keymap", () => {
    expect(bindings(() => mode()).map((binding) => [binding.bind, binding.intent])).toEqual([
      ["pageup", "page_up"],
      ["pagedown", "page_down"],
      ["ctrl+home", "home"],
      ["ctrl+end", "end"],
      ["ctrl+up", "list"],
      ["ctrl+down", "step_down"],
      ["delete", "clear"],
      ["enter", "retry"],
      ["up", "recall_older"],
      ["down", "recall_newer"],
      ["up", "choose_up"],
      ["down", "choose_down"],
      ["enter", "choose"],
      ["escape", "close_list"],
    ])
  })

  test("the enabled predicate of each command comes from the mode", () => {
    const open = enabledIntents(mode())
    for (const intent of [
      "page_up",
      "page_down",
      "home",
      "end",
      "list",
      "step_down",
      "clear",
      "recall_older",
      "recall_newer",
    ]) {
      expect(open.has(intent as never)).toBe(true)
    }
    for (const intent of ["choose_up", "choose_down", "choose", "close_list"]) {
      expect(open.has(intent as never)).toBe(false)
    }

    const listed = enabledIntents(mode({ listed: true }))
    expect(listed.has("clear")).toBe(false)
    expect(listed.has("recall_older")).toBe(false)
    expect(listed.has("recall_newer")).toBe(false)
    expect(listed.has("choose_up")).toBe(true)
    expect(listed.has("choose_down")).toBe(true)
    expect(listed.has("choose")).toBe(true)
    expect(listed.has("close_list")).toBe(true)
  })

  test("Delete is enabled only for an idle, empty, unlisted composer", () => {
    const clear = (m: InteractionMode) =>
      bindings(() => m).find((binding) => binding.bind === "delete")
    expect(clear(mode())?.enabled()).toBe(true)
    expect(clear(mode({ waiting: true }))?.enabled()).toBe(false)
    expect(clear(mode({ typed: true }))?.enabled()).toBe(false)
    expect(clear(mode({ listed: true }))?.enabled()).toBe(false)
  })

  test("Enter retries only an idle failed thread with an empty composer", () => {
    const retry = (m: InteractionMode) =>
      bindings(() => m).find((binding) => binding.intent === "retry")
    expect(retry(mode({ canRetry: true }))?.enabled()).toBe(true)
    expect(retry(mode())?.enabled()).toBe(false)
    expect(retry(mode({ canRetry: true, waiting: true }))?.enabled()).toBe(false)
    expect(retry(mode({ canRetry: true, typed: true }))?.enabled()).toBe(false)
    expect(retry(mode({ canRetry: true, listed: true }))?.enabled()).toBe(false)
  })

  test("the list effect follows the list state", () => {
    const effect = (intent: "list" | "step_down", m: InteractionMode) =>
      bindings(() => m).find((binding) => binding.intent === intent)?.effect()
    expect(effect("list", mode())).toBe("open")
    expect(effect("list", mode({ listed: true }))).toBe("close")
    expect(effect("step_down", mode())).toBe("close-window")
    expect(effect("step_down", mode({ listed: true }))).toBe("close")
  })
})

describe("opensFromSession", () => {
  test("the session command and the window list read one bind", () => {
    expect(SESSION_OPEN_BIND).toBe("ctrl+up")
    expect(bindings(() => mode()).find((binding) => binding.id === "session.aside.list")?.bind).toBe(
      SESSION_OPEN_BIND,
    )
  })

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

const IDLE = mode()
const IDLE_TYPED = mode({ typed: true })
const WAITING = mode({ waiting: true })
const WAITING_TYPED = mode({ waiting: true, typed: true })
const MODES = [IDLE, IDLE_TYPED, WAITING, WAITING_TYPED]

const PANEL_WIDTH = 88

type HintOver = { panelWidth?: number; copy?: string; right?: string }

const hintsFor = (m: InteractionMode, over: HintOver = {}) =>
  footerHints(m, over.panelWidth ?? PANEL_WIDTH, over.copy ?? "copy thread", over.right ?? "")

const keyNames = (m: InteractionMode, over: HintOver = {}) =>
  hintsFor(m, over).map(([key]) => key)

describe("footerMode", () => {
  test("the row reads two facts: a question is out, and the composer holds text", () => {
    expect(footerMode(IDLE)).toBe("idle")
    expect(footerMode(IDLE_TYPED)).toBe("idle-typed")
    expect(footerMode(WAITING)).toBe("waiting")
    expect(footerMode(WAITING_TYPED)).toBe("waiting-typed")
  })
})

describe("the hint table", () => {
  test("a hint's key is the bind of the same table entry", () => {
    const bound = bindings(() => mode()).map((binding) => binding.bind)
    for (const m of MODES) {
      for (const [key] of hints(m, 200)) {
        for (const part of key.split("/")) {
          expect(bound.some((bind) => bind === part || bind.endsWith(part))).toBe(true)
        }
      }
    }
  })

  test("every key the row names is a bind the window takes", () => {
    const bound = new Set(["ctrl+up/down", "ctrl+home/end", "delete", "enter"])
    for (const m of MODES) {
      for (const [key] of hintsFor(m, { panelWidth: 200 })) expect(bound.has(key)).toBe(true)
    }
  })

  test("the hints a panel gets fit the room the row has left", () => {
    for (const m of MODES) {
      for (const panelWidth of [20, 40, 51, 60, 88, 140]) {
        for (const right of ["", "↓ 4 below", "↓ 2 new answers, click to read"]) {
          for (const copy of ["copy thread", "nothing to copy"]) {
            const room = Math.max(
              0,
              panelWidth -
                (2 * FOOTER_PAD + copy.length + right.length + FOOTER_GAP * (right ? 3 : 2)),
            )
            const used = hints(m, room).reduce((sum, [key, rest]) => sum + key.length + rest.length, 0)
            expect(used).toBeLessThanOrEqual(room)
          }
        }
      }
    }
  })

  test("a panel too narrow for a hint draws none", () => {
    expect(keyNames(IDLE, { panelWidth: 20, copy: "nothing to copy" })).toEqual([])
    expect(keyNames(IDLE, { panelWidth: 0 })).toEqual([])
  })

  test("the tiers drop from the tail: clear, then jump, then list", () => {
    expect(hints(IDLE, 63).map(([key]) => key)).toEqual(["ctrl+up/down", "ctrl+home/end", "delete"])
    expect(hints(IDLE, 50).map(([key]) => key)).toEqual(["ctrl+up/down", "ctrl+home/end"])
    expect(hints(IDLE, 25).map(([key]) => key)).toEqual(["ctrl+up/down"])
    expect(hints(IDLE, 18).map(([key]) => key)).toEqual(["ctrl+home/end"])
    expect(hints(IDLE, 10)).toEqual([])
  })
})

describe("the hints of a mode", () => {
  test("a reading window names the list, the jump and the clear", () => {
    expect(keyNames(IDLE)).toEqual(["ctrl+up/down", "ctrl+home/end", "delete"])
  })

  test("a failed thread names the retry before the other idle hints", () => {
    expect(hints(mode({ canRetry: true }), 200).map(([key]) => key)).toEqual([
      "enter",
      "ctrl+up/down",
      "ctrl+home/end",
      "delete",
    ])
    expect(keyNames(mode({ canRetry: true, typed: true }))).not.toContain("enter")
    expect(keyNames(mode({ canRetry: true, listed: true }))).not.toContain("enter")
  })

  test("a thread with nothing in it drops the clear", () => {
    expect(keyNames(mode({ canClear: false }))).toEqual(["ctrl+up/down", "ctrl+home/end"])
  })

  test("a transcript that fits drops the jump, because there is nowhere to jump", () => {
    expect(keyNames(mode({ canJump: false }))).toEqual(["ctrl+up/down", "delete"])
    expect(keyNames(mode({ typed: true, canJump: false }))).toEqual([])
  })

  test("a typed question names the jump alone, since Enter needs no teaching", () => {
    expect(keyNames(IDLE_TYPED)).toEqual(["ctrl+home/end"])
  })

  test("a waiting window with an empty composer names the list and the jump", () => {
    expect(keyNames(WAITING)).toEqual(["ctrl+up/down", "ctrl+home/end"])
  })

  test("a waiting window with a question typed names the queue", () => {
    expect(keyNames(WAITING_TYPED)).toEqual(["enter", "ctrl+home/end"])
  })

  test("no row names a key the reader already knows", () => {
    for (const m of MODES) {
      for (const [key, rest] of hintsFor(m, { panelWidth: 200 })) {
        expect(key).not.toBe("page up/down")
        expect(key).not.toBe("wheel")
        expect(key).not.toContain("esc")
        expect(rest).not.toContain("scroll")
      }
    }
  })

  test("the prompt list is named only over an empty composer", () => {
    expect(keyNames(IDLE)).toContain("ctrl+up/down")
    expect(keyNames(WAITING)).toContain("ctrl+up/down")
    expect(keyNames(IDLE_TYPED)).not.toContain("ctrl+up/down")
    expect(keyNames(WAITING_TYPED)).not.toContain("ctrl+up/down")
  })

  test("the clear is named only over an idle thread with a turn in it", () => {
    expect(keyNames(IDLE)).toContain("delete")
    expect(keyNames(mode({ canClear: false }))).not.toContain("delete")
    expect(keyNames(mode({ listed: true }))).not.toContain("delete")
  })

  test("the jump is named whenever the transcript runs past the window", () => {
    for (const m of MODES) expect(keyNames({ ...m, canJump: true })).toContain("ctrl+home/end")
  })

  test("a narrow reading window keeps the list, because that is what an empty composer is for", () => {
    expect(keyNames(IDLE, { panelWidth: 48, copy: "nothing to copy" })).toEqual(["ctrl+up/down"])
  })
})

describe("the footer labels", () => {
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

  test("an empty thread has nothing to copy", () => {
    expect(copyLabel(0)).toBe("nothing to copy")
  })

  test("a thread with a turn offers the copy", () => {
    expect(copyLabel(1)).toBe("copy thread")
  })

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
