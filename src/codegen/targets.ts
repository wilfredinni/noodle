import { targets, type Target } from "httpsnippet"

export interface CodeTarget {
  id: string
  label: string
  description: string
  target: string
  client: string
}

export interface CodeLanguage {
  key: string
  title: string
  defaultClientId: string
  clients: { id: string; title: string }[]
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

function buildLanguages(): CodeLanguage[] {
  const langs: CodeLanguage[] = []
  for (const target of Object.values(targets) as Target[]) {
    const { key, title } = target.info
    const clients = Object.keys(target.clientsById).map((clientId) => {
      const info = target.clientsById[clientId]!.info
      return { id: clientId, title: info.title }
    })
    langs.push({
      key,
      title,
      defaultClientId: target.info.default,
      clients,
    })
  }

  const shellIdx = langs.findIndex((l) => l.key === "shell")
  if (shellIdx !== -1) {
    const [shell] = langs.splice(shellIdx, 1)
    langs.unshift(shell!)
  }

  return langs
}

export const CODE_TARGETS: CodeTarget[] = buildTargets()
export const CODE_LANGUAGES: CodeLanguage[] = buildLanguages()

export function getCodeTarget(
  langKey: string,
  clientId: string,
): CodeTarget | undefined {
  return CODE_TARGETS.find((t) => t.target === langKey && t.client === clientId)
}

export function isCodeTarget(value: string): boolean {
  return CODE_TARGETS.some((t) => t.id === value)
}

export function findCodeTarget(id: string): CodeTarget | undefined {
  return CODE_TARGETS.find((t) => t.id === id)
}
