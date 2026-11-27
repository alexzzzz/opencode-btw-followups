import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { delimiter, dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const root = fileURLToPath(new URL("..", import.meta.url))
const packageName = "@alexzzzz/opencode-btw-followups"

export const compatibility = [
  {
    name: "minimum",
    opencode: "2.0.19",
    plugin: "2.0.19",
    core: "0.5.12",
    solidRuntime: "0.5.12",
    solid: "1.9.12",
  },
  {
    name: "current",
    opencode: "2.4.2",
    plugin: "2.4.2",
    core: "0.9.9",
    solidRuntime: "0.9.9",
    solid: "1.9.20",
  },
]

function quoteWindows(arg) {
  return /[\s"&|<>^()%!]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg
}

function run(command, args, settings = {}) {
  const options = {
    cwd: settings.cwd,
    env: settings.env ?? process.env,
    encoding: "utf8",
    stdio: settings.capture ? ["ignore", "pipe", "pipe"] : "inherit",
    windowsVerbatimArguments: process.platform === "win32",
  }
  const result =
    process.platform === "win32"
      ? spawnSync(
          process.env.ComSpec || "cmd.exe",
          ["/d", "/v:off", "/s", "/c", `"${[command, ...args].map(quoteWindows).join(" ")}"`],
          options,
        )
      : spawnSync(command, args, options)
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (settings.capture) {
      if (result.stdout) process.stdout.write(result.stdout)
      if (result.stderr) process.stderr.write(result.stderr)
    }
    throw new Error(`${command} ${args.join(" ")} failed with exit code ${result.status}`)
  }
  return result.stdout ?? ""
}

export async function sourceArchive(destination, source = root) {
  const result = spawnSync("git", ["ls-files", "-z", "--cached"], {
    cwd: source,
    encoding: "buffer",
  })
  if (result.error) throw result.error
  if (result.status !== 0) throw new Error(`git ls-files failed with exit code ${result.status}`)
  const names = result.stdout.toString("utf8").split("\0").filter(Boolean)
  for (const name of names) {
    const target = join(destination, name)
    await mkdir(dirname(target), { recursive: true })
    await cp(join(source, name), target, { recursive: true, force: true })
  }
  if (existsSync(join(destination, "dist"))) throw new Error("The clean source archive contains dist/")
}

async function pack(source, destination) {
  await mkdir(destination, { recursive: true })
  const output = run("npm", ["pack", "--json", "--pack-destination", destination], {
    cwd: source,
    capture: true,
  })
  const packed = JSON.parse(output)
  const files = new Set(packed[0]?.files.map((file) => file.path))
  for (const entry of ["dist/index.js", "dist/tui.js"]) {
    if (!files.has(entry)) throw new Error(`The package is missing ${entry}`)
  }
  return join(destination, packed[0].filename)
}

async function consumer(destination, tarball, host) {
  await mkdir(destination, { recursive: true })
  await writeFile(
    join(destination, "package.json"),
    `${JSON.stringify({ name: `btw-release-${host.name}`, private: true, type: "module" }, null, 2)}\n`,
  )
  await writeFile(
    join(destination, "import.mjs"),
    [
      `const server = await import(${JSON.stringify(packageName)})`,
      `const terminal = await import(${JSON.stringify(`${packageName}/tui`)})`,
      'if (server.default?.id !== "btw-followups") throw new Error("The server entrypoint has the wrong export")',
      'if (terminal.default?.id !== "btw-followups.tui") throw new Error("The terminal entrypoint has the wrong export")',
      'console.log("Imported the server and terminal entrypoints")',
      "",
    ].join("\n"),
  )
  run(
    "npm",
    [
      "install",
      "--no-audit",
      "--no-fund",
      tarball,
      `@opencode/cli@${host.opencode}`,
      `@opencode/plugin@${host.plugin}`,
      `@opentui/core@${host.core}`,
      `@opentui/solid@${host.solidRuntime}`,
      `solid-js@${host.solid}`,
    ],
    { cwd: destination },
  )
  const installed = JSON.parse(
    await readFile(join(destination, "node_modules", "@opencode", "plugin", "package.json"), "utf8"),
  )
  if (installed.version !== host.plugin) {
    throw new Error(`Expected @opencode/plugin ${host.plugin}, installed ${installed.version}`)
  }
  run("bun", ["run", "import.mjs"], { cwd: destination })
}

async function answerPointer(source, destination) {
  await cp(join(source, "src"), join(destination, "src"), { recursive: true, force: true })
  const fixture = join("test", "fixtures", "markdown-pointer.ts")
  await mkdir(dirname(join(destination, fixture)), { recursive: true })
  await cp(join(source, fixture), join(destination, fixture))
  run("bun", ["--preload", "@opentui/solid/preload", fixture], { cwd: destination })
}

function hostEnvironment(destination, host) {
  const env = {
    ...process.env,
    HOME: join(destination, `home-${host.name}`),
    USERPROFILE: join(destination, `home-${host.name}`),
  }
  for (const key of Object.keys(env)) {
    if (key.toLowerCase() === "path") delete env[key]
  }
  env.PATH = `${join(destination, "node_modules", ".bin")}${delimiter}${process.env.PATH ?? process.env.Path ?? ""}`
  delete env.OPENCODE_CONFIG_DIR
  delete env.XDG_CONFIG_HOME
  return env
}

async function deploy(source, destination, env, expected, absent) {
  const reported = run("opencode", ["debug", "paths", "config"], {
    cwd: destination,
    env,
    capture: true,
  }).trim()
  if (resolve(reported) !== resolve(expected)) {
    throw new Error(`Expected OpenCode config ${expected}, got ${reported}`)
  }
  run(process.execPath, [join(source, "scripts", "deploy.mjs")], { cwd: destination, env })
  const target = join(expected, "plugins", "btw-followups")
  if (!existsSync(join(target, "tui.tsx"))) throw new Error(`Deploy did not write ${target}`)
  if (absent && existsSync(join(absent, "plugins", "btw-followups"))) {
    throw new Error(`Deploy also wrote the non-canonical directory ${absent}`)
  }
  run(process.execPath, [join(source, "scripts", "deploy.mjs"), "--check"], {
    cwd: destination,
    env,
    capture: true,
  })
}

async function smoke() {
  const temporary = await mkdtemp(join(tmpdir(), "btw-release-"))
  try {
    const source = join(temporary, "source")
    const archive = join(temporary, "archive")
    await sourceArchive(source)
    run("bun", ["install", "--frozen-lockfile"], { cwd: source })
    const tarball = await pack(source, archive)

    for (const host of compatibility) {
      const destination = join(temporary, host.name)
      console.log(`\nChecking ${host.name}: OpenCode ${host.opencode}, OpenTUI ${host.core}, Solid ${host.solid}`)
      await consumer(destination, tarball, host)
      await answerPointer(source, destination)
      const env = hostEnvironment(destination, host)
      await mkdir(env.HOME, { recursive: true })

      if (host.name === "minimum") {
        const xdg = join(temporary, "xdg-minimum")
        const reported = join(temporary, "reported-minimum")
        env.XDG_CONFIG_HOME = xdg
        env.OPENCODE_CONFIG_DIR = reported
        await deploy(source, destination, env, reported, join(xdg, "opencode"))
      } else {
        const xdg = join(temporary, "xdg-current")
        env.XDG_CONFIG_HOME = xdg
        await deploy(source, destination, env, join(xdg, "opencode"))
        delete env.XDG_CONFIG_HOME
        await deploy(source, destination, env, join(env.HOME, ".config", "opencode"))
      }
    }
    console.log("\nRelease smoke passed")
  } finally {
    await rm(temporary, { recursive: true, force: true })
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  await smoke()
}
