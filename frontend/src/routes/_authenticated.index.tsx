import { createFileRoute, useRouter } from "@tanstack/react-router";
import { logoutFn } from "../lib/auth.server";

export const Route = createFileRoute("/_authenticated/")({
  component: App,
});

function App() {
  const { auth } = Route.useRouteContext();
  const router = useRouter();

  const handleLogout = async () => {
    try {
      await logoutFn();
    } catch (err) {
      if (err instanceof Response && err.status === 307) {
        const location = err.headers.get("Location");
        if (location) {
          await router.navigate({ to: location });
        }
        return;
      }
    }
  };

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900 p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-white mb-4">
          Welcome, {auth.user.first_name}!
        </h1>
        <p className="text-slate-300 mb-6">Email: {auth.user.email}</p>

        <button
          onClick={handleLogout}
          className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
