import { loadEnvironment } from "./load"
import { saveEnvironment } from "./save"

export async function cloneEnvironment(
  dir: string,
  sourceName: string,
  targetName: string,
): Promise<void> {
  if (
    targetName.includes("..") ||
    targetName.includes("/") ||
    targetName.includes("\\")
  ) {
    throw new Error("env.clone: invalid target name")
  }

  const source = await loadEnvironment(dir, sourceName)
  await saveEnvironment(dir, {
    name: targetName,
    vars: source.vars,
    color: source.color,
    disabledVars: source.disabledVars,
  })
}
