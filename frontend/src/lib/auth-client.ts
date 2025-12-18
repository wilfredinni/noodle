import { createAuthClient } from "better-auth/react";

// Custom fetch wrapper to work with Django Knox authentication
const customFetch = async (
  url: string | URL | Request,
  options?: RequestInit
) => {
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  // Map Better Auth routes to Django routes
  const urlStr = url.toString();
  let djangoUrl = urlStr;

  if (urlStr.includes("/sign-in/email")) {
    djangoUrl = `${baseURL}/auth/login/`;
  } else if (urlStr.includes("/sign-out")) {
    djangoUrl = `${baseURL}/auth/logout/`;
  } else if (urlStr.includes("/get-session")) {
    djangoUrl = `${baseURL}/auth/profile/`;
  }

  // Get token from localStorage (SSR-safe)
  const token =
    typeof window !== "undefined" ? localStorage.getItem("auth_token") : null;

  const headers = new Headers(options?.headers || {});
  if (token && !urlStr.includes("/sign-in")) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(djangoUrl, {
    ...options,
    headers,
  });

  // Handle Django login response and store token
  if (urlStr.includes("/sign-in/email") && response.ok) {
    const data = await response.json();
    if (data.token && typeof window !== "undefined") {
      localStorage.setItem("auth_token", data.token);
    }
  }

  // Handle logout
  if (urlStr.includes("/sign-out") && response.ok) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
  }

  return response;
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_API_URL || "http://localhost:8000",
  fetchOptions: {
    customFetchImpl: customFetch,
  },
});

// Custom Django signin function
export async function signInWithDjango(email: string, password: string) {
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  const response = await fetch(`${baseURL}/auth/login/`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    const errorMessage =
      error.non_field_errors?.[0] ||
      error.email?.[0] ||
      error.password?.[0] ||
      error.detail ||
      `Login failed (${response.status})`;
    throw new Error(errorMessage);
  }

  const data = await response.json();

  // Store token (SSR-safe)
  if (data.token && typeof window !== "undefined") {
    localStorage.setItem("auth_token", data.token);
  }

  return data;
}

// Get current user session
export async function getSession() {
  // SSR-safe check
  if (typeof window === "undefined") {
    return null;
  }

  const token = localStorage.getItem("auth_token");

  if (!token) {
    return null;
  }

  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  try {
    const response = await fetch(`${baseURL}/auth/profile/`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    if (!response.ok) {
      if (typeof window !== "undefined") {
        localStorage.removeItem("auth_token");
      }
      return null;
    }

    return await response.json();
  } catch (error) {
    if (typeof window !== "undefined") {
      localStorage.removeItem("auth_token");
    }
    return null;
  }
}

// Sign out
export async function signOut() {
  // SSR-safe check
  if (typeof window === "undefined") {
    return;
  }

  const token = localStorage.getItem("auth_token");
  const baseURL = import.meta.env.VITE_API_URL || "http://localhost:8000";

  if (token) {
    try {
      await fetch(`${baseURL}/auth/logout/`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  }

  if (typeof window !== "undefined") {
    localStorage.removeItem("auth_token");
  }
}

// Check if user is authenticated
export function isAuthenticated(): boolean {
  if (typeof window === "undefined") {
    return false;
  }
  return !!localStorage.getItem("auth_token");
}
