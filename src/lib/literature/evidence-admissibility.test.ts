import { describe, expect, it } from "vitest";
import {
  compareAdmissibilityComponents,
  computeAdmissibilitySortComponents,
  inferDocumentAuthorityClass,
} from "@/lib/literature/evidence-admissibility";
import type { ClinicalExpansion } from "@/lib/literature/query-expansion";
import { emptyTherapyQueryContext } from "@/lib/literature/therapy-context";

function therapeuticExpansion(
  q: string,
  ctx: ReturnType<typeof emptyTherapyQueryContext>,
  opts?: { approvalSocIntent?: boolean },
): ClinicalExpansion {
  return {
    normalizedQuery: q,
    subqueries: [],
    anchors: ["pancreatic", "pdac"],
    competitorHints: [],
    treatmentIntent: true,
    therapeuticClinicalRetrieval: true,
    pdacExocrineIntent: true,
    approvalSocIntent: opts?.approvalSocIntent ?? false,
    therapyQueryContext: ctx,
    preferRecent: false,
    strongRecencyQuery: false,
    europePmcQuery: "",
  };
}

describe("inferDocumentAuthorityClass", () => {
  it("detects Phase III RCT-style titles", () => {
    expect(
      inferDocumentAuthorityClass(
        "Randomized phase III trial of gemcitabine in metastatic pancreatic cancer",
      ),
    ).toBe("PHASE3");
  });

  it("detects case reports", () => {
    expect(inferDocumentAuthorityClass("Locally advanced PDAC: a case report")).toBe("CASE_REPORT");
  });
});

describe("admissibility lexicographic order", () => {
  it("ranks B1 phase II trial above B2 landscape despite lower topical score", () => {
    const exp = therapeuticExpansion("first-line metastatic PDAC overall survival benefit", {
      ...emptyTherapyQueryContext(),
      wantsMetastatic: true,
    });
    const landscape = computeAdmissibilitySortComponents(
      exp,
      "Therapeutic landscape and precision medicine overview in pancreatic ductal adenocarcinoma",
      950,
    );
    const phase2 = computeAdmissibilitySortComponents(
      exp,
      "Randomized phase II trial of chemotherapy in metastatic pancreatic adenocarcinoma",
      320,
    );
    expect(landscape.tierLabel).toBe("B2");
    expect(phase2.tierLabel).toBe("B1");
    expect(compareAdmissibilityComponents(phase2, landscape)).toBeLessThan(0);
  });

  it("ranks regimen Phase III before adjunctive meta-analysis for metastatic SOC-style query", () => {
    const exp = therapeuticExpansion(
      "first-line metastatic pancreatic cancer overall survival FDA-approved therapy",
      {
        ...emptyTherapyQueryContext(),
        wantsMetastatic: true,
        explicitFdaLanguage: true,
      },
      { approvalSocIntent: true },
    );
    const adjunctive = computeAdmissibilitySortComponents(
      exp,
      "Impact of concomitant use of renin-angiotensin system inhibitors on survival in cancer: a meta-analysis",
      850,
    );
    const regimen = computeAdmissibilitySortComponents(
      exp,
      "Randomized phase III trial of gemcitabine plus nab-paclitaxel in metastatic pancreatic adenocarcinoma overall survival",
      400,
    );
    expect(adjunctive.interventionFrame).toBe("ADJUNCTIVE_MEDICATION");
    expect(regimen.interventionFrame).toBe("CHEMOTHERAPY_REGIMEN");
    expect(compareAdmissibilityComponents(regimen, adjunctive)).toBeLessThan(0);
  });

  it("puts tier-A pivotal trial before tier-C exploratory despite weaker topical score", () => {
    const exp = therapeuticExpansion("metastatic PDAC first line", {
      ...emptyTherapyQueryContext(),
      wantsMetastatic: true,
    });
    const exploratory = computeAdmissibilitySortComponents(
      exp,
      "Neoantigen vaccines: a promising avenue for pancreatic cancer",
      900,
    );
    const pivotal = computeAdmissibilitySortComponents(
      exp,
      "Randomized phase III trial of gemcitabine plus nab-paclitaxel in metastatic pancreatic adenocarcinoma overall survival",
      120,
    );
    expect(compareAdmissibilityComponents(pivotal, exploratory)).toBeLessThan(0);
  });

  it("demotes tier-A to B when metastatic doc faces adjuvant-only query (severe violation)", () => {
    const exp = therapeuticExpansion("adjuvant therapy after resection PDAC", {
      ...emptyTherapyQueryContext(),
      wantsAdjuvant: true,
      wantsResectedPostOp: true,
    });
    const metastaticOnly = computeAdmissibilitySortComponents(
      exp,
      "Phase III randomized trial of first-line immunotherapy in metastatic pancreatic cancer",
      800,
    );
    expect(metastaticOnly.settingViolation).toBe(2);
    expect(metastaticOnly.tierLabel).not.toBe("A");
  });
});
