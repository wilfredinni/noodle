import { useCallback, useEffect, useRef, useState } from "react"
import { readFile } from "node:fs/promises"
import { dirname, join } from "node:path"
import {
  checkForUpdates,
  getUpdateDeps,
  installBinaryUpdate,
  installBrewUpdate,
  type UpdateAvailableInfo,
  type UpdateDependencies,
} from "../app/commands/update"
import { isBunRuntime } from "../app/commands/updateDetect"
import { showToast } from "./Toast"
import type { UpdateFlowState } from "./appState"

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function showUpdateCompleted(skillStatus: string | undefined) {
  if (skillStatus === "failed")
    showToast("Noodle updated; skill update failed", "warning")
  else showToast("Update completed", "success")
}

function getPreviewFlow(value: string | undefined): UpdateFlowState | null {
  switch (value) {
    case "idle":
      return { phase: "idle" }
    case "checking":
      return { phase: "checking" }
    case "up_to_date":
      return { phase: "up_to_date" }
    case "downloading":
      return {
        phase: "downloading",
        version: "v0.7.5",
        installType: "binary",
      }
    case "installing":
      return {
        phase: "installing",
        version: "v0.7.5",
        installType: "binary",
      }
    case "done":
      return { phase: "done", version: "v0.7.5" }
    case "failed":
      return { phase: "failed", message: "Preview failure" }
    default:
      return null
  }
}

export function useUpdateFlow(
  dependencies: Partial<UpdateDependencies> = {
    fetcher: globalThis.fetch,
    env: process.env,
  },
) {
  const [checkToken, setCheckToken] = useState(0)
  const [updateFlow, setUpdateFlow] = useState<UpdateFlowState>({
    phase: "idle",
  })
  const updateFlowRef = useRef(updateFlow)
  updateFlowRef.current = updateFlow
  const dependenciesRef = useRef(dependencies)
  const checkInFlightRef = useRef(false)
  const installTokenRef = useRef(0)
  const previewPhase = isBunRuntime(process.execPath)
    ? process.env.NOODLE_UPDATE_PREVIEW
    : undefined

  useEffect(() => {
    dependenciesRef.current = dependencies
  }, [dependencies])

  const startCheck = useCallback(() => {
    const phase = updateFlowRef.current.phase
    if (
      checkInFlightRef.current ||
      phase === "downloading" ||
      phase === "installing" ||
      phase === "done"
    )
      return
    const previewFlow = getPreviewFlow(previewPhase)
    if (previewFlow) {
      setUpdateFlow(previewFlow)
      return
    }
    checkInFlightRef.current = true
    setUpdateFlow({ phase: "checking" })
    setCheckToken((token) => token + 1)
  }, [previewPhase])

  const triggerAboutUpdateCheck = useCallback(startCheck, [startCheck])

  useEffect(() => {
    const deps = getUpdateDeps(dependenciesRef.current)
    if (
      deps.platform !== "win32" ||
      isBunRuntime(deps.execPath) ||
      previewPhase
    ) {
      startCheck()
      return
    }
    let cancelled = false
    const logPath = join(dirname(deps.execPath), ".noodle-update.log")
    void readFile(logPath, "utf8")
      .then((log) => {
        if (cancelled) return
        const outcome = log
          .match(
            /^Failed to (?:finish the Noodle update|stage update):|^Update complete\./gm,
          )
          ?.at(-1)
        if (outcome?.startsWith("Failed")) {
          const message = `The previous Windows update failed.\nUpdate details: ${logPath}\nClose Noodle and retry with: noodle update`
          setUpdateFlow({ phase: "failed", message })
          showToast(message, "error")
        } else startCheck()
      })
      .catch(() => {
        if (!cancelled) startCheck()
      })
    return () => {
      cancelled = true
    }
  }, [startCheck, previewPhase])

  useEffect(() => {
    if (checkToken === 0) return
    let cancelled = false
    checkForUpdates(true, dependenciesRef.current)
      .then((status) => {
        if (cancelled) return
        checkInFlightRef.current = false
        if (status.kind === "unavailable") {
          setUpdateFlow({ phase: "idle" })
          return
        }
        if (status.kind === "up_to_date") {
          setUpdateFlow({ phase: "up_to_date" })
          return
        }
        if (status.kind === "error") {
          setUpdateFlow({ phase: "failed", message: status.message })
          showToast("Update check failed", "error")
          return
        }

        const update: UpdateAvailableInfo = {
          version: status.latestVersion || "latest",
          installType: status.installType,
          assetUrl:
            status.installType === "binary" ? status.assetUrl : undefined,
          expectedSha256:
            status.installType === "binary" ? status.expectedSha256 : undefined,
        }
        setUpdateFlow({
          phase: update.installType === "binary" ? "downloading" : "installing",
          ...update,
        })
      })
      .catch((error: unknown) => {
        if (cancelled) return
        checkInFlightRef.current = false
        setUpdateFlow({ phase: "failed", message: getErrorMessage(error) })
        showToast("Update check failed", "error")
      })
    return () => {
      cancelled = true
      checkInFlightRef.current = false
    }
  }, [checkToken])

  useEffect(() => {
    if (
      updateFlow.phase === "installing" &&
      updateFlow.installType === "brew"
    ) {
      const update = updateFlow
      const token = ++installTokenRef.current
      installBrewUpdate(dependenciesRef.current)
        .then((result) => {
          if (token !== installTokenRef.current) return
          if (result.data.status === "homebrew_updated") {
            showUpdateCompleted(result.data.skill_status)
            setUpdateFlow({ phase: "done", version: update.version })
          } else {
            const message = result.data.exit_code
              ? `Homebrew upgrade failed (exit ${result.data.exit_code})`
              : "Homebrew upgrade failed"
            showToast("Update failed", "error")
            setUpdateFlow({ phase: "failed", message })
          }
        })
        .catch((error: unknown) => {
          if (token !== installTokenRef.current) return
          showToast("Update failed", "error")
          setUpdateFlow({ phase: "failed", message: getErrorMessage(error) })
        })
      return
    }

    if (
      updateFlow.phase !== "downloading" ||
      updateFlow.installType !== "binary" ||
      !updateFlow.assetUrl ||
      !updateFlow.expectedSha256
    )
      return

    const assetUrl = updateFlow.assetUrl
    const expectedSha256 = updateFlow.expectedSha256
    const update: UpdateAvailableInfo = {
      version: updateFlow.version,
      installType: updateFlow.installType,
      assetUrl,
      expectedSha256,
    }
    const token = ++installTokenRef.current
    installBinaryUpdate(
      update.version,
      assetUrl,
      expectedSha256,
      dependenciesRef.current,
      (phase) => {
        if (phase === "installing" && token === installTokenRef.current) {
          setUpdateFlow({ ...update, phase: "installing" })
        }
      },
    )
      .then((result) => {
        if (token !== installTokenRef.current) return
        if (result.data.status === "updated") {
          const version = result.data.version ?? update.version
          showUpdateCompleted(result.data.skill_status)
          setUpdateFlow({ phase: "done", version })
        } else if (result.data.status === "restart_required") {
          showToast(
            `Update staged; restart Noodle to apply.\nUpdate details: ${result.data.log_path}\nIf the update fails, close Noodle and retry with: noodle update`,
            "warning",
          )
          setUpdateFlow({
            phase: "done",
            version: result.data.version ?? update.version,
          })
        } else {
          const message =
            (result.data as Record<string, string>).reason ?? "Update failed"
          showToast("Update failed", "error")
          setUpdateFlow({ phase: "failed", message })
        }
      })
      .catch((error: unknown) => {
        if (token !== installTokenRef.current) return
        showToast("Update failed", "error")
        setUpdateFlow({ phase: "failed", message: getErrorMessage(error) })
      })
  }, [updateFlow])

  return {
    updateFlow,
    triggerAboutUpdateCheck,
  }
}
