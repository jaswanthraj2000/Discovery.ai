import * as React from "react";
import type { Source } from "@/lib/research-types";
import { ExternalLink, FileText, Database, FlaskConical, Atom, BookOpen } from "lucide-react";

const ICONS: Record<Source["type"], React.ElementType> = {
  journal: BookOpen,
  preprint: FileText,
  trial: FlaskConical,
  dataset: Database,
  structure: Atom,
};

const ACCESS_LABEL: Record<Source["access"], string> = {
  "open-access": "Open Access",
  abstract: "Abstract Only",
  "metadata-only": "Metadata Only",
};

export function CitationPill({ n, onClick }: { n: number; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center justify-center align-baseline mx-0.5 min-w-[1.5rem] h-5 px-1.5 rounded-full border border-primary/30 bg-primary/5 text-[10px] font-mono font-medium text-primary hover:bg-primary hover:text-primary-foreground transition-colors"
    >
      {n}
    </button>
  );
}

export function RetrievalMatchBadge({ band }: { band: NonNullable<Source["relevanceBand"]> }) {
  const styles: Record<NonNullable<Source["relevanceBand"]>, string> = {
    top: "bg-primary/10 text-primary border-primary/35",
    related: "bg-secondary text-secondary-foreground border-border",
    context: "bg-muted text-muted-foreground border-border",
  };
  const labels: Record<NonNullable<Source["relevanceBand"]>, string> = {
    top: "Strong match",
    related: "Related",
    context: "Broad context",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium ${styles[band]}`}
    >
      {labels[band]}
    </span>
  );
}

export function EvidenceBadge({
  kind,
}: {
  kind:
    | Source["evidence"]
    | "preprint"
    | "open-access"
    | "metadata-only"
    | "abstract"
    | "peer-reviewed";
}) {
  const map: Record<string, string> = {
    supporting: "bg-success/10 text-success border-success/30",
    conflicting: "bg-accent/10 text-accent border-accent/30",
    background: "bg-muted text-muted-foreground border-border",
    unspecified: "bg-muted text-muted-foreground border-dashed border-border",
    preprint: "bg-warning/15 text-warning-foreground border-warning/40",
    "open-access": "bg-success/10 text-success border-success/30",
    "metadata-only": "bg-muted text-muted-foreground border-border",
    abstract: "bg-secondary text-secondary-foreground border-border",
    "peer-reviewed": "bg-primary/10 text-primary border-primary/30",
  };
  const label: Record<string, string> = {
    supporting: "Supporting",
    conflicting: "Conflicting",
    background: "Background",
    unspecified: "Not classified",
    preprint: "Preprint",
    "open-access": "Open Access",
    "metadata-only": "Metadata Only",
    abstract: "Abstract",
    "peer-reviewed": "Peer Reviewed",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[10px] uppercase tracking-wider font-medium ${map[kind]}`}
    >
      {label[kind]}
    </span>
  );
}

export function SourceCard({ s }: { s: Source }) {
  const Icon = ICONS[s.type];
  return (
    <article className="paper-card p-4 transition-all hover:shadow-[var(--shadow-elevated)] hover:-translate-y-0.5">
      <div className="flex items-start gap-3">
        <div className="font-mono text-[11px] text-muted-foreground bg-secondary border border-border rounded px-1.5 py-0.5 shrink-0">
          [{s.id}]
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground mb-1.5">
            <Icon className="h-3 w-3" />
            <span className="font-mono">{s.source}</span>
            <span>·</span>
            <span>
              {s.year}
              {s.pubYearSuspect ? (
                <span title="Year adjusted from suspicious metadata"> †</span>
              ) : null}
            </span>
            {s.type === "preprint" && (
              <>
                <span>·</span>
                <EvidenceBadge kind="preprint" />
              </>
            )}
            {s.type === "journal" && s.access === "open-access" && (
              <>
                <span>·</span>
                <EvidenceBadge kind="peer-reviewed" />
              </>
            )}
          </div>
          <h4 className="font-serif text-[15px] leading-snug text-foreground text-balance">
            {s.title}
          </h4>
          <p className="mt-1.5 text-xs text-muted-foreground line-clamp-1">
            {s.authors} · <em>{s.venue}</em>
          </p>
          <div className="mt-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 flex-wrap">
              <EvidenceBadge kind={s.access} />
              {s.relevanceBand ? <RetrievalMatchBadge band={s.relevanceBand} /> : null}
              {s.relevanceAdjustments && s.relevanceAdjustments.length > 0 ? (
                <details className="text-[10px] text-muted-foreground max-w-[min(100%,22rem)]">
                  <summary className="cursor-pointer select-none hover:text-foreground">
                    Rank heuristics
                  </summary>
                  <ul className="mt-1 space-y-0.5 font-mono border border-border rounded px-2 py-1.5 bg-secondary/40">
                    {s.relevanceAdjustments.map((a, i) => (
                      <li key={`${a.label}-${i}`}>
                        {a.label}: {a.delta > 0 ? "+" : ""}
                        {a.delta}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
            <a
              href={s.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline shrink-0"
            >
              Open <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>
      </div>
    </article>
  );
}

export function EntityChip({ type, name }: { type: string; name: string }) {
  const colorMap: Record<string, string> = {
    Disease: "border-accent/40 text-accent",
    Gene: "border-primary/40 text-primary",
    Protein: "border-primary/40 text-primary",
    Compound: "border-success/40 text-success",
    Trial: "border-warning/50 text-warning-foreground",
    Pathway: "border-muted-foreground/40 text-muted-foreground",
    Topic: "border-primary/30 text-primary",
  };
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border bg-card px-2.5 py-1 text-xs ${colorMap[type] ?? "border-border"}`}
    >
      <span className="text-[9px] uppercase tracking-widest opacity-60">{type}</span>
      <span className="font-medium text-foreground">{name}</span>
    </span>
  );
}
