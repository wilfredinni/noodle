import type { Command, CommandContext } from "@opentui/keymap"
import type { Renderable, KeyEvent } from "@opentui/core"
import type { UseBindingsLayer } from "@opentui/keymap/react"
import { createCookieJarLayers } from "./cookieLayers"
import { createEnvironmentLayers } from "./environmentLayers"
import { createFolderLayers } from "./folderLayers"
import { createGlobalLayers } from "./globalLayers"
import { createRequestLayers } from "./requestLayers"
import { createRunnerLayer } from "./runnerLayers"
import type { AppKeymapContext } from "./types"
import { runnerAllowsCommand } from "../commandActions"

export type AppKeymapLayers = readonly [
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
  UseBindingsLayer,
]

// Layer order is dispatch behavior. Keep request edit after folder layers.
export function createAppKeymapLayers(
  context: AppKeymapContext,
): AppKeymapLayers {
  const [alwaysOn, urlbar] = createGlobalLayers(context)
  const [base, requestFocus, requestBrowse, requestEdit] =
    createRequestLayers(context)
  const [folderBase, folderFocus, folderBrowse, folderEdit] =
    createFolderLayers(context)
  const [envBase, envBrowse, envEdit] = createEnvironmentLayers(context)
  const [cookieBase, cookieFilter, cookieNavigate] =
    createCookieJarLayers(context)
  const runner = createRunnerLayer(context)

  const layers: AppKeymapLayers = [
    alwaysOn,
    urlbar,
    base,
    requestFocus,
    requestBrowse,
    folderBase,
    folderFocus,
    folderBrowse,
    folderEdit,
    requestEdit,
    envBase,
    envBrowse,
    envEdit,
    cookieBase,
    cookieFilter,
    cookieNavigate,
    runner,
  ]
  for (const layer of layers) {
    for (const command of (layer.commands ?? []) as Command<
      Renderable,
      KeyEvent
    >[]) {
      if (runnerAllowsCommand(command.name)) continue
      const enabled = command.enabled
      command.enabled = (ctx: CommandContext<Renderable, KeyEvent>) =>
        !context.runner.runnerRef.current.isRunning() &&
        (typeof enabled === "function" ? enabled(ctx) : enabled !== false)
    }
  }
  return layers
}
