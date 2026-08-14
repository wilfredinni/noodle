import { CookieJarSidebar } from "./CookieJarSidebar"
import { CookieJarPane } from "./CookieJarPane"
import type { UseCookieJarViewResult } from "../../hooks/useCookieJarView"
import type { Focus } from "../focus"
import type { CookieJarStatus } from "../../cookies"
import { EmptyState } from "../EmptyState"
import { FullBorder } from "../borders"

export function CookieJarView({
  view,
  status,
  focus,
  jumpMode = false,
  onPaneFocus = () => {},
  onAddCookie,
  onRetry,
  onReset,
  resetKey,
}: {
  view: UseCookieJarViewResult
  status: CookieJarStatus
  focus: Focus
  jumpMode?: boolean
  onPaneFocus?: (focus: Focus) => void
  onAddCookie?: () => void
  onRetry?: () => void
  onReset?: () => void
  resetKey?: string
}) {
  if (
    view.domains.length === 0 &&
    status.state === "encrypted" &&
    onAddCookie !== undefined
  ) {
    return (
      <EmptyState
        border={FullBorder}
        actionActive
        subtitle="No cookies in this collection"
        message="Add a cookie"
        onAction={onAddCookie}
      />
    )
  }

  return (
    <box style={{ flexDirection: "row", flexGrow: 1, gap: 1, minHeight: 0 }}>
      <CookieJarSidebar
        domains={view.domains}
        selectedDomain={view.selectedDomain}
        domainIndex={view.domainIndex}
        focused={focus === "cookie-sidebar"}
        jumpMode={jumpMode}
        onSelectDomain={(domain) => {
          view.selectDomain(domain)
          onPaneFocus("cookie-sidebar")
        }}
        onPaneFocus={() => onPaneFocus("cookie-sidebar")}
      />
      <CookieJarPane
        view={view}
        status={status}
        domain={view.selectedDomain}
        focused={focus === "cookie-list"}
        jumpMode={jumpMode}
        onPaneFocus={() => onPaneFocus("cookie-list")}
        onRetry={onRetry}
        onReset={onReset}
        resetKey={resetKey}
      />
    </box>
  )
}
