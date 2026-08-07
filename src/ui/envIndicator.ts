import type { Environment } from "../schema"

const MAX_REASON = 60

export type EnvStatus = "active" | "error" | "none"

export function envIndicator(
  names: string[],
  activeIndex: number,
  activeEnv: Environment | null,
  error: Error | null,
): { label: string; status: EnvStatus } {
  if (names.length === 0 || activeIndex < 0 || activeIndex >= names.length) {
    return { label: "(no env)", status: "none" }
  }
  const name = names[activeIndex]!
  if (error !== null) {
    let reason = error.message
    if (reason.length > MAX_REASON)
      reason = reason.slice(0, MAX_REASON - 1) + "…"
    return {
      label: `${name} (load failed: ${reason})`,
      status: "error",
    }
  }
  if (activeEnv === null) return { label: "(no env)", status: "none" }
  return { label: name, status: "active" }
}

export function envIndicatorLabel(
  names: string[],
  activeIndex: number,
  activeEnv: Environment | null,
  error: Error | null,
): string {
  return envIndicator(names, activeIndex, activeEnv, error).label
}
