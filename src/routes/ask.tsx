import * as React from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { PremiumSearch } from "@/components/premium-search";
import { CitationPill, SourceCard, EvidenceBadge, EntityChip, RetrievalMatchBadge } from "@/components/research-ui";
import { SOURCE_BADGES } from "@/lib/catalog";
import {
  buildNarrativeSummary,
  deriveKeyFindings,
  searchLiterature,
} from "@/lib/literature/search";
import type { Hypothesis } from "@/lib/research-types";
import { FlaskConical, Lightbulb, BookMarked, Filter, ShieldCheck, ChevronRight } from "lucide-react";

type AskSearch = { q: string };

export const Route = createFileRoute("/ask")({
  validateSearch: (raw: Record<string, unknown>): AskSearch => ({
    q: typeof raw.q === "string" ? raw.q : "",
  }),
  loader: async ({ location }) => {
    const q = (location.search as AskSearch).q.trim();
    if (!q) {
      return {
        query: "",
        sources: [],
        entities: [],
        keyFindings: [],
        summary: buildNarrativeSummary("", []),
        summaryOpts: {},
        hypotheses: [] as Hypothesis[],
        experiments: [] as string[],
      };
    }
    const { sources, entities, summaryOpts } = await searchLiterature(q);
    return {
      query: q,
      sources,
      entities,
      keyFindings: deriveKeyFindings(sources),
      summary: buildNarrativeSummary(q, sources, summaryOpts),
      summaryOpts,
      hypotheses: [] as Hypothesis[],
      experiments: [] as string[],
    };
  },
  head: () => ({
    meta: [
      { title: "Ask — Discovery OS" },
      { name: "description", content: "Cited, source-grounded answers to biomedical research questions." },
    ],
  }),
  component: AskPage,
});

function SectionHeader({
  icon: Icon,
  title,
  count,
  tone,
}: {
  icon: React.ElementType;
  title: string;
  count?: number;
  tone?: "primary" | "accent" | "success";
}) {
  const t = tone ?? "primary";
  const color = t === "accent" ? "text-accent" : t === "success" ? "text-success" : "text-primary";
  return (
    <div className="flex items-center justify-between mb-4">
      <div className="flex items-center gap-2.5">
        <Icon className={`h-4 w-4 ${color}`} />
        <h2 className="font-serif text-xl tracking-tight">{title}</h2>
        {count !== undefined && <span className="text-xs font-mono text-muted-foreground">({count})</span>}
      </div>
    </div>
  );
}

function AskPage() {
  const { query, sources, entities, keyFindings, summary, summaryOpts, hypotheses, experiments } =
    Route.useLoaderData();
  const strongMatches = sources.filter((s) => s.relevanceBand === "top").length;

  return (
    <div className="mx-auto max-w-7xl px-6 py-8 md:py-12">
      <div className="mb-6">
        <PremiumSearch defaultValue={query} />
      </div>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-10">
          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Research question</div>
            <h1 className="font-serif text-3xl md:text-4xl tracking-tight text-balance leading-tight">
              {query || "Ask a biomedical research question"}
            </h1>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span className="font-mono">{sources.length} sources</span>
              <span>·</span>
              <span>{strongMatches} strong lexical matches</span>
              <span>·</span>
              <span>Expanded retrieval + rerank</span>
            </div>
          </div>

          <section className="paper-card p-6 md:p-8 bg-gradient-to-br from-card via-card to-secondary/30">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-4">
              <span className="h-1.5 w-1.5 rounded-full bg-success" /> Answer summary · from retrieved records
            </div>
            <p className="font-serif text-[19px] md:text-[21px] leading-relaxed text-balance">
              {summary}
              {sources.slice(0, 5).map((s) => (
                <CitationPill key={s.id} n={s.id} />
              ))}
            </p>
            <div className="mt-5 flex items-center gap-2 text-[11px] text-muted-foreground border-t border-border pt-4">
              <ShieldCheck className="h-3.5 w-3.5" />
              Descriptive aggregation only. Not medical advice.
            </div>
          </section>

          {keyFindings.length > 0 && (
            <section>
              <SectionHeader icon={Lightbulb} title="Key findings" count={keyFindings.length} />
              <div className="paper-card divide-hairline">
                {keyFindings.map((f, i) => (
                  <div key={i} className="p-5 flex items-start gap-4">
                    <span className="font-mono text-xs text-muted-foreground mt-1">F{i + 1}</span>
                    <p className="flex-1 text-[15px] leading-relaxed">
                      {f.text}
                      {f.cites.map((c) => (
                        <CitationPill key={c} n={c} />
                      ))}
                    </p>
                  </div>
                ))}
              </div>
            </section>
          )}

          {sources.length > 0 && (
            <section>
              <SectionHeader icon={BookMarked} title="Ranked literature" count={sources.length} />
              <p className="text-xs text-muted-foreground mb-4 max-w-3xl leading-relaxed">
                Synonym-expanded OpenAlex queries plus a structured Europe PMC clause, then reranking (semantic when
                configured).{" "}
                {summaryOpts?.therapeuticClinicalRetrieval ? (
                  <>
                    <span className="text-foreground font-medium">Therapeutic-clinical mode:</span> large boosts for
                    FDA/EMA/NCCN/ESMO/SOC and line-of-therapy language; penalties for “promising”/translational-only/stromal
                    concepts without regulatory or pivotal-trial cues; extra weight on trials and outcomes; downweight for
                    animal-only, biomarker-only, imaging-only, and case reports unless therapy-aligned.
                  </>
                ) : (
                  <>
                    Therapy cues, anchor phrases, epidemiology downweights, and penalties when another cancer site dominates
                    the title without your anchors.
                  </>
                )}{" "}
                Impossible publication years from indexes are clamped and lightly downranked (verify on source).
                {summaryOpts?.strongRecencyQuery ? (
                  <> Words like “latest/recent/new/emerging” strengthen preference for newer papers (guideline/FDA/NCCN
                  landmarks keep partial credit when older). </>
                ) : null}
                Bands describe retrieval fit—not whether a paper supports a clinical claim.
              </p>
              <div className="grid gap-3 md:grid-cols-2">
                {sources.map((s) => (
                  <SourceCard key={`${s.source}-${s.id}-${s.doi ?? s.url}`} s={s} />
                ))}
              </div>
            </section>
          )}

          {query && sources.length === 0 && (
            <p className="text-sm text-muted-foreground">
              No records matched this query. Try different keywords or a broader disease or drug name.
            </p>
          )}

          {hypotheses.length > 0 && (
            <section>
              <SectionHeader icon={Lightbulb} title="Candidate hypotheses" count={hypotheses.length} />
              <div className="text-xs text-muted-foreground mb-3 flex items-center gap-2">
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-accent" />
                Model-generated. Distinct from observed evidence above.
              </div>
              <div className="space-y-3">
                {hypotheses.map((h) => (
                  <Link
                    key={h.id}
                    to="/hypothesis"
                    className="paper-card group p-5 flex items-start gap-4 hover:border-primary/40 transition-colors"
                  >
                    <div className="flex-1">
                      <h3 className="font-serif text-lg leading-snug text-balance">{h.title}</h3>
                      <div className="mt-3 flex flex-wrap gap-3 text-[11px] font-mono text-muted-foreground">
                        <span>
                          Novelty <span className="text-foreground">{h.novelty}</span>
                        </span>
                        <span>
                          Evidence <span className="text-foreground">{h.evidence}</span>
                        </span>
                        <span>
                          Feasibility <span className="text-foreground">{h.feasibility}</span>
                        </span>
                        <span>
                          Translational <span className="text-foreground">{h.translational}</span>
                        </span>
                      </div>
                    </div>
                    <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-primary mt-1" />
                  </Link>
                ))}
              </div>
            </section>
          )}

          {experiments.length > 0 && (
            <section>
              <SectionHeader icon={FlaskConical} title="Proposed experiments" count={experiments.length} />
              <ol className="paper-card divide-hairline">
                {experiments.map((e, i) => (
                  <li key={i} className="p-5 flex items-start gap-4">
                    <span className="font-mono text-xs text-accent mt-1">EXP{i + 1}</span>
                    <p className="flex-1 text-[15px] leading-relaxed">{e}</p>
                  </li>
                ))}
              </ol>
            </section>
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-24 lg:self-start">
          <div className="paper-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              Sources used ({sources.length})
            </div>
            <ul className="space-y-2.5 text-sm">
              {sources.map((s) => (
                <li key={s.id} className="flex items-start gap-2">
                  <span className="font-mono text-[11px] text-muted-foreground bg-secondary border border-border rounded px-1 py-0.5 shrink-0">
                    [{s.id}]
                  </span>
                  <a href={s.url} target="_blank" rel="noreferrer" className="leading-snug hover:text-primary line-clamp-2">
                    {s.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>

          <div className="paper-card p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              <Filter className="h-3 w-3" /> Filters
            </div>
            <div className="space-y-2.5 text-sm">
              {(
                [
                  ["Open access only", true],
                  ["Peer-reviewed only", false],
                  ["Exclude preprints", false],
                  ["Last 5 years", true],
                  ["Include clinical trials", true],
                ] as const
              ).map(([label, on]) => (
                <label key={label} className="flex items-center gap-2.5 cursor-pointer">
                  <span className={`h-4 w-7 rounded-full p-0.5 transition-colors ${on ? "bg-primary" : "bg-border"}`}>
                    <span className={`block h-3 w-3 rounded-full bg-background transition-transform ${on ? "translate-x-3" : ""}`} />
                  </span>
                  <span>{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="paper-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Retrieval bands</div>
            <div className="flex flex-wrap gap-1.5">
              <RetrievalMatchBadge band="top" />
              <RetrievalMatchBadge band="related" />
              <RetrievalMatchBadge band="context" />
            </div>
            <p className="text-[10px] text-muted-foreground mt-3 leading-relaxed">
              Access badges still describe OA tiers; bands describe how tightly each title matched expanded anchors—not
              biological evidence.
            </p>
            <div className="mt-4 pt-3 border-t border-border space-y-1.5">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Access tier legend</div>
              <div className="flex flex-wrap gap-1.5">
                <EvidenceBadge kind="open-access" />
                <EvidenceBadge kind="abstract" />
                <EvidenceBadge kind="metadata-only" />
                <EvidenceBadge kind="preprint" />
              </div>
            </div>
          </div>

          <div className="paper-card p-5">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-3">Linked concepts</div>
            <div className="flex flex-wrap gap-1.5">
              {entities.slice(0, 12).map((e) => (
                <EntityChip key={e.name} {...e} />
              ))}
            </div>
            <Link to="/evidence" search={{ q: query }} className="mt-4 inline-flex items-center gap-1 text-xs text-primary hover:underline">
              View evidence map <ChevronRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="paper-card p-5">
            <div className="flex items-center gap-2 text-[11px] uppercase tracking-widest text-muted-foreground mb-3">
              <ShieldCheck className="h-3 w-3" /> Legal sources
            </div>
            <div className="flex flex-wrap gap-1.5 text-[11px]">
              {SOURCE_BADGES.map((b) => (
                <span key={b} className="border border-border bg-secondary rounded px-1.5 py-0.5 font-mono">
                  {b}
                </span>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
