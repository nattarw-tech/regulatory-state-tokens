/**
 * Tests for the encoded MiCA Article 35 own-funds rule.
 *
 * These matter more than ordinary unit tests. The rule object is what gets
 * committed to the ledger, and the digest is what a verifier uses to confirm
 * that off-chain rule text matches the on-chain pointer. If canonicalisation is
 * not deterministic, that integrity guarantee silently fails: two encodings of
 * the same rule would produce different digests and verification would reject a
 * legitimate rule.
 *
 * Run: npm test   (Node's built-in runner — no test framework dependency)
 */

import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  MICA_ART35_OWN_FUNDS_RULE,
  checkOwnFundsAdequacy,
  computeRuleDigest,
  encodeRuleAsJSON,
  buildRulePointerURI,
  type MiCARule,
} from "../src/rules/micaRules";

describe("Article 35 three-limb test", () => {
  test("the EUR 350,000 floor binds for a small issuer", () => {
    // Tiny reserve, tiny overheads — neither percentage limb reaches the floor.
    const r = checkOwnFundsAdequacy(400_000, 1_000_000, 200_000);

    assert.equal(r.bindingLimb, "absolute_floor");
    assert.equal(r.requiredCapital_EUR, 350_000);
    assert.equal(r.compliant, true);
  });

  test("2% of reserve assets binds for a large issuer", () => {
    // 2% of 100m = 2m, which exceeds both the floor and a quarter of overheads.
    const r = checkOwnFundsAdequacy(2_500_000, 100_000_000, 400_000);

    assert.equal(r.bindingLimb, "reserve_percentage");
    assert.equal(r.requiredCapital_EUR, 2_000_000);
    assert.equal(r.compliant, true);
  });

  test("a quarter of fixed overheads binds for an operationally heavy issuer", () => {
    // 25% of 8m = 2m, above the floor and above 2% of a 10m reserve (200k).
    const r = checkOwnFundsAdequacy(2_100_000, 10_000_000, 8_000_000);

    assert.equal(r.bindingLimb, "fixed_overheads");
    assert.equal(r.requiredCapital_EUR, 2_000_000);
    assert.equal(r.compliant, true);
  });

  test("a shortfall against the binding limb is non-compliant", () => {
    const r = checkOwnFundsAdequacy(1_000_000, 100_000_000, 400_000);

    assert.equal(r.compliant, false);
    assert.equal(r.requiredCapital_EUR, 2_000_000);
    assert.match(r.reason, /INSUFFICIENT/);
  });

  test("meeting the requirement exactly is compliant", () => {
    // The statute says "at least", so equality passes. An off-by-one here would
    // wrongly refuse a firm that is precisely at its regulatory minimum.
    const r = checkOwnFundsAdequacy(350_000, 1_000_000, 200_000);

    assert.equal(r.compliant, true);
    assert.equal(r.requiredCapital_EUR, 350_000);
  });

  test("the reason names the limb that set the requirement", () => {
    // Explainability is a design requirement, not a nicety: a firm refused
    // service is entitled to know which limb it failed.
    const floor = checkOwnFundsAdequacy(400_000, 1_000_000, 200_000);
    const reserve = checkOwnFundsAdequacy(2_500_000, 100_000_000, 400_000);

    assert.match(floor.reason, /350,000 floor/);
    assert.match(reserve.reason, /2% of reserve assets/);
  });
});

describe("canonicalisation and digest integrity", () => {
  test("the digest is stable across runs", () => {
    assert.equal(
      computeRuleDigest(MICA_ART35_OWN_FUNDS_RULE),
      computeRuleDigest(MICA_ART35_OWN_FUNDS_RULE)
    );
  });

  test("key insertion order does not change the digest", () => {
    // The integrity guarantee rests on this. Two systems encoding the same rule
    // must agree on the digest regardless of how they built the object.
    const forward = MICA_ART35_OWN_FUNDS_RULE;

    const reversed = Object.fromEntries(
      Object.entries(forward).reverse()
    ) as unknown as MiCARule;

    assert.notEqual(
      JSON.stringify(forward),
      JSON.stringify(reversed),
      "test is vacuous unless the raw serialisations differ"
    );
    assert.equal(computeRuleDigest(forward), computeRuleDigest(reversed));
  });

  test("a changed threshold changes the digest", () => {
    // The rule-update scenario depends on this: bumping the threshold must be
    // detectable by anyone holding the previous digest.
    const raised: MiCARule = {
      ...MICA_ART35_OWN_FUNDS_RULE,
      requirements: {
        ...MICA_ART35_OWN_FUNDS_RULE.requirements,
        minimumCapital_EUR: 500_000,
      },
    };

    assert.notEqual(
      computeRuleDigest(MICA_ART35_OWN_FUNDS_RULE),
      computeRuleDigest(raised)
    );
  });

  test("canonical JSON sorts nested keys", () => {
    const json = encodeRuleAsJSON(MICA_ART35_OWN_FUNDS_RULE);
    const parsed = JSON.parse(json);

    const topLevel = Object.keys(parsed);
    assert.deepEqual(topLevel, [...topLevel].sort());

    const provenance = Object.keys(parsed.provenance);
    assert.deepEqual(provenance, [...provenance].sort());
  });
});

describe("on-chain pointer URI", () => {
  test("matches the documented rgt: format", () => {
    const uri = buildRulePointerURI(MICA_ART35_OWN_FUNDS_RULE);
    assert.match(uri, /^rgt:[A-Za-z0-9-]+\?v=[\d.]+&h=[0-9a-f]{32}$/);
  });

  test("commits to the rule it describes", () => {
    const uri = buildRulePointerURI(MICA_ART35_OWN_FUNDS_RULE);
    const digest = computeRuleDigest(MICA_ART35_OWN_FUNDS_RULE);

    assert.ok(uri.endsWith(digest.slice(0, 32)));
  });

  test("stays inside the 256-byte NFToken URI limit", () => {
    const uri = buildRulePointerURI(MICA_ART35_OWN_FUNDS_RULE);
    assert.ok(
      Buffer.byteLength(uri, "utf8") <= 256,
      `URI is ${Buffer.byteLength(uri, "utf8")} bytes`
    );
  });

  test("refuses to build a URI that would exceed the limit", () => {
    // A mint carrying an over-long URI fails on submission. Failing here, with
    // a clear message, is preferable to a tec code from the network.
    const overlong: MiCARule = {
      ...MICA_ART35_OWN_FUNDS_RULE,
      ruleId: "X".repeat(260),
    };

    assert.throws(
      () => buildRulePointerURI(overlong),
      /exceeds the 256-byte XRPL NFToken URI limit/
    );
  });
});

describe("encoded rule fidelity to the source text", () => {
  test("carries the three Article 35(1) limbs", () => {
    const req = MICA_ART35_OWN_FUNDS_RULE.requirements;

    assert.equal(req.minimumCapital_EUR, 350_000);
    assert.equal(req.reserveAssetsPercentage, 2);
    assert.equal(req.fixedOverheadsFraction, 0.25);
    assert.equal(req.complianceThreshold, "highest_of");
  });

  test("cites MiCA by CELEX identifier and article", () => {
    const p = MICA_ART35_OWN_FUNDS_RULE.provenance;

    assert.equal(p.celex, "32023R1114");
    assert.equal(p.articleReference, "Article 35(1)");
  });

  test("does not claim an authoritative taxonomy identifier it does not have", () => {
    // Guards the honesty note in micaRules.ts. Cambridge Regulatory Genome
    // concept IDs are not public without a data agreement, so conceptId must
    // stay null rather than carry an invented value.
    assert.equal(MICA_ART35_OWN_FUNDS_RULE.taxonomy.conceptId, null);
  });
});
