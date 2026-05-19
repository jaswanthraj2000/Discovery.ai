import { afterEach, describe, expect, it } from "vitest";
import {
  computeTreatmentSettingStateAdjustments,
  inferDocumentTreatmentSettingStates,
  inferQueryExpectedTreatmentStates,
} from "@/lib/literature/treatment-setting-state";
import { emptyTherapyQueryContext } from "@/lib/literature/therapy-context";

const prevEnv = { ...process.env };

afterEach(() => {
  process.env = { ...prevEnv };
});

describe("inferDocumentTreatmentSettingStates", () => {
  it("detects metastatic and adjuvant when both appear", () => {
    const s = inferDocumentTreatmentSettingStates(
      "Gemcitabine plus nab-paclitaxel in metastatic pancreatic cancer vs adjuvant trial subset",
    );
    expect(s.has("METASTATIC")).toBe(true);
    expect(s.has("ADJUVANT")).toBe(true);
  });

  it("detects postoperative cues", () => {
    const s = inferDocumentTreatmentSettingStates(
      "Postoperative chemotherapy after curative resection",
    );
    expect(s.has("POSTOPERATIVE")).toBe(true);
  });
});

describe("inferQueryExpectedTreatmentStates", () => {
  it("maps adjuvant query context", () => {
    const ctx = { ...emptyTherapyQueryContext(), wantsAdjuvant: true };
    const s = inferQueryExpectedTreatmentStates(ctx);
    expect(s.has("ADJUVANT")).toBe(true);
    expect(s.size).toBe(1);
  });
});

describe("computeTreatmentSettingStateAdjustments", () => {
  function expansionSlice(ctx: ReturnType<typeof emptyTherapyQueryContext>) {
    return {
      therapeuticClinicalRetrieval: true,
      therapyQueryContext: ctx,
    };
  }

  it("returns empty when structured setting explicitly disabled", () => {
    process.env.ENABLE_SETTING_STATE = "false";
    const adj = computeTreatmentSettingStateAdjustments(
      "Metastatic pancreatic cancer phase III",
      expansionSlice({ ...emptyTherapyQueryContext(), wantsAdjuvant: true }),
    );
    expect(adj).toEqual([]);
  });

  it("penalizes metastatic-only doc vs explicit adjuvant query when hard mismatch on", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    process.env.SETTING_HARD_MISMATCH = "true";
    const adj = computeTreatmentSettingStateAdjustments(
      "Randomized phase III trial of gemcitabine in metastatic pancreatic adenocarcinoma",
      expansionSlice({ ...emptyTherapyQueryContext(), wantsAdjuvant: true }),
    );
    const labels = adj.map((a) => a.label);
    expect(labels).toContain("settingMismatch_metastaticVsAdjuvantContext");
    expect(
      adj.find((a) => a.label === "settingMismatch_metastaticVsAdjuvantContext")?.delta,
    ).toBeLessThan(0);
  });

  it("boosts alignment when doc matches adjuvant query", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    const adj = computeTreatmentSettingStateAdjustments(
      "Adjuvant modified FOLFIRINOX in resected pancreatic cancer",
      expansionSlice({ ...emptyTherapyQueryContext(), wantsAdjuvant: true }),
    );
    const align = adj.find((a) => a.label === "settingStateAlign");
    expect(align?.delta).toBeGreaterThanOrEqual(34);
  });

  it("penalizes LA-heavy doc when query is adjuvant/post-resection without LA intent", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    process.env.SETTING_HARD_MISMATCH = "true";
    const adj = computeTreatmentSettingStateAdjustments(
      "Stereotactic radiotherapy in locally advanced pancreatic cancer: a case series",
      expansionSlice({
        ...emptyTherapyQueryContext(),
        wantsAdjuvant: true,
        wantsResectedPostOp: true,
        wantsLocallyAdvanced: false,
      }),
    );
    expect(adj.some((a) => a.label === "settingMismatch_laDominantVsAdjuvantPostOpQuery")).toBe(
      true,
    );
  });

  it("penalizes neoantigen / vaccine lane vs adjuvant intent", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    process.env.SETTING_HARD_MISMATCH = "true";
    const adj = computeTreatmentSettingStateAdjustments(
      "Neoantigen vaccine strategies in pancreatic ductal adenocarcinoma",
      expansionSlice({ ...emptyTherapyQueryContext(), wantsAdjuvant: true }),
    );
    expect(
      adj.some((a) => a.label === "settingMismatch_adjPostExpected_TranslationalWrongLane"),
    ).toBe(true);
  });

  it("penalizes translational wrong lane vs neoadjuvant + borderline intent", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    process.env.SETTING_HARD_MISMATCH = "true";
    const adj = computeTreatmentSettingStateAdjustments(
      "Targeting KRAS G12D in metastatic pancreatic cancer: preclinical advances",
      expansionSlice({
        ...emptyTherapyQueryContext(),
        wantsNeoadjuvant: true,
        wantsLocallyAdvanced: true,
      }),
    );
    expect(
      adj.some(
        (a) =>
          a.label === "settingMismatch_neoExpected_TranslationalWrongLane" ||
          a.label === "settingMismatch_metastaticVsNeoQuery",
      ),
    ).toBe(true);
  });

  it("skips hard mismatch when SETTING_HARD_MISMATCH=false", () => {
    process.env.ENABLE_SETTING_STATE = "true";
    process.env.SETTING_HARD_MISMATCH = "false";
    const adj = computeTreatmentSettingStateAdjustments(
      "Adjuvant chemotherapy for pancreatic cancer — exploratory metastatic subgroup",
      expansionSlice({ ...emptyTherapyQueryContext(), wantsAdjuvant: true }),
    );
    expect(adj.every((a) => !a.label.startsWith("settingMismatch_"))).toBe(true);
    expect(adj.find((a) => a.label === "settingStateAlign")?.delta).toBeGreaterThan(0);
  });
});
