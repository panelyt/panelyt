import type { MetadataRoute } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || "https://panelyt.com";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
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
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
        },
      },
    });

    // English
    entries.push({
      url: `${BASE_URL}/en${route.path}`,
      lastModified: new Date(),
      changeFrequency: "daily",
      priority: route.priority,
      alternates: {
        languages: {
          pl: `${BASE_URL}${route.path}`,
          en: `${BASE_URL}/en${route.path}`,
        },
      },
    });
  }

  // TODO: Fetch dynamic template slugs from API and add them

  return entries;
}
