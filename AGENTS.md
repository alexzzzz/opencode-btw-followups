# @alexzzzz/opencode-btw-followups

The package is an OpenCode V2 plugin that replaces the built-in `/btw` with a side question
dialog that keeps a thread.

## Build and check

Run `bun run check` before you call a change done. It typechecks, then runs the tests, then
builds the package the npm release ships, in that order. `bun test` runs the tests alone. The
fixed long-thread benchmark is `bun scripts/benchmark-playback.ts`, and its measured result lives
in `docs/design.md`. The TUI half has only the markdown pointer probe described in
`docs/design.md`, so a change to the dialog, the command or the queue also needs one pass by hand in
a terminal.

Run `bun run release:smoke` before a release. It starts with `bun run check`, then packs a clean
source archive, installs it against the minimum and current host sets, imports every entrypoint,
and checks deployment against the real host binaries. `npm publish` runs the same gate.

The running TUI loads this plugin from `<config>/plugins/btw-followups` rather than from the
tree, so `bun run deploy` copies the sources there and `bun run deploy:check` says whether the
copy is behind. A change the copy does not hold is a change the window never shows.

## Where things are

- `src/index.ts` is the server entrypoint: it registers the reasoning setting and the transient
  generation hook that applies it to a side question. The thread itself is a terminal concern.
- `src/tui.tsx` is the terminal entrypoint: the command, the badge, the window's lifetime and
  the queue behind it.
- `src/window.tsx` is the window itself: the dialog, the parts it is drawn from, and the
  scroll and clear handling inside them. `test/tui.test.ts` pins the order of the attributes
  on its markdown element, which is a rule no other test can see.
- `src/syntax.ts` is the syntax style a fenced block in an answer is drawn with.
- `src/pointer.ts` turns one top-level block of an answer into the text a click copies, and finds
  the block under the pointer for the rail beside it.
- `src/contract.ts` is the RPC contract both halves import, and the third package export.
- `src/prompt.ts`, `src/layout.ts`, `src/quick.ts`, `src/state.ts`, `src/footer.ts`,
  `src/header.ts`, `src/interaction.ts`, `src/playback.ts`, `src/reasoning.ts` and `src/pointer.ts`
  are pure, and `test/` covers them.
- `README.md` is what a user reads.
- `scripts/config-dir.mjs` resolves the config directory reported by `opencode debug paths config`.
  Deployment and the documented examples use that answer.
- `scripts/release-smoke.mjs` holds the tested host sets and the clean pack, install, import, and
  deployment check.
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
  tool attempt and a reply cut short, and repeats the question. Put the original failed batch
  back at the front of the pending queue, pause automatic draining, and resume only when the
  reader asks a new question or retries.
- Keep the thread whole. Every question resends it, and the reader decides what a side
  conversation should cost them.
- Clear a thread on `Delete` only while no answer is active, the quick list is closed and the
  composer is empty, and only on a second press, because the composer takes `Delete` as a forward
  delete whenever it holds text and a dropped thread cannot be recovered: the first press puts
  what the second would drop in the footer, the warning goes away after four seconds, the first
  keystroke or a quick prompt, and `cleared` drops the turns and the failure while the queue,
  the request in flight and the draft stay. A paused queue stays paused until a new question.
- Keep the whole tool set in place, and let `RULES` hold tools out of a side answer. The free
  tier refuses a request that carries no real tools.

### The window

- One window serves every session and names the session it is up for. Running the command in
  another session takes the window down without ending anything, so the thread, the request in
  flight and the queue stay in their session.
- Closing the window ends the window alone and lets a request in flight finish, because a
  question that was asked is not un-asked by closing the view: the queue keeps draining while
  no window is up and answers everything that was asked. A deleted session calls that request
  off and releases its playback memory.
- Opening a window leaves a stored failure and a paused queue in place, because the reader must
  see why work stopped and choose a new question or an explicit retry before it resumes.
- Raise the window for an answer only when the reader is in the session it belongs to.
- Write out each new answer once, and only once. The computation behind the reveal runs on every
  write to the side state, not only when a turn is added, and an answer lands as two writes a
  couple of milliseconds apart, so the window remembers the turn it is playing and ignores the
  later runs for that turn. The mark of a played answer lives with the pacing in `src/playback.ts`,
  keyed by session id, so a window opened later draws a played answer whole while an answer that
  arrived behind a closed window still plays when the window opens. Reveal advances by grapheme
  cluster, with a code-point fallback that keeps surrogate pairs whole. The dialog memoizes the
  mapped turns, and only the newest answer reads the reveal signal, so older answers keep stable
  values and each tick appends only the new text.
- Hold copying of the newest answer until its reveal completes. The pointer rail may remain, but
  a click must not copy partial markdown. `copyable` at the answer-copy boundary holds this rule,
  separate from token conversion.
- Hold the newest question's first line at the top of the window while its answer is written out,
  because the transcript follows the bottom and a long answer would otherwise push its own
  question out of view: the window follows a short answer to the bottom, stops following the
  moment the question's beginning reaches the top row, and lets go when the reader scrolls by
  hand. The hold is the window's own scroll position with `stickyScroll` turned off, because the
  sticky bottom is applied again on every content size change and would push the question out on
  the next tick.
  It runs on the renderer's `frame` event, because the reveal's effect runs before layout and
  would read the height one tick behind, and it belongs to a reader who was at the bottom when the
  answer started, because a window that moves for a reader parked above fights the transcript they
  chose to read. Asking from the window brings the transcript to the end, because after a held
  answer the question just asked would land below the fold.
- Make the badge a handle on the window: a click on the `btw` badge in the prompt row
  opens the window for the session that row belongs to, because the badge is the sign of active,
  pending or failed work the reader cannot see while the window is down. Take the session
  from the row, and open the window the way the command opens it, with nothing asked.
- Close the plugin's own dialog on the way out, and only while that window is up, because the
  host's `dialog.clear()` closes whichever dialog is active. A terminal too short to open a
  window costs the reader the message alone.
- Write the draft on the way out, which is the question typed and not asked and never the
  question a recall left standing, because a recalled question is one the reader has not
  decided to ask. Write the reading position too, and put it back only once the transcript is
  as tall as it was left.
- Pass cleanup as the dialog's `onClose` and keep it idempotent, because the host closes its
  own dialog on Escape and Ctrl+C and calls `onClose` for every entry it clears.
- Take the session from a slot input or a signal rather than from `router.current()`, which is
  a plain read. The badge is a component mounted for as long as there is a wait to show.

### The panel

- Keep the panel inside the terminal. `src/layout.ts` owns that arithmetic, and
  `test/layout.test.ts` holds it in place, because a cell written outside the panel is not
  repainted when the panel closes.
- Bind Ctrl+Home, Ctrl+End, PageUp and PageDown in a `mode: "modal"` keymap layer registered
  by the dialog component. The composer holds the focus, and a layer resolves ahead of a
  focused renderable, so the layer is the path that works. Leave bare Home and End to the
  composer, because the host prompt keeps them for the ends of the input and jumps the
  messages on them only while nothing is focused, so taking them makes the field unlike every
  other one in the host.
- Recall what was asked in the side thread, newest first, and keep it when the thread is
  cleared, because a clear drops what the thread resends and not what the reader typed. Up and
  Down move the cursor through the composer first, and only a press that has nowhere to go
  walks the list: Up at the very start of the text, Down at its very end. A press on the first
  line that is not at its start goes to the start, and one on the last line that is not at its
  end goes to the end, so the key means the same thing on every line. The walk saves what was
  typed and puts it back when it leaves the newest question. A press with nothing left to recall
  leaves the cursor where it is, because `Down` is cursor movement and the quick list has its own
  keys, `Ctrl+Up` and the marker in the header, and a draft in the field stays where it is.
  `src/state.ts` holds the list beside the thread, `src/history.ts` owns the walk, and
  `test/history.test.ts` holds it in place.
- Take Up and Down in the same modal layer, because the composer is resolved after the layer:
  moving the cursor there is the dialog's own call, and the key must not reach the session
  behind the window. Hold both off while the quick list is open, and return `false` rather
  than taking `Delete` while the composer holds text, so that key stays a forward delete.
- Measure the panel width from the dialog's own root box on `onSizeChange`, because the host
  chooses the panel width. The footer fits its hints to that width, longest wording first and
  the next tier down when the panel is too narrow, and draws none rather than one cut short.
  `src/footer.ts` measures the room and `src/interaction.ts` owns the table and the tiers, and
  `test/interaction.test.ts` holds them in place.
- Name a key only when the reader cannot reach it by habit. `PageUp`, `PageDown`, the wheel,
  `Enter` to send and `Up` for history mean here what they mean in the host prompt, so the row
  leaves them out. What it names is what the host does not teach: `ctrl+home/end jump`, because
  `Home` and `End` belong to the composer here and to the messages only while nothing is focused,
  and it appears only while the transcript runs past the window; `ctrl+up/down prompts`;
  `delete clear thread`; `enter queues` while a question is out; `enter retry` while a failed
  queue is paused; and `ctrl+shift+c copy thread`. Two facts make four modes: a question is out or
  nothing is out, and the composer holds text or it does not. The prompt list is named only over
  an empty composer. The clear is named only over an idle, empty, unlisted composer with a turn in
  it, because the first keystroke closes the list, `Delete` is a forward delete while the field
  holds text, and the key does nothing on an empty thread. A question out turns the verb into
  `enter queues` and takes the clear out, since a clear under a streaming answer drops the thread
  that answer belongs to. The row gives up the copy first, then the clear, the jump and the list.
  Retry stays beside the remaining hints until only the jump fits. The header's `esc close` covers
  the escape in every mode that fits the panel, so the row spends nothing on it.
  Read the composer's text on the renderer's `frame` event rather than from a signal, because the
  host's textarea reports typing alone and a recall, the draft put back at mount and the submit
  that empties the field all write it without a word.
- Fit the header the same way, because a row wider than the panel wraps mid-word rather than
  clipping. The count goes first, then the reasoning state, and `docs/design.md` holds the
  measured order in which the remaining cells give way. `src/header.ts` owns that fitting, and
  `test/header.test.ts` holds it in place.
- Keep the quick prompts behind one marker in the header of the window, and let the list
  of them float over the transcript rather than take rows from it, so nothing inside the
  window moves when it opens and the reading position stays where it was. While the list is
  open the window takes the rows the terminal has left over, never more than the list needs,
  because a composer shorter than its cap leaves rows that would otherwise go unused. The list
  is a block of its own width, centred under the header, lifted off the transcript by the raised
  background and a blank row rather than by a frame. `src/quick.ts` measures the width and wrapped
  rows from the prompt text, panel width, number column, gap and padding. The padded dress is used
  only when it fits the transcript room, and a list that still does not fit becomes a scroll
  viewport that keeps the chosen prompt's first row visible. `src/layout.ts` owns the rows the open
  list may take, and `test/quick.test.ts` and `test/layout.test.ts` hold that in place.
- Make the list answer the keyboard as well as the mouse: Down moves the pick and wraps from the
  last prompt to the first, Up moves it back and wraps from the first to the last, Enter asks
  the picked prompt, Esc closes the list and leaves the window standing, and a hover puts the pick
  under the pointer. Both arrows wrap, because an arrow that turns into a way out drops the list
  under a reader who is walking it, and Esc is the way out every list in the host answers. The
  pick is the row in the base colour with an accent number; the rest stay muted and faint. The
  bindings sit in the modal layer beside the scroll keys and are enabled only while the list is
  open, so Enter still asks a typed question and the arrows still move the cursor otherwise.
  `nextChoice` in `src/quick.ts` moves the pick, and `quickChoiceScroll` keeps that pick inside
  the viewport. `test/quick.test.ts` holds both in place.
  Delete is held off while the list is open, so a menu never drops the thread behind it.
- Close the list on the first keystroke in the composer, because a reader who starts typing has
  decided that none of the prepared questions says what they want, and the list is then something
  to read past rather than something to pick from. Ask the pick on `Enter` while the list is up,
  even over a filled composer, and leave that text in the field: a list open beside text was
  opened on purpose, because the keystroke that filled the field put it down and only `Ctrl+Up` or
  the marker brings it back, so the open list is the decision to pick and the question being
  written goes out after it, from the list down. `Esc` puts the list down and leaves the text for
  the field's own submit.
- Ask a quick prompt the way a typed question is asked, and leave the composer alone, so
  that a click never throws away what the reader typed. The click is a mouse up, the way the
  host sends its own. Starting the request disarms an armed clear warning.
- Keep a failed question in the transcript with a `retry question` label, and let `Enter` retry
  it while the composer is empty. Both actions resume the preserved queue and leave the main
  conversation untouched.
- Draw no frame of your own. The host draws the panel's frame, and a second box inside it reads
  as a box inside a box; separate a floating part with the raised background and a blank row
  instead. The left rails are lines rather than frames, and they stay.
- Name `flexDirection` on every box with more than one child, since a box lays its children in
  a column otherwise.
- Name the style and the colour before the content on the answer's markdown element, because the
  renderer builds its blocks when the content lands and a block built without a style keeps none:
  the highlighter falls back to the raw source and `**` lands on screen.
- Mark the prompt row with a braille frame in `hue.interactive[200]` and then `btw`, in one
  `box flexShrink={0}` with no gap, so the row is the four cells `/btw` measures. Call that
  row the badge, and lighten it on hover the way the host lightens its own clickable labels.

### The answer under the pointer

- Copy one top-level piece of an answer on a click, because that is the unit the renderer builds
  and the unit a reader wants: `renderNode` hands each top-level block its own renderable and
  inline tokens never reach it, so a click on a bold word is a click on its paragraph.
  `src/pointer.ts` turns the token into plain text and `test/pointer.test.ts` holds it.
- Treat the newest answer as copyable only after its reveal completes. The rail may remain, but
  `pointerAt` returns no copy text while its `copyable` guard is false. Older answers keep the
  completed copy path.
- Return the renderable `defaultRender` built, with the handler set on it, rather than a box of
  the plugin's own around it: a wrapper turns `canUpdateInPlace` off and the reveal rewrites the
  content once per step for a second and a half, so every block would be rebuilt on every step.
- Read the text at the click from the block's `_blockStates` entry, not from the closure, because
  a block updated in place keeps the text it was built with and a paragraph that grew still
  copied the short one.
- Keep the rail in the gutter the answer already had, one cell of it and one cell of padding, so
  the text width does not move when the pointer arrives; draw `top` blank lines and one line per
  row of the block, so a rail never makes the row taller than the answer already was.
- Read the pointer from the event's cell coordinates, because a block reports its `mouse out`
  after the next block's `mouse move`, so clearing on the out alone blanks the rail under a
  pointer that has just arrived. Clear it on the wheel too, because a scrolled transcript moves
  the block out from under a pointer that has not moved.
- Draw the rail in `text.muted` and not in the accent, because the accent already says "this is
  what you asked" on the question's rail, and the reader should not have to tell two accents
  apart.
- Hold the rail off, and hold the block copy, the quick prompts and whole-thread copy off, while a
  selection is being dragged or already holds text, because a reader who drags to copy by hand is
  not asking for the block. `selecting()` in `src/window.tsx` is the one guard behind all four.

### The session prompt

- Open the window from the open session on `Ctrl+Up`, because a dialog is the only layer the
  host draws over a session and a plugin has no other way in that leaves the conversation alone.
- Keep that command out of the window's way: it is disabled while a window is up, because a
  global layer can otherwise take the key before the dialog's own layer sees it.
- Open the quick prompts on `Ctrl+Up` inside the window, the way the `btw` marker in the header
  toggles them, because the key reaches the dialog before anything behind it and the composer
  keeps the arrows, `Home` and `End` for the cursor.
- Mirror it on `Ctrl+Down`: the list goes down on that key, and the window goes down once the
  list is already down, because `Ctrl+Up` is the way in at both levels and the way out should
  read the same. The host binds no `Ctrl+Down`, so the key is free. `src/interaction.ts` holds both
  keys in its table and decides whether the session command may open the window at all, and
  `test/interaction.test.ts` holds it in place.
- Ask a pick in the side thread, which is what both a click and `Enter` do, because the prompts
  are the window's own and a side question leaves the conversation alone.
- Copy the whole thread on `Ctrl+Shift+C`, from the "Copy the whole side thread" command palette
  action and from `copy thread` in the footer. The key is free in the supported host keymaps, and
  every path keeps the selection guard and the existing clipboard feedback.
- Report the unsupported reasoning state from the toggle instead of changing the setting, because
  a setting changed where it cannot take effect has no visible result, and a reader told that
  reasoning is off while the answer still thinks has been told something false. The header cell
  and the palette action are one toggle, and the state is global to the plugin.
- Use the cheapest level the catalogue offers when it cannot turn reasoning fully off, because the
  catalogue names the value the provider accepts and a level of `high` or above is the default the
  reader already pays. The header and the toast name that level, and a model with no usable level
  stays unsupported. `src/reasoning.ts` owns the choice, and `test/reasoning.test.ts` holds it.
