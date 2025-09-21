import { env } from "./env";

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`GET ${path} failed with ${response.status}`);
  }

  return (await response.json()) as T;
}

export async function postJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${env.apiBase}${path}`, {
    method: "POST",
    body: JSON.stringify(body),
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`POST ${path} failed with ${response.status}: ${text}`);
  }

  return (await response.json()) as T;
}
