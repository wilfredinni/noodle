import type { UseBindingsLayer } from "@opentui/keymap/react"
import { copyToClipboard } from "../clipboard"
import { showToast } from "../Toast"
import type { AppKeymapContext } from "./types"

export function createCookieJarLayers(
  context: AppKeymapContext,
): [UseBindingsLayer, UseBindingsLayer, UseBindingsLayer] {
  const { keymap, keybinds, global, cookies, renderer } = context
  const isCookieJar = () =>
    keymap.getData("app.view") === "cookie-jar" &&
    keymap.getData("app.overlay") === "none"
  const isSidebar = () => keymap.getData("app.focus") === "cookie-sidebar"
  const isList = () => keymap.getData("app.focus") === "cookie-list"
  const view = () => cookies.cookieJarViewRef.current

  const base: UseBindingsLayer = {
    enabled: isCookieJar,
    commands: [
      {
        name: "cookie.close",
        run: () => {
          global.setView("main")
          global.setFocus("sidebar")
        },
      },
      {
        name: "cookie.delete",
        enabled: () => isList() && Boolean(view().cookies.length),
        run: () => {
          const state = view()
          const cookie = state.cookies[state.cookieIndex]
          if (!cookie) return
          cookies.setCookieDeletePending({
            kind: "cookie",
            name: cookie.name,
            domain: cookie.domain,
            path: cookie.path,
          })
        },
      },
      {
        name: "cookie.delete-domain",
        enabled: () => isSidebar() && view().selectedDomain !== null,
        run: () => {
          const domain = view().selectedDomain
          if (!domain) return
          cookies.setCookieDeletePending({ kind: "domain", domain })
        },
      },
      {
        name: "cookie.clear",
        enabled: () =>
          view().domains.length > 0 ||
          view().jar?.status.state === "unavailable",
        run: () =>
          cookies.setCookieDeletePending({
            kind: view().jar?.status.state === "unavailable" ? "reset" : "all",
          }),
      },
      {
        name: "cookie.retry-storage",
        run: cookies.retryCookieStorage,
      },
      {
        name: "cookie.new",
        run: () => {
          cookies.setCookieFormInitial(null)
          cookies.setCookieFormVisible(true)
        },
      },
      {
        name: "cookie.edit",
        enabled: () =>
          isList() && !view().filtering && Boolean(view().cookies.length),
        run: () => {
          const state = view()
          const cookie = state.cookies[state.cookieIndex]
          if (!cookie) return
          cookies.setCookieFormInitial(cookie)
          cookies.setCookieFormVisible(true)
        },
      },
      {
        name: "cookie.copy",
        enabled: () => isList() && Boolean(view().cookies.length),
        run: () => {
          const state = view()
          const cookie = state.cookies[state.cookieIndex]
          if (!cookie) return
          if (copyToClipboard(`${cookie.name}=${cookie.value}`, renderer)) {
            showToast("Cookie copied", "success")
          } else {
            showToast("Failed to copy cookie", "error")
          }
        },
      },
      {
        name: "cookie.filter",
        enabled: () => isList(),
        run: () => view().setFiltering(true),
      },
      {
        name: "cookie.filter.exit",
        enabled: () => view().filtering,
        run: () => view().setFiltering(false),
      },
      {
        name: "cookie.filter.clear",
        enabled: () => view().filtering,
        run: () => {
          view().setFilter("")
          view().setFiltering(false)
        },
      },
    ],
    bindings: [
      { key: "escape", cmd: "cookie.close" },
      { key: keybinds.cookie_delete, cmd: "cookie.delete" },
      { key: keybinds.cookie_delete_domain, cmd: "cookie.delete-domain" },
      { key: keybinds.cookie_clear, cmd: "cookie.clear" },
      { key: keybinds.cookie_new, cmd: "cookie.new" },
      { key: keybinds.cookie_copy, cmd: "cookie.copy" },
      { key: "return", cmd: "cookie.edit" },
      { key: "/", cmd: "cookie.filter" },
      { key: "r", cmd: "cookie.retry-storage" },
    ],
  }

  const filter: UseBindingsLayer = {
    enabled: () => isCookieJar() && view().filtering,
    commands: [
      {
        name: "cookie.filter.exit",
        run: () => view().setFiltering(false),
      },
      {
        name: "cookie.filter.clear",
        run: () => {
          view().setFilter("")
          view().setFiltering(false)
        },
      },
      {
        name: "cookie.up",
        run: () => view().cookieUp(),
      },
      {
        name: "cookie.down",
        run: () => view().cookieDown(),
      },
    ],
    bindings: [
      { key: "return", cmd: "cookie.filter.exit" },
      { key: "escape", cmd: "cookie.filter.clear" },
      { key: "up", cmd: "cookie.up" },
      { key: "down", cmd: "cookie.down" },
    ],
  }

  const navigate: UseBindingsLayer = {
    enabled: () => isCookieJar() && !view().filtering,
    commands: [
      {
        name: "cookie.up",
        run: () => {
          if (isSidebar()) view().domainUp()
          else view().cookieUp()
        },
      },
      {
        name: "cookie.down",
        run: () => {
          if (isSidebar()) view().domainDown()
          else view().cookieDown()
        },
      },
    ],
    bindings: [
      { key: "up", cmd: "cookie.up" },
      { key: "down", cmd: "cookie.down" },
    ],
  }

  return [base, filter, navigate]
}
