"use client";

import { FormEvent } from "react";
import { Loader2, X } from "lucide-react";

interface SaveListModalProps {
  open: boolean;
  name: string;
  error: string | null;
  isSaving: boolean;
  onNameChange: (value: string) => void;
  onClose: () => void;
  onConfirm: () => Promise<void> | void;
}

export function SaveListModal({
  open,
  name,
  error,
  isSaving,
  onNameChange,
  onClose,
  onConfirm,
}: SaveListModalProps) {
  if (!open) {
    return null;
  }

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await onConfirm();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 px-4 py-6 backdrop-blur">
      <div className="relative w-full max-w-sm rounded-3xl border border-slate-800 bg-slate-900/90 p-6 text-slate-100 shadow-2xl shadow-slate-900/60">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-full border border-slate-700/70 bg-slate-900/70 p-1 text-slate-300 transition hover:border-slate-500 hover:text-white"
          aria-label="Close save dialog"
        >
          <X className="h-4 w-4" />
        </button>

        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-slate-400">Panelyt</p>
        <h2 className="mt-2 text-2xl font-semibold text-white">Save current selection</h2>
        <p className="mt-2 text-sm text-slate-400">
          Give this set a name so you can reload it or compare prices later.
        </p>

        <form className="mt-6 space-y-4" onSubmit={handleSubmit}>
          <div>
            <label htmlFor="save-list-name" className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              List name
            </label>
            <input
              id="save-list-name"
              value={name}
              onChange={(event) => onNameChange(event.target.value)}
              placeholder="e.g. Annual checkup"
              autoFocus
              className="mt-1 w-full rounded-xl border border-slate-700 bg-slate-950/60 px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-emerald-400 focus:outline-none focus:ring-2 focus:ring-emerald-400"
            />
          </div>

          {error && <p className="text-sm text-red-300">{error}</p>}

          <button
            type="submit"
            disabled={isSaving}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500 px-4 py-2.5 text-sm font-semibold text-slate-950 shadow-md shadow-emerald-500/30 transition focus:outline-none focus:ring-2 focus:ring-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSaving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save list
          </button>
        </form>
      </div>
    </div>
  );
}
