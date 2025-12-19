import { createFileRoute, redirect, Outlet } from "@tanstack/react-router";
import { getCurrentUserFn } from "../lib/auth.server";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async ({ location }) => {
    const auth = await getCurrentUserFn();

    if (!auth) {
      throw redirect({
        to: "/login",
        search: {
          redirect: location.href,
        },
      });
    }

    return { auth };
  },
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  return (
    <div>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
