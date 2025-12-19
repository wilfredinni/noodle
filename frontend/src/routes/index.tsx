import { createFileRoute, redirect } from "@tanstack/react-router";
import { getCurrentUserFn, logoutFn } from "../lib/auth.server";

export const Route = createFileRoute("/")({
  loader: async () => {
    const auth = await getCurrentUserFn();

    if (!auth) {
      throw redirect({ to: "/login" });
    }

    return { auth };
  },
  component: App,
});

function App() {
  const { auth } = Route.useLoaderData();

  const handleLogout = async () => {
    try {
      await logoutFn();
    } catch (err) {
      // Redirect Response - manually navigate
      if (err instanceof Response && err.status === 307) {
        window.location.href = "/login";
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
