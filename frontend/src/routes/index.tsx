import { createFileRoute } from "@tanstack/react-router";
import { useAuth } from "../hooks/useAuth";
import { Button } from "../components/ui/button";

export const Route = createFileRoute("/")({ component: App });

function App() {
  const { user, loading, logout } = useAuth();

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
        <p className="text-white text-xl">Loading...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-linear-to-b from-slate-900 via-slate-800 to-slate-900">
      <div className="container mx-auto p-8">
        <div className="max-w-2xl mx-auto space-y-6">
          <div className="bg-slate-800 rounded-lg shadow-xl border border-slate-700 p-6">
            <h1 className="text-3xl font-bold text-white mb-4">Dashboard</h1>
            <div className="space-y-2 text-slate-300">
              <p>
                <span className="font-semibold">Email:</span> {user.email}
              </p>
              {user.first_name && (
                <p>
                  <span className="font-semibold">First Name:</span>{" "}
                  {user.first_name}
                </p>
              )}
              {user.last_name && (
                <p>
                  <span className="font-semibold">Last Name:</span>{" "}
                  {user.last_name}
                </p>
              )}
            </div>
            <div className="mt-6">
              <Button onClick={logout} variant="destructive">
                Sign Out
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
