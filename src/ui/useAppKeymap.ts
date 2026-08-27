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
  AppKeymapRunner,
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
    runner: args.runner,
    actions: createActionsConfig(args, renderer),
  }
  const layers = createAppKeymapLayers(context)
  const bindingDeps = [
    args.runtime.keybinds,
    args.runtime.collectionDir,
    args.runtime.confirmUndoAll,
  ]

  useBindings(() => layers[0], bindingDeps)
  useBindings(() => layers[1], bindingDeps)
  useBindings(() => layers[2], bindingDeps)
  useBindings(() => layers[3], bindingDeps)
  useBindings(() => layers[4], bindingDeps)
  useBindings(() => layers[5], bindingDeps)
  useBindings(() => layers[6], bindingDeps)
  useBindings(() => layers[7], bindingDeps)
  useBindings(() => layers[8], bindingDeps)
  useBindings(() => layers[9], bindingDeps)
  useBindings(() => layers[10], bindingDeps)
  useBindings(() => layers[11], bindingDeps)
  useBindings(() => layers[12], bindingDeps)
  useBindings(() => layers[13], bindingDeps)
  useBindings(() => layers[14], bindingDeps)
  useBindings(() => layers[15], bindingDeps)
  useBindings(() => layers[16], bindingDeps)
}
