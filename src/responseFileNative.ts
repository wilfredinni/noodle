type Handle = object

export interface ResponseFileNative {
  openAnchor(path: string): Promise<Handle>
  descend(parent: Handle, name: string): Promise<Handle>
  create(parent: Handle, name: string): Promise<Handle>
  write(file: Handle, bytes: Uint8Array): Promise<void>
  writeReport(
    parent: Handle,
    name: string,
    temporary: string,
    bytes: Uint8Array,
  ): Promise<void>
  cleanup(file: Handle): Promise<void>
  matches(directory: Handle, path: string): Promise<boolean>
  close(handle: Handle): void
}

let native: ResponseFileNative | undefined

export function responseFileNative(): ResponseFileNative {
  if (native) return native
  if (process.arch !== "arm64" && process.arch !== "x64")
    throw new Error(
      `Unsupported response file platform: ${process.platform}-${process.arch}`,
    )
  // Literal requires let Bun embed the addons in the standalone executable.
  if (process.platform === "darwin") {
    native =
      process.arch === "arm64"
        ? require("../native/response-file/prebuilds/darwin-arm64.node")
        : require("../native/response-file/prebuilds/darwin-x64.node")
  } else if (process.platform === "win32" && process.arch === "x64") {
    native = require("../native/response-file/prebuilds/win32-x64.node")
  } else if (process.platform === "linux") {
    const report = process.report.getReport() as {
      header?: { glibcVersionRuntime?: string }
    }
    if (
      process.env.NOODLE_LIBC !== "glibc" &&
      !report.header?.glibcVersionRuntime
    )
      throw new Error(
        `Unsupported response file platform: linux-${process.arch}-musl`,
      )
    native =
      process.arch === "arm64"
        ? require("../native/response-file/prebuilds/linux-arm64.node")
        : require("../native/response-file/prebuilds/linux-x64.node")
  } else {
    throw new Error(
      `Unsupported response file platform: ${process.platform}-${process.arch}`,
    )
  }
  return native!
}
