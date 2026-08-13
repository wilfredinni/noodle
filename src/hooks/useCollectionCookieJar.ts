import { useEffect, useState } from "react"
import { CollectionCookieJar } from "../cookies"
import { ensureCollectionId } from "../secrets"

const CONFIG_DIR = `${process.env.HOME ?? "~"}/.config/noodle`

export function useCollectionCookieJar(
  collectionDir: string | undefined,
): CollectionCookieJar | null {
  const [jar, setJar] = useState<CollectionCookieJar | null>(null)

  useEffect(() => {
    let cancelled = false
    setJar(null)
    if (!collectionDir) return
    void (async () => {
      try {
        const collectionId = await ensureCollectionId(collectionDir)
        const handle = await CollectionCookieJar.open(CONFIG_DIR, collectionId)
        if (!cancelled) setJar(handle)
      } catch {
        // cookies disabled by storage failure; requests run jar-less
      }
    })()
    return () => {
      cancelled = true
    }
  }, [collectionDir])

  return jar
}
