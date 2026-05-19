import { createFileRoute, Link } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";

export const Route = createFileRoute("/hypothesis")({
  head: () => ({
    meta: [
      { title: "Hypothesis — Discovery OS" },
      {
        name: "description",
        content: "Hypothesis detail with novelty, evidence, feasibility and translational relevance scores.",
      },
    ],
  }),
  component: HypothesisDetail,
});

function HypothesisDetail() {
  return (
    <div className="mx-auto max-w-2xl px-6 py-16 text-center">
      <Link to="/ask" search={{ q: "" }} className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary mb-10">
        <ChevronLeft className="h-4 w-4" /> Back to Ask
      </Link>
      <h1 className="font-serif text-3xl tracking-tight">Hypothesis workspace</h1>
      <p className="mt-4 text-muted-foreground leading-relaxed">
        Scored hypotheses and validation plans previously shown here were placeholder content. They require a dedicated model
        or rules service on top of retrieved literature.
      </p>
      <p className="mt-4 text-sm text-muted-foreground">
        Today, use{" "}
        <Link to="/ask" search={{ q: "" }} className="text-primary hover:underline">
          Ask
        </Link>{" "}
        to pull live works from OpenAlex and Europe PMC. When you add an analysis API, this route can load hypotheses by ID from
        your backend.
      </p>
    </div>
  );
}
