import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { API_URL } from "./config";
import { useAppSession, isTokenExpired } from "./session";

// Login server function
export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => data)
  .handler(async ({ data }) => {
    const response = await fetch(`${API_URL}/auth/login/`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      return {
        error:
          errorData.detail || "Unable to log in with provided credentials.",
      };
    }

    const result = await response.json();

    // Store token, user, and expiry in session
    const session = await useAppSession();
    await session.update({
      token: result.token,
      user: result.user,
      expiry: result.expiry,
    });

    // Redirect to home page on success
    throw redirect({ to: "/" });
  });

// Logout server function
export const logoutFn = createServerFn({ method: "POST" }).handler(async () => {
  const session = await useAppSession();
  await session.clear();
  throw redirect({ to: "/login" });
});

// Get current user with expiry check
export const getCurrentUserFn = createServerFn({ method: "GET" }).handler(
  async () => {
    const session = await useAppSession();
    const { token, user, expiry } = session.data;

    // Check if token exists and is not expired
    if (!token || !user || isTokenExpired(expiry)) {
      // Auto-logout if expired
      await session.clear();
      return null;
    }

    return { token, user };
  }
);
