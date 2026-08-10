import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import type { BodyType, Environment, TimelineEntry } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { Focus } from "./focus"
import type { UrlBarSubFocus } from "./focus"
import type { ResponseTabKind } from "./tabs/uiState"
import type { SendState } from "./sendState"
import type { RefObject } from "react"
import type { ResponseQueryController } from "./responseQuery"
import type { FieldKind } from "./editMode"

interface RequestResponseViewProps {
  draft: UseRequestDraftResult
  eb: UseEditBrowseResult
  error: Error | null
  focus: Focus
  layout: "stacked" | "side-by-side"
  expanded: "request" | "response" | null
  activeEnv: Environment | null
  collectionTlsVerify?: boolean
  insecure?: boolean
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
  onResponseBodyEditorAvailableChange?: (available: boolean) => void
  onPaneFocus?: (focus: Focus) => void
  onUrlbarFocus?: (subFocus: UrlBarSubFocus) => void
  onSend?: () => void
  onRequestTabChange?: (tab: FieldKind) => void
  onRequestBodyTypeFocus?: () => void
  onRequestAuthFocusRow?: (row: number) => void
  onRequestBodyEditorFocus?: (bodyType: BodyType) => void
  onRequestFieldActivate?: (
    field: FieldKind,
    row: number,
    addingRow?: boolean,
    subfield?: "key" | "value",
  ) => void
  onRequestFieldToggle?: (field: FieldKind, row: number) => void
  onRequestInteraction?: () => void
}

export function RequestResponseView({
  draft,
  eb,
  error,
  focus,
  layout,
  expanded,
  activeEnv,
  collectionTlsVerify,
  insecure = false,
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
  onResponseBodyEditorAvailableChange,
  onPaneFocus = () => {},
  onUrlbarFocus,
  onSend,
  onRequestTabChange,
  onRequestBodyTypeFocus,
  onRequestAuthFocusRow,
  onRequestBodyEditorFocus,
  onRequestFieldActivate,
  onRequestFieldToggle,
  onRequestInteraction,
}: RequestResponseViewProps) {
  const requestVisible = expanded !== "response"
  const responseVisible = expanded !== "request"
  const content = (
    <>
      <RequestPane
        request={draft.draft}
        visible={requestVisible}
        error={error}
        editState={eb.editState}
        editKey={eb.editKey}
        editValue={eb.editValue}
        setEditKey={eb.setEditKey}
        setEditValue={eb.setEditValue}
        focused={requestVisible && focus === "request"}
        activeTab={eb.activeTab}
        activeEnv={activeEnv}
        onAuthTypeChange={draft.setAuthType}
        onApiKeyPlacementChange={draft.setApiKeyPlacement}
        onBodyTypeChange={draft.setBodyType}
        onBodyChange={draft.setBody}
        onTlsVerifyChange={draft.setTlsVerify}
        onSelectOpenChange={setSelectOpen}
        jumpMode={jumpMode}
        onPaneFocus={() => onPaneFocus("request")}
        onTabChange={onRequestTabChange}
        onBodyTypeFocus={onRequestBodyTypeFocus}
        onAuthFocusRow={onRequestAuthFocusRow}
        onBodyEditorFocus={onRequestBodyEditorFocus}
        onFieldActivate={onRequestFieldActivate}
        onFieldSubfieldFocus={eb.focusSubfield}
        onFieldToggle={onRequestFieldToggle}
        onInteraction={onRequestInteraction}
        interactive={urlbarInteractive}
        collectionTlsVerify={collectionTlsVerify}
        insecure={insecure}
      />
      <ResponsePane
        key={responseKey}
        state={responseState}
        visible={responseVisible}
        focused={responseVisible && focus === "response"}
        timelineEntries={timelineEntries}
        initialTab={initialResponseTab}
        onTabChange={onResponseTabChange}
        onOpenTimelineEntry={onOpenTimelineEntry}
        responseKey={responseKey}
        responseQueryRef={responseQueryRef}
        responseBodyForCopyRef={responseBodyForCopyRef}
        layout={layout}
        expanded={expanded}
        jumpMode={jumpMode && draft.draft !== null}
        onQueryVisibleChange={onQueryVisibleChange}
        onBodyEditorAvailableChange={onResponseBodyEditorAvailableChange}
        onPaneFocus={() => onPaneFocus("response")}
      />
    </>
  )

  return (
    <>
      <UrlBar
        key={draft.draft?.id}
        method={draft.draft?.method ?? "GET"}
        url={draft.draft?.url ?? ""}
        params={draft.draft?.params ?? []}
        pathParams={draft.draft?.pathParams ?? []}
        setUrl={draft.setUrl}
        setMethod={draft.setMethod}
        onDefocus={draft.syncUrlParams}
        focused={focus === "urlbar"}
        interactive={urlbarInteractive}
        subFocus={urlbarSubFocus}
        activeEnv={activeEnv}
        jumpMode={jumpMode && draft.draft !== null && expanded !== "response"}
        onPaneFocus={() => onPaneFocus("urlbar")}
        onSubFocus={onUrlbarFocus}
        onSend={onSend}
        sending={responseState.status === "sending"}
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
