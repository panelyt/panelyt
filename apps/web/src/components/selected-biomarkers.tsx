"use client";

interface Props {
  biomarkers: string[];
  onRemove: (biomarker: string) => void;
}

export function SelectedBiomarkers({ biomarkers, onRemove }: Props) {
  if (biomarkers.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        Add biomarkers to compare prices across packages and single tests.
      </p>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {biomarkers.map((token) => (
        <button
          key={token}
          type="button"
          onClick={() => onRemove(token)}
          className="group flex items-center gap-2 rounded-full border border-brand bg-brand/5 px-3 py-1 text-xs font-semibold uppercase text-brand transition hover:bg-brand hover:text-white"
        >
          {token}
          <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-normal uppercase text-brand group-hover:bg-white/20 group-hover:text-white">
            Remove
          </span>
        </button>
      ))}
    </div>
  );
}
