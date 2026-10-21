import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

/**
 * The answer's markdown element, read out of the source.
 *
 * The order of its attributes is a rule, and no other test can see it: the renderer
 * builds its blocks when the content lands, and a block built without a style keeps
 * none. The highlighter then fails on it and the renderer falls back to the raw
 * source, so `**`, `#` and backticks land on screen. The measurement behind this is
 * in `docs/design.md`.
 */
const markup = () => {
  const source = readFileSync(new URL("../src/tui.tsx", import.meta.url), "utf8")
  const start = source.indexOf("<markdown")
  if (start < 0) return ""
  const end = source.indexOf("/>", start)
  return end < 0 ? "" : source.slice(start, end)
}

describe("the answer's markdown", () => {
  test("names the style and the colour before the content", () => {
    const element = markup()
    const style = element.indexOf("syntaxStyle=")
    const colour = element.indexOf("fg=")
    const content = element.indexOf("content=")
    expect(style).toBeGreaterThan(-1)
    expect(colour).toBeGreaterThan(-1)
    expect(content).toBeGreaterThan(-1)
    expect(style).toBeLessThan(content)
    expect(colour).toBeLessThan(content)
  })
})
