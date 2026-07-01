import type { Collection, CollectionSettings, Request } from "../schema"
import { loadCollection, loadSettings } from "./load"
import { saveRequest, saveSettings, deleteRequest } from "./save"
import {
  loadTimeline,
  saveTimelineEntry,
  clearTimelineForRequest,
  clearAllTimeline,
} from "./timeline"

export {
  loadSettings,
  saveSettings,
  saveRequest,
  deleteRequest,
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
