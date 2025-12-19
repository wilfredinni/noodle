import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { z } from "zod";
import { Button } from "../components/ui/button";
import { Input } from "../components/ui/input";
import { Label } from "../components/ui/label";
import { loginFn, getCurrentUserFn } from "../lib/auth.server";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  beforeLoad: async ({ search }) => {
    const auth = await getCurrentUserFn();
    if (auth) {
      throw redirect({ to: search.redirect || "/" });
    }
  },
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [attemptCount, setAttemptCount] = useState(0);
  const MAX_ATTEMPTS = 5;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    // Client-side validation
    if (!email.trim() || !password.trim()) {
      setError("Email and password are required.");
      setLoading(false);
      return;
    }

    // Simple email format check
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      setError("Please enter a valid email address.");
      setLoading(false);
      return;
    }

    // Check attempt limit
    if (attemptCount >= MAX_ATTEMPTS) {
      setError(
        "Too many failed attempts. Please wait a few minutes before trying again."
      );
      setLoading(false);
      return;
    }

    try {
      const result = await loginFn({ data: { email, password } });

      // If we get a result with an error, display it
      if (result?.error) {
        setError(result.error);
        setAttemptCount((prev) => prev + 1);
        setLoading(false);
      }
    } catch (err) {
      // Re-throw redirect Response so TanStack Router handles it
      if (err instanceof Response && err.status === 307) {
        window.location.href = "/";
        return;
      }
      console.error("Login error:", err);
      setError(
        err instanceof Error
          ? err.message
          : "An error occurred. Please try again."
      );
      setAttemptCount((prev) => prev + 1);
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-linear-to-br from-slate-900 to-slate-800 px-4">
      <div className="w-full max-w-md space-y-8 rounded-lg bg-white p-8 shadow-2xl">
        <div className="text-center">
          <h1 className="text-3xl font-bold text-slate-900">Sign In</h1>
          <p className="mt-2 text-sm text-slate-600">
            Enter your credentials to access your account
          </p>
        </div>

        <form onSubmit={handleSubmit} className="mt-8 space-y-6">
          <div>
            <Label htmlFor="email" className="text-slate-900">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1"
              placeholder="you@example.com"
              disabled={loading}
              required
            />
          </div>

          <div>
            <Label htmlFor="password" className="text-slate-900">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1"
              placeholder="••••••••"
              disabled={loading || attemptCount >= MAX_ATTEMPTS}
              required
              minLength={8}
            />
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-3">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {attemptCount > 0 && attemptCount < MAX_ATTEMPTS && (
            <div className="rounded-md bg-yellow-50 p-3">
              <p className="text-sm text-yellow-800">
                Failed attempts: {attemptCount}/{MAX_ATTEMPTS}
              </p>
            </div>
          )}

          <Button
            type="submit"
            disabled={loading || attemptCount >= MAX_ATTEMPTS}
            className="w-full"
          >
            {loading ? "Signing in..." : "Sign In"}
          </Button>
        </form>
      </div>
    </div>
  );
}
