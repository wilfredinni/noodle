import type { UpdateFlowState } from "./appState"
import { useTheme } from "./theme"

type UpdateStatusColor = "secondary" | "success" | "warning" | "error"

export type UpdateStatusSegment = {
  text: string
  color: UpdateStatusColor
}

export function getUpdateStatusSegments(
  updateFlow: UpdateFlowState,
  activeOnly = false,
): UpdateStatusSegment[] {
  if (
    activeOnly &&
    (updateFlow.phase === "checking" || updateFlow.phase === "up_to_date")
  ) {
    return []
  }

  switch (updateFlow.phase) {
    case "up_to_date":
      return [{ text: " ✓", color: "success" }]
    case "checking":
      return [{ text: " ⟳ Checking for updates…", color: "secondary" }]
    case "downloading":
      return [
        {
          text: ` ↓ Downloading ${updateFlow.version}…`,
          color: "secondary",
        },
      ]
    case "installing":
      return [
        {
          text: ` ⚙ Installing ${updateFlow.version}…`,
          color: "warning",
        },
      ]
    case "done":
      return [
        {
          text: ` ↻ Restart to apply ${updateFlow.version}`,
          color: "warning",
        },
      ]
    case "failed":
      return [{ text: " ✕ Update failed", color: "error" }]
    default:
      return []
  }
}

export function UpdateStatusSpans({
  segments,
}: {
  segments: UpdateStatusSegment[]
}) {
  const theme = useTheme()

  return (
    <>
      {segments.map((segment, index) => (
        <span key={index} fg={theme[segment.color]}>
          {segment.text}
        </span>
      ))}
    </>
  )
}
