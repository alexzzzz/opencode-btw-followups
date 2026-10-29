import { describe, expect, test } from "bun:test"
import { blockPlace, blockRow, blockText, blockTextOf, copiedLabel, type AnswerToken } from "../src/block.ts"

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

describe("the text a click copies", () => {
  test("drops the markers of a paragraph and keeps its words", () => {
    const block = paragraph(text("run "), codespan("bun test"), text(" before the "), strong("push"))
    expect(blockText(block)).toBe("run bun test before the push")
  })

  test("keeps a link's label and not its address", () => {
    const link: AnswerToken = {
      type: "link",
      raw: "[the notes](docs/design.md)",
      text: "the notes",
      tokens: [text("the notes")],
    }
    expect(blockText(paragraph(text("see "), link))).toBe("see the notes")
  })

  test("takes the code out of a fence and leaves the fence behind", () => {
    const block: AnswerToken = {
      type: "code",
      raw: "```sh\nbun run check\n```",
      text: "bun run check\n",
    }
    expect(blockText(block)).toBe("bun run check")
  })

  test("keeps a list's markers and its nesting", () => {
    const item = (raw: string, ...tokens: AnswerToken[]): AnswerToken => ({
      type: "list_item",
      raw,
      tokens,
    })
    const block: AnswerToken = {
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
    }
    expect(blockText(block)).toBe(["- one", "- two", "  1. three"].join("\n"))
  })

  test("numbers an ordered list from where it starts", () => {
    const block: AnswerToken = {
      type: "list",
      raw: "3. three",
      ordered: true,
      start: 3,
      items: [{ type: "list_item", raw: "three", tokens: [paragraph(text("three"))] }],
    }
    expect(blockText(block)).toBe("3. three")
  })

  test("lays a table out as rows of cells", () => {
    const cell = (value: string): AnswerToken => ({ type: "text", text: value, tokens: [text(value)] })
    const block: AnswerToken = {
      type: "table",
      raw: "| a | b |",
      header: [cell("a"), cell("b")],
      rows: [[cell("1"), cell("2")]],
    }
    expect(blockText(block)).toBe(["a | b", "1 | 2"].join("\n"))
  })

  test("copies nothing for a rule or a gap", () => {
    expect(blockText({ type: "hr", raw: "---" })).toBeUndefined()
    expect(blockText({ type: "space", raw: "\n\n" })).toBeUndefined()
    expect(blockText({ type: "code", raw: "```\n```", text: "\n" })).toBeUndefined()
  })
})

describe("the text of a block that was rewritten in place", () => {
  test("reads the token the block carries now", () => {
    const renderable = {}
    const owner = { _blockStates: [{ token: paragraph(text("now")), renderable }] }
    expect(blockTextOf(owner, renderable, "before")).toBe("now")
  })

  test("falls back to what the block was built with", () => {
    expect(blockTextOf(undefined, {}, "before")).toBe("before")
    expect(blockTextOf({ _blockStates: [] }, {}, "before")).toBe("before")
    expect(blockTextOf({ _blockStates: [{ token: { type: "hr", raw: "---" }, renderable: {} }] }, {}, "before")).toBe(
      "before",
    )
  })
})

describe("the block a pointer names", () => {
  const owner = (y: number | undefined, frames: readonly { y: number; height: number }[]) => ({
    y,
    _blockStates: frames.map((renderable) => ({ token: paragraph(text("x")), renderable })),
  })

  const frames = [
    { y: 6, height: 1 },
    { y: 8, height: 2 },
    { y: 11, height: 1 },
  ]

  test("finds the block under a row and counts from the markdown", () => {
    expect(blockRow(owner(6, frames), 8)).toEqual({ top: 2, height: 2 })
    expect(blockRow(owner(6, frames), 10)).toBeUndefined()
    expect(blockRow(owner(6, frames), 13)).toBeUndefined()
  })

  test("counts from the block itself when the owner has no row of its own", () => {
    expect(blockRow(owner(undefined, frames), 8)).toEqual({ top: 0, height: 2 })
  })

  test("names the block a renderable draws", () => {
    const renderable = { y: 11, height: 1 }
    const markdown = { y: 6, _blockStates: [{ token: paragraph(text("x")), renderable }] }
    expect(blockPlace(markdown, renderable)).toEqual({ top: 5, height: 1 })
    expect(blockPlace(markdown, {})).toBeUndefined()
    expect(blockPlace(undefined, renderable)).toBeUndefined()
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
