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
  const { auth } = Route.useRouteContext();

  return (
    <div>
      <nav className="bg-slate-800 border-b border-slate-700 px-4 py-3">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <span className="text-white font-semibold">{auth.user.email}</span>
          <form action="/api/logout" method="post">
            <button
              type="submit"
              className="px-3 py-1 text-sm bg-red-600 text-white rounded hover:bg-red-700 transition"
            >
              Sign Out
            </button>
          </form>
        </div>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
