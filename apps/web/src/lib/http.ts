import type { ZodType } from "zod";

import { env } from "./env";

export class HttpError extends Error {
  constructor(public status: number, message: string, public body?: string) {
    super(message);
    this.name = "HttpError";
  }
}

/**
 * Extracts a user-friendly error message from an error object.
 * Handles HttpError with JSON body containing `detail` field,
 * standard Error objects, and unknown error types.
 */
export function extractErrorMessage(
  error: unknown,
  fallback = "Something went wrong",
): string {
  if (error instanceof HttpError) {
    if (error.body) {
      try {
        const parsed = JSON.parse(error.body);
        if (typeof parsed.detail === "string") {
          return parsed.detail;
        }
      } catch {
        // ignore parse failures
      }
    }
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return fallback;
}

async function parseResponse<T>(response: Response): Promise<T> {
  if (response.status === 204) {
    return undefined as T;
  }

  const contentLength = response.headers.get("content-length");
  if (contentLength === "0" || (!contentLength && response.status >= 200 && response.status < 300)) {
    try {
      return (await response.json()) as T;
    } catch {
      return undefined as T;
    }
  }

  return (await response.json()) as T;
}

export async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${env.apiBase}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    cache: "no-store",
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, `GET ${path} failed with ${response.status}`, text);
  }

  return parseResponse<T>(response);
}

export async function getParsedJson<T>(
  path: string,
  schema: ZodType<T>,
  init?: RequestInit,
): Promise<T> {
  const payload = await getJson<unknown>(path, init);
  return schema.parse(payload);
}

export async function postJson<T>(
  path: string,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const requestInit: RequestInit = {
    method: "POST",
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  };

  if (body !== undefined) {
    requestInit.body = JSON.stringify(body);
  }

  const response = await fetch(`${env.apiBase}${path}`, requestInit);

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, `POST ${path} failed with ${response.status}`, text);
  }

  return parseResponse<T>(response);
}

export async function postParsedJson<T>(
  path: string,
  schema: ZodType<T>,
  body?: unknown,
  init?: RequestInit,
): Promise<T> {
  const payload = await postJson<unknown>(path, body, init);
  return schema.parse(payload);
}

export async function putJson<T>(
  path: string,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(`${env.apiBase}${path}`, {
    method: "PUT",
    body: JSON.stringify(body),
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, `PUT ${path} failed with ${response.status}`, text);
  }

  return parseResponse<T>(response);
}

export async function putParsedJson<T>(
  path: string,
  schema: ZodType<T>,
  body: unknown,
  init?: RequestInit,
): Promise<T> {
  const payload = await putJson<unknown>(path, body, init);
  return schema.parse(payload);
}

export async function deleteRequest(
  path: string,
  init?: RequestInit,
): Promise<void> {
  const response = await fetch(`${env.apiBase}${path}`, {
    method: "DELETE",
    cache: "no-store",
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
    credentials: "include",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new HttpError(response.status, `DELETE ${path} failed with ${response.status}`, text);
  }
}
