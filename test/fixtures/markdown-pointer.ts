import { deepStrictEqual, ok } from "node:assert/strict"
import { MarkdownRenderable, SyntaxStyle, type BaseRenderable, type Renderable } from "@opentui/core"
import { createTestRenderer } from "@opentui/core/testing"
import { render } from "@opentui/solid"
import { createComponent } from "solid-js"
import { RAIL } from "../../src/rail.ts"
import { Turn } from "../../src/window.tsx"

const descendants = (node: BaseRenderable): BaseRenderable[] => [
  node,
  ...node.getChildren().flatMap(descendants),
]

const theme = {
  hue: { interactive: { 200: "#7dcfff" } },
  text: { base: "#ffffff", muted: "#808080" },
  markdown: { text: "#ffffff" },
} as unknown as Parameters<typeof Turn>[0]["theme"]

const setup = await createTestRenderer({ width: 60, height: 20 })
try {
  const syntax = SyntaxStyle.fromStyles({ default: { fg: "#ffffff" } }, setup.renderer.nativeScene)
  const copied: string[] = []
  await render(
    () =>
      createComponent(Turn, {
        question: "What changed?",
        answer: () => "First **block**.\n\nSecond block.\n",
        copy: (text) => copied.push(text),
        selecting: () => false,
        theme,
        syntax,
      }),
    setup.renderer,
  )
  await setup.flush()

  const markdown = descendants(setup.renderer.root).find(
    (node): node is MarkdownRenderable => node instanceof MarkdownRenderable,
  )
  ok(markdown)
  const legacy = markdown as unknown as {
    readonly _blockStates?: readonly { readonly renderable?: Renderable }[]
  }
  const first =
    "renderBlock" in MarkdownRenderable.prototype
      ? markdown.blocks[0]?.renderable
      : legacy._blockStates?.[0]?.renderable
  ok(first)

  const before = setup.captureCharFrame().split(RAIL).length - 1
  await setup.mockMouse.moveTo(first.x + 2, first.y)
  await setup.flush()
  const after = setup.captureCharFrame().split(RAIL).length - 1
  await setup.mockMouse.click(first.x + 2, first.y)
  await setup.flush()

  deepStrictEqual(
    { railAdded: after > before, copied },
    { railAdded: true, copied: ["First block."] },
  )
} finally {
  const cleanup = setup as unknown as { dispose?: () => Promise<void> }
  if (cleanup.dispose) await cleanup.dispose()
  else setup.renderer.destroy()
}
