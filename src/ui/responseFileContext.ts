import { createContext } from "react"

export interface ResponseFileActions {
  save: () => boolean
  open: () => boolean
  savedPath?: string
}

export const ResponseFileContext = createContext<ResponseFileActions | null>(
  null,
)
