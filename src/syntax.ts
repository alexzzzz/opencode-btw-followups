import { SyntaxStyle, type ColorInput, type StyleDefinitionInput } from "@opentui/core"
import type { Plugin } from "@opencode/plugin/tui"

type Theme = Plugin.Context["theme"]

export function createSyntaxStyle(theme: Theme, owner: any) {
  const style = (SyntaxStyle as { create(owner?: any): SyntaxStyle }).create(owner)
  const syntax = theme.syntax
  const markdown = theme.markdown
  const register = (scopes: readonly string[], fg: ColorInput, extra?: StyleDefinitionInput) =>
    scopes.forEach((scope) => style.registerStyle(scope, { fg, ...extra }))

  register(["default", "spell", "nospell"], theme.text.base)
  register(["comment", "comment.documentation"], syntax.comment, { italic: true })
  register(["string", "symbol", "character", "character.special"], syntax.string)
  register(["number", "boolean", "constant", "float"], syntax.number)
  register(["keyword", "keyword.return", "keyword.conditional", "keyword.repeat"], syntax.keyword, {
    italic: true,
  })
  register(
    ["keyword.coroutine", "keyword.import", "keyword.export", "string.escape", "string.regexp"],
    syntax.keyword,
  )
  register(["keyword.type"], syntax.type, { bold: true, italic: true })
  register(["keyword.operator"], syntax.operator)
  register(["function", "function.method", "variable.member"], syntax.function)
  register(["operator", "punctuation.delimiter", "punctuation.special"], syntax.operator)
  register(["variable", "variable.parameter", "property", "field", "parameter"], syntax.variable)
  register(["type", "module", "class", "namespace", "type.definition"], syntax.type, { bold: true })
  register(["punctuation", "punctuation.bracket"], syntax.punctuation)
  register(["tag.attribute"], syntax.keyword)
  register(["markup.heading.1"], markdown.heading, { bold: true, underline: true })
  register(
    [
      "markup.heading",
      "markup.heading.2",
      "markup.heading.3",
      "markup.heading.4",
      "markup.heading.5",
      "markup.heading.6",
    ],
    markdown.heading,
    { bold: true },
  )
  register(["markup.bold", "markup.strong"], markdown.strong, { bold: true })
  register(["markup.italic", "markup.emphasis"], markdown.emphasis, { italic: true })
  register(["markup.list", "markup.list.checked"], markdown.listItem)
  register(["markup.quote", "markup.blockQuote"], markdown.blockQuote, { italic: true })
  register(["markup.raw", "markup.raw.block"], markdown.code)
  register(["markup.raw.inline"], markdown.code, { bg: theme.background.base })
  register(
    ["markup.link", "markup.link.url", "string.special", "string.special.url"],
    markdown.link,
    { underline: true },
  )
  register(["markup.link.label", "label"], markdown.linkText, { underline: true })
  register(["markup.underline"], theme.text.base, { underline: true })
  register(["markup.strikethrough", "markup.list.unchecked"], theme.text.muted)

  return style
}
