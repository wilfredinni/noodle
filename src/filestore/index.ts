import type { Collection, Request } from "../schema"
import { loadCollection } from "./load"

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  loadCollection,
  async saveRequest() {
    throw new Error("filestore.saveRequest: not implemented")
  },
}
