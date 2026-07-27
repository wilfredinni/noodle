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
import type { RefObject } from "react"
import type { ResponseQueryController } from "./responseQuery"

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
  responseKey?: string | null
  responseQueryRef?: RefObject<ResponseQueryController | null>
  responseBodyForCopyRef?: RefObject<string | null>
  jumpMode?: boolean
  onQueryVisibleChange?: (v: boolean) => void
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
  responseKey,
  responseQueryRef,
  responseBodyForCopyRef,
  jumpMode = false,
  onQueryVisibleChange,
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
          jumpMode={jumpMode}
        />
      )}
      {expanded !== "request" && (
        <ResponsePane
          key={responseKey}
          state={responseState}
          focused={focus === "response"}
          timelineEntries={timelineEntries}
          initialTab={initialResponseTab}
          onTabChange={onResponseTabChange}
          onOpenTimelineEntry={onOpenTimelineEntry}
          responseKey={responseKey}
          responseQueryRef={responseQueryRef}
          responseBodyForCopyRef={responseBodyForCopyRef}
          layout={layout}
          expanded={expanded}
          jumpMode={jumpMode}
          onQueryVisibleChange={onQueryVisibleChange}
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
        jumpMode={jumpMode && draft.draft !== null}
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
