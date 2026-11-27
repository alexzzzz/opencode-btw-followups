import { describe, expect, test } from "bun:test"
import { RAIL } from "../src/rail.ts"
import {
  answerToken,
  copiedLabel,
  pointerAt,
  samePointer,
  type AnswerToken,
  type AnswerPointer,
  type PointerSurface,
} from "../src/pointer.ts"

const text = (value: string): AnswerToken => ({ type: "text", raw: value, text: value })

const codespan = (value: string): AnswerToken => ({ type: "codespan", raw: value, text: value })

const strong = (value: string): AnswerToken => ({
  type: "strong",
  raw: value,
  text: value,
  tokens: [text(value)],
})

const paragraph = (...tokens: AnswerToken[]): AnswerToken => ({
  type: "paragraph",
  raw: tokens.map((token) => token.raw ?? "").join(""),
  text: tokens.map((token) => token.text ?? "").join(""),
  tokens,
})

type Block = { token: AnswerToken; renderable: { y: number; height: number } }

const block = (token: AnswerToken, y: number, height: number): Block => ({
  token,
  renderable: { y, height },
})

const surface = (
  states: readonly Block[],
  options: { readonly ownerY?: number; readonly answer?: { x: number; y: number; width: number; height: number } } = {},
): PointerSurface => ({
  answer: options.answer ?? { x: 0, y: 0, width: 80, height: 40 },
  markdown: { y: options.ownerY ?? 0, _blockStates: states },
})

const none = () => false

const at = (
  s: PointerSurface,
  x: number,
  y: number,
  selecting = none,
  copyable: () => boolean = () => true,
): AnswerPointer => pointerAt({ x, y }, s, selecting, copyable)

describe("the text a click copies", () => {
  const copied = (token: AnswerToken) => at(surface([block(token, 0, 1)]), 2, 0).copy

  test("drops the markers of a paragraph and keeps its words", () => {
    expect(
      copied(paragraph(text("run "), codespan("bun test"), text(" before the "), strong("push"))),
    ).toBe("run bun test before the push")
  })

  test("keeps a link's label and not its address", () => {
    const link: AnswerToken = {
      type: "link",
      raw: "[the notes](docs/design.md)",
      text: "the notes",
      tokens: [text("the notes")],
    }
    expect(copied(paragraph(text("see "), link))).toBe("see the notes")
  })

  test("takes the code out of a fence and leaves the fence behind", () => {
    expect(
      copied({
        type: "code",
        raw: "```sh\nbun run check\n```",
        text: "bun run check\n",
      }),
    ).toBe("bun run check")
  })

  test("keeps a list's markers and its nesting", () => {
    const item = (raw: string, ...tokens: AnswerToken[]): AnswerToken => ({
      type: "list_item",
      raw,
      tokens,
    })
    expect(
      copied({
        type: "list",
        raw: "- one\n- two\n  1. three",
        ordered: false,
        items: [
          item("- one", paragraph(text("one"))),
          item("- two", paragraph(text("two")), {
            type: "list",
            raw: "1. three",
            ordered: true,
            start: 1,
            items: [item("1. three", paragraph(text("three")))],
          }),
        ],
      }),
    ).toBe(["- one", "- two", "  1. three"].join("\n"))
  })

  test("numbers an ordered list from where it starts", () => {
    expect(
      copied({
        type: "list",
        raw: "3. three",
        ordered: true,
        start: 3,
        items: [{ type: "list_item", raw: "three", tokens: [paragraph(text("three"))] }],
      }),
    ).toBe("3. three")
  })

  test("lays a table out as rows of cells", () => {
    const cell = (value: string): AnswerToken => ({ type: "text", text: value, tokens: [text(value)] })
    expect(
      copied({
        type: "table",
        raw: "| a | b |",
        header: [cell("a"), cell("b")],
        rows: [[cell("1"), cell("2")]],
      }),
    ).toBe(["a | b", "1 | 2"].join("\n"))
  })

  test("copies nothing for a rule or a gap", () => {
    expect(copied({ type: "hr", raw: "---" })).toBe("")
    expect(copied({ type: "space", raw: "\n\n" })).toBe("")
    expect(copied({ type: "code", raw: "```\n```", text: "\n" })).toBe("")
  })
})

describe("a paragraph that grew in place", () => {
  test("copies the token the block carries at the click", () => {
    const growing = block(paragraph(text("First paragraph.")), 0, 1)
    const s = surface([growing])
    expect(at(s, 2, 0).copy).toBe("First paragraph.")
    growing.token = paragraph(text("First paragraph, now longer."))
    expect(at(s, 2, 0).copy).toBe("First paragraph, now longer.")
  })
})

describe("copy eligibility", () => {
  const s = surface([block(paragraph(text("a completed command")), 0, 1)])

  test("a partial answer keeps its rail but copies nothing", () => {
    expect(at(s, 2, 0, none, () => false)).toEqual({
      place: { top: 0, height: 1 },
      rail: RAIL,
      copy: "",
    })
  })

  test("a completed answer copies its whole block", () => {
    expect(at(s, 2, 0, none, () => true).copy).toBe("a completed command")
  })
})

describe("the selection guard", () => {
  test("a drag that selects text leaves the rail and the copy off", () => {
    const s = surface([block(paragraph(text("a command")), 0, 1)])
    expect(at(s, 2, 0, () => true)).toEqual({ place: undefined, rail: "", copy: "" })
  })
})

describe("the rail under the pointer", () => {
  const states = [
    block(paragraph(text("one")), 6, 1),
    block(paragraph(text("two")), 8, 2),
    block(paragraph(text("three")), 11, 1),
  ]
  const s = surface(states, { ownerY: 6, answer: { x: 0, y: 6, width: 60, height: 10 } })

  test("names the block under the row and counts from the markdown", () => {
    expect(at(s, 2, 8).place).toEqual({ top: 2, height: 2 })
    expect(at(s, 2, 8).copy).toBe("two")
    expect(at(s, 2, 10)).toEqual({ place: undefined, rail: "", copy: "" })
    expect(at(s, 2, 13)).toEqual({ place: undefined, rail: "", copy: "" })
  })

  test("draws one rail line per row of the block, starting at its top", () => {
    expect(at(s, 2, 8).rail).toBe(`\n\n${RAIL}\n${RAIL}`)
    expect(at(s, 2, 6).rail).toBe(RAIL)
  })

  test("clears the rail when the pointer leaves the answer frame", () => {
    expect(at(s, 2, 4)).toEqual({ place: undefined, rail: "", copy: "" })
    expect(at(s, 61, 8)).toEqual({ place: undefined, rail: "", copy: "" })
  })

  test("a pointer moving inside one block redraws nothing", () => {
    expect(samePointer(at(s, 2, 8), at(s, 20, 9))).toBe(true)
    expect(samePointer(at(s, 2, 8), at(s, 2, 6))).toBe(false)
  })

  test("counts from the block itself when the markdown has no row of its own", () => {
    const plain: PointerSurface = {
      answer: { x: 0, y: 0, width: 80, height: 40 },
      markdown: { _blockStates: [block(paragraph(text("x")), 8, 2)] },
    }
    expect(at(plain, 2, 8).place).toEqual({ top: 0, height: 2 })
  })
})

describe("the current host's markdown blocks", () => {
  type Block = {
    kind: string
    raw: string
    text: string
    children: Block[]
    ordered?: boolean
    start?: number
  }

  const block = (kind: string, text: string, children: Block[] = []): Block => ({
    kind,
    raw: text,
    text,
    children,
  })

  test("copies the display text of a paragraph", () => {
    expect(answerToken(block("paragraph", "A bold paragraph."))).toMatchObject({
      type: "paragraph",
      text: "A bold paragraph.",
    })
  })

  test("keeps list markers and nesting", () => {
    const token = answerToken(
      block("list", "- one\n- two\n  1. three", [
        block("item", "- one", [block("paragraph", "one")]),
        block("item", "- two\n  1. three", [
          block("paragraph", "two"),
          {
            ...block("list", "1. three", [
              block("item", "1. three", [block("paragraph", "three")]),
            ]),
            ordered: true,
            start: 1,
          },
        ]),
      ]),
    )
    expect(token).toMatchObject({ type: "list", ordered: false })
    expect(token.items?.[1]?.tokens?.[1]).toMatchObject({ type: "list", ordered: true, start: 1 })
  })

  test("copies table rows from their cells", () => {
    const token = answerToken(
      block("table", "| a | b |", [
        block("row", "| a | b |", [block("cell", "a"), block("cell", "b")]),
        block("row", "| 1 | 2 |", [block("cell", "1"), block("cell", "2")]),
      ]),
    )
    expect(token).toMatchObject({ type: "table" })
    expect(token.header).toHaveLength(2)
    expect(token.rows).toHaveLength(1)
  })

  test("a rule is still not copy text", () => {
    expect(answerToken(block("rule", "---")).type).toBe("hr")
  })
})

describe("the label after a copy", () => {
  test("names the first line and cuts a long one", () => {
    expect(copiedLabel("bun run check\n\nthen push")).toBe("Copied: bun run check")
    const long = "a".repeat(80)
    expect(copiedLabel(`\n\n${long}`)).toBe(`Copied: ${"a".repeat(40)}…`)
  })

  test("says only that it copied when there is no line to name", () => {
    expect(copiedLabel("\n\n")).toBe("Copied.")
  })
})
