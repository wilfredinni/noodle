import { API_URL } from "./config";
import { logoutFn } from "./auth.server";

type FetchAPIOptions = RequestInit & {
  token?: string;
};

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
    await logoutFn();
    return;
  }

  return response;
}
