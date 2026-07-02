import { methodColor } from "./formatRequest"
import type { Theme } from "./theme"
import type { FolderActivityStats } from "./useFolderActivity"

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

  if (stats.summary.totalCalls === 0) {
    return (
      <text fg={theme.textMuted}>
        No activity yet. Send requests to see stats.
      </text>
    )
  }

  return (
    <box style={{ flexDirection: "column", gap: 1, padding: 1 }}>
      <box
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          paddingBottom: 1,
        }}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
      >
        <text fg={theme.textMuted}>
          {stats.summary.overallSuccessRate !== null
            ? pct(stats.summary.overallSuccessRate)
            : "\u2014"}{" "}
          success
        </text>
        <text fg={theme.textMuted}>
          {stats.summary.overallAvgTime !== null
            ? ms(stats.summary.overallAvgTime)
            : "\u2014"}{" "}
          avg
        </text>
        <text fg={theme.textMuted}>
          {stats.summary.totalCalls} call
          {stats.summary.totalCalls !== 1 ? "s" : ""}
        </text>
      </box>

      <box
        style={{ flexDirection: "row", paddingBottom: 0 }}
        border={["bottom"]}
        borderColor={theme.borderSubtle}
      >
        <text fg={theme.textMuted} wrapMode="none">
          {"Method".padEnd(7)}
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          {"Name".padEnd(14)}
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          {"OK%".padEnd(6)}
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          {"Avg".padEnd(7)}
        </text>
        <text fg={theme.textMuted} wrapMode="none">
          Last
        </text>
      </box>

      {stats.requests.map((r) => {
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
        const callsText =
          r.callCount > 0 ? `${r.callCount}c \u00B7 ` : ""

        return (
          <box key={r.id} style={{ flexDirection: "row" }}>
            <text fg={methodColor(r.method, theme)} wrapMode="none">
              {r.method === "DELETE" ? "DEL" : r.method.padEnd(7).slice(0, 7)}
            </text>
            <text
              fg={r.callCount > 0 ? theme.text : theme.textMuted}
              wrapMode="none"
            >
              {nameColumn(r.name, 12)}
              {"  "}
            </text>
            <text fg={statusColor} wrapMode="none">
              {r.successRate !== null
                ? pct(r.successRate).padEnd(6)
                : "\u2014".padEnd(6)}
            </text>
            <text
              fg={r.avgTimeMs !== null ? theme.text : theme.textMuted}
              wrapMode="none"
            >
              {r.avgTimeMs !== null
                ? ms(r.avgTimeMs).padEnd(7)
                : "\u2014".padEnd(7)}
            </text>
            <text fg={theme.textMuted} wrapMode="none">
              {callsText}
              <text fg={r.lastSent !== null ? theme.text : theme.textMuted}>
                {lastSentText}
              </text>
            </text>
          </box>
        )
      })}
    </box>
  )
}
