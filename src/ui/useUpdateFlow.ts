import { useCallback, useEffect, useRef, useState } from "react"
import {
  checkForUpdates,
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

  useEffect(() => startCheck(), [startCheck])

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
            showToast("Update completed", "success")
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
          showToast("Update completed", "success")
          setUpdateFlow({ phase: "done", version })
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
