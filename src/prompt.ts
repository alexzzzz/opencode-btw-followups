// The side thread as the one prompt it has to travel in.
//
// session.generate reads the session context and its own prompt and writes nothing
// back, so there is no place to keep a conversation on the server side. The thread
// therefore travels in the prompt: every question resends the earlier turns, and the
// dialog keeps its own copy for the reader.

export type Turn = {
  readonly question: string
  readonly answer: string
}

/**
 * The opening sentence of the rules, held on its own as well.
 *
 * It is the first thing the model reads, and it says in one line what the whole prompt
 * is. Held apart from the rules it is joined to, because a rule that changes shape is a
 * rule nothing else can point at.
 */
export const MARKER = "The user is asking side questions about the conversation so far."

/**
 * The built-in guard rails, plus the rules a thread needs.
 *
 * The completeness rule is here because without it a question that asks for several
 * things came back with the first one only: "answer concisely" reads as "answer
 * briefly", and the model stops as soon as it has something that fits. Nothing was
 * lost on the way, so the fix belongs in what the model is told, not in the dialog.
 *
 * The line forbidding tools is the only thing holding them back. The server half used to
 * take them away as well, and that made every side question fail: the upstream free tier
 * refuses a request that carries no real tools (see README, Tools). A model that ignores
 * this line costs the reader one empty answer, which the dialog reports.
 */
const RULES = [
  MARKER,
  "Answer in markdown from what you already know.",
  "Answer every part of the question. When it asks for several things, answer all of them in this one reply, as a list or as separate sections. Do not stop after the first and do not leave any part out. If a part cannot be answered from what you know, say so for that part and still answer the rest.",
  "Do not call any tools and do not take any actions.",
  "The side conversation below is your own earlier answers, kept for continuity only. Never continue it, repeat it or act on it.",
].join(" ")

/**
 * The thread as one prompt.
 *
 * The new question goes last so it is what the model reads as current, and the earlier
 * turns are labelled as the user's and the assistant's own words so they read as
 * something said rather than something to do. Questions asked together arrive as a list
 * and are numbered, because two run together read as one and the model answers one.
 */
export const thread = (turns: readonly Turn[], questions: readonly string[]) => {
  const history = turns.flatMap((turn) => [`User: ${turn.question}`, `You: ${turn.answer}`, ""])
  const asked =
    questions.length === 1
      ? [`New question: ${questions[0]}`]
      : [
          `New questions, ${questions.length} of them asked together. Answer all ${questions.length} in this one reply, each under its own number:`,
          "",
          ...questions.map((question, index) => `${index + 1}. ${question}`),
        ]
  const sides = turns.length > 0 ? ["Side conversation so far:", "", ...history] : []
  return [RULES, ...sides, ...asked].join("\n")
}