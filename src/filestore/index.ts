import type { Collection, CollectionSettings, Request } from "../schema"
import { loadCollection, loadSettings } from "./load"
import { saveRequest, saveSettings } from "./save"

export { loadSettings, saveSettings }
export type { CollectionSettings }

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  loadCollection,
  saveRequest,
}
