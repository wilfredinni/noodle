import type { UseBindingsLayer } from "@opentui/keymap/react"
import { createCookieJarLayers } from "./cookieLayers"
import { createEnvironmentLayers } from "./environmentLayers"
import { createFolderLayers } from "./folderLayers"
import { createGlobalLayers } from "./globalLayers"
import { createRequestLayers } from "./requestLayers"
import type { AppKeymapContext } from "./types"

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

  return [
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
  ]
}
