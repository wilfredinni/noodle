type Handle = object

export interface ResponseFileNative {
  openAnchor(path: string): Promise<Handle>
  descend(parent: Handle, name: string): Promise<Handle>
  create(parent: Handle, name: string): Promise<Handle>
  write(file: Handle, bytes: Uint8Array): Promise<void>
  cleanup(file: Handle): Promise<void>
  matches(directory: Handle, path: string): Promise<boolean>
  close(handle: Handle): void
}

let native: ResponseFileNative | undefined

export function responseFileNative(): ResponseFileNative {
  if (native) return native
  // Literal requires let Bun embed the addons in the standalone executable.
  if (process.platform === "darwin") {
    native =
      process.arch === "arm64"
        ? require("../native/response-file/prebuilds/darwin-arm64.node")
        : require("../native/response-file/prebuilds/darwin-x64.node")
  } else if (process.platform === "win32") {
    native =
      process.arch === "arm64"
        ? require("../native/response-file/prebuilds/win32-arm64.node")
        : require("../native/response-file/prebuilds/win32-x64.node")
  } else if (process.platform === "linux") {
    const report = process.report.getReport() as {
      header?: { glibcVersionRuntime?: string }
    }
    const musl = !report.header?.glibcVersionRuntime
    native =
      process.arch === "arm64"
        ? musl
          ? require("../native/response-file/prebuilds/linux-arm64-musl.node")
          : require("../native/response-file/prebuilds/linux-arm64.node")
        : musl
          ? require("../native/response-file/prebuilds/linux-x64-musl.node")
          : require("../native/response-file/prebuilds/linux-x64.node")
  } else {
    throw new Error(`Unsupported response file platform: ${process.platform}`)
  }
  return native!
}
