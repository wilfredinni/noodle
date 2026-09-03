import { useCallback, useEffect, useRef, useState } from "react"
import { useKeyboard } from "@opentui/react"
import type { CollectionItem, Request } from "../schema"
import {
  findFolderByPath,
  findRequestById,
  flattenRequests,
  visibleNodes,
  type VisibleNode,
} from "../ui/tree"

export interface UseTreeNavigationResult {
  selectedId: string | null
  selectedIdRef: { current: string | null }
  selectedRequest: Request | null
  focusedFolderPath: string | null
  focusedFolderName: string | null
  expanded: Set<string>
  visibleItems: VisibleNode[]
  cursorIndex: number
  setSelectedId: (id: string) => void
  revealRequest: (id: string) => void
  revealFolder: (path: string) => void
  toggleFolder: (path: string) => void
  expandFolder: (path: string) => void
  collapseFolder: (path: string) => void
}

export function useTreeNavigation(
  items: CollectionItem[],
  enabled: () => boolean = () => true,
  initialSelectedId?: string,
  initialExpanded?: Set<string>,
): UseTreeNavigationResult {
  const [selectedId, setSelectedIdState] = useState<string | null>(null)
  const selectedIdRef = useRef<string | null>(null)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [cursorIndex, setCursorIndex] = useState(0)

  const expandedInitDone = useRef(false)
  useEffect(() => {
    if (
      !expandedInitDone.current &&
      initialExpanded &&
      initialExpanded.size > 0
    ) {
      setExpanded(new Set(initialExpanded))
      expandedInitDone.current = true
    }
  }, [initialExpanded])

  const itemsRef = useRef(items)
  itemsRef.current = items

  const expandedRef = useRef(expanded)
  expandedRef.current = expanded

  const vis = visibleNodes(items, expanded)
  const visRef = useRef(vis)
  visRef.current = vis

  const cursorIndexRef = useRef(cursorIndex)
  cursorIndexRef.current = cursorIndex

  const initialCursorSet = useRef(false)
  const prevSelectedIdRef = useRef(selectedId)

  const flatReqs = flattenRequests(items)
  let targetId = selectedId
    ? (findRequestById(items, selectedId)?.id ?? null)
    : null
  if (!targetId && initialSelectedId && !initialSelectedId.endsWith("/")) {
    targetId = findRequestById(items, initialSelectedId)?.id ?? null
  }
  if (!targetId && !(initialSelectedId && initialSelectedId.endsWith("/"))) {
    targetId = flatReqs[0]?.id ?? null
  }

  const setSelectedId = useCallback((id: string) => {
    selectedIdRef.current = id
    setSelectedIdState(id)
  }, [])

  const revealRequest = useCallback((id: string) => {
    const request = findRequestById(itemsRef.current, id)
    if (!request) return

    const nextExpanded = new Set(expandedRef.current)
    const parts = id.split("/")
    for (let i = 1; i < parts.length; i++) {
      nextExpanded.add(parts.slice(0, i).join("/"))
    }
    const nextVisible = visibleNodes(itemsRef.current, nextExpanded)
    const nextCursor = nextVisible.findIndex(
      (node) => node.type === "request" && node.id === id,
    )

    setExpanded(nextExpanded)
    selectedIdRef.current = id
    setSelectedIdState(id)
    if (nextCursor >= 0) setCursorIndex(nextCursor)
  }, [])

  const revealFolder = useCallback((path: string) => {
    const folder = findFolderByPath(itemsRef.current, path)
    if (!folder) return

    const nextExpanded = new Set(expandedRef.current)
    const parts = path.split("/")
    for (let i = 1; i < parts.length; i++) {
      nextExpanded.add(parts.slice(0, i).join("/"))
    }
    const nextVisible = visibleNodes(itemsRef.current, nextExpanded)
    const nextCursor = nextVisible.findIndex(
      (node) => node.type === "folder" && node.id === path,
    )

    setExpanded(nextExpanded)
    if (nextCursor >= 0) setCursorIndex(nextCursor)
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

  const initialSetupDone = useRef(false)

  useEffect(() => {
    if (flatReqs.length > 0) {
      initialCursorSet.current = false
      if (targetId && targetId !== selectedId) {
        selectedIdRef.current = targetId
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
      if (targetId) {
        const currentNode = visRef.current[cursorIndexRef.current]
        if (currentNode?.type !== "folder") {
          const idx = vis.findIndex(
            (n) => n.type === "request" && n.id === targetId,
          )
          if (idx >= 0) setCursorIndex(idx)
        }
      }
    } else {
      selectedIdRef.current = null
      setSelectedIdState(null)
    }
  }, [items])

  useEffect(() => {
    const selectedIdChanged = prevSelectedIdRef.current !== selectedId
    prevSelectedIdRef.current = selectedId

    if (initialCursorSet.current) return
    if (vis.length === 0) return

    if (!initialSetupDone.current) {
      if (initialSelectedId && initialSelectedId.endsWith("/")) {
        const folderPath = initialSelectedId.slice(0, -1)
        const idx = vis.findIndex(
          (n) => n.type === "folder" && n.id === folderPath,
        )
        if (idx >= 0) {
          setCursorIndex(idx)
          initialCursorSet.current = true
          initialSetupDone.current = true
          return
        }
      }
      initialSetupDone.current = true
    }

    if (!selectedId) return
    const currentNode = visRef.current[cursorIndexRef.current]
    if (currentNode?.type === "folder" && !selectedIdChanged) return
    const idx = vis.findIndex(
      (n) => n.type === "request" && n.id === selectedId,
    )
    if (idx >= 0) {
      setCursorIndex(idx)
      initialCursorSet.current = true
    }
  }, [selectedId, vis])

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
        setSelectedId(target.id)
      }
    } else if (key.name === "down") {
      setCursorIndex((prev) => {
        const next = prev + 1
        return next >= v.length ? v.length - 1 : next
      })
      const nextIdx = Math.min(idx + 1, v.length - 1)
      const target = v[nextIdx]
      if (target && target.type === "request") {
        setSelectedId(target.id)
      }
    } else if (key.name === "home") {
      setCursorIndex(0)
      const target = v[0]
      if (target && target.type === "request") {
        setSelectedId(target.id)
      }
    } else if (key.name === "end") {
      const lastIdx = v.length - 1
      setCursorIndex(lastIdx)
      const target = v[lastIdx]
      if (target && target.type === "request") {
        setSelectedId(target.id)
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
        setSelectedId(node.id)
      }
    } else if (key.name === "space") {
      if (node && node.type === "folder") {
        toggleFolder(node.id)
      }
    }
  })

  const renderedSelectedId = selectedId === null ? null : targetId
  let clampedCursor = Math.min(cursorIndex, Math.max(0, vis.length - 1))
  if (renderedSelectedId !== selectedId) {
    const targetIndex = vis.findIndex(
      (node) => node.type === "request" && node.id === renderedSelectedId,
    )
    if (targetIndex >= 0) clampedCursor = targetIndex
  }
  const focusedNode = vis[clampedCursor]
  const focusedFolderPath =
    focusedNode?.type === "folder" ? focusedNode.id : null
  const focusedFolderName =
    focusedNode?.type === "folder" ? focusedNode.name : null
  const selectedRequest = renderedSelectedId
    ? findRequestById(itemsRef.current, renderedSelectedId)
    : null

  return {
    selectedId: renderedSelectedId,
    selectedIdRef,
    selectedRequest,
    focusedFolderPath,
    focusedFolderName,
    expanded,
    visibleItems: vis,
    cursorIndex: clampedCursor,
    setSelectedId,
    revealRequest,
    revealFolder,
    toggleFolder,
    expandFolder,
    collapseFolder,
  }
}
