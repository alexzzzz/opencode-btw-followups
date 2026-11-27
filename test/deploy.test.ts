import { afterEach, describe, expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, join } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const script = join(root, "scripts", "deploy.mjs")
const roots: string[] = []

afterEach(async () => {
  await Promise.all(roots.splice(0).map((path) => rm(path, { recursive: true, force: true })))
})

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "btw-deploy-"))
  roots.push(root)
  const bin = join(root, "bin")
  const home = join(root, "home")
  const host = join(bin, "host.mjs")
  await mkdir(bin, { recursive: true })
  await mkdir(home, { recursive: true })
  await writeFile(
    host,
    [
      'import { homedir } from "node:os"',
      'import { join } from "node:path"',
      "console.log(process.env.FAKE_OPENCODE_CONFIG ?? join(process.env.XDG_CONFIG_HOME ?? join(homedir(), \".config\"), \"opencode\"))",
      "",
    ].join("\n"),
  )
  if (process.platform === "win32") {
    await writeFile(join(bin, "opencode.cmd"), `@echo off\r\n"${process.execPath}" "%~dp0host.mjs" %*\r\n`)
  } else {
    const executable = join(bin, "opencode")
    await writeFile(executable, `#!/bin/sh\nexec "${process.execPath}" "${host}" "$@"\n`)
    await chmod(executable, 0o755)
  }
  return { root, bin, home }
}

function environment(paths: { bin: string; home: string }) {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: paths.home,
    USERPROFILE: paths.home,
  }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") delete env[key]
  }
  env.PATH = `${paths.bin}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`
  delete env.XDG_CONFIG_HOME
  delete env.OPENCODE_CONFIG_DIR
  delete env.FAKE_OPENCODE_CONFIG
  return env
}

function deploy(env: NodeJS.ProcessEnv, ...args: string[]) {
  const result = spawnSync("node", [script, ...args], { cwd: root, env, encoding: "utf8" })
  if (result.error) throw result.error
  return result
}

async function expectDeployed(target: string) {
  expect(await readFile(join(target, "index.ts"), "utf8")).toBe(
    await readFile(join(root, "src", "index.ts"), "utf8"),
  )
}

describe("deploy config discovery", () => {
  test("the host-reported directory wins over XDG_CONFIG_HOME for deploy and deploy:check", async () => {
    const paths = await fixture()
    const reported = join(paths.root, "reported-config")
    const xdg = join(paths.root, "xdg-config")
    const env = { ...environment(paths), XDG_CONFIG_HOME: xdg, FAKE_OPENCODE_CONFIG: reported }

    const before = deploy(env, "--check")
    expect(before.status).toBe(1)
    expect(before.stdout).toContain(reported)

    expect(deploy(env).status).toBe(0)
    await expectDeployed(join(reported, "plugins", "btw-followups"))
    expect(existsSync(join(xdg, "opencode", "plugins", "btw-followups"))).toBe(false)

    const after = deploy(env, "--check")
    expect(after.status).toBe(0)
    expect(after.stdout).toContain(reported)
  })

  test("XDG_CONFIG_HOME selects the OpenCode directory when the host reports it", async () => {
    const paths = await fixture()
    const xdg = join(paths.root, "xdg-config")
    const env = { ...environment(paths), XDG_CONFIG_HOME: xdg }

    expect(deploy(env).status).toBe(0)
    await expectDeployed(join(xdg, "opencode", "plugins", "btw-followups"))
    expect(deploy(env, "--check").status).toBe(0)
  })

  test("an unset XDG_CONFIG_HOME uses the home config directory", async () => {
    const paths = await fixture()
    const env = environment(paths)

    expect(deploy(env).status).toBe(0)
    await expectDeployed(join(paths.home, ".config", "opencode", "plugins", "btw-followups"))
    expect(deploy(env, "--check").status).toBe(0)
  })
})
