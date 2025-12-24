import { Github, Mail } from "lucide-react";

export function Footer() {
  return (
    <footer className="border-t border-slate-800 bg-slate-950 py-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <span className="text-sm text-slate-500">
          &copy; {new Date().getFullYear()} Panelyt
        </span>
        <div className="flex items-center gap-4">
          <a
            href="mailto:contact@panelyt.com"
            className="flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <Mail className="h-4 w-4" />
            <span className="hidden sm:inline">Contact</span>
          </a>
          <a
            href="https://github.com/panelyt/panelyt"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-slate-400 transition hover:text-slate-200"
          >
            <Github className="h-4 w-4" />
            <span className="hidden sm:inline">GitHub</span>
          </a>
        </div>
      </div>
    </footer>
  );
}
