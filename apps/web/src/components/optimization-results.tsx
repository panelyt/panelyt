"use client";

import type { OptimizeResponse } from "@panelyt/types";

import { formatCurrency, formatGroszToPln } from "../lib/format";

interface Props {
  selected: string[];
  result?: OptimizeResponse;
  isLoading: boolean;
  error?: Error | null;
}

export function OptimizationResults({ selected, result, isLoading, error }: Props) {
  if (selected.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-slate-300 bg-white p-6 text-sm text-slate-500">
        Select at least one biomarker to see the cheapest mix of single tests and packages.
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="rounded-lg border border-slate-200 bg-white p-6 text-sm text-slate-500">
        Calculating optimal combination…
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-6 text-sm text-red-700">
        Optimization failed: {error.message}
      </div>
    );
  }

  if (!result) {
    return null;
  }

  const groups = groupByKind(result.items);

  return (
    <div className="flex flex-col gap-6">
      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Optimal basket</h2>
            <p className="text-sm text-slate-500">
              Covers {selected.length} biomarker{selected.length === 1 ? "" : "s"} using the
              lowest current prices.
            </p>
          </div>
          <div className="flex gap-6 text-right text-sm">
            <div>
              <p className="text-slate-500">Current total</p>
              <p className="text-lg font-semibold text-slate-900">
                {formatCurrency(result.total_now)}
              </p>
            </div>
            <div>
              <p className="text-slate-500">Panelyt 30-day minimum</p>
              <p className="text-lg font-semibold text-emerald-600">
                {formatCurrency(result.total_min30)}
              </p>
            </div>
          </div>
        </div>
        {result.uncovered.length > 0 && (
          <p className="mt-4 text-sm text-orange-600">
            Unable to cover: {result.uncovered.join(", ")}. These biomarkers are missing from
            the catalog.
          </p>
        )}
      </header>

      <section className="grid gap-4 md:grid-cols-2">
        {groups.map((group) => (
          <div key={group.kind} className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <h3 className="mb-3 flex items-center justify-between text-sm font-semibold uppercase text-slate-500">
              {group.kind === "package" ? "Packages" : "Single tests"}
              <span className="text-xs font-normal text-slate-400">
                {group.items.length} item{group.items.length === 1 ? "" : "s"}
              </span>
            </h3>
            {group.items.length === 0 ? (
              <p className="text-sm text-slate-500">No {group.kind}s selected.</p>
            ) : (
              <ul className="space-y-3">
                {group.items.map((item) => (
                  <li key={item.id} className="rounded-md border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-sm font-semibold text-slate-900 hover:text-brand"
                        >
                          {item.name}
                        </a>
                        <p className="mt-1 text-xs uppercase text-slate-400">
                          Covers: {item.biomarkers.join(", ")}
                        </p>
                      </div>
                      <div className="text-right text-xs text-slate-500">
                        <p>Current</p>
                        <p className="text-sm font-semibold text-slate-900">
                          {formatGroszToPln(item.price_now_grosz)}
                        </p>
                        <p className="mt-1 text-slate-500">Panelyt 30-day min</p>
                        <p className="text-sm font-semibold text-emerald-600">
                          {formatGroszToPln(item.price_min30_grosz)}
                        </p>
                      </div>
                    </div>
                    {item.on_sale && (
                      <p className="mt-2 inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide text-amber-700">
                        On sale
                      </p>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </section>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        <h3 className="text-sm font-semibold uppercase text-slate-500">Coverage matrix</h3>
        <dl className="mt-3 grid gap-2 md:grid-cols-2">
          {Object.entries(result.explain).map(([token, items]) => (
            <div key={token} className="rounded-md border border-slate-100 bg-slate-50 p-3">
              <dt className="text-xs font-semibold uppercase text-slate-500">{token}</dt>
              <dd className="text-sm text-slate-700">{items.join(", ")}</dd>
            </div>
          ))}
        </dl>
      </section>
    </div>
  );
}

function groupByKind(items: OptimizeResponse["items"]) {
  const packages: OptimizeResponse["items"] = [];
  const singles: OptimizeResponse["items"] = [];
  for (const item of items) {
    if (item.kind === "package") {
      packages.push(item);
    } else {
      singles.push(item);
    }
  }
  return [
    { kind: "package" as const, items: packages },
    { kind: "single" as const, items: singles },
  ];
}
