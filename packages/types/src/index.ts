import { z } from "zod";

export const BiomarkerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  elab_code: z.string().nullable(),
  slug: z.string().nullable(),
});

export type Biomarker = z.infer<typeof BiomarkerSchema>;

export const ItemSchema = z.object({
  id: z.number().int().positive(),
  kind: z.enum(["single", "package"]),
  name: z.string(),
  slug: z.string(),
  price_now_grosz: z.number().int().nonnegative(),
  price_min30_grosz: z.number().int().nonnegative(),
  currency: z.string(),
  biomarkers: z.array(z.string()),
  url: z.string().url(),
  on_sale: z.boolean(),
});

export type Item = z.infer<typeof ItemSchema>;

export const OptimizeRequestSchema = z.object({
  biomarkers: z.array(z.string().min(1)).min(1),
});

export type OptimizeRequest = z.infer<typeof OptimizeRequestSchema>;

export const OptimizeResponseSchema = z.object({
  total_now: z.number().nonnegative(),
  total_min30: z.number().nonnegative(),
  currency: z.string(),
  items: z.array(ItemSchema),
  explain: z.record(z.string(), z.array(z.string())),
  uncovered: z.array(z.string()),
});

export type OptimizeResponse = z.infer<typeof OptimizeResponseSchema>;

export const CatalogMetaSchema = z.object({
  item_count: z.number().int().nonnegative(),
  biomarker_count: z.number().int().nonnegative(),
  latest_fetched_at: z.string().nullable(),
  snapshot_days_covered: z.number().int().min(0).max(30),
  percent_with_today_snapshot: z.number().min(0).max(100),
});

export type CatalogMeta = z.infer<typeof CatalogMetaSchema>;

export const BiomarkerSearchResponseSchema = z.object({
  results: z.array(BiomarkerSchema.pick({ name: true, elab_code: true, slug: true })),
});

export type BiomarkerSearchResponse = z.infer<
  typeof BiomarkerSearchResponseSchema
>;
