// Builds the two entrypoints the package exports.
//
// The terminal half is JSX, and a JSX file only loads when something compiles it.
// OpenCode compiles it when it loads a plugin from a directory, but a package
// installed from npm has to load without help, so the JSX is compiled here instead
// and the package ships plain JavaScript. Verified by importing the built files from
// a bare Bun process with no JSX transform configured.
//
// The peers stay external. OpenCode provides them at runtime, and bundling a second
// copy of the renderer into the package would give the plugin a different set of
// renderables than the host it draws into.

import { build } from "esbuild"
import { solidPlugin } from "esbuild-plugin-solid"

const external = ["@opencode/plugin", "@opencode/plugin/tui", "@opentui/core", "@opentui/solid", "solid-js", "solid-js/web"]

const common = {
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "esnext",
  external,
  logLevel: "info",
}

await build({
  ...common,
  entryPoints: ["src/index.ts"],
  outfile: "dist/index.js",
})

// Three settings decide whether the compiled output can be loaded at all, and all
// three were found by importing the result from a plain Bun process and comparing it
// with what a published OpenCode plugin emits.
//
// `generate: "universal"` because the host is a custom renderer, not a browser. It
// emits insertNode, spread, setProp and createElement instead of the DOM helpers.
//
// `moduleName: "@opentui/solid"` rather than solid-js/web, so those helpers are asked
// of the runtime the host actually provides. With the default the output imports them
// from solid-js/web and fails on a missing export.
//
// `delegateEvents: false` because with delegation on the compiler emits an
// `addEventListener` import from the runtime module, and @opentui/solid exports none.
await build({
  ...common,
  entryPoints: ["src/tui.tsx"],
  outfile: "dist/tui.js",
  plugins: [
    solidPlugin({ solid: { generate: "universal", moduleName: "@opentui/solid", delegateEvents: false } }),
  ],
})