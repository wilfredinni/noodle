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

  const headers = new Headers(fetchOptions.headers);

  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  if (token) {
    headers.set("Authorization", `Bearer ${token}`);
  }

  const response = await fetch(`${API_URL}${endpoint}`, {
    ...fetchOptions,
    headers,
  });

  if (response.status === 401) {
    await logoutFn();
    throw new UnauthorizedError();
  }

  return response;
}
