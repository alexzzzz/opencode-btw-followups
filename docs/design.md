# Design notes

Reference behind every decision in this plugin. Read it before you change the dialog, the
prompt, the install notes or the build, because each item below cost a measurement to find.
The sources carry no comments: a name says what a thing does, and this file says why it is
shaped that way. `README.md` carries what a user sees.

## What the host does not expose

Checked against the published types of `@opencode/plugin` and `@opentui/core`, version 2.0.22
and 0.5.17, and against the loader in the host's own plugin source. Do not design around
these as if they might appear.

- `session.generate` writes nothing back into the session. There is no server-side thread
  to read or write, so the thread travels inside the prompt, and a side question never moves
  the session's message count by itself.
- A tool called during `session.generate` is never executed, and the reply comes back empty.
  The host offers the agent's tools but has nowhere to put a result, and it writes nothing
  back, so an executed tool would leave no trace in the session either.
- The answer arrives as one string, and the session event stream carries nothing while the
  call runs. True streaming is not available, so the newest answer is revealed on a timer.
- The host keeps its syntax style private, so a fenced block has no colour unless the plugin
  registers one.
- The `spinner` element exists in the host but is not in the element catalogue a plugin may
  use.
- The dialog host gives a panel no height limit, so the height cap lives here. It is read as
  the window draws rather than captured when the window opens, because a terminal that
  shrinks under an open window has to take the panel down with it. The message count a turn
  is compared against is read the same way, since the line under the newest answer is about
  the session as it stands.
- `text.base` and `markdown.text` both resolve to `$hue.neutral.200`, so colour cannot tell
  a question from an answer.
- `InputRenderable.submit` invokes its listener with `{}`, so a field that owns its value
  reads the field rather than the event.
- The dialog lives in the host's own stack, not in this plugin. Cleanup has to close it, or
  a hot reload leaves it drawing from state that no longer exists.
- A new `plugins` array entry takes effect only when the server builds its plugin list at
  startup. `opencode reload` does not rebuild that list.
- Directory junctions and symbolic links under `<config>/plugins/` are not discovered. That
  directory has to hold real files.
- A plugin carries no version of its own. The loader reads a version from the package it
  installed, and a plugin loaded from a directory has none. The plugin contract is an id
  and a setup function, and there is nowhere in it to put a version.

## Tools

A side question must not run a tool, and saying so in the prompt does not always hold. A
model that means to do something announces it, then reaches for the tool, and the reply
ends empty.

The measurement was taken on the free tier at provider `opencode`, with the same session,
the same model and the same prompt, in one process and with no restart. Fourteen tools left
in place answered every request. An emptied tool set came back as a 503, and so did a
removed one, and so did a single tool put in their place. The gate reads a request that
carries no real tools as one that did not come from OpenCode, and turns it away.

So the tools stay, and the rule in `RULES` is all that holds them. A model that ignores the
rule costs the reader one empty answer, which the dialog reports with the question attached.
Measure again on the tier the reader is on before anything here changes the tool set.

Several answers in a row are not built. They would need the model to signal that it wants
another turn, and a tool call is the only such signal the host supports here. A text marker
would work and was not wanted.

## Clearing the thread

`Delete` drops the thread, and it is also the key a focused textarea takes as a forward
delete. A `mode: "modal"` keymap layer resolves ahead of the focused renderable, which is
what lets the window take the key at all, so binding it costs the composer that key. The
host's input keymap binds `Ctrl+D` and `Shift+Delete` to the same forward delete, and the
window does not take either.

One press would therefore sit one careless keystroke away from throwing away a conversation
that cannot be recovered, so the drop waits for a second press within four seconds and the
footer carries the warning while it waits. Autorepeat must not confirm the warning it just
armed. Under the kitty protocol the host marks a repeat with `eventType: "repeat"`, and those
are ignored; a terminal without that protocol sends the same press again with no marker at
all, so the second press must also arrive at least 300 ms after the first, which is longer
than keyboard autorepeat ever takes.

The warning takes the footer row: on the shortest terminal `transcript()` allows the panel
is already full once the composer has grown to `COMPOSER_ROWS`, and one more row would push
cells past the panel edge. The footer is the row that is always on screen, so it takes the
warning whole for those four seconds.

What a clear leaves alone is deliberate. The turns and the failure go, because the failure
names a question that is not in the thread. A request already sent is not called off and its
answer joins the emptied thread, the queue keeps what has not gone out, and the draft stays:
the reader asked to drop the history, not the work in progress. A clear also resets the
reveal timer and the "new answers below" notice, since both count turns that are gone.

## The badge in the prompt row

The badge is the `btw` the plugin draws in the host's prompt row, and it is the reader's
only way back to a question that is being answered while the window is down.

The evidence was taken against OpenCode 2.1.2 and its `@opencode/plugin` 2.1.2, whose slot
map publishes `prompt.footer.status` with the session id, the mode and the details flag,
and against `@opentui/core` 0.5.14 and 0.6.6.

- The slot is drawn in the prompt's footer row, beside the label of the working directory
  (`packages/tui/src/component/prompt/index.tsx`). The host makes that label clickable
  with `onMouseOver`, `onMouseOut` and `onMouseUp` on the text, and lightens it while the
  pointer is on it, so the badge follows the same convention: a mouse up opens, and the
  text brightens on hover.
- OpenTUI has no `onMouseClick`. The handlers are `onMouse`, `onMouseDown`, `onMouseUp`,
  `onMouseMove`, `onMouseOver`, `onMouseOut`, `onMouseDrag`, `onMouseDragEnd`,
  `onMouseDrop` and `onMouseScroll`, and an event bubbles up the tree of renderables until
  it is stopped. The handlers therefore sit on the box that holds the two texts, and a
  click on either of them reaches it.
- A click that ends a text selection is not a click on the badge. The host makes that
  guard for its own labels, and so does this one.
- The host's dialog covers the screen with a backdrop that takes the mouse up
  (`packages/tui/src/ui/dialog.tsx`), so the badge cannot be clicked while any dialog is
  up. That is the case the badge is drawn for anyway: the window for that session is
  down, or it is up for another session.
- The host can have the mouse turned off, with `mouse: false` in its config. The badge is
  then drawn and cannot be clicked, and the reader has the command.

## The quick prompts

The quick prompts are the prepared questions the window offers, so that a reader who wants to
know how it is going does not have to write the question down first. They sit behind one
marker in the header of the window: the marker opens the list of all of them, centred in the
panel, floating over the transcript.

The evidence was taken against OpenCode 2.1.2 and `@opentui/core` 0.5.14.

- The panel is the host's `large` dialog, which is 88 cells wide
  (`packages/tui/src/ui/dialog.tsx`, `dialogWidth`). The prompts are 16 to 32 cells long,
  so each of them takes a row of the list and none of them is cut.
- The marker sits between two spacers in the header row, so it lands in the middle of the
  row: it is where the reader already looks, and a row of its own would cost the panel a
  row.
- The list is an absolute child of the panel: a row below the header, the panel's own
  width, and a `zIndex` above the transcript. An absolute child is taken out of the parent's
  flow, so nothing inside the window moves when the list opens. The transcript keeps its
  size, its scroll position and the reader's place in it.
- The list carries the panel's own background, because the transcript is drawn under it.
- The click is a mouse up, because that is the click OpenTUI sends, and the hover lightens the
  label the way the host lightens its own clickable labels. A click that ends a text selection
  is not a click on a prompt, and the host makes that guard for its own labels.

## The markdown of an answer

The answer is drawn by the host's own markdown renderer, which takes the content and the
syntax style and builds one block per top-level piece of the answer. The order of those
two props is load-bearing, and the host writes its own markdown the same way: the style
first, the content after it.

The renderer builds its blocks when the content lands. A block built without a style keeps
none: the highlighter is handed an undefined style, throws, and the renderer falls back to
the raw source, so `**`, `#` and backticks land on screen.

The measurement was taken against `@opentui/core` 0.5.17, the version OpenCode 2.0.32
carries, with the host's own test renderer and an answer that carries a heading, a bold
paragraph and a numbered list. The plugin's order, `content` before `syntaxStyle`, printed
the list items as raw markdown and logged `Code highlighting failed, falling back to plain
text: TypeError: undefined is not an object (evaluating 'syntaxStyle.getStyle')`. The host's
order printed the same answer with the list marker, the bold and the inline code styled.

The list is the piece that breaks and the paragraphs are not. When the style lands after
the blocks are built, the renderer hands the style to the blocks it already has, and the
paragraphs and the heading take it. The list is a box of its own, and its rows are only
rebuilt when their text changes, so the rows keep the style they were built without.

A reopened window shows it and an answer that arrives in front of the reader does not. The
reveal writes the content again and again, and a later write rebuilds the list, which picks
the style up on the way. A reopened window writes the content once, so the list keeps what
it was built with. An answer short enough to arrive in one write breaks the same way on
the first display.

The colour is read from the same place as the style, so it goes before the content too.

## The answer as it arrives

`session.generate` returns the finished text in one response, so the newest answer is written
out on a timer rather than streamed. The step is one character until an answer passes ninety,
and then a ninety-fifth of it, so every answer takes about a second and a half however long it
is. The first chunk lands in the same tick the answer arrives: starting from zero left a gap
between the spinner going out and the first character, and an answer short enough to arrive in
one write had nothing under the question until the timer ran.

Only the newest turn is written out again. An older one is drawn whole, and a window reopened
over a thread draws every turn whole, so a half-revealed answer never leaves markdown's control
characters on screen. The pacing is in `src/reveal.ts` and `test/reveal.test.ts` holds it.

The reveal is also what keeps the markdown of a finished answer right: a later write rebuilds
the list block, and the block picks the syntax style up on the way, which is the case described
above.

## The footer row

One row, one job. While a clear waits for its second press the row is the question and nothing
else, because a warning read beside four hints is not read at all.

The hints are fitted to the panel rather than abbreviated, because `pgup` is a word the reader
has to decode. The panel's width is measured from the dialog's root box, the fixed parts of the
row are taken off it, and the first tier that fits is drawn; the shortest tier names only the
key that clears the thread, and a panel too narrow even for that gets no hint at all.

A hint is never cut short. OpenTUI lays each text out at its own width, so a row that runs past
its room does not clip, it overlaps: a phone-sized terminal gave the dialog about fifty cells,
which leaves the footer twenty-six beside `nothing to copy`, and the two-key tier needs
forty-one. The screenshot that showed it read `nothing to page up/ scrolldele clear t`. That arithmetic is in `src/footer.ts` and `test/footer.test.ts` holds it.

A reader parked above the newest answer is told what arrived below and offered the way down,
because `stickyScroll` follows new content only from the bottom and the transcript deliberately
does not move for them. Reading by hand clears the notice, so the footer never nags a reader who
has already found the answer themselves.

## The queue behind the window

One request at a time per session. The questions asked while one is out go out together as the
next one, numbered by `thread`, so they are answered as a list rather than as one run-together
question.

The loop drains the queue once more on its way out, because a question asked in the tick between
the last answer and the end of the loop finds the session busy, lands in the queue, and would
otherwise be sent by nothing.

An empty answer stops the queue with the question in the failure, and an error stops it too:
answering more questions against a gap in the thread is worse than stopping. A deleted session
calls its request off and is not reported, because there is no conversation left to answer
about.

## What the window says

The header names the model that will answer, read from the session the window belongs to,
because `session.generate` is answered by that session's model and the prompt's own selection
follows the route the reader may have walked away from. A model the catalogue does not know
falls back to its own id.

A toast the host refuses is swallowed. Every path that shows one has either written what matters
into the session's state or has nothing else to say it with, and a throw from a click handler
would replace the message the reader needed with one they cannot act on.

## Install notes

The evidence behind the checkout instructions in `README.md`.

- An entry counts as a local path when it starts with `file://` or `.`, or when it is
  absolute, which on Windows includes `C:/repos/thing`. Everything else is an npm package
  name.
- A directory target must hold a `package.json` or an index file, or it is skipped with
  `Plugin directory ... is missing package.json or index file`.
- The loader takes the terminal half from `exports["./tui"]`, and the server half from
  `exports["./server"]` falling back to `main`.
- Plugins under `<config>/plugins/` are discovered with no config entry and do reload on
  change.
- The directory form needs the two entrypoints and every module they import, and all of
  them have to be copied again on every change:

  ```sh
  mkdir -p ~/.config/opencode/plugins/btw-followups
  cp src/*.ts src/*.tsx ~/.config/opencode/plugins/btw-followups/
  ```
- The directory form runs the unbuilt sources, and the host picks the reload up from the file
  change. A TUI left open across a reload keeps the old dialog on the host's stack.
- A plugin installed from a directory shows as `local` in `opencode plugin list` and in the
  plugins dialog. A version appears there only for a plugin installed from npm, because the
  version belongs to the package the host installed.
- The oldest host the README names is OpenCode 2.0.19. Its `@opencode/plugin` 2.0.19 already
  carries the three calls the terminal half makes, `dialog.set` with `size` and `centered`,
  `ui.slot` and `keymap.layer`. The `@opentui/core` 0.5.12 that host ships has the markdown
  renderable with `internalBlockMode`, so the answer keeps its blocks.

## Packaging

`exports` points at `dist/`, built by `scripts/build.mjs`, rather than at the TypeScript
sources the documentation shows. The documented form relies on the host compiling the JSX,
which it only does for a plugin it loads from a directory. Installed from npm there is no
compiler, and the terminal half fails to load with a missing `react/jsx-dev-runtime`.

Discovery by filename is a separate mechanism. `<config>/plugins/<dir>/index.ts` and
`tui.tsx` are read directly, so the directory form runs the unbuilt sources and is unaffected
by where `exports` points.

Three Solid compiler settings in the build script are load-bearing. The check for all three
is to import the built output from a plain Bun process and compare the emitted imports with
those of a published OpenCode plugin.

- `generate: "universal"`, because the host is a custom renderer rather than a browser. It
  emits `insertNode`, `spread`, `setProp` and `createElement` instead of the DOM helpers.
- `moduleName: "@opentui/solid"`, so those helpers are asked of the runtime the host
  provides. With the default the output imports them from `solid-js/web` and fails on a
  missing export.
- `delegateEvents: false`, because with delegation on the compiler emits an
  `addEventListener` import from the runtime module, and `@opentui/solid` exports none.

Do not change one without importing the built output from a plain Bun process and checking
that it still loads.

## Verification

The pure modules are covered by tests, and they are the primary seam: the prompt the thread
travels in, the height arithmetic that keeps the panel on the terminal, the store that keeps one
thread per session, the footer's fitting arithmetic and the pacing of the reveal.

The packaging is verified by packing the tarball, installing it into an empty project, and
importing each entrypoint.

The TUI half is verified by hand: rendering, scrolling, the composer, the spinner, the
command, the click on the badge that opens the window, the row of quick questions, the list
they open, a quick question asked by a click, switching sessions with a window
up, the line between two exchanges, the markdown of an answer that has finished being
written, the markdown of that same answer after the window was closed and opened again,
and the two presses that clear a thread.

## The picture in the README

`docs/btw-window.png` is a render of the dialog, not a drawing of it. The dialog is
mounted for real inside the host's own dialog frame, with the host's theme and the host's
markdown renderer, and the frame is captured from the terminal buffer. The picture is drawn
from the captured spans, so it carries the colors a reader sees.

Two things have to be right for that render, and both were found the hard way. The dialog
needs the client build of `solid-js`, which is the one the host serves. The server build
returns an empty string from `Show`, and the reconciler then tries to draw that string into
a box, which fails with `Orphan text error`. And the tree-sitter client needs
`web-tree-sitter`, without it the markdown falls back to the raw source and the answer
arrives with its `**` on screen.
