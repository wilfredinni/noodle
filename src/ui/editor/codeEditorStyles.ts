import { SyntaxStyle } from "@opentui/core"
import type { Theme } from "../theme-data"

export function createCodeEditorSyntaxStyle(theme: Theme): SyntaxStyle {
  return SyntaxStyle.fromStyles({
    "json.key": { fg: theme.secondary },
    "json.string": { fg: theme.success },
    "json.number": { fg: theme.warning },
    "json.boolean": { fg: theme.info },
    "json.null": { fg: theme.info },
    "json.bracket": { fg: theme.textMuted },
    "json.text": { fg: theme.text },
    "yaml.key": { fg: theme.secondary },
    "yaml.string": { fg: theme.success },
    "yaml.number": { fg: theme.warning },
    "yaml.boolean": { fg: theme.info },
    "yaml.null": { fg: theme.info },
    "yaml.punctuation": { fg: theme.textMuted },
    "yaml.comment": { fg: theme.textMuted },
    "yaml.text": { fg: theme.text },
    string: { fg: theme.success },
    number: { fg: theme.warning },
    boolean: { fg: theme.info },
    constant: { fg: theme.info },
    "constant.builtin": { fg: theme.info },
    property: { fg: theme.secondary },
    comment: { fg: theme.textMuted },
    punctuation: { fg: theme.textMuted },
    "punctuation.delimiter": { fg: theme.textMuted },
    "punctuation.bracket": { fg: theme.textMuted },
    "punctuation.special": { fg: theme.textMuted },
    keyword: { fg: theme.info },
    "keyword.directive": { fg: theme.info },
    label: { fg: theme.info },
    type: { fg: theme.info },
    "string.escape": { fg: theme.success },
    tag: { fg: theme.secondary },
    attribute: { fg: theme.info },
    operator: { fg: theme.textMuted },
    embedded: { fg: theme.text },
    markup: { fg: theme.text },
    "markup.heading": { fg: theme.info },
    "markup.raw": { fg: theme.success },
    "markup.link": { fg: theme.success },
    error: { fg: theme.error },
    "env.resolved": { fg: theme.primary },
    "env.missing": { fg: theme.error },
  })
}

export function getEnvStyleIds(style: SyntaxStyle): {
  resolved: number
  missing: number
} {
  return {
    resolved: style.getStyleId("env.resolved") ?? 0,
    missing: style.getStyleId("env.missing") ?? 0,
  }
}

export function styleIdForJsonToken(
  kind: string | undefined,
  fg: string,
  theme: Theme,
  style: SyntaxStyle,
): number {
  const names: Record<string, string> = {
    key: "json.key",
    string: "json.string",
    number: "json.number",
    boolean: "json.boolean",
    null: "json.null",
    bracket: "json.bracket",
    punctuation: "json.bracket",
    text: "json.text",
  }
  if (kind) return style.getStyleId(names[kind] ?? "json.text") ?? 0
  if (fg === theme.secondary) return style.getStyleId("json.key") ?? 0
  if (fg === theme.success) return style.getStyleId("json.string") ?? 0
  if (fg === theme.warning) return style.getStyleId("json.number") ?? 0
  if (fg === theme.info) return style.getStyleId("json.boolean") ?? 0
  if (fg === theme.textMuted) return style.getStyleId("json.bracket") ?? 0
  return style.getStyleId("json.text") ?? 0
}

export function styleIdForYamlForeground(
  fg: string,
  theme: Theme,
  style: SyntaxStyle,
): number {
  if (fg === theme.secondary) return style.getStyleId("property") ?? 0
  if (fg === theme.success) return style.getStyleId("string") ?? 0
  if (fg === theme.warning) return style.getStyleId("number") ?? 0
  if (fg === theme.info) return style.getStyleId("boolean") ?? 0
  if (fg === theme.textMuted) return style.getStyleId("comment") ?? 0
  return style.getStyleId("yaml.text") ?? 0
}
