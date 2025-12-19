import { createFileRoute, useRouter } from "@tanstack/react-router";
import { logoutFn } from "../lib/auth.server";
import { Button } from "@/components/ui/button";

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
    <div className="min-h-screen p-8">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-4xl font-bold text-slate-900 mb-4">
          Welcome, {auth.user.first_name}!
        </h1>
        <p className="text-slate-700 mb-6">Email: {auth.user.email}</p>

        <Button variant={"destructive"} onClick={handleLogout}>
          Sign Out
        </Button>
      </div>
    </div>
  );
}
