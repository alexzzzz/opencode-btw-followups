# @alexzzzz/opencode-btw-followups

An OpenCode plugin that gives side questions a thread of their own.

[![npm](https://img.shields.io/npm/v/@alexzzzz/opencode-btw-followups)](https://www.npmjs.com/package/@alexzzzz/opencode-btw-followups)

## Contents

- [What does it do?](#what-does-it-do)
- [Why use it?](#why-use-it)
- [Getting started](#getting-started)
  - [Keyboard shortcuts](#keyboard-shortcuts)
- [Working in the window](#working-in-the-window)
- [Things to keep in mind](#things-to-keep-in-mind)
- [Agent instructions](#agent-instructions)
  - [Install](#install)
  - [Update](#update)
  - [Remove](#remove)
- [License](#license)

## What does it do?

The plugin replaces OpenCode's built-in `/btw` with a separate window for side questions. It keeps every question and answer in that window and sends the whole thread with each new question. Follow-up questions build on earlier answers, while your main session stays untouched.

## Why use it?

The built-in `/btw` answers one question, then forgets the exchange. A follow-up starts from scratch. Asking a side question in the main session also adds the question and answer to the session's context and transcript, which is not always what you want.

If you only have one question to ask, the built-in `/btw` is all you need.

## Getting started

In the session prompt, type `/btw` followed by your question:

```text
/btw why does the ci fail on the second test?
```

If you'd rather open the window first, run `/btw` on its own, then type your question inside the window.

### Keyboard shortcuts

From a session, you can use these shortcuts:

1. Press `Ctrl+Up` to open the window.
2. Press `Ctrl+Up` again to open the quick prompts. Use `Up` and `Down` to choose one, then press `Enter`, or click a question.
3. Press `Ctrl+Down` to close the quick prompts.
4. Press `Ctrl+Down` again to close the window.

The same shortcuts work in subagent sessions, so you can ask your subagents side questions, too.

![The /btw window with the quick prompts open over a long thread](docs/btw-window.png)

## Working in the window

Ask follow-up questions as you would in a normal chat. Each new question includes the earlier questions and answers, so the model has the context it needs.

Use `PageUp`, `PageDown`, or the mouse wheel to read a long thread. Click one part of an answer to copy that section. To copy the whole thread, use `copy thread`. To clear the thread, press `Delete` twice while the input field is empty.

![The btw badge in the status bar](docs/btw-badge.png)

If you close the window while an answer is being prepared, a `btw` badge appears below the input field. Click it to open the window for that session. You can close the window at any time and come back to it later.

## Things to keep in mind

- **Model and context:** The window uses the same model as your session. Each new question sends the whole side thread, so a long thread uses more context. If your session is already close to its context limit, a side question may fail. Side questions and answers stay out of the session's context and transcript.
- **Tools:** The model cannot use tools in the side window. It cannot read files, run commands, or take other actions. If it tries to use a tool, the answer may fail, and the window shows the question that failed.
- **Storage:** Threads are kept in memory only. They are lost when OpenCode stops or when you delete the session.
- **Terminal:** The window needs a terminal that is at least 15 rows tall.

## Agent instructions

Each block below is self-contained. Copy only the block you need.

### Install

```text
Goal: install @alexzzzz/opencode-btw-followups and make `/btw` use it instead of the built-in command.

1. Run `opencode plugin add @alexzzzz/opencode-btw-followups`.
2. Open `cli.json` in the global OpenCode config (`~/.config/opencode`; Windows: `%USERPROFILE%\.config\opencode`) and add `-opencode.btw` to `plugins`. Keep every other entry. This turns off the built-in `/btw`; without it both answer the same command.
3. Run `opencode plugin list` and check that `btw-followups` is listed.
4. Run `opencode reload`.
5. Ask the user to run `/btw` and check that the plugin window opens.

Done when `/btw` opens the plugin window.

If `cli.json` is missing, create it with `{"$schema":"https://opencode.ai/v2/cli.json","plugins":["*","-opencode.btw"]}`. If a command fails, report it instead of guessing.
```

### Update

```text
Run `opencode plugin update @alexzzzz/opencode-btw-followups`.
```

### Remove

```text
Goal: remove @alexzzzz/opencode-btw-followups and restore the built-in `/btw`.

1. Run `opencode plugin remove @alexzzzz/opencode-btw-followups`.
2. Open `cli.json` in the global OpenCode config (`~/.config/opencode`; Windows: `%USERPROFILE%\.config\opencode`) and remove `-opencode.btw` from `plugins`. Keep every other entry. This lets the built-in `/btw` load again.
3. Run `opencode plugin list` and check that `btw-followups` is gone.
4. Run `opencode reload`.
5. Ask the user to run `/btw` and check that the built-in command opens.

Done when `/btw` opens the built-in command.

If `cli.json` is missing, the built-in `/btw` is already on. If `btw-followups` still appears with a local path, report it and do not delete files. If a command fails, report it instead of guessing.
```

## License

[WTFPL v2](LICENSE)
