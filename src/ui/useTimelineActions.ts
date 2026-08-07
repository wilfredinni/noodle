import { useCallback } from "react"
import type { CliRenderer } from "@opentui/core"
import type { TimelineBodyRef, TimelineEntry } from "../schema"
import { exportTimelineEntry, loadTimelineBody } from "../filestore"
import { copyToClipboard } from "./clipboard"
import { showToast } from "./Toast"

export function useTimelineActions(
  collectionDir: string,
  renderer: CliRenderer,
) {
  const onLoadTimelineBody = useCallback(
    (entry: TimelineEntry, ref: TimelineBodyRef) =>
      loadTimelineBody(collectionDir, entry.request.id, ref),
    [collectionDir],
  )
  const onCopyTimelineHeaders = useCallback(
    (headersText: string) => {
      if (copyToClipboard(headersText, renderer))
        showToast("Timeline headers copied", "success")
      else showToast("Failed to copy timeline headers", "error")
    },
    [renderer],
  )
  const onCopyTimelineBody = useCallback(
    (body: string) => {
      if (copyToClipboard(body, renderer))
        showToast("Timeline body copied", "success")
      else showToast("Failed to copy timeline body", "error")
    },
    [renderer],
  )
  const onExportTimelineBody = useCallback(
    async (
      entry: TimelineEntry,
      kind: "request" | "response",
      body?: string,
    ) => {
      await exportTimelineEntry(collectionDir, entry, kind, body)
      showToast("Timeline entry exported", "success")
    },
    [collectionDir],
  )

  return {
    onLoadTimelineBody,
    onCopyTimelineHeaders,
    onCopyTimelineBody,
    onExportTimelineBody,
  }
}
