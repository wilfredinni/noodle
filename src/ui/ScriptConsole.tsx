import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type RefObject,
} from "react"
import { useKeymap } from "@opentui/keymap/react"
import { useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { ResponseExecutionResults } from "../executionResults"
import type { ScriptLog, ScriptPhase } from "../preRequestScript"
import { copyToClipboard } from "./clipboard"
import { showToast } from "./Toast"
import { useTheme } from "./theme"

export const ConsoleCopyContext = createContext<RefObject<
  (() => boolean) | null
> | null>(null)
export function scriptConsoleEntries(
  execution?: ResponseExecutionResults,
): (ScriptLog & { phase: ScriptPhase })[] {
  return [
    ...(execution?.scripts?.results ?? []).flatMap((result) =>
      result.logs.map((log) => ({
        ...log,
        source: log.source ?? result.source,
        phase: result.phase,
      })),
    ),
    ...(execution?.tests?.logs ?? []).map((log) => ({
      ...log,
      phase: "tests" as const,
    })),
  ]
}
export function formatConsoleEntry(
  log: ScriptLog & { phase: ScriptPhase },
): string {
  return `[${formatConsoleTime(log.timeMs)}] ${log.phase} ${log.level.toUpperCase()} ${log.message}`
}

function formatConsoleTime(timeMs: number | undefined): string {
  return timeMs === undefined ? "?ms" : `${Math.max(0, timeMs).toFixed(1)}ms`
}

export function ScriptConsole({
  execution,
  focused,
  allowOverlay = false,
}: {
  execution?: ResponseExecutionResults
  focused: boolean
  allowOverlay?: boolean
}) {
  const theme = useTheme()
  const renderer = useRenderer()
  const keymap = useKeymap()
  const copyRef = useContext(ConsoleCopyContext)
  const scroll = useRef<ScrollBoxRenderable | null>(null)
  const entries = useMemo(() => scriptConsoleEntries(execution), [execution])
  const timeWidth = Math.max(
    3,
    ...entries.map((log) => formatConsoleTime(log.timeMs).length),
  )
  const text = entries.map(formatConsoleEntry).join("\n")
  const copy = () => {
    const copied = copyToClipboard(text, renderer)
    showToast(
      copied ? "Console copied" : "Failed to copy console",
      copied ? "success" : "error",
    )
    return copied
  }
  useEffect(() => {
    scroll.current?.scrollTo(0)
  }, [execution])
  useEffect(() => {
    if (!focused || !copyRef) return
    copyRef.current = copy
    return () => {
      copyRef.current = null
    }
  }, [copyRef, focused, text, renderer])
  useEffect(
    () =>
      keymap.intercept(
        "key",
        ({ event }) => {
          if (
            !focused ||
            (!allowOverlay && keymap.getData("app.overlay") !== "none")
          )
            return
          if (event.name === "up" || event.name === "down")
            scroll.current?.scrollBy(event.name === "up" ? -1 : 1)
          else if (event.name === "pageup" || event.name === "pagedown")
            scroll.current?.scrollBy(
              event.name === "pageup" ? -1 : 1,
              "viewport",
            )
          else if (event.name === "home") scroll.current?.scrollTo(0)
          else if (event.name === "end")
            scroll.current?.scrollTo(scroll.current.scrollHeight)
          else return
          event.preventDefault()
          event.stopPropagation()
        },
        { priority: 115 },
      ),
    [keymap, focused, allowOverlay],
  )
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
      <scrollbox
        id="script-console-logs"
        ref={scroll}
        scrollY
        verticalScrollbarOptions={{
          trackOptions: {
            backgroundColor: theme.background,
            foregroundColor: theme.borderActive,
          },
        }}
        style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
      >
        {entries.length ? (
          entries.map((log, index) => (
            <box
              id={`script-console-row-${index}`}
              key={index}
              style={{
                flexDirection: "row",
                flexWrap: "wrap",
                columnGap: 2,
                paddingLeft: 1,
                paddingRight: 1,
                minWidth: 0,
              }}
            >
              <text
                id={`script-console-metadata-${index}`}
                fg={theme.textMuted}
                wrapMode="word"
                style={{
                  width: timeWidth + 14,
                  flexShrink: 1,
                  minWidth: 0,
                }}
              >
                {formatConsoleTime(log.timeMs).padStart(timeWidth)}
                {"  "}
                <span
                  fg={
                    log.phase === "pre"
                      ? theme.primary
                      : log.phase === "post"
                        ? theme.secondary
                        : theme.accent
                  }
                >
                  {log.phase.padEnd(7)}
                </span>
                <span
                  fg={
                    log.level === "error"
                      ? theme.error
                      : log.level === "warn"
                        ? theme.warning
                        : log.level === "info"
                          ? theme.info
                          : theme.textMuted
                  }
                >
                  {log.level.toUpperCase()}
                </span>
              </text>
              <text
                id={`script-console-message-${index}`}
                fg={theme.text}
                wrapMode="word"
                style={{
                  flexGrow: 1,
                  flexShrink: 1,
                  flexBasis: 24,
                  minWidth: 0,
                }}
              >
                {log.message}
              </text>
            </box>
          ))
        ) : (
          <text fg={theme.textMuted} paddingLeft={1}>
            No console logs.
          </text>
        )}
      </scrollbox>
    </box>
  )
}
