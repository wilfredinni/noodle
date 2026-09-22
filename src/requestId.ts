export function validateId(id: string): void {
  if (
    !id ||
    id === "." ||
    id.startsWith("./") ||
    id.startsWith("/") ||
    id.includes("..") ||
    id.includes("\\") ||
    id.split("/").some((segment) => !segment || segment.startsWith("."))
  )
    throw new Error(`invalid request id "${id}"`)
}
