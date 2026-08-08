import { useCallback, useEffect, useRef, useState } from "react"
import type { RefObject } from "react"
import {
  checkForUpdates,
  installBinaryUpdate,
  installBrewUpdate,
  type UpdateDependencies,
} from "../app/commands/update"
import { showToast } from "./Toast"
import type { UpdateFlowState } from "./appState"

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function useUpdateFlow(
  overlayActiveRef: RefObject<boolean>,
  dependencies: Pick<UpdateDependencies, "fetcher" | "env"> = {
    fetcher: globalThis.fetch,
    env: process.env,
  },
) {
  const [checkToken, setCheckToken] = useState(0)
  const [updateFlow, setUpdateFlow] = useState<UpdateFlowState>({
    phase: "idle",
  })
  const [restartVersion, setRestartVersion] = useState<string | null>(null)
  const [updateAvailable, setUpdateAvailable] = useState<string | null>(null)
  const updateFlowRef = useRef(updateFlow)
  updateFlowRef.current = updateFlow
  const dependenciesRef = useRef(dependencies)
  const installTokenRef = useRef(0)

  useEffect(() => {
    dependenciesRef.current = dependencies
  }, [dependencies])

  const triggerUpdateCheck = useCallback(
    () => setCheckToken((token) => token + 1),
    [],
  )

  useEffect(() => {
    if (checkToken === 0 || updateFlowRef.current.phase === "installing") return
    let cancelled = false
    checkForUpdates(true, dependenciesRef.current)
      .then((status) => {
        if (cancelled || overlayActiveRef.current) return
        if (status.kind === "up_to_date") {
          setUpdateAvailable(null)
          showToast("Noodle is up to date", "success")
        } else if (status.kind === "error") {
          showToast("Update check failed", "error")
        } else if (status.kind === "update_available") {
          setUpdateFlow({
            phase: "confirm",
            version: status.latestVersion || "latest",
            installType: status.installType,
            assetUrl:
              status.installType === "binary" ? status.assetUrl : undefined,
            expectedSha256:
              status.installType === "binary"
                ? status.expectedSha256
                : undefined,
          })
        }
      })
      .catch(() => {
        if (!cancelled) showToast("Update check failed", "error")
      })
    return () => {
      cancelled = true
    }
  }, [checkToken])

  useEffect(() => {
    if (updateFlow.phase !== "installing") return
    const update = updateFlow
    const token = ++installTokenRef.current
    if (update.installType === "brew") {
      installBrewUpdate(dependenciesRef.current)
        .then((result) => {
          if (token !== installTokenRef.current) return
          if (result.data.status === "homebrew_updated") {
            showToast("Update completed", "success")
            setUpdateFlow({
              phase: "done",
              version: update.version || "latest",
            })
            setRestartVersion(update.version || "latest")
            setUpdateAvailable(null)
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
          const message = getErrorMessage(error)
          showToast("Update failed", "error")
          setUpdateFlow({ phase: "failed", message })
        })
      return
    }
    if (
      update.installType === "binary" &&
      update.assetUrl &&
      update.expectedSha256
    ) {
      installBinaryUpdate(
        update.version,
        update.assetUrl,
        update.expectedSha256,
        dependenciesRef.current,
      )
        .then((result) => {
          if (token !== installTokenRef.current) return
          if (result.data.status === "updated") {
            const version = result.data.version ?? update.version
            showToast("Update completed", "success")
            setUpdateFlow({ phase: "done", version })
            setRestartVersion(version)
            setUpdateAvailable(null)
          } else {
            const message =
              (result.data as Record<string, string>).reason ?? "Update failed"
            showToast("Update failed", "error")
            setUpdateFlow({ phase: "failed", message })
          }
        })
        .catch((error: unknown) => {
          if (token !== installTokenRef.current) return
          const message = getErrorMessage(error)
          showToast("Update failed", "error")
          setUpdateFlow({ phase: "failed", message })
        })
      return
    }
    setUpdateFlow({ phase: "idle" })
  }, [updateFlow])

  useEffect(() => {
    let cancelled = false
    checkForUpdates(false, dependenciesRef.current)
      .then((status) => {
        if (!cancelled && status.kind === "update_available") {
          setUpdateAvailable(status.latestVersion)
        }
      })
      .catch(() => {
        if (!cancelled) showToast("Update check failed", "error")
      })
    return () => {
      cancelled = true
    }
  }, [])

  const confirmInstall = useCallback(() => {
    const update = updateFlowRef.current
    if (update.phase !== "confirm") return
    setUpdateFlow({
      phase: "installing",
      version: update.version,
      installType: update.installType,
      assetUrl: update.assetUrl,
      expectedSha256: update.expectedSha256,
    })
  }, [])
  const cancelUpdate = useCallback(() => setUpdateFlow({ phase: "idle" }), [])

  return {
    updateFlow,
    restartVersion,
    updateAvailable,
    triggerUpdateCheck,
    confirmInstall,
    cancelUpdate,
  }
}
