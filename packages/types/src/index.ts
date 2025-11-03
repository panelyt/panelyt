import { z } from "zod";

export const BiomarkerSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  elab_code: z.string().nullable(),
  slug: z.string().nullable(),
  lab_prices: z
    .record(z.string(), z.number().int().nonnegative())
    .default({}),
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
  lab_code: z.string(),
  lab_name: z.string(),
});

export type Item = z.infer<typeof ItemSchema>;

export const OptimizeModeSchema = z.enum(["auto", "single_lab", "split"]);

export type OptimizeMode = z.infer<typeof OptimizeModeSchema>;

export const OptimizeRequestSchema = z
  .object({
    biomarkers: z.array(z.string().min(1)).min(1),
    mode: OptimizeModeSchema.default("auto"),
    lab_code: z.string().min(1).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.mode === "single_lab" && !data.lab_code) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "lab_code is required when mode is single_lab",
        path: ["lab_code"],
      });
    }
  });

export type OptimizeRequest = z.infer<typeof OptimizeRequestSchema>;

export const LabAvailabilitySchema = z.object({
  code: z.string(),
  name: z.string(),
  covers_all: z.boolean(),
  missing_tokens: z.array(z.string()).default([]),
});

export type LabAvailability = z.infer<typeof LabAvailabilitySchema>;

export const LabSelectionSummarySchema = z.object({
  code: z.string(),
  name: z.string(),
  total_now_grosz: z.number().int().nonnegative(),
  items: z.number().int().nonnegative(),
});

export type LabSelectionSummary = z.infer<typeof LabSelectionSummarySchema>;

export const AddOnSuggestionSchema = z.object({
  item: ItemSchema,
  matched_tokens: z.array(z.string()).default([]),
  bonus_tokens: z.array(z.string()).default([]),
  already_included_tokens: z.array(z.string()).default([]),
  incremental_now: z.number().nonnegative(),
  incremental_now_grosz: z.number().int().nonnegative(),
});

export type AddOnSuggestion = z.infer<typeof AddOnSuggestionSchema>;

export const OptimizeResponseSchema = z.object({
  total_now: z.number().nonnegative(),
  total_min30: z.number().nonnegative(),
  currency: z.string(),
  items: z.array(ItemSchema),
  bonus_total_now: z.number().nonnegative().default(0),
  explain: z.record(z.string(), z.array(z.string())),
  uncovered: z.array(z.string()),
  lab_code: z.string().default(""),
  lab_name: z.string().default(""),
  exclusive: z.record(z.string(), z.string()).default({}),
  labels: z.record(z.string(), z.string()).default({}),
  mode: OptimizeModeSchema.default("auto"),
  lab_options: z.array(LabAvailabilitySchema).default([]),
  lab_selections: z.array(LabSelectionSummarySchema).default([]),
  add_on_suggestions: z.array(AddOnSuggestionSchema).default([]),
});

export type OptimizeResponse = z.infer<typeof OptimizeResponseSchema>;

export const CredentialsSchema = z.object({
  username: z.string().min(3).max(64),
  password: z.string().min(8).max(128),
});

export type Credentials = z.infer<typeof CredentialsSchema>;

export const SessionResponseSchema = z.object({
  user_id: z.string(),
  username: z.string().nullable(),
  registered: z.boolean(),
  is_admin: z.boolean(),
});

export type SessionResponse = z.infer<typeof SessionResponseSchema>;

export const TelegramLinkStatusSchema = z.object({
  enabled: z.boolean(),
  chat_id: z.string().nullable(),
  linked_at: z.string().nullable(),
  link_token: z.string().nullable(),
  link_token_expires_at: z.string().nullable(),
  bot_username: z.string().nullable(),
  link_url: z.string().nullable(),
});

export type TelegramLinkStatus = z.infer<typeof TelegramLinkStatusSchema>;

export const AccountSettingsSchema = z.object({
  telegram: TelegramLinkStatusSchema,
});

export type AccountSettings = z.infer<typeof AccountSettingsSchema>;

export const TelegramLinkTokenResponseSchema = z.object({
  telegram: TelegramLinkStatusSchema,
});

export type TelegramLinkTokenResponse = z.infer<typeof TelegramLinkTokenResponseSchema>;

export const SavedListEntrySchema = z.object({
  id: z.string(),
  code: z.string(),
  display_name: z.string(),
  sort_order: z.number().int(),
  biomarker_id: z.number().int().nullable(),
  created_at: z.string(),
});

export type SavedListEntry = z.infer<typeof SavedListEntrySchema>;

export const SavedListSchema = z.object({
  id: z.string(),
  name: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  share_token: z.string().nullable(),
  shared_at: z.string().nullable(),
  notify_on_price_drop: z.boolean(),
  last_known_total_grosz: z.number().int().nullable(),
  last_total_updated_at: z.string().nullable(),
  last_notified_total_grosz: z.number().int().nullable(),
  last_notified_at: z.string().nullable(),
  biomarkers: z.array(SavedListEntrySchema),
});

export type SavedList = z.infer<typeof SavedListSchema>;

export const SavedListCollectionSchema = z.object({
  lists: z.array(SavedListSchema),
});

export type SavedListCollection = z.infer<typeof SavedListCollectionSchema>;

export const SavedListNotificationRequestSchema = z.object({
  notify_on_price_drop: z.boolean(),
});

export type SavedListNotificationRequest = z.infer<
  typeof SavedListNotificationRequestSchema
>;

export const SavedListNotificationResponseSchema = z.object({
  list_id: z.string(),
  notify_on_price_drop: z.boolean(),
  last_known_total_grosz: z.number().int().nullable(),
  last_total_updated_at: z.string().nullable(),
});

export type SavedListNotificationResponse = z.infer<
  typeof SavedListNotificationResponseSchema
>;

export const SavedListNotificationsBulkResponseSchema = z.object({
  lists: z.array(SavedListNotificationResponseSchema),
});

export type SavedListNotificationsBulkResponse = z.infer<
  typeof SavedListNotificationsBulkResponseSchema
>;

export const SavedListShareRequestSchema = z.object({
  regenerate: z.boolean().optional().default(false),
});

export type SavedListShareRequest = z.infer<typeof SavedListShareRequestSchema>;

export const SavedListShareResponseSchema = z.object({
  list_id: z.string(),
  share_token: z.string(),
  shared_at: z.string(),
});

export type SavedListShareResponse = z.infer<typeof SavedListShareResponseSchema>;

export const SavedListUpsertSchema = z.object({
  name: z.string().min(1).max(128),
  biomarkers: z
    .array(
      z.object({
        code: z.string().min(1).max(128),
        name: z.string().min(1).max(255),
      }),
    )
    .max(100),
});

export type SavedListUpsert = z.infer<typeof SavedListUpsertSchema>;

export const BiomarkerReferenceSchema = z.object({
  id: z.number().int().positive(),
  name: z.string(),
  elab_code: z.string().nullable(),
  slug: z.string().nullable(),
});

export type BiomarkerReference = z.infer<typeof BiomarkerReferenceSchema>;

export const BiomarkerListEntrySchema = z.object({
  id: z.number().int().positive(),
  code: z.string(),
  display_name: z.string(),
  sort_order: z.number().int(),
  biomarker: BiomarkerReferenceSchema.nullable(),
  notes: z.string().nullable(),
});

export type BiomarkerListEntry = z.infer<typeof BiomarkerListEntrySchema>;

export const BiomarkerListTemplateSchema = z.object({
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  is_active: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  biomarkers: z.array(BiomarkerListEntrySchema),
});

export type BiomarkerListTemplate = z.infer<typeof BiomarkerListTemplateSchema>;

export const BiomarkerListTemplateCollectionSchema = z.object({
  templates: z.array(BiomarkerListTemplateSchema),
});

export type BiomarkerListTemplateCollection = z.infer<
  typeof BiomarkerListTemplateCollectionSchema
>;

export const BiomarkerTemplateEntryPayloadSchema = z.object({
  code: z.string().min(1).max(128),
  display_name: z.string().min(1).max(255),
  notes: z.string().max(1024).nullable().optional(),
});

export type BiomarkerTemplateEntryPayload = z.infer<
  typeof BiomarkerTemplateEntryPayloadSchema
>;

export const BiomarkerListTemplateUpsertSchema = z.object({
  slug: z.string().min(1).max(128),
  name: z.string().min(1).max(128),
  description: z.string().max(512).nullable(),
  is_active: z.boolean(),
  biomarkers: z
    .array(BiomarkerTemplateEntryPayloadSchema)
    .max(200)
    .default([]),
});

export type BiomarkerListTemplateUpsert = z.infer<
  typeof BiomarkerListTemplateUpsertSchema
>;

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

export const CatalogBiomarkerResultSchema = z.object({
  type: z.literal('biomarker'),
  id: z.number().int().positive(),
  name: z.string(),
  elab_code: z.string().nullable(),
  slug: z.string().nullable(),
  lab_prices: z
    .record(z.string(), z.number().int().nonnegative())
    .default({}),
});

export type CatalogBiomarkerResult = z.infer<typeof CatalogBiomarkerResultSchema>;

export const CatalogTemplateResultSchema = z.object({
  type: z.literal('template'),
  id: z.number().int().positive(),
  slug: z.string(),
  name: z.string(),
  description: z.string().nullable(),
  biomarker_count: z.number().int().nonnegative(),
});

export type CatalogTemplateResult = z.infer<typeof CatalogTemplateResultSchema>;

export const CatalogSearchResultSchema = z.discriminatedUnion('type', [
  CatalogBiomarkerResultSchema,
  CatalogTemplateResultSchema,
]);

export type CatalogSearchResult = z.infer<typeof CatalogSearchResultSchema>;

export const CatalogSearchResponseSchema = z.object({
  results: z.array(CatalogSearchResultSchema),
});

export type CatalogSearchResponse = z.infer<typeof CatalogSearchResponseSchema>;
