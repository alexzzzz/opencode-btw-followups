# @alexzzzz/opencode-btw-followups

An OpenCode plugin for side questions that keeps a thread.

[![npm](https://img.shields.io/npm/v/@alexzzzz/opencode-btw-followups)](https://www.npmjs.com/package/@alexzzzz/opencode-btw-followups)

## What is it?

This plugin replaces the built-in `/btw` with a separate window for side questions. It keeps the questions and answers and sends them with each new question, so follow-up questions build on the earlier answers. The main session does not change.

## Why does it exist?

The built-in `/btw` answers one question and forgets the exchange. A follow-up question starts again from zero. If you ask a side question in the session, the question and answer go into the session's context and transcript.

If you only need one question, the built-in `/btw` is enough.

## How do I install it?

Run this command, or ask your coding agent to install the plugin:

```sh
opencode plugin add @alexzzzz/opencode-btw-followups
```

## How do I use it?

In the session prompt, type `/btw` and your question:

```text
/btw why does the ci fail on the second test?
```

To open the window first, run `/btw` with no text, then type only your question inside it.

You can also use these keys in a session:
1. Press `Ctrl+Up` to open the window.
2. Press `Ctrl+Up` again to open the quick prompts. Use `Up` and `Down` to choose one, then press `Enter`, or click a question.
3. Press `Ctrl+Down` to close the quick prompts.
4. Press `Ctrl+Down` again to close the window.

**BONUS:** `Ctrl+Up` and `Ctrl+Down` also work in subagent sessions. You can ask subagents questions, too.

![The /btw window with the quick prompts open over a long thread](docs/btw-window.png)

## What can I do in the window?

You can ask follow-up questions. The earlier questions and answers are sent with each new question.

Use `PageUp`, `PageDown`, or the mouse wheel to read a long thread. Click one part of an answer to copy it, or use `copy thread` to copy the whole thread. Press `Delete` twice in an empty input field to clear the thread.

![The btw badge in the status bar](docs/btw-badge.png)

When the window is closed, the `btw` badge appears in the status bar below the input field while an answer is being prepared. Click it to open the window for that session. You can close the window at any time and return to it later.

## What are the limits?

- **Model and context:** The window uses the same model as the session. Each new question sends the whole side thread, so a long thread uses more context. If the session is already close to the context limit, a side question can fail. The side questions and answers do not go into the session's context or transcript.
- **Tools:** The model cannot use tools in the side window. It cannot read files, run commands, or take other actions. If it tries to call a tool, the answer can fail, and the window shows the question that failed.
- **Storage:** The thread is kept only in memory. It is lost when OpenCode stops or when you delete the session.
- **Terminal:** The window needs a terminal that is at least 15 rows tall.

## License

[WTFPL v2](LICENSE)
