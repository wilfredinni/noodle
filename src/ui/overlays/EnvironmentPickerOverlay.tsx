import { TextAttributes } from "@opentui/core"
import { useCallback, useEffect, useMemo, useState } from "react"
import { useTheme } from "../theme"
import { PickerOverlay } from "./PickerOverlay"

export function EnvironmentPickerOverlay({
  visible,
  environments,
  activeEnvironment,
  onSelect,
  onClose,
}: {
  visible: boolean
  environments: string[]
  activeEnvironment: string | null
  onSelect: (name: string) => void
  onClose: () => void
}) {
  const theme = useTheme()
  const [highlightedEnvironment, setHighlightedEnvironment] = useState<
    string | null
  >(null)

  useEffect(() => {
    if (visible) setHighlightedEnvironment(activeEnvironment)
  }, [visible, activeEnvironment])

  const highlightedItem = useMemo(
    () =>
      environments.find((name) => name === highlightedEnvironment) ??
      environments[0] ??
      null,
    [environments, highlightedEnvironment],
  )

  const filter = useCallback(
    (name: string, query: string) =>
      name.toLowerCase().includes(query.toLowerCase()),
    [],
  )

  const renderItem = useCallback(
    (
      name: string,
      { highlighted, active }: { highlighted: boolean; active: boolean },
    ) => {
      const foreground = highlighted ? "#1a1a1a" : theme.text

      return (
        <>
          <text fg={highlighted ? "#1a1a1a" : theme.primary}>
            {active ? "●" : " "}
          </text>
          <text
            fg={foreground}
            attributes={active ? TextAttributes.BOLD : undefined}
          >
            {name}
          </text>
        </>
      )
    },
    [theme],
  )

  return (
    <PickerOverlay
      visible={visible}
      title="Environments"
      placeholder="Search environments..."
      items={environments}
      keyExtractor={(name) => name}
      filter={filter}
      renderItem={renderItem}
      highlightedItem={highlightedItem}
      activeItem={activeEnvironment}
      onHighlightChange={setHighlightedEnvironment}
      onSelect={onSelect}
      onClose={onClose}
    />
  )
}
