# @alexzzzz/opencode-btw-followups

The package is an OpenCode V2 plugin that replaces the built-in `/btw` with a side question
dialog that keeps a thread.

## Build and check

Run `bun run check` before you call a change done. It typechecks, then runs the tests, then
builds the package the npm release ships, in that order. `bun test` runs the tests alone. The
TUI half has no behavioural test, so a change to the dialog, the command or the queue also
needs one pass by hand in a terminal.

## Where things are

- `src/index.ts` is the server entrypoint, and it registers nothing because the thread is a
  terminal concern.
- `src/tui.tsx` is the terminal entrypoint: the command, the badge, the window's lifetime and
  the queue behind it.
- `src/window.tsx` is the window itself: the dialog, the parts it is drawn from, and the
  scroll and clear handling inside them. `test/tui.test.ts` pins the order of the attributes
  on its markdown element, which is a rule no other test can see.
- `src/syntax.ts` is the syntax style a fenced block in an answer is drawn with.
- `src/prompt.ts`, `src/layout.ts`, `src/quick.ts`, `src/state.ts`, `src/footer.ts` and
  `src/reveal.ts` are pure, and `test/` covers them.
- `README.md` is what a user reads.
- `docs/design.md` holds the measurement behind every rule below, plus the install
  evidence and the packaging rules. Read it before you change the dialog, the prompt, the
  install notes or the build.

## Rules that hold

Treat every rule below as load-bearing. Each rule carries its reason in a clause, and the
measurement behind the reason is in `docs/design.md`.

Write no comments in `src/`. A name says what a thing does and the module is small enough to
read whole, so a reason that cannot be seen in the code belongs in `docs/design.md` beside the
measurement that produced it. A comment left in the code is a second copy of a fact, and the two
copies drift.

### The thread

- A thread belongs to the session id it was asked in. Every question resends the whole thread,
  so a turn kept beside another session's is read as something about a conversation it is not
  being asked about. `src/state.ts` holds the threads per session id, and `test/state.test.ts`
  holds that in place.
- A side question leaves the model context of the session it is asked about untouched, because
  the question goes through `session.generate`, which writes nothing back.
- Send one question at a time and in the order they were asked, because a thread whose turns
  arrive out of order is not a thread.
- Store each turn with the count of `user` and `assistant` messages the session held when its
  answer landed. Count only those two kinds, because an `idle` marker or a `shell` call is
  something the session did, not something anyone said. The transcript draws a line between
  two turns whose counts differ, and draws it the moment a question is asked. The count comes
  from `context.data.session.message`, so a host that leaves that cache empty for a session
  shows no line at all.
- Treat an empty answer as a failure and store nothing. The failure names both causes, the
  tool attempt and a reply cut short, and repeats the question.
- Keep the thread whole. Every question resends it, and the reader decides what a side
  conversation should cost them.
- Clear a thread on `Delete`, and only on a second press, because the composer takes
  `Delete` as a forward delete and a dropped thread cannot be recovered: the first press
  puts what the second would drop in the footer, the warning goes away after four seconds,
  and `cleared` drops the turns and the failure while the queue, the request in flight and
  the draft stay.
- Keep the whole tool set in place, and let `RULES` hold tools out of a side answer. The free
  tier refuses a request that carries no real tools.

### The window

- One window serves every session and names the session it is up for. Running the command in
  another session takes the window down without ending anything, so the thread, the request in
  flight and the queue stay in their session.
- Closing the window ends the window and the queue and lets a request in flight finish. A
  deleted session calls that request off.
- Raise the window for an answer only when the reader is in the session it belongs to.
- Make the badge a handle on the window: a click on the `btw` badge in the prompt row
  opens the window for the session that row belongs to, because the badge is the only
  sign of a question the reader cannot see while it is being answered. Take the session
  from the row, and open the window the way the command opens it, with nothing asked.
- Close the plugin's own dialog on the way out, and only while that window is up, because the
  host's `dialog.clear()` closes whichever dialog is active. A terminal too short to open a
  window costs the reader the message alone.
- Write the question typed and not asked, and the reading position, on the way out, and put
  the position back only once the transcript is as tall as it was left.
- Pass cleanup as the dialog's `onClose` and keep it idempotent, because the host closes its
  own dialog on Escape and Ctrl+C and calls `onClose` for every entry it clears.
- Take the session from a slot input or a signal rather than from `router.current()`, which is
  a plain read. The badge is a component mounted for as long as there is a wait to show.

### The panel

- Keep the panel inside the terminal. `src/layout.ts` owns that arithmetic, and
  `test/layout.test.ts` holds it in place, because a cell written outside the panel is not
  repainted when the panel closes.
- Bind Home, End, PageUp and PageDown in a `mode: "modal"` keymap layer registered by the
  dialog component. The composer holds the focus, and a layer resolves ahead of a focused
  renderable, so the layer is the path that works.
- Measure the panel width from the dialog's own root box on `onSizeChange`, because the host
  chooses the panel width. The footer fits its hints to that width, longest wording first and
  the next tier down when the panel is too narrow, and draws none rather than one cut short.
  `src/footer.ts` owns that fitting, and `test/footer.test.ts` holds it in place.
- Keep the quick prompts behind one marker in the header of the window, and let the list
  of them float over the transcript rather than take rows from it, so nothing inside the
  window moves when it opens and the reading position stays where it was. The list is
  centred in the panel, because a list of prompts is read down the middle. `src/quick.ts`
  owns the prompts and the marker, and `test/quick.test.ts` holds that in place.
- Ask a quick prompt the way a typed question is asked, and leave the composer alone, so
  that a click never throws away what the reader typed. The click is a mouse up and the
  hover lightens the label, the way the host lightens its own clickable labels.
- Name `flexDirection` on every box with more than one child, since a box lays its children in
  a column otherwise.
- Name the style and the colour before the content on the answer's markdown element, because the
  renderer builds its blocks when the content lands and a block built without a style keeps none:
  the highlighter falls back to the raw source and `**` lands on screen.
- Mark the prompt row with a braille frame in `hue.interactive[200]` and then `btw`, in one
  `box flexShrink={0}` with no gap, so the row is the four cells `/btw` measures. Call that
  row the badge, and lighten it on hover the way the host lightens its own clickable labels.
