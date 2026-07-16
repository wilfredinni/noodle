import type { Collection, CollectionSettings, Request } from "../schema"
import { loadCollection, loadCollectionBrowse, loadSettings } from "./load"
import {
  saveRequest,
  saveSettings,
  deleteRequest,
  saveFolder,
  deleteFolder,
  ensureCollectionBootstrapped,
} from "./save"
import {
  loadTimeline,
  saveTimelineEntry,
  clearTimelineForRequest,
  clearAllTimeline,
} from "./timeline"

export {
  loadSettings,
  loadCollectionBrowse,
  saveSettings,
  saveRequest,
  deleteRequest,
  saveFolder,
  deleteFolder,
  ensureCollectionBootstrapped,
  loadTimeline,
  saveTimelineEntry,
  clearTimelineForRequest,
  clearAllTimeline,
}
export type { CollectionSettings }

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  loadCollection,
  saveRequest,
}
