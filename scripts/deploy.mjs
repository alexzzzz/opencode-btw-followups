// Copies the sources the terminal half of the plugin runs from.
//
// The running TUI loads this plugin from `<config>/plugins/btw-followups` rather
// than from the repository: the directory is discovered by name, and the host
// reloads the modules when a file changes. A change that is not copied there is
// a change the window never sees, and a target left behind runs the old code
// without saying so. `--check` compares without writing, for the times the
// question is only whether the window is running what the tree holds.

import { mkdir, readFile, readdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { extname, join } from "node:path"
import { fileURLToPath } from "node:url"

const check = process.argv.includes("--check")

const root = fileURLToPath(new URL("..", import.meta.url))
const source = join(root, "src")
const target = join(homedir(), ".config", "opencode", "plugins", "btw-followups")

const copies = (name) => [".ts", ".tsx"].includes(extname(name))

const read = async (path) => {
  try {
    return await readFile(path, "utf8")
  } catch {
    return undefined
  }
}

const names = (await readdir(source)).filter(copies).sort()
const wanted = new Set(names)

const stale = []
const missing = []
const same = []

for (const name of names) {
  const before = await read(join(target, name))
  const after = await read(join(source, name))
  if (before === undefined) missing.push(name)
  else if (before !== after) stale.push(name)
  else same.push(name)
}

const extraFiles = (await readdir(target).catch(() => []))
  .filter((name) => copies(name) && !wanted.has(name))
  .sort()

const report = [
  ...missing.map((name) => `new      ${name}`),
  ...stale.map((name) => `changed  ${name}`),
  ...same.map((name) => `same     ${name}`),
  ...extraFiles.map((name) => `extra    ${name} (not in src)`),
]

if (report.length > 0) console.log(report.join("\n"))

const outdated = missing.length + stale.length

if (check) {
  console.log(
    outdated === 0
      ? `\n${target} holds every source in src/.`
      : `\n${outdated} of ${names.length} sources in ${target} are behind. Run bun run deploy.`,
  )
  process.exit(outdated === 0 ? 0 : 1)
}

if (outdated > 0) {
  await mkdir(target, { recursive: true })
  for (const name of [...missing, ...stale]) {
    await writeFile(join(target, name), await readFile(join(source, name)))
  }
}

console.log(
  outdated === 0
    ? `\n${target} holds every source in src/.`
    : `\n${outdated} of ${names.length} sources copied to ${target}.`,
)

if (extraFiles.length > 0) {
  console.log(`Left ${extraFiles.length} files alone: ${extraFiles.join(", ")}.`)
}
