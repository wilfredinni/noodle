import { useState, useEffect } from "react";
import { getSession, signOut, isAuthenticated } from "../lib/auth-client";

interface User {
  id: string;
  email: string;
  first_name?: string;
  last_name?: string;
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadUser();
  }, []);

  async function loadUser() {
    try {
      const userData = await getSession();
      setUser(userData);
    } catch (error) {
      console.error("Failed to load user:", error);
    } finally {
      setLoading(false);
    }
  }

  async function logout() {
    setLoading(true);
    await signOut();
    setUser(null);
    setLoading(false);
    // Redirect will be handled by AuthGuard or index page
    window.location.href = "/signin";
  }

  return {
    user,
    loading,
    isAuthenticated: isAuthenticated(),
    logout,
    refreshUser: loadUser,
  };
}
