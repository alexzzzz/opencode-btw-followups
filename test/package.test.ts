import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { rm } from "node:fs/promises"
import { join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))

test("npm pack builds every public entrypoint from a source checkout", async () => {
  await rm(join(root, "dist"), { recursive: true, force: true })
  const result = spawnSync("npm", ["pack", "--dry-run", "--json"], {
    cwd: root,
    encoding: "utf8",
    shell: process.platform === "win32",
  })
  if (result.error) throw result.error
  expect(result.status).toBe(0)

  const packed = JSON.parse(result.stdout) as Array<{ files: Array<{ path: string }> }>
  const files = new Set(packed[0]?.files.map((file) => file.path))
  expect(files.has("dist/index.js")).toBe(true)
  expect(files.has("dist/tui.js")).toBe(true)
  expect(files.has("dist/contract.js")).toBe(true)
}, 15000)
