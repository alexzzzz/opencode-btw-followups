import { describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

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

test("the host markdown copies a completed block and draws its pointer rail", () => {
  const root = fileURLToPath(new URL("..", import.meta.url))
  const result = spawnSync(
    process.execPath,
    ["--preload", "@opentui/solid/preload", join("test", "fixtures", "markdown-pointer.ts")],
    { cwd: root, encoding: "utf8" },
  )
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error([result.stdout, result.stderr].filter(Boolean).join("\n"))
  }
  expect(result.status).toBe(0)
}, 15000)
