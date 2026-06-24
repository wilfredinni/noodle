import type { Collection, Request } from "../schema"

export interface Filestore {
  loadCollection(dir: string): Promise<Collection>
  saveRequest(dir: string, req: Request): Promise<void>
}

export const filestore: Filestore = {
  async loadCollection() {
    throw new Error("filestore.loadCollection: not implemented")
  },
  async saveRequest() {
    throw new Error("filestore.saveRequest: not implemented")
  },
}
