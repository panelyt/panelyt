import type { MetadataRoute } from "next";

import { BASE_URL } from "@/lib/config";
import { env } from "@/lib/env";

interface TemplatesResponse {
  templates: Array<{ slug: string }>;
}

/**
 * Fetches template slugs from the API for sitemap generation.
 * Returns an empty array if the fetch fails to ensure sitemap generation continues.
 */
export async function fetchTemplateSlugs(): Promise<string[]> {
  try {
    const response = await fetch(`${env.apiBase}/biomarker-lists/templates`, {
      headers: { "content-type": "application/json" },
      next: { revalidate: 3600 },
    });

    if (!response.ok) {
      return [];
    }

    const data: unknown = await response.json();
    if (
      typeof data !== "object" ||
      data === null ||
      !("templates" in data) ||
      !Array.isArray((data as TemplatesResponse).templates)
    ) {
      return [];
    }

    return (data as TemplatesResponse).templates
      .filter((t) => typeof t.slug === "string")
      .map((t) => t.slug);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticRoutes = [
    { path: "/", priority: 1.0 },
    { path: "/collections", priority: 0.8 },
    { path: "/lists", priority: 0.6 },
    { path: "/account", priority: 0.4 },
  ];

  const entries: MetadataRoute.Sitemap = [];

  // Add static routes for both locales
  for (const route of staticRoutes) {
    // Polish (default, no prefix)
    entries.push({
      url: `${BASE_URL}${route.path}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
          "x-default": `${BASE_URL}${route.path}`,
        },
      },
    });

    // English
    entries.push({
      url: `${BASE_URL}/en${route.path}`,
      lastModified: now,
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
          "x-default": `${BASE_URL}${route.path}`,
        },
      },
    });
  }

  // Add dynamic template routes for both locales
  const templateSlugs = await fetchTemplateSlugs();
  for (const slug of templateSlugs) {
    const path = `/collections/${slug}`;

    // Polish (default, no prefix)
    entries.push({
      url: `${BASE_URL}${path}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          pl: `${BASE_URL}${path}`,
          en: `${BASE_URL}/en${path}`,
          "x-default": `${BASE_URL}${path}`,
        },
      },
    });

    // English
    entries.push({
      url: `${BASE_URL}/en${path}`,
      lastModified: now,
      changeFrequency: "weekly",
      priority: 0.7,
      alternates: {
        languages: {
          pl: `${BASE_URL}${path}`,
          en: `${BASE_URL}/en${path}`,
          "x-default": `${BASE_URL}${path}`,
        },
      },
    });
  }

  return entries;
}
