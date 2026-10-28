import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"

const markup = () => {
  const source = readFileSync(new URL("../src/window.tsx", import.meta.url), "utf8")
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
