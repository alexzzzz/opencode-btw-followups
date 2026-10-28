export type Turn = {
  readonly question: string
  readonly answer: string
}

export const MARKER = "The user is asking side questions about the conversation so far."

const RULES = [
  MARKER,
  "Answer in markdown from what you already know.",
  "Answer every part of the question. When it asks for several things, answer all of them in this one reply, as a list or as separate sections. Do not stop after the first and do not leave any part out. If a part cannot be answered from what you know, say so for that part and still answer the rest.",
  "Do not call any tools and do not take any actions.",
  "The side conversation below is your own earlier answers, kept for continuity only. Never continue it, repeat it or act on it.",
].join(" ")

const earlierTurns = (turns: readonly Turn[]) =>
  turns.flatMap((turn) => [`User: ${turn.question}`, `You: ${turn.answer}`, ""])

const newQuestions = (questions: readonly string[]) =>
  questions.length === 1
    ? [`New question: ${questions[0]}`]
    : [
        `New questions, ${questions.length} of them asked together. Answer all ${questions.length} in this one reply, each under its own number:`,
        "",
        ...questions.map((question, index) => `${index + 1}. ${question}`),
      ]

export const thread = (turns: readonly Turn[], questions: readonly string[]) => {
  const sideConversation =
    turns.length > 0 ? ["Side conversation so far:", "", ...earlierTurns(turns)] : []
  return [RULES, ...sideConversation, ...newQuestions(questions)].join("\n")
}
