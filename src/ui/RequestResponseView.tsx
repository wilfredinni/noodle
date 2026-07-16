import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import type { Environment, TimelineEntry } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { Focus } from "./focus"
import type { UrlBarSubFocus } from "./focus"
import type { ResponseTabKind } from "./tabs/uiState"
import type { SendState } from "./sendState"

interface RequestResponseViewProps {
  draft: UseRequestDraftResult
  eb: UseEditBrowseResult
  error: Error | null
  focus: Focus
  layout: "stacked" | "side-by-side"
  expanded: "request" | "response" | null
  activeEnv: Environment | null
  responseState: SendState
  timelineEntries: TimelineEntry[]
  initialResponseTab?: ResponseTabKind
  onResponseTabChange: (tab: ResponseTabKind) => void
  onOpenTimelineEntry?: (entry: TimelineEntry) => void
  setSelectOpen: (open: boolean) => void
  urlbarSubFocus: UrlBarSubFocus
  urlbarInteractive: boolean
  expandHint: string
}

export function RequestResponseView({
  draft,
  eb,
  error,
  focus,
  layout,
  expanded,
  activeEnv,
  responseState,
  timelineEntries,
  initialResponseTab,
  onResponseTabChange,
  onOpenTimelineEntry,
  setSelectOpen,
  urlbarSubFocus,
  urlbarInteractive,
  expandHint,
}: RequestResponseViewProps) {
  const content = (
    <>
      {expanded !== "response" && (
        <RequestPane
          request={draft.draft}
          error={error}
          editState={eb.editState}
          editKey={eb.editKey}
          editValue={eb.editValue}
          setEditKey={eb.setEditKey}
          setEditValue={eb.setEditValue}
          focused={focus === "request"}
          activeTab={eb.activeTab}
          activeEnv={activeEnv}
          onAuthTypeChange={draft.setAuthType}
          onApiKeyPlacementChange={draft.setApiKeyPlacement}
          onBodyTypeChange={draft.setBodyType}
          onSelectOpenChange={setSelectOpen}
          expandHint={expandHint}
        />
      )}
      {expanded !== "request" && (
        <ResponsePane
          state={responseState}
          focused={focus === "response"}
          timelineEntries={timelineEntries}
          initialTab={initialResponseTab}
          onTabChange={onResponseTabChange}
          onOpenTimelineEntry={onOpenTimelineEntry}
          expandHint={expandHint}
        />
      )}
    </>
  )

  return (
    <>
      <UrlBar
        method={draft.draft?.method ?? "GET"}
        url={draft.draft?.url ?? ""}
        params={draft.draft?.params ?? []}
        setUrl={draft.setUrl}
        setMethod={draft.setMethod}
        onDefocus={draft.syncUrlParams}
        focused={focus === "urlbar"}
        interactive={urlbarInteractive}
        subFocus={urlbarSubFocus}
        activeEnv={activeEnv}
      />
      <box
        style={{
          flexDirection: layout === "side-by-side" ? "row" : "column",
          flexGrow: 1,
          gap: layout === "side-by-side" ? 1 : 0,
          minHeight: 0,
        }}
      >
        {content}
      </box>
    </>
  )
}
