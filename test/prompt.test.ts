import { describe, expect, test } from "bun:test"
import { MARKER, thread } from "../src/prompt.ts"

describe("thread", () => {
  test("a first question carries the rules and nothing else", () => {
    const prompt = thread([], ["why did step 2 fail?"])
    expect(prompt).toContain("side questions about the conversation so far")
    expect(prompt).toContain("New question: why did step 2 fail?")
    expect(prompt).not.toContain("Side conversation so far:")
  })

  test("the new question goes last, so it reads as the current one", () => {
    const prompt = thread([{ question: "first?", answer: "one" }], ["second?"])
    expect(prompt.indexOf("User: first?")).toBeLessThan(prompt.indexOf("New question:"))
    expect(prompt.endsWith("New question: second?")).toBe(true)
  })

  test("earlier turns are labelled as words said, not as work to do", () => {
    const prompt = thread([{ question: "first?", answer: "one" }], ["second?"])
    expect(prompt).toContain("You: one")
    expect(prompt).toContain("Side conversation so far:")
  })

  test("the transcript travels in order", () => {
    const prompt = thread(
      [
        { question: "a", answer: "1" },
        { question: "b", answer: "2" },
      ],
      ["c"],
    )
    const order = ["User: a", "You: 1", "User: b", "You: 2", "New question: c"].map((marker) => prompt.indexOf(marker))
    expect(order.every((at) => at >= 0)).toBe(true)
    expect([...order].sort((x, y) => x - y)).toEqual(order)
  })

  /**
   * Questions merged into one request are the case where an answer came back with
   * only the first part. Two questions run together read as one, so they are numbered
   * and the prompt says how many there are.
   */
  test("questions asked together are numbered, not pasted together", () => {
    const prompt = thread([], ["what changed in the parser?", "and in the writer?"])
    expect(prompt).toContain("2 of them asked together")
    expect(prompt).toContain("1. what changed in the parser?")
    expect(prompt).toContain("2. and in the writer?")
  })

  test("a single question is not dressed up as a list of one", () => {
    const prompt = thread([], ["only one"])
    expect(prompt).not.toContain("asked together")
    expect(prompt).toContain("New question: only one")
  })

  /**
   * This is the rule that was missing when a question asking for several things came
   * back with one of them. "Answer concisely" reads to the model as "answer briefly",
   * and it stops as soon as it has something short enough.
   */
  test("the rules ask for every part of the question", () => {
    const prompt = thread([], ["anything"])
    expect(prompt).toContain("Answer every part of the question")
    expect(prompt).toContain("Do not stop after the first")
    expect(prompt).not.toContain("concisely")
  })

  test("the marker is the opening sentence of the rules", () => {
    expect(thread([], ["anything"]).startsWith(MARKER)).toBe(true)
  })
})

/**
 * The marker is the first sentence of every prompt. It is kept as a thing of its own
 * because a rule that changes shape is a rule nothing else can point at, and because it
 * is the line a test can read the model's opening instruction from.
 */
describe("MARKER", () => {
  test("it is a whole sentence, so it reads as a rule rather than as a label", () => {
    expect(MARKER.endsWith(".")).toBe(true)
    expect(MARKER.includes(MARKER.slice(0, -1))).toBe(true)
  })

  test("it says the questions are about the conversation, which is what they are", () => {
    expect(MARKER).toContain("side questions")
    expect(MARKER).toContain("conversation so far")
  })
})