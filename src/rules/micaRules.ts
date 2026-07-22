/**
 * MiCA Regulatory Rule Encoding
 *
 * This module encodes a single, narrow, quantitative regulatory rule as
 * structured data — the first step from "machine-readable" towards
 * "machine-enforceable" regulation. The encoded rule is the canonical source of
 * truth for both the on-chain Regulatory State Token and the Regulatory
 * Passport credential.
 *
 * RULE SELECTED: a MiCA Article 35-style own-funds threshold.
 *
 * ── Important legal framing ──────────────────────────────────────────────────
 * MiCA Article 35 sets own-funds requirements for issuers of ASSET-REFERENCED
 * TOKENS (ARTs): own funds at least equal to the HIGHEST of
 *   (a) EUR 350,000,
 *   (b) 2% of the average amount of the reserve of assets, or
 *   (c) one quarter of the preceding year's fixed overheads.
 *
 * An earlier draft of this project described the rule as "Article 54 — own
 * funds for e-money token issuers". That was incorrect and has been corrected
 * here. MiCA Article 54 concerns the INVESTMENT of funds received in exchange
 * for e-money tokens (segregation and low-risk investment), not capital
 * adequacy. E-money token issuers are governed primarily by MiCA Title IV and
 * the E-Money Directive.
 *
 * This rule is used because it is clear, numerical and therefore suitable for
 * testing the enforcement architecture. It is NOT presented as a legal opinion
 * on the prudential regime for any class of crypto-asset, and the encoding is
 * deliberately simplified.
 *
 * Source: Regulation (EU) 2023/1114 (MiCA), Title III.
 *
 * ── Schema design ────────────────────────────────────────────────────────────
 * The rule object is deliberately shaped to resemble a structured regulatory
 * obligation as produced by a machine-readable regulation provider such as the
 * Cambridge Regulatory Genome (CRG) / Regulatory Genome Project: it carries
 * source provenance, a taxonomy classification, and explicit versioning. This
 * means the rule could be POPULATED FROM such a feed rather than hand-coded,
 * which is the natural next step identified in the project's roadmap.
 */

import { createHash } from "crypto";

/* ─── Types ───────────────────────────────────────────────────────────────── */

export type RuleStatus = "active" | "draft" | "superseded";

/**
 * Source provenance — where this obligation came from, so that any consumer can
 * trace the encoded parameters back to the authoritative legal text.
 */
export interface RuleProvenance {
  /** Body that published the source instrument */
  publisher: string;
  /** Title of the source instrument */
  sourceDocument: string;
  /** EUR-Lex CELEX identifier */
  celex: string;
  /** Stable link to the source text */
  sourceUri: string;
  /** The specific provision encoded here */
  articleReference: string;
  /** When the source text was consulted */
  retrievedDate: string;
}

/**
 * Taxonomy classification.
 *
 * NOTE ON HONESTY: `conceptId` is null because authoritative Cambridge
 * Regulatory Genome taxonomy identifiers are not publicly available without a
 * data agreement. The `classificationPath` below is the author's own
 * descriptive classification, NOT an official CRG concept. If taxonomy access
 * is granted, `conceptId` should be populated with the authoritative
 * identifier and this note removed.
 */
export interface RuleTaxonomy {
  scheme: string;
  schemeVersion: string | null;
  /** Author's descriptive classification path (illustrative) */
  classificationPath: string[];
  /** Authoritative taxonomy concept id — null until a real feed is available */
  conceptId: string | null;
  note: string;
}

/**
 * The substantive requirement: own funds must be at least the HIGHEST of three
 * limbs. Encoding all three limbs (rather than only the flat floor and the
 * percentage) keeps the encoding faithful to the structure of Article 35.
 */
export interface OwnFundsRequirement {
  /** Limb (a): absolute floor in EUR */
  minimumCapital_EUR: number;
  /** Limb (b): percentage of the average reserve of assets */
  reserveAssetsPercentage: number;
  /** Limb (c): fraction of the preceding year's fixed overheads */
  fixedOverheadsFraction: number;
  /** How the limbs combine */
  complianceThreshold: "highest_of";
}

export interface ComplianceCheckpoint {
  /** How frequently the issuer must demonstrate compliance */
  frequency: string;
  /** Accepted methods for demonstrating capital adequacy */
  evidence: string[];
}

export interface MiCARule {
  /** Unique identifier for this rule within the compliance engine */
  ruleId: string;
  /** Source regulation family */
  regulation: "MiCA";
  /** Human-readable rule title */
  title: string;
  /** Entity type the obligation binds */
  applicableTo: string;
  /** Where the rule text came from */
  provenance: RuleProvenance;
  /** How the obligation is classified */
  taxonomy: RuleTaxonomy;
  /** The substantive requirement, as structured parameters */
  requirements: OwnFundsRequirement;
  /** Compliance verification parameters */
  complianceCheckpoint: ComplianceCheckpoint;
  /** Versioning and lifecycle */
  metadata: {
    effectiveDate: string;
    jurisdiction: string;
    version: string;
    /** ruleId this version replaces, if any */
    supersedes: string | null;
    encodedBy: string;
    encodingDate: string;
    status: RuleStatus;
  };
}

/* ─── The encoded rule ────────────────────────────────────────────────────── */

export const MICA_ART35_OWN_FUNDS_RULE: MiCARule = {
  ruleId: "MiCA-ART35-OWNFUNDS-V1",
  regulation: "MiCA",
  title: "Own funds requirements for issuers of asset-referenced tokens",
  applicableTo: "Asset-Referenced Token (ART) Issuer",

  provenance: {
    publisher: "European Union",
    sourceDocument:
      "Regulation (EU) 2023/1114 on markets in crypto-assets (MiCA)",
    celex: "32023R1114",
    sourceUri:
      "https://eur-lex.europa.eu/legal-content/EN/TXT/HTML/?uri=CELEX:32023R1114",
    articleReference: "Article 35(1)",
    retrievedDate: "2026-07-21",
  },

  taxonomy: {
    scheme: "Cambridge Regulatory Genome (CRG) — structure only",
    schemeVersion: null,
    classificationPath: [
      "Prudential Requirements",
      "Own Funds",
      "Capital Adequacy Threshold",
    ],
    conceptId: null,
    note:
      "Descriptive classification by the author. Not an authoritative CRG " +
      "concept identifier; populate conceptId if taxonomy access is granted.",
  },

  requirements: {
    minimumCapital_EUR: 350_000,
    reserveAssetsPercentage: 2,
    fixedOverheadsFraction: 0.25,
    complianceThreshold: "highest_of",
  },

  complianceCheckpoint: {
    frequency: "continuous",
    evidence: [
      "audited_balance_sheet",
      "regulatory_capital_return",
      "third_party_attestation",
    ],
  },

  metadata: {
    effectiveDate: "2024-06-30",
    jurisdiction: "EU",
    version: "1.0",
    supersedes: null,
    encodedBy: "regulatory-state-tokens PoC",
    encodingDate: "2026-07-21",
    status: "active",
  },
};

/* ─── Encoding helpers ────────────────────────────────────────────────────── */

/**
 * Deterministic (canonical) JSON: object keys sorted recursively so that the
 * same rule always produces the same string, and therefore the same digest.
 */
function canonicalise(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalise);
  if (value && typeof value === "object") {
    return Object.keys(value as Record<string, unknown>)
      .sort()
      .reduce<Record<string, unknown>>((acc, key) => {
        acc[key] = canonicalise((value as Record<string, unknown>)[key]);
        return acc;
      }, {});
  }
  return value;
}

/**
 * Full rule as a JSON string — used for off-chain publication and display.
 * This is NOT what goes in the NFT URI (see buildRulePointerURI).
 */
export function encodeRuleAsJSON(rule: MiCARule): string {
  return JSON.stringify(canonicalise(rule));
}

/**
 * SHA-256 digest of the canonical rule JSON — the integrity check that lets a
 * verifier confirm that off-chain rule metadata matches what the on-chain
 * pointer commits to.
 */
export function computeRuleDigest(rule: MiCARule): string {
  return createHash("sha256").update(encodeRuleAsJSON(rule)).digest("hex");
}

/**
 * Builds the URI that goes on-chain in the Regulatory State Token.
 *
 * WHY A POINTER, NOT THE FULL RULE: an XRPL NFToken URI is capped at 256 bytes.
 * The full rule JSON is far larger, so embedding it directly would make the
 * mint fail. Instead the token carries a compact, self-describing pointer plus
 * a truncated integrity digest — the token is the authoritative pointer to the
 * rule, while the rule body itself is published off-chain.
 *
 * Format: rgt:<ruleId>?v=<version>&h=<first 32 hex chars of the SHA-256 digest>
 */
export function buildRulePointerURI(rule: MiCARule): string {
  const digest = computeRuleDigest(rule).slice(0, 32);
  const uri = `rgt:${rule.ruleId}?v=${rule.metadata.version}&h=${digest}`;

  if (Buffer.byteLength(uri, "utf8") > 256) {
    throw new Error(
      `Rule pointer URI is ${Buffer.byteLength(uri, "utf8")} bytes — ` +
        `exceeds the 256-byte XRPL NFToken URI limit.`
    );
  }
  return uri;
}

/* ─── The rule, as executable logic ───────────────────────────────────────── */

export interface OwnFundsCheckResult {
  compliant: boolean;
  requiredCapital_EUR: number;
  /** Which of the three limbs set the requirement */
  bindingLimb: "absolute_floor" | "reserve_percentage" | "fixed_overheads";
  reason: string;
}

/**
 * Applies the Article 35-style own-funds test.
 *
 * This is the "regulation as code" core: the same test a compliance officer
 * would apply, expressed as auditable, executable logic. Returning the binding
 * limb makes the decision explainable rather than a bare pass/fail.
 */
export function checkOwnFundsAdequacy(
  ownFunds_EUR: number,
  averageReserveAssets_EUR: number,
  annualFixedOverheads_EUR: number,
  rule: MiCARule = MICA_ART35_OWN_FUNDS_RULE
): OwnFundsCheckResult {
  const req = rule.requirements;

  const limbs = [
    {
      name: "absolute_floor" as const,
      value: req.minimumCapital_EUR,
    },
    {
      name: "reserve_percentage" as const,
      value: (req.reserveAssetsPercentage / 100) * averageReserveAssets_EUR,
    },
    {
      name: "fixed_overheads" as const,
      value: req.fixedOverheadsFraction * annualFixedOverheads_EUR,
    },
  ];

  const binding = limbs.reduce((a, b) => (b.value > a.value ? b : a));
  const requiredCapital_EUR = binding.value;
  const compliant = ownFunds_EUR >= requiredCapital_EUR;

  const limbLabel: Record<OwnFundsCheckResult["bindingLimb"], string> = {
    absolute_floor: `the EUR ${req.minimumCapital_EUR.toLocaleString()} floor`,
    reserve_percentage: `${req.reserveAssetsPercentage}% of reserve assets`,
    fixed_overheads: `one quarter of fixed overheads`,
  };

  const reason = compliant
    ? `Own funds of €${ownFunds_EUR.toLocaleString()} meet the required ` +
      `€${requiredCapital_EUR.toLocaleString()}, set by ${limbLabel[binding.name]}.`
    : `Own funds of €${ownFunds_EUR.toLocaleString()} are INSUFFICIENT — ` +
      `€${requiredCapital_EUR.toLocaleString()} required, set by ${limbLabel[binding.name]}.`;

  return {
    compliant,
    requiredCapital_EUR,
    bindingLimb: binding.name,
    reason,
  };
}
