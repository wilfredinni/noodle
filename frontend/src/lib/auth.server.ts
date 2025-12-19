import { createServerFn } from "@tanstack/react-start";
import { redirect } from "@tanstack/react-router";
import { API_URL } from "./config";
import { useAppSession, isTokenExpired } from "./session";

// Login server function
export const loginFn = createServerFn({ method: "POST" })
  .inputValidator((data: { email: string; password: string }) => {
    // Basic validation
    if (!data.email || !data.password) {
      throw new Error("Email and password are required");
    }
    // Email format validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(data.email)) {
      throw new Error("Invalid email format");
    }
    return data;
  })
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

      // Handle specific error cases
      if (response.status === 429) {
        return {
          error: "Too many login attempts. Please try again later.",
        };
      }

      // Generic error message to prevent user enumeration
      return {
        error:
          errorData.detail || "Unable to log in with provided credentials.",
      };
    }

    const result = await response.json();

    // Validate response structure
    if (!result.token || !result.user || !result.expiry) {
      return {
        error: "Invalid response from server. Please try again.",
      };
    }

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
