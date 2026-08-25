import { UrlBar } from "./UrlBar"
import { RequestPane } from "./RequestPane"
import { ResponsePane } from "./ResponsePane"
import { MouseButton, type BoxRenderable, type MouseEvent } from "@opentui/core"
import type { BodyType, Environment, TimelineEntry } from "../schema"
import type { UseRequestDraftResult } from "../hooks/useRequestDraft"
import type { UseEditBrowseResult } from "../hooks/useEditBrowse"
import type { Focus } from "./focus"
import type { UrlBarSubFocus } from "./focus"
import type { ResponseTabKind } from "./tabs/uiState"
import type { SendState } from "./sendState"
import { useRef, type RefObject } from "react"
import type { ResponseQueryController } from "./responseQuery"
import type { FieldKind } from "./editMode"

interface RequestResponseViewProps {
  draft: UseRequestDraftResult
  eb: UseEditBrowseResult
  error: Error | null
  focus: Focus
  layout: "stacked" | "side-by-side"
  splitContainerRef?: RefObject<BoxRenderable | null>
  splitRatio?: number
  onSplitResizeStart?: () => void
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
  splitContainerRef,
  splitRatio = 0.5,
  onSplitResizeStart = () => {},
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
  const localSplitContainerRef = useRef<BoxRenderable | null>(null)
  const activeSplitContainerRef = splitContainerRef ?? localSplitContainerRef

  const requestPane = (
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
      onAuthFieldChange={draft.setAuthField}
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
  )
  const responsePane = (
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
  )
  const startSplitResize = (event: MouseEvent) => {
    if (event.button !== MouseButton.LEFT) return
    onSplitResizeStart()
    event.preventDefault()
    event.stopPropagation()
  }
  const splitHandle =
    expanded === null ? (
      <box
        key={layout}
        id="request-response-resize-handle"
        style={{
          position: layout === "side-by-side" ? "relative" : "absolute",
          left: layout === "stacked" ? 0 : undefined,
          bottom: layout === "stacked" ? 0 : undefined,
          width: layout === "side-by-side" ? 1 : "100%",
          height: layout === "side-by-side" ? "100%" : 1,
          flexShrink: 0,
          zIndex: 1,
        }}
        onMouseDown={startSplitResize}
      />
    ) : null
  const stackedResponseHandle =
    expanded === null && layout === "stacked" ? (
      <box
        id="request-response-resize-handle-response-edge"
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          width: "100%",
          height: 1,
          zIndex: 1,
        }}
        onMouseDown={startSplitResize}
      />
    ) : null

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
        id="request-response-split"
        ref={activeSplitContainerRef}
        style={{
          flexDirection: layout === "side-by-side" ? "row" : "column",
          flexGrow: 1,
          gap: 0,
          minHeight: 0,
        }}
      >
        <box
          id="request-pane-slot"
          visible={requestVisible}
          style={{
            flexDirection: "column",
            position: "relative",
            flexGrow: expanded === null ? 0 : 1,
            flexShrink: 1,
            width:
              layout === "side-by-side" && expanded === null
                ? `${splitRatio * 100}%`
                : "100%",
            height:
              layout === "stacked" && expanded === null
                ? `${splitRatio * 100}%`
                : "100%",
            minWidth: layout === "side-by-side" ? 16 : 0,
            minHeight: layout === "stacked" ? 6 : 0,
          }}
        >
          {requestPane}
          {layout === "stacked" ? splitHandle : null}
        </box>
        {layout === "side-by-side" ? splitHandle : null}
        <box
          id="response-pane-slot"
          visible={responseVisible}
          style={{
            flexDirection: "column",
            position: "relative",
            flexGrow: expanded === null ? 0 : 1,
            flexShrink: 1,
            width:
              layout === "side-by-side" && expanded === null
                ? `${(1 - splitRatio) * 100}%`
                : "100%",
            height:
              layout === "stacked" && expanded === null
                ? `${(1 - splitRatio) * 100}%`
                : "100%",
            minWidth: layout === "side-by-side" ? 16 : 0,
            minHeight: layout === "stacked" ? 6 : 0,
          }}
        >
          {responsePane}
          {stackedResponseHandle}
        </box>
      </box>
    </>
  )
}
