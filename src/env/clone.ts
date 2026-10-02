import { loadEnvironment } from "./load"
import { saveEnvironment } from "./save"
import { withEnvironmentLock } from "./lock"
import { validateFilenameSegment } from "../userPath"

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
  validateFilenameSegment(targetName)

  return withEnvironmentLock(dir, async () => {
    const source = await loadEnvironment(dir, sourceName, {
      resolveSecrets: false,
    })
    await saveEnvironment(
      dir,
      {
        name: targetName,
        vars: source.vars,
        color: source.color,
        disabledVars: source.disabledVars,
        secretVars: source.secretVars,
      },
      { mode: "create" },
    )
  })
}
