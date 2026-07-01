import { useCallback, useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { CollectionItem, Request } from "../schema"
import {
  findRequestById,
  flattenRequests,
  visibleNodes,
  type VisibleNode,
} from "../ui/tree"

export interface UseTreeNavigationResult {
  selectedId: string | null
  selectedRequest: Request | null
  focusedFolderPath: string | null
  focusedFolderName: string | null
  expanded: Set<string>
  visibleItems: VisibleNode[]
  cursorIndex: number
  setSelectedId: (id: string) => void
  toggleFolder: (path: string) => void
  expandFolder: (path: string) => void
  collapseFolder: (path: string) => void
}

export function useTreeNavigation(
  items: CollectionItem[],
  enabled: () => boolean = () => true,
  initialSelectedId?: string,
): UseTreeNavigationResult {
  const [selectedId, setSelectedIdState] = useState<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cursorIndex, setCursorIndex] = useState(0)

  const itemsRef = useRef(items)
  itemsRef.current = items

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const vis = visibleNodes(items, expanded)
  const visRef = useRef(vis)
  visRef.current = vis

  const cursorIndexRef = useRef(cursorIndex)
  cursorIndexRef.current = cursorIndex

  const flatReqs = flattenRequests(items)

  const setSelectedId = useCallback((id: string) => {
    setSelectedIdState(id)
  }, [])

  const toggleFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const expandFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      if (prev.has(path)) return prev
      const next = new Set(prev)
      next.add(path)
      return next
    })
  }, [])

  const collapseFolder = useCallback((path: string) => {
    setExpanded((prev) => {
      if (!prev.has(path)) return prev
      const next = new Set(prev)
      next.delete(path)
      return next
    })
  }, [])

  useEffect(() => {
    if (flatReqs.length > 0) {
      let targetId: string | null = null
      if (initialSelectedId) {
        const found = findRequestById(items, initialSelectedId)
        if (found) targetId = initialSelectedId
      }
      if (!targetId) targetId = flatReqs[0].id
      if (targetId !== selectedId) {
        setSelectedIdState(targetId)
        const parts = targetId.split("/")
        if (parts.length > 1) {
          setExpanded((prev) => {
            const next = new Set(prev)
            for (let i = 1; i < parts.length; i++) {
              next.add(parts.slice(0, i).join("/"))
            }
            return next
          })
        }
      }
    } else {
      setSelectedIdState(null)
    }
  }, [items])

  useKeyboard((key) => {
    if (!enabled()) return
    const v = visRef.current
    if (v.length === 0) return
    const idx = cursorIndexRef.current
    const node = v[idx]

    if (key.name === "up") {
      setCursorIndex((prev) => {
        const next = prev - 1
        return next < 0 ? 0 : next
      })
      const nextIdx = Math.max(idx - 1, 0)
      const target = v[nextIdx]
      if (target && target.type === "request") {
        setSelectedIdState(target.id)
      }
    } else if (key.name === "down") {
      setCursorIndex((prev) => {
        const next = prev + 1
        return next >= v.length ? v.length - 1 : next
      })
      const nextIdx = Math.min(idx + 1, v.length - 1)
      const target = v[nextIdx]
      if (target && target.type === "request") {
        setSelectedIdState(target.id)
      }
    } else if (key.name === "right") {
      if (
        node &&
        node.type === "folder" &&
        !node.expanded &&
        node.hasChildren
      ) {
        expandFolder(node.id)
      }
    } else if (key.name === "left") {
      if (node && node.type === "folder" && node.expanded) {
        collapseFolder(node.id)
      }
    } else if (key.name === "return") {
      if (node && node.type === "request") {
        setSelectedIdState(node.id)
      }
    } else if (key.name === "space") {
      if (node && node.type === "folder") {
        toggleFolder(node.id)
      }
    }
  })

  const clampedCursor = Math.min(cursorIndex, Math.max(0, vis.length - 1))
  const focusedNode = vis[clampedCursor]
  const focusedFolderPath =
    focusedNode?.type === "folder" ? focusedNode.id : null
  const focusedFolderName =
    focusedNode?.type === "folder" ? focusedNode.name : null
  const selectedRequest = selectedId
    ? findRequestById(itemsRef.current, selectedId)
    : null

  return {
    selectedId,
    selectedRequest,
    focusedFolderPath,
    focusedFolderName,
    expanded,
    visibleItems: vis,
    cursorIndex: clampedCursor,
    setSelectedId,
    toggleFolder,
    expandFolder,
    collapseFolder,
  }
}
