import { targets, type Target } from "httpsnippet"

export interface CodeTarget {
  id: string
  label: string
  description: string
  target: string
  client: string
}

function buildTargets(): CodeTarget[] {
  const result: CodeTarget[] = []
  for (const target of Object.values(targets) as Target[]) {
    const { key, title } = target.info
    const clients = Object.keys(target.clientsById)

    if (clients.length === 1) {
      const clientId = clients[0]!
      const clientInfo = target.clientsById[clientId]!.info
      result.push({
        id: `${key}-${clientId}`,
        label: `${title} · ${clientInfo.title}`,
        description:
          title === clientInfo.title
            ? key
            : `${title} · ${clientInfo.description}`,
        target: key,
        client: clientId,
      })
    } else {
      for (const clientId of clients) {
        const clientInfo = target.clientsById[clientId]!.info
        result.push({
          id: `${key}-${clientId}`,
          label: `${title} · ${clientInfo.title}`,
          description: `${title} · ${clientInfo.description}`,
          target: key,
          client: clientId,
        })
      }
    }
  }

  const curlIdx = result.findIndex((t) => t.id === "shell-curl")
  if (curlIdx !== -1) {
    const [curl] = result.splice(curlIdx, 1)
    result.unshift(curl!)
  }

  return result
}

export const CODE_TARGETS: CodeTarget[] = buildTargets()

export function isCodeTarget(value: string): boolean {
  return CODE_TARGETS.some((t) => t.id === value)
}

export function findCodeTarget(id: string): CodeTarget | undefined {
  return CODE_TARGETS.find((t) => t.id === id)
}
