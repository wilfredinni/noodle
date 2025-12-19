import { API_URL } from "./config";
import { logoutFn } from "./auth.server";

type FetchAPIOptions = RequestInit & {
  token?: string;
};

export class UnauthorizedError extends Error {
  constructor(message = "Your session has expired. Please log in again.") {
    super(message);
    this.name = "UnauthorizedError";
  }
}

export async function fetchAPI(
  endpoint: string,
  options: FetchAPIOptions = {}
) {
  const { token, ...fetchOptions } = options;

  const headers: HeadersInit = {
    "Content-Type": "application/json",
    ...fetchOptions.headers,
  };

  // Add Authorization header if token is provided
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  // Auto-logout on 401 Unauthorized
  if (response.status === 401) {
    // Perform logout
    await logoutFn();
    // Throw error to notify caller
    throw new UnauthorizedError();
  }

  return response;
}
