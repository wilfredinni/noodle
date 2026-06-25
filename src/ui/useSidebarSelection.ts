import { useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { Request } from "../schema"
import { nextIndex } from "./selection"

export interface UseSidebarSelectionResult {
  selectedIndex: number
  selectedRequest: Request | null
}

function clampBase(prev: number, len: number): number {
  return len === 0 ? -1 : Math.min(Math.max(prev, 0), len - 1)
}

export function useSidebarSelection(
  requests: Request[],
): UseSidebarSelectionResult {
  const [selectedIndex, setSelectedIndex] = useState(0)

  useKeyboard((key) => {
    const len = requests.length
    if (key.name === "up") {
      setSelectedIndex((prev) => nextIndex(clampBase(prev, len), len, -1))
    } else if (key.name === "down") {
      setSelectedIndex((prev) => nextIndex(clampBase(prev, len), len, +1))
    }
  })

  const clamped =
    requests.length === 0 ? -1 : Math.min(selectedIndex, requests.length - 1)
  return {
    selectedIndex: clamped,
    selectedRequest: clamped >= 0 ? requests[clamped] : null,
  }
}
