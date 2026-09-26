import type { ScriptFields } from "./schema"
import type { ScriptPhase } from "./preRequestScript"

export const SCRIPT_TABS = [
  { id: "preScript", label: "Pre Script", phase: "pre" },
  { id: "postScript", label: "Post Script", phase: "post" },
  { id: "tests", label: "Tests", phase: "tests" },
] as const
export type ScriptField = (typeof SCRIPT_TABS)[number]["id"]
export function scriptPhase(field: string): ScriptPhase | undefined {
  return SCRIPT_TABS.find((tab) => tab.id === field)?.phase
}
export function scriptText(fields: ScriptFields, phase: ScriptPhase): string {
  return (phase === "tests" ? fields.tests : fields.scripts?.[phase]) ?? ""
}
export function withScript<T extends ScriptFields>(
  fields: T,
  phase: ScriptPhase,
  text: string,
): T {
  if (phase === "tests") return { ...fields, tests: text || undefined }
  const scripts: { pre?: string; post?: string } = {
    ...fields.scripts,
    [phase]: text || undefined,
  }
  return {
    ...fields,
    scripts: scripts.pre
      ? { pre: scripts.pre, ...(scripts.post ? { post: scripts.post } : {}) }
      : scripts.post
        ? { post: scripts.post }
        : undefined,
  }
}
