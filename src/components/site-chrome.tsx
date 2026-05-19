import { Link, useLocation } from "@tanstack/react-router";
import { useState } from "react";
import { Menu, X } from "lucide-react";

const NAV = [
  { to: "/", label: "Home" },
  { to: "/ask", label: "Ask", search: { q: "" } as const },
  { to: "/evidence", label: "Evidence Map", search: { q: "" } as const },
  { to: "/hypothesis", label: "Hypothesis" },
  { to: "/workspace", label: "Workspace" },
] as const;

export function SiteHeader() {
  const loc = useLocation();
  const [open, setOpen] = useState(false);
  return (
    <header className="sticky top-0 z-40 border-b border-border bg-background/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
        <Link to="/" className="flex items-center gap-2.5 group">
          <div className="relative h-7 w-7">
            <div className="absolute inset-0 rounded-sm bg-primary" />
            <div className="absolute inset-[3px] rounded-[2px] bg-background" />
            <div className="absolute inset-[6px] rounded-[1px] bg-accent" />
          </div>
          <div className="flex flex-col leading-none">
            <span className="font-serif text-lg tracking-tight">Discovery OS</span>
            <span className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground">Open Science</span>
          </div>
        </Link>

        <nav className="hidden md:flex items-center gap-1">
          {NAV.map((n) => {
            const active = loc.pathname === n.to || (n.to !== "/" && loc.pathname.startsWith(n.to));
            return (
              <Link
                key={n.to}
                to={n.to}
                {...("search" in n ? { search: n.search } : {})}
                className={`px-3 py-1.5 text-sm rounded-md transition-colors ${
                  active ? "text-foreground bg-secondary" : "text-muted-foreground hover:text-foreground hover:bg-secondary/60"
                }`}
              >
                {n.label}
              </Link>
            );
          })}
        </nav>

        <div className="hidden md:flex items-center gap-3">
          <span className="text-[11px] text-muted-foreground font-mono">v0.4 · research preview</span>
        </div>

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="md:hidden p-2 -mr-2"
          aria-label="Menu"
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden border-t border-border px-6 py-3 space-y-1">
          {NAV.map((n) => (
            <Link
              key={n.to}
              to={n.to}
              {...("search" in n ? { search: n.search } : {})}
              onClick={() => setOpen(false)}
              className="block px-3 py-2 text-sm rounded-md hover:bg-secondary"
            >
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-border bg-card/40">
      <div className="mx-auto max-w-7xl px-6 py-12 grid gap-8 md:grid-cols-4">
        <div className="md:col-span-2">
          <div className="font-serif text-xl">Discovery OS</div>
          <p className="mt-2 text-sm text-muted-foreground max-w-sm">
            An evidence-backed scientific discovery engine built exclusively on legal, public, and open biomedical data.
          </p>
          <p className="mt-4 text-xs text-muted-foreground font-mono">
            Not medical advice. Research use only.
          </p>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Sources</div>
          <ul className="space-y-1.5 text-sm">
            <li>OpenAlex</li>
            <li>PubMed / Europe PMC</li>
            <li>Crossref</li>
            <li>ChEMBL</li>
            <li>ClinicalTrials.gov</li>
            <li>RCSB PDB</li>
          </ul>
        </div>
        <div>
          <div className="text-xs uppercase tracking-widest text-muted-foreground mb-3">Product</div>
          <ul className="space-y-1.5 text-sm">
            <li>
              <Link to="/ask" search={{ q: "" }} className="hover:text-primary">
                Ask
              </Link>
            </li>
            <li>
              <Link to="/evidence" search={{ q: "" }} className="hover:text-primary">
                Evidence Map
              </Link>
            </li>
            <li>
              <Link to="/workspace" className="hover:text-primary">
                Workspace
              </Link>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-border py-5 text-center text-xs text-muted-foreground">
        © 2026 Discovery OS · Open data, transparent reasoning.
      </div>
    </footer>
  );
}
