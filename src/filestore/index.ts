import type { Collection, CollectionSettings, Request } from "../schema"
import {
  loadCollection,
  loadCollectionBrowse,
  loadSettings,
  parseCollectionSettings,
  type LoadOptions,
} from "./load"
import {
  saveRequest,
  saveSettings,
  deleteRequest,
  saveFolder,
  deleteFolder,
} from "./save"
import { ensureCollectionBootstrapped } from "./bootstrap"
import {
  loadTimeline,
  loadTimelineBody,
  exportTimelineBody,
  exportTimelineEntry,
  getDownloadsDir,
  saveTimelineEntry,
  pruneTimeline,
  DEFAULT_TIMELINE_MAX_ENTRIES,
  clearTimelineForRequest,
  clearAllTimeline,
} from "./timeline"

export {
  loadSettings,
  parseCollectionSettings,
  loadCollectionBrowse,
  saveSettings,
  saveRequest,
  deleteRequest,
  saveFolder,
  deleteFolder,
  ensureCollectionBootstrapped,
  loadTimeline,
  loadTimelineBody,
  exportTimelineBody,
  exportTimelineEntry,
  getDownloadsDir,
  saveTimelineEntry,
  pruneTimeline,
  DEFAULT_TIMELINE_MAX_ENTRIES,
  clearTimelineForRequest,
  clearAllTimeline,
}
export type { CollectionSettings }

export interface Filestore {
  loadCollection(dir: string, options?: LoadOptions): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  loadCollection,
  saveRequest,
}
