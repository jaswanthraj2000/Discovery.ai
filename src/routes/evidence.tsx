import { createFileRoute } from "@tanstack/react-router";
import { searchLiterature } from "@/lib/literature/search";
import { EntityChip } from "@/components/research-ui";
import { Filter } from "lucide-react";

type EvidenceSearch = { q: string };

export const Route = createFileRoute("/evidence")({
  validateSearch: (raw: Record<string, unknown>): EvidenceSearch => ({
    q: typeof raw.q === "string" ? raw.q : "",
  }),
  loader: async ({ location }) => {
    const raw = (location.search as EvidenceSearch).q.trim();
    const q = raw || "idiopathic pulmonary fibrosis";
    const { sources, entities } = await searchLiterature(q);
    const years = [...new Set(sources.map((s) => s.year))].sort((a, b) => a - b);
    return { sources, entities, query: q, years };
  },
  head: () => ({
    meta: [
      { title: "Evidence Map — Discovery OS" },
      { name: "description", content: "Visualize linked entities, claims, and publications across the evidence graph." },
    ],
  }),
  component: EvidenceMap,
});

function EvidenceMap() {
  const { sources, entities, query, years } = Route.useLoaderData();

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="mb-8">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Evidence map</div>
        <h1 className="font-serif text-4xl tracking-tight">Records & concepts</h1>
        <p className="mt-2 text-muted-foreground max-w-2xl">
          Live data for <span className="font-mono text-foreground">{query}</span> from OpenAlex and Europe PMC. Graph layout
          from co-citation networks is not wired yet—use Ask for full cards.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="paper-card p-6 min-h-[320px] flex flex-col">
          <div className="text-[10px] font-mono text-muted-foreground mb-4">
            {sources.length} works · {entities.length} concept hints
          </div>
          <ul className="space-y-2 text-sm flex-1 overflow-auto max-h-[480px]">
            {sources.map((s) => (
              <li key={s.id} className="flex gap-2 border-b border-border/60 pb-2">
                <span className="font-mono text-[10px] text-muted-foreground shrink-0">[{s.id}]</span>
                <a href={s.url} target="_blank" rel="noreferrer" className="hover:text-primary leading-snug">
                  {s.title}
                </a>
              </li>
            ))}
          </ul>
        </div>

        <aside className="space-y-4">
          <div className="paper-card p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              <Filter className="h-3 w-3" /> Filters
            </div>
            <div className="space-y-3 text-sm text-muted-foreground">
              <p className="text-xs">
                Client-side filters are placeholders. Apply query refinements on the Ask page via your search string.
              </p>
            </div>
          </div>

          <div className="paper-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Concepts</div>
            <div className="flex flex-wrap gap-1.5">
              {entities.map((e) => (
                <EntityChip key={`${e.type}-${e.name}`} {...e} />
              ))}
            </div>
          </div>
        </aside>
      </div>

      {years.length > 0 && (
        <div className="mt-10 paper-card p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-4">Publication years in this set</div>
          <div className="relative">
            <div className="absolute left-0 right-0 top-1/2 h-px bg-border" />
            <div className="relative flex flex-wrap justify-between items-center gap-4">
              {years.map((y) => {
                const count = sources.filter((s) => s.year === y).length;
                return (
                  <div key={y} className="flex flex-col items-center gap-2">
                    <div
                      className="w-2 rounded-t bg-primary/60"
                      style={{ height: `${Math.max(8, count * 18)}px` }}
                      title={`${count} sources`}
                    />
                    <div className="h-2 w-2 rounded-full bg-foreground border-2 border-background" />
                    <div className="font-mono text-[10px] text-muted-foreground">{y}</div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
