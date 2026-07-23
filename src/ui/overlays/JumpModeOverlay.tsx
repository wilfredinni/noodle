import { JumpBadge } from "../JumpBadge"
import { REQUEST_TAB_HINTS, RESPONSE_TAB_HINTS } from "../useJumpMode"
import type { Request } from "../../schema"

interface JumpModeOverlayProps {
  availableJumpTargets: Map<string, unknown>
  layout: "stacked" | "side-by-side"
  expanded: "request" | "response" | null
  focusedFolderPresent: boolean
  draftRequest?: Request | null
}

export function JumpModeOverlay({
  availableJumpTargets,
  layout,
  expanded,
  focusedFolderPresent,
  draftRequest,
}: JumpModeOverlayProps) {
  const has = (key: string) => availableJumpTargets.has(key)

  const hasAuth = draftRequest?.auth?.type && draftRequest.auth.type !== "none"
  const authWidth = 1 + (hasAuth ? 6 : 4) + 2
  const settingsLeft = 28 + authWidth

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
      {/* HeaderBar space: height 1 */}
      <box style={{ height: 1 }} />

      {/* MainView flex container mirror */}
      <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
        {/* Sidebar container (width 38) */}
        <box style={{ width: 38, position: "relative" }}>
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
                  {has(REQUEST_TAB_HINTS.headers) && (
                    <JumpBadge letter="h" style={{ top: 0, left: 2 }} />
                  )}
                  {has(REQUEST_TAB_HINTS.params) && (
                    <JumpBadge letter="p" style={{ top: 0, left: 12 }} />
                  )}
                  {has(REQUEST_TAB_HINTS.body) && (
                    <JumpBadge letter="b" style={{ top: 0, left: 21 }} />
                  )}
                  {has(REQUEST_TAB_HINTS.auth) && (
                    <JumpBadge letter="a" style={{ top: 0, left: 28 }} />
                  )}
                  {has(REQUEST_TAB_HINTS.settings) && (
                    <JumpBadge
                      letter="t"
                      style={{ top: 0, left: settingsLeft }}
                    />
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
                  {has(RESPONSE_TAB_HINTS.body) && (
                    <JumpBadge letter="r" style={{ top: 0, left: 2 }} />
                  )}
                  {has(RESPONSE_TAB_HINTS.headers) && (
                    <JumpBadge letter="e" style={{ top: 0, left: 9 }} />
                  )}
                  {has(RESPONSE_TAB_HINTS.timeline) && (
                    <JumpBadge letter="l" style={{ top: 0, left: 19 }} />
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
