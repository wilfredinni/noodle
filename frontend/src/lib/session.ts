import { useSession } from "@tanstack/react-start/server";

type SessionData = {
  token?: string;
  user?: {
    email: string;
    first_name: string;
    last_name: string;
  };
  expiry?: string; // ISO timestamp from Knox
};

export function useAppSession() {
  return useSession<SessionData>({
    name: "app-session",
    password:
      process.env.SESSION_SECRET ||
      "change-this-to-a-secure-32-char-minimum-secret-key-in-production",
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 10 * 60 * 60, // 10 hours to match Knox TOKEN_TTL
    },
  });
}

export function isTokenExpired(expiry?: string): boolean {
  if (!expiry) return true;
  const expiryDate = new Date(expiry);
  return expiryDate <= new Date();
}
