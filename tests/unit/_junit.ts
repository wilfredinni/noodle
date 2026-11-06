import { parser } from "sax"

export type XmlNode = {
  name: string
  attributes: Record<string, string>
  text: string
  children: XmlNode[]
}

export function parseReport(source: string): XmlNode {
  const root: XmlNode = {
    name: "document",
    attributes: {},
    text: "",
    children: [],
  }
  const stack = [root]
  const xml = parser(true)
  xml.onopentag = (tag) => {
    const node = {
      name: tag.name,
      attributes: tag.attributes as Record<string, string>,
      text: "",
      children: [],
    }
    stack.at(-1)!.children.push(node)
    stack.push(node)
  }
  xml.ontext = (text) => {
    stack.at(-1)!.text += text
  }
  xml.onclosetag = () => {
    stack.pop()
  }
  xml.write(source).close()
  return root.children[0]!
}

export function reportCases(source: string): XmlNode[] {
  return parseReport(source).children[0]!.children.filter(
    (node) => node.name === "testcase",
  )
}
