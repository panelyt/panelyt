import { expect, test, type Page } from "@playwright/test";

const DEFAULT_ORIGIN = "http://127.0.0.1:3000";

const DEFAULT_SESSION = {
  user_id: "user-1",
  username: "Egor",
  registered: true,
  is_admin: false,
};

const DEFAULT_ACCOUNT_SETTINGS = {
  telegram: {
    enabled: false,
    chat_id: null,
    linked_at: null,
    link_token: null,
    link_token_expires_at: null,
    bot_username: null,
    link_url: null,
  },
  preferred_institution_id: null,
  preferred_institution_label: null,
};

const DEFAULT_INSTITUTION = {
  id: 1135,
  name: "Diag Warszawa Centrum",
  city: "Warsaw",
  address: "Marszalkowska 1",
  slug: "diag-centrum",
  city_slug: "warszawa",
};

const DEFAULT_BIOMARKER = {
  id: 101,
  name: "ALT",
  elab_code: "ALT",
  slug: "alt",
  price_now_grosz: 1200,
};

const OPTIMIZE_ITEM = {
  id: 501,
  kind: "single",
  name: "ALT",
  slug: "alt",
  price_now_grosz: 1200,
  price_min30_grosz: 1500,
  currency: "PLN",
  biomarkers: ["ALT"],
  url: "https://diag.pl/alt",
  on_sale: false,
  is_synthetic_package: false,
};

const OPTIMIZE_RESPONSE = {
  total_now: 12,
  total_min30: 15,
  currency: "PLN",
  items: [OPTIMIZE_ITEM],
  bonus_total_now: 0,
  bonus_biomarkers: [],
  explain: { ALT: ["ALT"] },
  uncovered: [],
  labels: { ALT: "ALT" },
  addon_suggestions: [],
};

const ADDON_SUGGESTIONS_RESPONSE = {
  addon_suggestions: [],
  labels: {},
};

type ApiState = {
  lists: Array<{
    id: string;
    name: string;
    created_at: string;
    updated_at: string;
    share_token: string | null;
    shared_at: string | null;
    notify_on_price_drop: boolean;
    last_known_total_grosz: number | null;
    last_total_updated_at: string | null;
    last_notified_total_grosz: number | null;
    last_notified_at: string | null;
    biomarkers: Array<{
      id: string;
      code: string;
      display_name: string;
      sort_order: number;
      biomarker_id: number | null;
      created_at: string;
    }>;
  }>;
  nextListId: number;
};

const createApiState = (): ApiState => ({
  lists: [],
  nextListId: 1,
});

const corsHeadersFor = (pageOrigin: string) => ({
  "access-control-allow-origin": pageOrigin,
  "access-control-allow-credentials": "true",
  "access-control-allow-headers": "content-type",
  "access-control-allow-methods": "GET,POST,PATCH,PUT,DELETE,OPTIONS",
});

const readJsonBody = (body: string | null) => {
  if (!body) {
    return null;
  }
  try {
    return JSON.parse(body) as Record<string, unknown>;
  } catch {
    return null;
  }
};

const buildSavedList = (
  id: string,
  payload: { name?: string; biomarkers?: Array<{ code?: string; name?: string }> },
) => {
  const timestamp = new Date().toISOString();
  const entries = (payload.biomarkers ?? []).map((biomarker, index) => ({
    id: `${id}-${index + 1}`,
    code: biomarker.code ?? "",
    display_name: biomarker.name ?? biomarker.code ?? "",
    sort_order: index,
    biomarker_id: null,
    created_at: timestamp,
  }));
  return {
    id,
    name: payload.name ?? "Untitled",
    created_at: timestamp,
    updated_at: timestamp,
    share_token: null,
    shared_at: null,
    notify_on_price_drop: false,
    last_known_total_grosz: null,
    last_total_updated_at: null,
    last_notified_total_grosz: null,
    last_notified_at: null,
    biomarkers: entries,
  };
};

const buildBatchResults = (codes: string[]) => {
  const results: Record<string, typeof DEFAULT_BIOMARKER | null> = {};
  for (const code of codes) {
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      continue;
    }
    results[normalized] = {
      ...DEFAULT_BIOMARKER,
      name: normalized,
      elab_code: normalized,
      slug: normalized.toLowerCase(),
    };
  }
  return results;
};

const setupApiRoutes = async (page: Page, state: ApiState) => {
  await page.route(/http:\/\/(localhost|127\.0\.0\.1):8000\/.*/, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const method = request.method();
    const pageOrigin = request.headers()["origin"] ?? DEFAULT_ORIGIN;
    const corsHeaders = corsHeadersFor(pageOrigin);
    const respondJson = async (payload: unknown, status = 200) => {
      await route.fulfill({
        status,
        headers: corsHeaders,
        contentType: "application/json",
        body: JSON.stringify(payload),
      });
    };

    if (method === "OPTIONS") {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }

    if (method === "POST" && url.pathname === "/users/session") {
      await respondJson(DEFAULT_SESSION);
      return;
    }

    if (method === "GET" && url.pathname === "/account/settings") {
      await respondJson(DEFAULT_ACCOUNT_SETTINGS);
      return;
    }

    if (method === "PATCH" && url.pathname === "/account/settings") {
      const payload = readJsonBody(request.postData());
      const preferredId = payload?.preferred_institution_id;
      await respondJson({
        ...DEFAULT_ACCOUNT_SETTINGS,
        preferred_institution_id: typeof preferredId === "number" ? preferredId : null,
        preferred_institution_label:
          typeof preferredId === "number" ? DEFAULT_INSTITUTION.name : null,
      });
      return;
    }

    if (method === "GET" && url.pathname === `/institutions/${DEFAULT_INSTITUTION.id}`) {
      await respondJson(DEFAULT_INSTITUTION);
      return;
    }

    if (method === "GET" && url.pathname === "/institutions/search") {
      await respondJson({ results: [] });
      return;
    }

    if (method === "GET" && url.pathname === "/catalog/search") {
      const query = url.searchParams.get("query") ?? "";
      const normalized = query.trim().toUpperCase();
      const results = normalized.includes("ALT")
        ? [
            {
              type: "biomarker",
              id: DEFAULT_BIOMARKER.id,
              name: DEFAULT_BIOMARKER.name,
              elab_code: DEFAULT_BIOMARKER.elab_code,
              slug: DEFAULT_BIOMARKER.slug,
              price_now_grosz: DEFAULT_BIOMARKER.price_now_grosz,
            },
          ]
        : [];
      await respondJson({ results });
      return;
    }

    if (method === "POST" && url.pathname === "/catalog/biomarkers/batch") {
      const payload = readJsonBody(request.postData());
      const codes = Array.isArray(payload?.codes) ? payload?.codes : [];
      await respondJson({ results: buildBatchResults(codes) });
      return;
    }

    if (method === "POST" && url.pathname === "/optimize") {
      await respondJson(OPTIMIZE_RESPONSE);
      return;
    }

    if (method === "POST" && url.pathname === "/optimize/addons") {
      await respondJson(ADDON_SUGGESTIONS_RESPONSE);
      return;
    }

    if (method === "GET" && url.pathname === "/lists") {
      await respondJson({ lists: state.lists });
      return;
    }

    if (method === "POST" && url.pathname === "/lists") {
      const payload = readJsonBody(request.postData());
      const id = `list-${state.nextListId}`;
      state.nextListId += 1;
      const list = buildSavedList(id, payload ?? {});
      state.lists = [...state.lists, list];
      await respondJson(list);
      return;
    }

    await respondJson({ error: `Unhandled ${method} ${url.pathname}` }, 500);
    throw new Error(`Unhandled API route: ${method} ${url.pathname}`);
  });
};

test.describe("optimizer e2e", () => {
  test("searches, selects, and sees optimization results", async ({ page }) => {
    const apiState = createApiState();
    await setupApiRoutes(page, apiState);

    await page.goto("/en");
    const search = page.getByRole("combobox", { name: "Search tests to add..." });
    await search.fill("ALT");
    await page.getByRole("option", { name: "ALT" }).click();

    await expect(page.getByRole("button", { name: "Remove ALT" })).toBeVisible();
    await expect(page.getByTestId("price-breakdown-total")).toBeVisible();
  });

  test("saves a list and keeps it after reload", async ({ page }) => {
    const apiState = createApiState();
    await setupApiRoutes(page, apiState);

    await page.goto("/en");
    const search = page.getByRole("combobox", { name: "Search tests to add..." });
    await search.fill("ALT");
    await page.getByRole("option", { name: "ALT" }).click();
    await expect(page.getByRole("button", { name: "Remove ALT" })).toBeVisible();

    await page
      .getByTestId("sticky-summary-bar")
      .getByRole("button", { name: "Save" })
      .click();
    await page.getByLabel("Panel name").fill("Annual checkup");
    await page.getByRole("button", { name: "Save panel" }).click();
    await expect(page.locator("#save-list-name")).toBeHidden();

    await page.reload();
    await page.getByRole("button", { name: "Load" }).click();
    await expect(
      page.getByRole("menuitem", { name: /Annual checkup/ }),
    ).toBeVisible();
  });
});
