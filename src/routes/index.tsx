import { createFileRoute, Link } from "@tanstack/react-router";
import { PremiumSearch } from "@/components/premium-search";
import { SOURCE_BADGES } from "@/lib/catalog";
import { fetchAutocompleteWorkTitles } from "@/lib/literature/search";
import { ShieldCheck, BookOpen, GitBranch, Sparkles, ArrowUpRight } from "lucide-react";

export const Route = createFileRoute("/")({
  loader: async () => {
    const suggestions = await fetchAutocompleteWorkTitles("idiopathic pulmonary fibrosis", 6);
    return { suggestions };
  },
  head: () => ({
    meta: [
      { title: "Discovery OS — Evidence-backed scientific discovery" },
      {
        name: "description",
        content: "Ask biomedical questions and get cited, source-grounded answers from open scientific data.",
      },
    ],
  }),
  component: Landing,
});

function Landing() {
  const { suggestions } = Route.useLoaderData();

  return (
    <div>
      <section className="mx-auto max-w-5xl px-6 pt-20 pb-16 md:pt-28 md:pb-24 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-mono text-muted-foreground mb-6">
          <span className="h-1.5 w-1.5 rounded-full bg-success animate-pulse" />
          Live OpenAlex + Europe PMC search
        </div>
        <h1 className="font-serif text-5xl md:text-7xl tracking-tight text-balance leading-[1.05]">
          Evidence-backed discovery <br />
          <span className="italic text-primary">from open scientific data.</span>
        </h1>
        <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto text-balance">
          A research-grade discovery engine for biomedical questions. Results are fetched from public indexes—no paywalled
          scraping.
        </p>

        <div className="mt-10 max-w-3xl mx-auto">
          <PremiumSearch size="lg" />
        </div>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-3 text-xs text-muted-foreground">
          <span className="uppercase tracking-widest">Indexed sources</span>
          {SOURCE_BADGES.map((b) => (
            <span key={b} className="font-mono text-foreground/80 border-b border-dashed border-border pb-0.5">
              {b}
            </span>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="grid gap-6 md:grid-cols-3">
          {[
            {
              icon: ShieldCheck,
              title: "Legal source policy",
              body: "We call only open HTTP APIs with documented terms. We respect rate limits and attribution. We do not scrape paywalled full text.",
            },
            {
              icon: BookOpen,
              title: "Metadata vs. full text",
              body: "Each work is labeled by access tier inferred from publisher metadata (Open Access, Abstract Only, or Metadata Only).",
            },
            {
              icon: GitBranch,
              title: "Observed vs. generated",
              body: "Retrieved titles and links are observed from indexes. Narrative synthesis on Ask is descriptive, not a substitute for reading primary sources.",
            },
          ].map((c) => (
            <div key={c.title} className="paper-card p-6">
              <c.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-serif text-xl">{c.title}</h3>
              <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{c.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-7xl px-6 py-16">
        <div className="flex items-end justify-between mb-8 gap-4 flex-wrap">
          <div>
            <div className="text-xs uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-2">
              <Sparkles className="h-3.5 w-3.5" /> Try a question
            </div>
            <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Suggested titles from OpenAlex</h2>
            <p className="mt-2 text-sm text-muted-foreground max-w-xl">
              Pulled live from the OpenAlex autocomplete API (seed: “idiopathic pulmonary fibrosis”). Click to open Ask with
              that text.
            </p>
          </div>
          <Link to="/ask" search={{ q: "" }} className="text-sm text-primary hover:underline inline-flex items-center gap-1">
            Open Ask workspace <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {suggestions.map((q, i) => (
            <Link
              key={q}
              to="/ask"
              search={{ q }}
              className="paper-card group p-5 flex items-start gap-4 hover:border-primary/40 hover:shadow-[var(--shadow-elevated)] transition-all"
            >
              <span className="font-mono text-xs text-muted-foreground pt-0.5">{String(i + 1).padStart(2, "0")}</span>
              <p className="flex-1 font-serif text-lg leading-snug text-balance">{q}</p>
              <ArrowUpRight className="h-4 w-4 text-muted-foreground group-hover:text-primary transition-colors mt-1" />
            </Link>
          ))}
        </div>
      </section>

      <section className="mx-auto max-w-5xl px-6 py-20">
        <div className="paper-card p-10 md:p-14 text-center bg-gradient-to-br from-card to-secondary/40">
          <h2 className="font-serif text-3xl md:text-4xl tracking-tight">Reasoning you can verify.</h2>
          <p className="mt-3 text-muted-foreground max-w-xl mx-auto">
            Inline links to primary records, access-tier labels, and side-by-side indexes. Built for researchers who need to
            trust the trail.
          </p>
          <Link
            to="/ask"
            search={{ q: "" }}
            className="mt-6 inline-flex items-center gap-2 rounded-md bg-primary text-primary-foreground px-5 py-2.5 text-sm hover:bg-primary/90"
          >
            Start a discovery <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
      </section>
    </div>
  );
}
