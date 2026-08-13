import { CookieJarSidebar } from "./CookieJarSidebar"
import { CookieJarPane } from "./CookieJarPane"
import type { UseCookieJarViewResult } from "../../hooks/useCookieJarView"
import type { Focus } from "../focus"

export function CookieJarView({
  view,
  focus,
  jumpMode = false,
  onPaneFocus = () => {},
}: {
  view: UseCookieJarViewResult
  focus: Focus
  jumpMode?: boolean
  onPaneFocus?: (focus: Focus) => void
}) {
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
        domain={view.selectedDomain}
        focused={focus === "cookie-list"}
        jumpMode={jumpMode}
        onPaneFocus={() => onPaneFocus("cookie-list")}
      />
    </box>
  )
}
