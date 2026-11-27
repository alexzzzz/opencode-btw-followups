import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import { isAbsolute, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

function fallbackConfigDir(env) {
  const home = env.HOME || env.USERPROFILE || homedir()
  return resolve(env.XDG_CONFIG_HOME || join(home, ".config"), "opencode")
}

export function configDir(env = process.env) {
  const args = ["debug", "paths", "config"]
  const result =
    process.platform === "win32"
      ? spawnSync(env.ComSpec || "cmd.exe", ["/d", "/v:off", "/s", "/c", '"opencode debug paths config"'], {
          encoding: "utf8",
          env,
          windowsVerbatimArguments: true,
        })
      : spawnSync("opencode", args, { encoding: "utf8", env })
  if (result.error) {
    if (result.error.code === "ENOENT") return fallbackConfigDir(env)
    throw result.error
  }
  if (result.status !== 0) {
    const detail = result.stderr?.trim()
    if (
      result.status === 127 ||
      /['"]opencode['"] is not recognized as an internal or external command/i.test(detail ?? "")
    ) {
      return fallbackConfigDir(env)
    }
    throw new Error(`opencode debug paths config failed${detail ? `: ${detail}` : ""}`)
  }
  const reported = result.stdout.trim()
  if (!reported || !isAbsolute(reported)) {
    throw new Error("opencode debug paths config did not report an absolute config directory")
  }
  return reported
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  console.log(configDir())
}
