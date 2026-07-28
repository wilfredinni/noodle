import type { KeyEvent } from "@opentui/core"

const OPEN_TO_CLOSE: Record<string, string> = {
  '"': '"',
  "'": "'",
  "(": ")",
  "{": "}",
  "[": "]",
  "<": ">",
}

const CLOSE_TO_OPEN: Record<string, string> = {
  '"': '"',
  "'": "'",
  ")": "(",
  "}": "{",
  "]": "[",
  ">": "<",
}

export type EditorCommand = "toggle-fold" | "fold-all" | "unfold-all"

export function normalizeEditorKey(key: KeyEvent): KeyEvent {
  if (key.name !== "return" || !key.shift) return key
  return { ...key, shift: false } as KeyEvent
}

export function getEditorCommand(key: KeyEvent): EditorCommand | null {
  if (key.ctrl && !key.meta && !key.option && !key.super && !key.hyper) {
    if (key.name === "g" && !key.shift) return "toggle-fold"
  }

  if (!key.ctrl && !key.meta && !key.option && !key.super && !key.hyper) {
    if (key.name === "f5") return "fold-all"
    if (key.name === "f6") return "unfold-all"
  }

  if (
    key.ctrl &&
    key.shift &&
    !key.meta &&
    !key.option &&
    !key.super &&
    !key.hyper
  ) {
    if (key.name === "[") return "fold-all"
    if (key.name === "]") return "unfold-all"
  }

  return null
}

export function getAutoCloseCharacter(key: KeyEvent): string | undefined {
  if (hasModifier(key)) return undefined
  return OPEN_TO_CLOSE[key.sequence]
}

export function shouldAutoSkipClosingCharacter(
  key: KeyEvent,
  text: string,
  offset: number,
): boolean {
  if (hasModifier(key)) return false
  const sequence = key.sequence
  if (!sequence || sequence.length !== 1 || !CLOSE_TO_OPEN[sequence])
    return false
  return offset < text.length && text[offset] === sequence
}

export function isPotentialEditKey(key: KeyEvent): boolean {
  if (key.name === "backspace" || key.name === "delete") return true
  if (key.name === "return" || key.name === "linefeed") return true
  if (key.ctrl) return ["d", "k", "u", "w", "z", ".", "-"].includes(key.name)
  if (key.meta || key.option || key.super || key.hyper) return false
  return Boolean(key.sequence && key.sequence.charCodeAt(0) >= 32)
}

function hasModifier(key: KeyEvent): boolean {
  return Boolean(key.ctrl || key.meta || key.option || key.super || key.hyper)
}
