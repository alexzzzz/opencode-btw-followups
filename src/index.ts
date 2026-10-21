// The server entrypoint of the plugin.
//
// The thread is entirely a terminal concern, and the question is answered with a transient
// `session.generate` call that leaves nothing behind, so this half has nothing to do.

import { Plugin } from "@opencode/plugin"

export default Plugin.define({
  id: "btw-followups",
  setup() {},
})
