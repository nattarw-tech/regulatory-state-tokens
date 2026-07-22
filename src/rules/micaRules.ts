/**
 * MiCA Regulatory Rule Encoding
 *
 * This module manually encodes a specific MiCA regulation rule as structured
 * TypeScript data — the first step toward "Regulation as Code." The encoded
 * rule serves as the canonical source of truth for both the on-chain
 * Regulatory State Token (NFT) and the Regulatory Passport (credential).
 *
 * Rule Selected: MiCA Article 54 — Own Funds Requirements for E-Money Token Issuers
 *
 * Source: Regulation (EU) 2023/1114 of the European Parliament and of the Council
 * on Markets in Crypto-assets (MiCA), Title IV, Chapter 3.
 *
 * Key Legal Text (paraphrased):
 *   "Issuers of e-money tokens shall, at all times, maintain own funds equal to
 *   an amount of at least 2% of the average amount of e-money tokens outstanding,
 *   and in any case not less than EUR 350,000."
 */

export interface CapitalRequirement {
  /** Percentage of average outstanding token value that must be held as own funds */
  outstandingTokensPercentage: number;
  /** Absolute minimum own funds floor in EUR */
  minimumCapital_EUR: number;
  /** Logic for combining the two thresholds */
  complianceThreshold: "higher_of_two";
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
  /** Source regulation */
  regulation: "MiCA";
  /** EU regulation number */
  regulationReference: string;
  /** Article number within MiCA */
  article: number;
  /** Sub-clause (if applicable) */
  paragraph?: number;
  /** Human-readable rule title */
  title: string;
  /** Applicable entity type */
  applicableTo: string;
  /** Substantive requirements encoded as structured data */
  requirements: CapitalRequirement;
  /** Compliance verification parameters */
  complianceCheckpoint: ComplianceCheckpoint;
  /** Rule metadata for versioning and lifecycle management */
  metadata: {
    effectiveDate: string;
    jurisdiction: string;
    version: string;
    encodedBy: string;
    encodingDate: string;
    status: "active" | "draft" | "superseded";
  };
}

/**
 * MiCA Article 54 — Own Funds Requirements for E-Money Token Issuers
 *
 * This is the manually encoded rule that will be:
 * 1. Embedded in the URI of the Regulatory State Token (NFT)
 * 2. Referenced in the Regulatory Passport (XLS-70 credential)
 * 3. Enforced (conceptually) by the on-chain Hook
 */
export const MICA_ARTICLE_54_RULE: MiCARule = {
  ruleId: "MiCA-ART54-EMT-CAPITAL-V1",
  regulation: "MiCA",
  regulationReference: "Regulation (EU) 2023/1114",
  article: 54,
  paragraph: 1,
  title: "Own funds requirements for issuers of e-money tokens",
  applicableTo: "E-Money Token (EMT) Issuer",
  requirements: {
    outstandingTokensPercentage: 2,       // 2% of average outstanding e-money tokens
    minimumCapital_EUR: 350000,           // €350,000 absolute floor
    complianceThreshold: "higher_of_two", // whichever of the two is greater
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
    effectiveDate: "2024-06-30",     // MiCA Title IV entry into force
    jurisdiction: "EU",
    version: "1.0",
    encodedBy: "DCSE-PoC",          // Dynamic Compliance Synthesis Engine
    encodingDate: "2025-01-01",
    status: "active",
  },
};

/**
 * Returns the rule as a compact JSON string suitable for embedding in an
 * NFT URI or credential field (after hex-encoding by the caller).
 */
export function encodeRuleAsJSON(rule: MiCARule): string {
  return JSON.stringify(rule);
}

/**
 * Checks whether a given capital amount satisfies Article 54 for an
 * issuer with a specified outstanding token value.
 *
 * This function embodies the "Regulation as Code" principle: the same
 * logic that a human compliance officer would apply is expressed as
 * executable code that can be audited and verified.
 */
export function checkCapitalAdequacy(
  ownFunds_EUR: number,
  outstandingTokenValue_EUR: number
): { compliant: boolean; requiredCapital_EUR: number; reason: string } {
  const rule = MICA_ARTICLE_54_RULE.requirements;
  const percentageThreshold =
    (rule.outstandingTokensPercentage / 100) * outstandingTokenValue_EUR;
  const requiredCapital_EUR = Math.max(
    rule.minimumCapital_EUR,
    percentageThreshold
  );

  const compliant = ownFunds_EUR >= requiredCapital_EUR;
  const reason = compliant
    ? `Own funds of €${ownFunds_EUR.toLocaleString()} meets the MiCA Art.54 requirement of €${requiredCapital_EUR.toLocaleString()}`
    : `Own funds of €${ownFunds_EUR.toLocaleString()} INSUFFICIENT — required €${requiredCapital_EUR.toLocaleString()} under MiCA Art.54`;

  return { compliant, requiredCapital_EUR, reason };
}
