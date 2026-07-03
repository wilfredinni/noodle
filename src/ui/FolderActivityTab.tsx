import { methodColor } from "./formatRequest"
import type { Theme } from "./theme"
import type { FolderActivityStats } from "./useFolderActivity"

function shortMethod(m: string): string {
  return m === "DELETE" ? "DEL" : m
}

function pct(v: number): string {
  return `${Math.round(v * 100)}%`
}

function ms(v: number): string {
  if (v < 1000) return `${v}ms`
  return `${(v / 1000).toFixed(1)}s`
}

function relativeTime(ts: number): string {
  const diff = Date.now() - ts
  const sec = Math.floor(diff / 1000)
  if (sec < 5) return "now"
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  if (min < 60) return `${min}m`
  const hr = Math.floor(min / 60)
  if (hr < 24) return `${hr}h`
  return `${Math.floor(hr / 24)}d`
}

function nameColumn(name: string, max: number): string {
  if (name.length <= max) return name
  return name.slice(0, max - 1) + "\u2026"
}

export function FolderActivityTab({
  stats,
  loading,
  theme,
}: {
  stats: FolderActivityStats | null
  loading: boolean
  theme: Theme
}) {
  if (loading) {
    return <text fg={theme.textMuted}>Loading...</text>
  }

  if (!stats) {
    return <text fg={theme.textMuted}>No activity data.</text>
  }

  if (stats.requests.length === 0) {
    return <text fg={theme.textMuted}>No requests in this folder.</text>
  }

  if (stats.requests.every((r) => r.callCount === 0)) {
    return (
      <text fg={theme.textMuted}>
        No activity yet. Send requests to see stats.
      </text>
    )
  }

  const widths = (() => {
    const method =
      Math.max(
        ...stats.requests.map((r) => shortMethod(r.method).length),
        "Method".length,
      ) + 1
    const name = Math.min(
      Math.max(...stats.requests.map((r) => r.name.length), "Name".length),
      20,
    )
    const ok = Math.max(
      ...stats.requests.map((r) =>
        r.successRate !== null ? pct(r.successRate).length : 1,
      ),
      "OK%".length,
    )
    const avg = Math.max(
      ...stats.requests.map((r) =>
        r.avgTimeMs !== null ? ms(r.avgTimeMs).length : 1,
      ),
      "Avg".length,
    )
    const last = Math.max(
      ...stats.requests.map((r) => {
        const lastSent =
          r.lastSent !== null ? relativeTime(r.lastSent) : "\u2014"
        const calls = r.callCount > 0 ? `${r.callCount}c \u00B7 ` : ""
        return `${calls}${lastSent}`.length
      }),
      "Last".length,
    )
    return { method, name, ok, avg, last }
  })()

  return (
    <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
      <text fg={theme.textMuted}>
        Activity stats for requests inside this folder.
      </text>

      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 0,
        }}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
      >
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 0, minWidth: widths.method }}
        >
          {"Method".padEnd(widths.method)}
        </text>
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 1, minWidth: widths.name }}
        >
          {"Name".padEnd(widths.name)}
        </text>
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 0, minWidth: widths.ok }}
        >
          {"OK%".padStart(widths.ok)}
        </text>
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 0, minWidth: widths.avg }}
        >
          {"Avg".padStart(widths.avg)}
        </text>
        <text
          fg={theme.textMuted}
          wrapMode="none"
          style={{ flexShrink: 0, minWidth: widths.last }}
        >
          {"Last".padEnd(widths.last)}
        </text>
      </box>

      {stats.requests.map((r, _i) => {
        const statusColor =
          r.successRate === null
            ? theme.textMuted
            : r.successRate >= 0.9
              ? theme.success
              : r.successRate >= 0.5
                ? theme.warning
                : theme.error

        const lastSentText =
          r.lastSent !== null ? relativeTime(r.lastSent) : "\u2014"
        const callsText = r.callCount > 0 ? `${r.callCount}c \u00B7 ` : ""

        const method = shortMethod(r.method).padEnd(widths.method)
        const name = nameColumn(r.name, widths.name).padEnd(widths.name)
        const okPct =
          r.successRate !== null
            ? pct(r.successRate).padStart(widths.ok)
            : "\u2014".padStart(widths.ok)
        const avgTime =
          r.avgTimeMs !== null
            ? ms(r.avgTimeMs).padStart(widths.avg)
            : "\u2014".padStart(widths.avg)
        const last = `${callsText}${lastSentText}`

        return (
          <box
            key={r.id}
            style={{ flexDirection: "row", justifyContent: "space-between" }}
          >
            <text
              fg={methodColor(r.method, theme)}
              wrapMode="none"
              style={{ flexShrink: 0, minWidth: widths.method }}
            >
              {method}
            </text>
            <text
              fg={r.callCount > 0 ? theme.text : theme.textMuted}
              wrapMode="none"
              style={{ flexShrink: 1, minWidth: widths.name }}
            >
              {name}
            </text>
            <text
              fg={statusColor}
              wrapMode="none"
              style={{ flexShrink: 0, minWidth: widths.ok }}
            >
              {okPct}
            </text>
            <text
              fg={r.avgTimeMs !== null ? theme.text : theme.textMuted}
              wrapMode="none"
              style={{ flexShrink: 0, minWidth: widths.avg }}
            >
              {avgTime}
            </text>
            <text
              fg={theme.textMuted}
              wrapMode="none"
              style={{ flexShrink: 0, minWidth: widths.last }}
            >
              {last}
            </text>
          </box>
        )
      })}
    </box>
  )
}
