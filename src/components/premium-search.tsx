import { Search, ArrowRight } from "lucide-react";

interface Props {
  defaultValue?: string;
  size?: "lg" | "md";
  autoFocus?: boolean;
}

export function PremiumSearch({ defaultValue = "", size = "md", autoFocus }: Props) {
  return (
    <form
      action="/ask"
      method="get"
      className={`group relative w-full paper-card flex items-center gap-3 transition-all hover:shadow-[var(--shadow-elevated)] focus-within:border-primary/60 ${
        size === "lg" ? "px-5 py-4" : "px-4 py-3"
      }`}
    >
      <Search className={`${size === "lg" ? "h-5 w-5" : "h-4 w-4"} text-muted-foreground shrink-0`} />
      <input
        name="q"
        defaultValue={defaultValue}
        autoFocus={autoFocus}
        placeholder="Ask a biomedical research question…"
        className={`flex-1 bg-transparent outline-none placeholder:text-muted-foreground/70 ${
          size === "lg" ? "text-lg" : "text-base"
        }`}
      />
      <span className="hidden md:inline-flex items-center gap-1 text-[10px] font-mono text-muted-foreground border border-border rounded px-1.5 py-0.5">
        ⌘K
      </span>
      <button
        type="submit"
        className={`inline-flex items-center gap-1.5 rounded-md bg-primary text-primary-foreground transition-colors hover:bg-primary/90 ${
          size === "lg" ? "px-4 py-2 text-sm" : "px-3 py-1.5 text-xs"
        }`}
      >
        Discover <ArrowRight className="h-3.5 w-3.5" />
      </button>
    </form>
  );
}
