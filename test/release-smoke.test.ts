import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sourceArchive, entrypoints } from "../scripts/release-smoke.mjs"

const git = (cwd: string, args: string[]) => {
  const result = spawnSync("git", args, { cwd, encoding: "utf8" })
  if (result.error) throw result.error
  expect(result.status).toBe(0)
}

test("the release gate imports every entrypoint the package exports", () => {
  expect(entrypoints.map((entry) => entry.path)).toEqual([
    "dist/index.js",
    "dist/tui.js",
    "dist/contract.js",
  ])
  expect(entrypoints.map((entry) => entry.id)).toEqual([
    "btw-followups",
    "btw-followups.tui",
    "btw-followups.reasoning",
  ])
})

test("the release source archive copies tracked files and leaves untracked files out", async () => {
  const temporary = await mkdtemp(join(tmpdir(), "btw-source-archive-"))
  try {
    const repository = join(temporary, "repository")
    const destination = join(temporary, "archive")
    await mkdir(repository)
    git(repository, ["init"])
    await writeFile(join(repository, "tracked.ts"), "export const tracked = true\n")
    await writeFile(join(repository, "untracked.ts"), "export const untracked = true\n")
    git(repository, ["add", "tracked.ts"])

    await sourceArchive(destination, repository)

    expect(await readFile(join(destination, "tracked.ts"), "utf8")).toBe("export const tracked = true\n")
    expect(existsSync(join(destination, "untracked.ts"))).toBe(false)
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
})
