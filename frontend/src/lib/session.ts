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

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;

  // Only validate on server side
  if (typeof window === "undefined") {
    if (!secret) {
      console.error(
        "⚠️  SESSION_SECRET environment variable is required.\n" +
          "   Generate a secure secret with: openssl rand -base64 32\n" +
          "   Add it to your .env file"
      );
      throw new Error(
        "SESSION_SECRET environment variable is required. " +
          "Generate a secure secret with: openssl rand -base64 32"
      );
    }

    if (secret.length < 32) {
      console.error(
        "⚠️  SESSION_SECRET must be at least 32 characters long for security.\n" +
          "   Current length: " +
          secret.length
      );
      throw new Error(
        "SESSION_SECRET must be at least 32 characters long for security."
      );
    }
  }

  // Return secret or placeholder for client (never used client-side)
  return secret || "placeholder-never-used-client-side";
}

export function useAppSession() {
  return useSession<SessionData>({
    name: "app-session",
    password: getSessionSecret(),
    cookie: {
      secure: process.env.NODE_ENV === "production",
      sameSite: process.env.NODE_ENV === "production" ? "strict" : "lax",
      httpOnly: true,
      maxAge: 10 * 60 * 60, // 10 hours to match Knox TOKEN_TTL
      path: "/",
    },
  });
}

export function isTokenExpired(expiry?: string): boolean {
  if (!expiry) return true;
  const expiryDate = new Date(expiry);
  return expiryDate <= new Date();
}
