import { useMemo } from "react"
import { JumpBadge } from "../JumpBadge"
import {
  computeRequestTabLabels,
  RESPONSE_TAB_LABELS,
  computeBadgeOffsets,
} from "../useJumpMode"
import { SIDEBAR_WIDTH } from "../Sidebar"
import type { JumpTarget } from "../useJumpMode"
import type { Request } from "../../schema"

const REQUEST_HINT_ORDER = ["h", "p", "b", "a", "t"] as const
const RESPONSE_HINT_ORDER = ["r", "e", "l"] as const

interface JumpModeOverlayProps {
  availableJumpTargets: Map<string, JumpTarget>
  layout: "stacked" | "side-by-side"
  expanded: "request" | "response" | null
  focusedFolderPresent: boolean
  draftRequest?: Request | null
  mode?: "collection" | "browse" | "empty" | "invalid"
}

export function JumpModeOverlay({
  availableJumpTargets,
  layout,
  expanded,
  focusedFolderPresent,
  draftRequest,
  mode = "collection",
}: JumpModeOverlayProps) {
  const has = (key: string) => availableJumpTargets.has(key)

  const requestLabels = useMemo(
    () => computeRequestTabLabels(draftRequest ?? null),
    [draftRequest],
  )

  const requestOffsets = useMemo(
    () => computeBadgeOffsets(requestLabels),
    [requestLabels],
  )
  const responseOffsets = useMemo(
    () => computeBadgeOffsets(RESPONSE_TAB_LABELS),
    [],
  )

  return (
    <box
      style={{
        position: "absolute",
        left: 0,
        top: 0,
        width: "100%",
        height: "100%",
        paddingLeft: 1,
        paddingRight: 1,
        zIndex: 100,
      }}
    >
      {/* MainView flex container mirror */}
      <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
        {/* Sidebar container (width 38) */}
        <box style={{ width: SIDEBAR_WIDTH, position: "relative" }}>
          {has("s") && <JumpBadge letter="s" style={{ top: 0, left: 2 }} />}
        </box>

        {/* Main content right column container */}
        <box
          style={{
            flexDirection: "column",
            flexGrow: 1,
            gap: 1,
            minHeight: 0,
          }}
        >
          {/* Read-only banner (matches MainView) */}
          {mode !== "collection" && <box style={{ height: 1 }} />}

          {/* UrlBar container */}
          <box style={{ height: 3, position: "relative" }}>
            {has("m") && <JumpBadge letter="m" style={{ top: 0, left: 2 }} />}
            {has("u") && <JumpBadge letter="u" style={{ top: 0, left: 14 }} />}
          </box>

          {/* Request / Response split area */}
          {!focusedFolderPresent && (
            <box
              style={{
                flexDirection: layout === "side-by-side" ? "row" : "column",
                flexGrow: 1,
                gap: layout === "side-by-side" ? 1 : 0,
                minHeight: 0,
              }}
            >
              {/* RequestPane */}
              {expanded !== "response" && (
                <box
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    minHeight: 0,
                    position: "relative",
                  }}
                >
                  {REQUEST_HINT_ORDER.map(
                    (hint, i) =>
                      has(hint) && (
                        <JumpBadge
                          key={hint}
                          letter={hint}
                          style={{ top: 0, left: requestOffsets[i] }}
                        />
                      ),
                  )}
                </box>
              )}

              {/* ResponsePane */}
              {expanded !== "request" && (
                <box
                  style={{
                    flexGrow: 1,
                    flexBasis: 0,
                    minHeight: 0,
                    position: "relative",
                  }}
                >
                  {RESPONSE_HINT_ORDER.map(
                    (hint, i) =>
                      has(hint) && (
                        <JumpBadge
                          key={hint}
                          letter={hint}
                          style={{ top: 0, left: responseOffsets[i] }}
                        />
                      ),
                  )}
                </box>
              )}
            </box>
          )}
        </box>
      </box>
    </box>
  )
}
