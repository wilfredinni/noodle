import type { Environment } from "../schema"

const MAX_REASON = 60

export function envIndicatorLabel(
  names: string[],
  activeIndex: number,
  activeEnv: Environment | null,
  error: Error | null,
): string {
  if (names.length === 0 || activeIndex < 0 || activeIndex >= names.length) {
    return "(no env)"
  }
  const name = names[activeIndex]
  if (error !== null) {
    let reason = error.message
    if (reason.length > MAX_REASON)
      reason = reason.slice(0, MAX_REASON - 1) + "…"
    return `${name} (load failed: ${reason})`
  }
  if (activeEnv === null) return "(no env)"
  return name
}
