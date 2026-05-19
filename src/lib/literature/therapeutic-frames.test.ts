import { describe, expect, it } from "vitest";
import {
  computeFrameMismatchRank,
  inferDocumentInterventionFrame,
  inferQueryTherapeuticFrames,
  selectPrimaryQueryTherapeuticFrame,
} from "@/lib/literature/therapeutic-frames";
import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import { emptyTherapyQueryContext } from "@/lib/literature/therapy-context";

function makeExpansion(
  query: string,
  ctx: Partial<ReturnType<typeof emptyTherapyQueryContext>> & {
    approvalSocIntent?: boolean;
  },
): ClinicalExpansion {
  const { approvalSocIntent = false, ...ctxRest } = ctx;
  return {
    normalizedQuery: query,
    subqueries: [],
    anchors: ["pancreatic", "pdac"],
    competitorHints: [],
    treatmentIntent: true,
    therapeuticClinicalRetrieval: true,
    pdacExocrineIntent: true,
    approvalSocIntent,
    therapyQueryContext: { ...emptyTherapyQueryContext(), ...ctxRest },
    preferRecent: false,
    strongRecencyQuery: false,
    europePmcQuery: "",
  };
}

describe("inferDocumentInterventionFrame", () => {
  it("detects adjunctive medication meta-analyses", () => {
    expect(
      inferDocumentInterventionFrame(
        "Impact of concomitant use of renin-angiotensin system inhibitors on survival in patients with solid tumors: a meta-analysis",
      ),
    ).toBe("ADJUNCTIVE_MEDICATION");
  });

  it("detects surgery-primary titles", () => {
    expect(
      inferDocumentInterventionFrame(
        "Surgery for locally advanced pancreatic ductal adenocarcinoma: a multicenter cohort",
      ),
    ).toBe("SURGERY");
  });

  it("detects chemotherapy regimen trials", () => {
    expect(
      inferDocumentInterventionFrame(
        "Randomized phase III trial of gemcitabine plus nab-paclitaxel in metastatic pancreatic adenocarcinoma",
      ),
    ).toBe("CHEMOTHERAPY_REGIMEN");
  });
});

describe("frame mismatch vs query", () => {
  it("flags severe mismatch for surgery doc under metastatic systemic query", () => {
    const e = makeExpansion("first-line metastatic pancreatic cancer overall survival benefit", {
      wantsMetastatic: true,
    });
    const surf = "Surgery for locally advanced pancreatic ductal adenocarcinoma";
    const dif = inferDocumentInterventionFrame(surf);
    expect(inferQueryTherapeuticFrames(e)).toContain("SYSTEMIC_METASTATIC");
    expect(computeFrameMismatchRank(e, surf, dif)).toBe(2);
  });

  it("flags adjunctive synthesis vs SOC regimen intent", () => {
    const e = makeExpansion("FDA-approved first-line metastatic PDAC therapy regimens", {
      wantsMetastatic: true,
      explicitFdaLanguage: true,
    });
    const surf =
      "Impact of concomitant use of renin-angiotensin system inhibitors on survival: a meta-analysis";
    const dif = inferDocumentInterventionFrame(surf);
    expect(dif).toBe("ADJUNCTIVE_MEDICATION");
    expect(computeFrameMismatchRank(e, surf, dif)).toBeGreaterThanOrEqual(2);
  });

  it("selects metastatic as primary when paired with SOC cues", () => {
    const e = makeExpansion("first-line metastatic PDAC standard of care", {
      wantsMetastatic: true,
      approvalSocIntent: true,
    });
    const frames = inferQueryTherapeuticFrames(e);
    expect(selectPrimaryQueryTherapeuticFrame(frames)).toBe("SYSTEMIC_METASTATIC");
  });
});
