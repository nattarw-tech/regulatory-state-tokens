/**
 * Scenario 3 — RULE UPDATE.
 *
 * A regulator raises a capital threshold. The question this scenario answers is
 * what has to happen next: in a conventional deployment, changed logic has to
 * be rewritten, retested, redeployed and rolled out. Here the change is one
 * transaction against ledger state, and nothing that enforces the rule is
 * touched at all.
 *
 * It also demonstrates the failure mode that makes the design safe. A verifier
 * holding the superseded rule text does not silently keep using it: the digest
 * it computes no longer matches the digest committed on-chain, so verification
 * fails loudly and the stale copy is rejected.
 *
 * Run: npm run scenario:update
 */

import { Client } from "xrpl";
import { XRPL_TESTNET } from "../config";
import {
  MICA_ART35_OWN_FUNDS_RULE,
  MICA_ART35_OWN_FUNDS_RULE_V2,
  checkOwnFundsAdequacy,
} from "../rules/micaRules";
import {
  mintRegulatoryStateToken,
  updateRegulatoryState,
  readRegulatoryState,
  verifyStateMatchesRule,
} from "../state/regulatoryStateToken";

const line = (n = 74) => console.log("─".repeat(n));
const step = (n: number, s: string) => {
  console.log("");
  line();
  console.log(`STEP ${n}  ${s}`);
  line();
};
const ok = (s: string) => console.log(`  [ok]   ${s}`);
const bad = (s: string) => console.log(`  [FAIL] ${s}`);
const info = (s: string) => console.log(`         ${s}`);

async function main(): Promise<void> {
  console.log("");
  line();
  console.log("  SCENARIO 3 — RULE UPDATE WITHOUT REDEPLOYMENT");
  console.log(`  ${XRPL_TESTNET.name}`);
  line();

  const client = new Client(XRPL_TESTNET.wsUrl);
  await client.connect();

  const failures: string[] = [];

  try {
    /* 1 ─ mint v1 --------------------------------------------------------- */
    step(1, "Regulator publishes rule v1 as on-chain state");

    const { wallet: regulator } = await client.fundWallet();
    ok(`Regulator ${regulator.address}`);

    const v1 = await mintRegulatoryStateToken(
      client,
      regulator,
      MICA_ART35_OWN_FUNDS_RULE
    );
    ok(`minted ${v1.nftokenID}`);
    info(`URI  ${v1.uri}`);
    info(v1.explorerUrl);

    /* 2 ─ verify v1 ------------------------------------------------------- */
    step(2, "A verifier reads the ledger and checks its local copy");

    let state = (await readRegulatoryState(client, regulator.address))[0];
    let check = verifyStateMatchesRule(state, MICA_ART35_OWN_FUNDS_RULE);
    check.matches ? ok(check.reason) : bad(check.reason);
    if (!check.matches) failures.push("verify v1");

    const floorV1 = MICA_ART35_OWN_FUNDS_RULE.requirements.minimumCapital_EUR;
    const firm = { ownFunds: 400_000, reserve: 1_000_000, overheads: 200_000 };

    const beforeUpdate = checkOwnFundsAdequacy(
      firm.ownFunds,
      firm.reserve,
      firm.overheads,
      MICA_ART35_OWN_FUNDS_RULE
    );
    info("");
    info(`Firm holds EUR ${firm.ownFunds.toLocaleString()} own funds.`);
    info(`Under v1 (floor EUR ${floorV1.toLocaleString()}): ${beforeUpdate.compliant ? "COMPLIANT" : "NON-COMPLIANT"}`);

    /* 3 ─ amend ----------------------------------------------------------- */
    step(3, "The threshold is raised — one transaction, no redeployment");
    info("Hypothetical amendment: the floor moves to EUR 500,000.");
    info("Note what is NOT happening: no code is recompiled or redeployed,");
    info("no credential type changes, and the NFTokenID stays the same.");

    const v2 = await updateRegulatoryState(
      client,
      regulator,
      v1.nftokenID,
      MICA_ART35_OWN_FUNDS_RULE_V2
    );
    ok(`NFTokenModify applied to ${v2.nftokenID}`);
    info(`URI  ${v2.uri}`);
    info(v2.explorerUrl);

    if (v2.nftokenID !== v1.nftokenID) {
      bad("token identity changed across the amendment");
      failures.push("stable identity");
    } else {
      ok("token identity preserved — existing references stay valid");
    }

    /* 4 ─ the stale copy is rejected -------------------------------------- */
    step(4, "The stale rule copy is now rejected, not silently trusted");

    state = (await readRegulatoryState(client, regulator.address))[0];

    const stale = verifyStateMatchesRule(state, MICA_ART35_OWN_FUNDS_RULE);
    if (stale.matches) {
      bad("v1 still verifies against updated on-chain state — integrity broken");
      failures.push("stale detection");
    } else {
      ok("v1 no longer verifies:");
      info(stale.reason);
    }

    const fresh = verifyStateMatchesRule(state, MICA_ART35_OWN_FUNDS_RULE_V2);
    fresh.matches ? ok(fresh.reason) : bad(fresh.reason);
    if (!fresh.matches) failures.push("verify v2");

    /* 5 ─ the regulatory consequence -------------------------------------- */
    step(5, "The same firm, unchanged, is now non-compliant");

    const afterUpdate = checkOwnFundsAdequacy(
      firm.ownFunds,
      firm.reserve,
      firm.overheads,
      MICA_ART35_OWN_FUNDS_RULE_V2
    );

    info(`Firm still holds EUR ${firm.ownFunds.toLocaleString()} — nothing about it changed.`);
    info(`Under v2: ${afterUpdate.compliant ? "COMPLIANT" : "NON-COMPLIANT"}`);
    info(afterUpdate.reason);

    if (beforeUpdate.compliant && !afterUpdate.compliant) {
      ok("compliance status flipped through a change in the law alone");
    } else {
      bad("expected the firm to pass under v1 and fail under v2");
      failures.push("status flip");
    }

    /* verdict ------------------------------------------------------------- */
    console.log("");
    line();
    if (failures.length === 0) {
      console.log("  SCENARIO 3 PASSED");
      console.log("");
      console.log("  A regulatory threshold moved. The ledger recorded the new");
      console.log("  state, the token kept its identity, holders of the old rule");
      console.log("  were forced to notice, and no enforcement code was touched.");
    } else {
      console.log(`  SCENARIO 3 FAILED — ${failures.join(", ")}`);
    }
    line();
    console.log("");

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("\nScenario 3 aborted:", err);
  process.exit(1);
});
