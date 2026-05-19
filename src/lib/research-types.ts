export type SourceType = "journal" | "preprint" | "trial" | "dataset" | "structure";
export type AccessLevel = "open-access" | "abstract" | "metadata-only";

export type SourceCatalog =
  | "OpenAlex"
  | "PubMed"
  | "Europe PMC"
  | "Crossref"
  | "ChEMBL"
  | "ClinicalTrials.gov"
  | "RCSB PDB"
  | "bioRxiv";

/** Lexical rerank tier — not clinical evidence grading. */
export type RetrievalRelevanceBand = "top" | "related" | "context";

/** Human-readable score deltas from domain heuristics (retrieval tuning / debugging — not clinical grading). */
export type RankAdjustment = { label: string; delta: number };

export interface Source {
  id: number;
  title: string;
  authors: string;
  venue: string;
  source: SourceCatalog;
  type: SourceType;
  year: number;
  /** True when publication year was clamped (e.g. future-dated metadata). */
  pubYearSuspect?: boolean;
  access: AccessLevel;
  doi?: string;
  /** PubMed / MED identifier when known (e.g. from Europe PMC). */
  pmid?: string;
  url: string;
  /** Abstract text when available from Europe PMC (ingestion or fetch). */
  abstractText?: string;
  /**
   * Reserved for future NLP evidence stance. Indexing layer does not infer clinical support/conflict.
   * Use `relevanceBand` for retrieval match quality only.
   */
  evidence: "supporting" | "conflicting" | "background" | "unspecified";
  /** Heuristic retrieval score (higher = stronger title/query alignment). */
  relevanceScore?: number;
  /** Post-rerank bucket — describes retrieval fit, not therapeutic truth. */
  relevanceBand?: RetrievalRelevanceBand;
  /** Breakdown of domain heuristic contributions when computed (therapeutic path + recency). */
  relevanceAdjustments?: RankAdjustment[];
  /** True when abstract was retrieved for second-pass evidence rescoring. */
  abstractUsedForRanking?: boolean;
  /** Clinical admissibility tier when lexicographic ranking is active (A → B1 → B2 → C). */
  clinicalEvidenceTier?: "A" | "B1" | "B2" | "C";
  /** Setting mismatch rank (0 none, 1 mild, 2 severe) when admissibility ranking is active. */
  clinicalSettingViolation?: number;
  /** Query vs document intervention-frame mismatch (0 aligned … 2 misaligned). */
  clinicalFrameMismatchRank?: number;
  /** Same labels as `DocumentInterventionFrame` in therapeutic-frames (kept loose to avoid coupling). */
  clinicalInterventionFrame?: string;
}

export interface KeyFinding {
  text: string;
  cites: number[];
}

export interface Hypothesis {
  id: string;
  title: string;
  novelty: number;
  evidence: number;
  feasibility: number;
  translational: number;
  risk: string;
  cites: number[];
}

export interface Entity {
  type: string;
  name: string;
}
