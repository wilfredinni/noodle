import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type RefObject,
} from "react"
import { useKeymap } from "@opentui/keymap/react"
import { useRenderer } from "@opentui/react"
import type { ScrollBoxRenderable } from "@opentui/core"
import type { ResponseExecutionResults } from "../executionResults"
import type { ScriptLog, ScriptPhase } from "../preRequestScript"
import { scriptSourceLabel } from "../scriptInheritance"
import { Select } from "./Select"
import { ActionButton } from "./ActionButton"
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
  const time =
    log.timeMs === undefined ? "?ms" : `${Math.max(0, log.timeMs).toFixed(1)}ms`
  return `[${time}] ${scriptSourceLabel(log.source)} ${log.phase} ${log.level.toUpperCase()} ${log.message}`
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
  const [level, setLevel] = useState("all")
  const [control, setControl] = useState(0)
  const [selectOpen, setSelectOpen] = useState(false)
  const entries = useMemo(() => scriptConsoleEntries(execution), [execution])
  const displayed = entries.filter(
    (log) => level === "all" || log.level === level,
  )
  const text = displayed.map(formatConsoleEntry).join("\n")
  const copy = () => {
    const copied = copyToClipboard(text, renderer)
    showToast(
      copied ? "Console copied" : "Failed to copy console",
      copied ? "success" : "error",
    )
    return copied
  }
  useEffect(() => {
    setLevel("all")
    setControl(0)
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
            selectOpen ||
            (!allowOverlay && keymap.getData("app.overlay") !== "none")
          )
            return
          if (event.name === "tab")
            setControl((value) => (value + (event.shift ? 2 : 1)) % 3)
          else if (event.name === "return" && control === 1) copy()
          else if (event.name === "up" || event.name === "down")
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
    [keymap, focused, selectOpen, allowOverlay, control, text, renderer],
  )
  return (
    <box flexDirection="column" flexGrow={1} flexBasis={0} minHeight={0}>
      <box flexDirection="row" flexShrink={0}>
        <Select
          items={["all", "log", "info", "warn", "error"].map((id) => ({
            id,
            label: id === "all" ? "All levels" : id.toUpperCase(),
          }))}
          value={level}
          onChange={setLevel}
          focused={focused && control === 0}
          onActivate={() => setControl(0)}
          onOpenChange={setSelectOpen}
          badge={false}
          fitContent
        />
        <ActionButton
          id="console-copy"
          label="Copy"
          focused={focused && control === 1}
          onAction={copy}
        />
      </box>
      <scrollbox
        id="script-console-logs"
        ref={scroll}
        scrollY
        style={{ flexGrow: 1, minHeight: 0, flexBasis: 0 }}
      >
        {displayed.length ? (
          displayed.map((log, index) => (
            <text
              key={index}
              fg={
                log.level === "error"
                  ? theme.error
                  : log.level === "warn"
                    ? theme.warning
                    : theme.text
              }
            >
              {formatConsoleEntry(log)}
            </text>
          ))
        ) : (
          <text fg={theme.textMuted}>No logs at this level.</text>
        )}
      </scrollbox>
    </box>
  )
}
