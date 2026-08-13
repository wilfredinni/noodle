import { useBindings, useKeymap } from "@opentui/keymap/react"
import { useRenderer } from "./RendererContext"
import { createAppKeymapLayers } from "./keymap/layers"
import type { AppKeymapContext, UseAppKeymapArgs } from "./keymap/types"
import type { CommandActionsConfig } from "./commandActions"

export type {
  AppKeymapCookieJar,
  AppKeymapEnvironment,
  AppKeymapFolder,
  AppKeymapGlobal,
  AppKeymapRequest,
  UseAppKeymapArgs,
} from "./keymap/types"

function createActionsConfig(
  args: UseAppKeymapArgs,
  renderer: AppKeymapContext["renderer"],
): CommandActionsConfig {
  const { runtime, global, request, folder, environment } = args
  return {
    collectionDir: runtime.collectionDir,
    confirmUndoAll: runtime.confirmUndoAll,
    renderer,
    trySendRef: request.trySendRef,
    draftRef: request.draftRef,
    folderDraftRef: folder.folderDraftRef,
    envStateRef: environment.envStateRef,
    envEditorRef: environment.envEditorRef,
    collectionRef: request.collectionRef,
    selectedIdRef: request.selectedIdRef,
    focusRef: global.focusRef,
    responseStateRef: global.responseStateRef,
    responseQueryRef: global.responseQueryRef,
    responseBodyForCopyRef: global.responseBodyForCopyRef,
    activeIndexRef: global.activeIndexRef,
    savingRef: request.savingRef,
    doSaveRef: request.doSaveRef,
    folderSaveRef: folder.folderSaveRef,
    focusedFolderPathRef: folder.focusedFolderPathRef,
    focusedFolderNameRef: folder.focusedFolderNameRef,
    folderDeletePathRef: folder.folderDeletePathRef,
  }
}

export function useAppKeymap(args: UseAppKeymapArgs): void {
  const keymap = useKeymap()
  const renderer = useRenderer()
  const context: AppKeymapContext = {
    ...args.runtime,
    keymap,
    renderer,
    global: args.global,
    request: args.request,
    folder: args.folder,
    environment: args.environment,
    cookies: args.cookies,
    actions: createActionsConfig(args, renderer),
  }
  const layers = createAppKeymapLayers(context)

  useBindings(() => layers[0])
  useBindings(() => layers[1])
  useBindings(() => layers[2])
  useBindings(() => layers[3])
  useBindings(() => layers[4])
  useBindings(() => layers[5])
  useBindings(() => layers[6])
  useBindings(() => layers[7])
  useBindings(() => layers[8])
  useBindings(() => layers[9])
  useBindings(() => layers[10])
  useBindings(() => layers[11])
  useBindings(() => layers[12])
  useBindings(() => layers[13])
  useBindings(() => layers[14])
  useBindings(() => layers[15])
}
