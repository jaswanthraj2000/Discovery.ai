import { useState, type ElementType, type ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { EntityChip } from "@/components/research-ui";
import { Bookmark, FolderOpen, FileQuestion, StickyNote, Plus } from "lucide-react";

export const Route = createFileRoute("/workspace")({
  head: () => ({
    meta: [
      { title: "Workspace — Discovery OS" },
      { name: "description", content: "Saved queries, hypotheses, and paper collections." },
    ],
  }),
  component: Workspace,
});

const TABS = ["Overview", "Papers", "Entities", "Notes"] as const;

function Workspace() {
  const [tab, setTab] = useState<(typeof TABS)[number]>("Overview");

  const savedQueries: { q: string; when: string; n: number }[] = [];
  const hypotheses: { id: string; title: string }[] = [];
  const collections: { name: string; n: number }[] = [];
  const entities: { type: string; name: string }[] = [];

  return (
    <div className="mx-auto max-w-7xl px-6 py-10">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
        <div>
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Workspace</div>
          <h1 className="font-serif text-4xl tracking-tight">Your research desk</h1>
          <p className="mt-2 text-muted-foreground">
            Saved queries and collections will sync from your account once persistence is enabled. For now, use{" "}
            <Link to="/ask" search={{ q: "" }} className="text-primary hover:underline">
              Ask
            </Link>{" "}
            for live retrieval.
          </p>
        </div>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground px-4 py-2 text-sm hover:bg-primary/90"
        >
          <Plus className="h-4 w-4" /> New collection
        </button>
      </div>

      <div className="border-b border-border flex gap-1 mb-8">
        {TABS.map((t) => (
          <button
            type="button"
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2.5 text-sm border-b-2 -mb-px transition-colors ${
              tab === t ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "Overview" && (
        <div className="grid gap-6 lg:grid-cols-3">
          <Section title="Saved queries" icon={FileQuestion} count={savedQueries.length}>
            {savedQueries.length === 0 ? (
              <p className="text-sm text-muted-foreground">No saved queries yet. Run a search on Ask—persistence coming next.</p>
            ) : (
              <ul className="divide-hairline">
                {savedQueries.map((q, i) => (
                  <li key={i} className={i === 0 ? "pb-3" : "py-3"}>
                    <p className="font-serif leading-snug text-balance">{q.q}</p>
                    <div className="mt-1.5 text-[11px] font-mono text-muted-foreground flex gap-3">
                      <span>{q.n} sources</span>
                      <span>·</span>
                      <span>{q.when}</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Saved hypotheses" icon={Bookmark} count={hypotheses.length}>
            {hypotheses.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Hypothesis scoring requires a model endpoint. Nothing stored here yet.
              </p>
            ) : (
              <ul className="divide-hairline">
                {hypotheses.map((h, i) => (
                  <li key={h.id} className={i === 0 ? "pb-3" : "py-3"}>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-accent">H-{h.id.toUpperCase()}</div>
                    <p className="mt-0.5 font-serif leading-snug text-balance">{h.title}</p>
                  </li>
                ))}
              </ul>
            )}
          </Section>
          <Section title="Collections" icon={FolderOpen} count={collections.length}>
            {collections.length === 0 ? (
              <p className="text-sm text-muted-foreground">Create collections after we add authenticated storage.</p>
            ) : (
              <ul className="divide-hairline">
                {collections.map((c, i) => (
                  <li key={c.name} className={`flex items-center justify-between ${i === 0 ? "pb-3" : "py-3"}`}>
                    <span className="font-serif">{c.name}</span>
                    <span className="text-xs font-mono text-muted-foreground">{c.n}</span>
                  </li>
                ))}
              </ul>
            )}
          </Section>
        </div>
      )}

      {tab === "Papers" && (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          <p className="text-sm text-muted-foreground col-span-full">
            No pinned papers. Open Ask, run a query, and bookmark works once we wire workspace persistence.
          </p>
        </div>
      )}

      {tab === "Entities" && (
        <div className="paper-card p-8">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-4">Tracked entities</div>
          {entities.length === 0 ? (
            <p className="text-sm text-muted-foreground">Tracked entities will appear here after you save them from results.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {entities.map((e) => (
                <EntityChip key={e.name} {...e} />
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "Notes" && (
        <EmptyState
          icon={StickyNote}
          title="No notes yet"
          body="Highlight a finding from any answer and save a note. Notes stay linked to their source citation once notes ship."
        />
      )}
    </div>
  );
}

function Section({
  title,
  icon: Icon,
  count,
  children,
}: {
  title: string;
  icon: ElementType;
  count: number;
  children: ReactNode;
}) {
  return (
    <div className="paper-card p-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Icon className="h-4 w-4 text-primary" />
          <h3 className="font-serif text-lg">{title}</h3>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{count}</span>
      </div>
      {children}
    </div>
  );
}

function EmptyState({ icon: Icon, title, body }: { icon: ElementType; title: string; body: string }) {
  return (
    <div className="paper-card p-12 text-center">
      <div className="mx-auto mb-4 inline-flex h-12 w-12 items-center justify-center rounded-full bg-secondary border border-border">
        <Icon className="h-5 w-5 text-muted-foreground" />
      </div>
      <h3 className="font-serif text-2xl">{title}</h3>
      <p className="mt-2 text-sm text-muted-foreground max-w-sm mx-auto">{body}</p>
    </div>
  );
}
