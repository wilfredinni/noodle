export type SaveState =
  | { kind: "idle" }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
