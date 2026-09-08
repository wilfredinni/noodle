import { parser } from "sax"
import { isRawJsonNumber, parseJsonPreservingNumbers } from "../lang/formatJson"

export interface VisualNode {
  id: number
  label: string
  kind: "object" | "array" | "value"
  value: string
  children: VisualNode[]
  element?: boolean
  preserveSpace?: boolean
}

export type VisualBody =
  | { kind: "success"; root: VisualNode }
  | { kind: "empty" | "error"; message: string }

export function parseVisualBody(body: string): VisualBody {
  if (!body.trim()) return { kind: "empty", message: "(no body)" }
  let nextId = 0
  const node = (
    label: string,
    kind: VisualNode["kind"],
    value = "",
  ): VisualNode => ({
    id: nextId++,
    label,
    kind,
    value,
    children: [],
  })
  try {
    if (!body.trimStart().startsWith("<")) {
      const value = parseJsonPreservingNumbers(body)
      const root = node("Response", "object")
      const pending = [{ node: root, value }]
      while (pending.length) {
        const current = pending.pop()!
        const value = current.value
        if (
          value === null ||
          typeof value !== "object" ||
          isRawJsonNumber(value)
        ) {
          current.node.kind = "value"
          current.node.value = isRawJsonNumber(value)
            ? value.rawJSON
            : JSON.stringify(value)
          continue
        }
        current.node.kind = Array.isArray(value) ? "array" : "object"
        for (const [key, childValue] of Object.entries(value)) {
          const child = node(Array.isArray(value) ? `[${key}]` : key, "object")
          current.node.children.push(child)
          pending.push({ node: child, value: childValue })
        }
      }
      return { kind: "success", root }
    }

    const root = node("Document", "object")
    const stack = [root]
    const options = { xmlns: true, strictEntities: true }
    const xml = parser(true, options)
    const appendText = (label: string, value: string) => {
      const parent = stack.at(-1)!
      const last = parent.children.at(-1)
      if (last?.label === label && last.kind === "value") last.value += value
      else parent.children.push(node(label, "value", value))
    }
    xml.onopentag = (tag) => {
      const child = node(tag.name, "object")
      child.element = true
      const space = tag.attributes["xml:space"]
      const spaceValue = typeof space === "string" ? space : space?.value
      child.preserveSpace =
        spaceValue === "preserve" ||
        (spaceValue !== "default" && stack.at(-1)!.preserveSpace === true)
      stack.at(-1)!.children.push(child)
      for (const [name, attribute] of Object.entries(tag.attributes)) {
        child.children.push(
          node(
            `@${name}`,
            "value",
            typeof attribute === "string" ? attribute : attribute.value,
          ),
        )
      }
      stack.push(child)
    }
    xml.onclosetag = () => {
      stack.pop()
    }
    xml.ontext = (value) => appendText("#text", value)
    xml.oncdata = (value) => appendText("#cdata", value)
    xml.oncomment = (value) => appendText("#comment", value)
    xml.onprocessinginstruction = ({ name, body }) =>
      appendText(`?${name}`, body)
    xml.onerror = (error) => {
      throw error
    }
    // DTDs are never fetched and custom entities are never expanded.
    xml.ondoctype = () => {
      throw new Error("DTD declarations are not supported in Visual")
    }
    xml.write(body).close()

    const pending = [root]
    while (pending.length) {
      const parent = pending.pop()!
      for (const child of parent.children)
        if (child.kind !== "value") pending.push(child)
      const hasElements = parent.children.some((child) => child.element)
      const mixed = parent.children.some(
        (child) =>
          child.label === "#cdata" ||
          (child.label === "#text" && child.value.trim() !== ""),
      )
      if (hasElements && !mixed && !parent.preserveSpace) {
        parent.children = parent.children.filter(
          (child) => child.label !== "#text" || child.value.trim() !== "",
        )
      }
      const grouped: VisualNode[] = []
      for (let index = 0; index < parent.children.length;) {
        const first = parent.children[index]!
        let end = index + 1
        if (first.element) {
          while (
            parent.children[end]?.element &&
            parent.children[end]?.label === first.label
          )
            end++
        }
        if (end - index > 1) {
          const list = node(first.label, "array")
          list.children = parent.children.slice(index, end)
          grouped.push(list)
        } else grouped.push(first)
        index = end
      }
      parent.children = grouped
    }
    return { kind: "success", root }
  } catch (error) {
    return {
      kind: "error",
      message: `Cannot visualize this body. ${error instanceof Error ? error.message : String(error)}. Use Source to inspect it.`,
    }
  }
}

export function visualMatches(root: VisualNode, query: string): Set<number> {
  const matches = new Set<number>()
  const needle = query.trim().toLowerCase()
  if (!needle) return matches
  const pending: Array<{ node: VisualNode; visited: boolean }> = [
    { node: root, visited: false },
  ]
  while (pending.length) {
    const { node, visited } = pending.pop()!
    if (!visited) {
      pending.push({ node, visited: true })
      for (const child of node.children)
        pending.push({ node: child, visited: false })
    } else if (
      node.label.toLowerCase().includes(needle) ||
      node.value.toLowerCase().includes(needle) ||
      node.children.some((child) => matches.has(child.id))
    ) {
      matches.add(node.id)
    }
  }
  return matches
}

export function visualChildren(
  node: VisualNode,
  query: string,
  matches: Set<number>,
): VisualNode[] {
  if (
    node.kind !== "array" ||
    !query ||
    node.label.toLowerCase().includes(query.toLowerCase())
  )
    return node.children
  return node.children.filter((child) => matches.has(child.id))
}

export function visualSummary(node: VisualNode): string {
  if (node.kind === "value") return node.value
  if (
    node.element &&
    node.children.length === 1 &&
    ["#text", "#cdata"].includes(node.children[0]!.label)
  )
    return node.children[0]!.value
  if (!node.children.length) return node.kind === "array" ? "[]" : "{}"
  return node.kind === "array"
    ? `[${node.children.length} items]`
    : `{${node.children.length} fields}`
}
