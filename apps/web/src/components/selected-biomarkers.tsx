"use client";

interface SelectedBiomarker {
  code: string;
  name: string;
}

interface Props {
  biomarkers: SelectedBiomarker[];
  onRemove: (code: string) => void;
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
      {biomarkers.map((biomarker) => (
        <button
          key={biomarker.code}
          type="button"
          onClick={() => onRemove(biomarker.code)}
          className="flex items-center rounded-full border border-brand bg-brand/5 px-3 py-1 text-xs font-semibold text-brand transition-colors hover:border-red-500 hover:bg-red-500 hover:text-white"
          title={`Remove ${biomarker.name}`}
        >
          {biomarker.name}
        </button>
      ))}
    </div>
  );
}
