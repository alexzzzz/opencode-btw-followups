export const QUICK_PROMPTS = [
  "How's it goin'?",
  "How far along is the work?",
  "What is left to finish?",
  "What problems are there?",
  "What could break?",
  "How do I check this works?",
] as const

export const quickMarker = (count: number, open: boolean) =>
  `${open ? "▾" : "▸"} ${count} quick prompts`
