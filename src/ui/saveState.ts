export type SaveState =
  | { kind: "idle" }
  | { kind: "confirming"; requestId: string }
  | { kind: "success"; message: string }
  | { kind: "error"; message: string }
