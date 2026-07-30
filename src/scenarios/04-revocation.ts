/**
 * Scenario 4 — REVOCATION.
 *
 * A firm makes a payment successfully. Its regulator then withdraws its
 * authorisation. The firm attempts the identical payment again and is refused.
 *
 * Nothing about the firm changed between the two attempts. Same account, same
 * destination, same amount, same code path. What changed was its supervisory
 * status, and the ledger acted on that change immediately.
 *
 * This is the scenario that distinguishes the design from an allowlist. An
 * allowlist records a decision taken at some point in the past, and stays wrong
 * until somebody remembers to edit it — at every counterparty that keeps one.
 * Here the regulator withdrew one credential, and every gate that relies on
 * that credential closed at once, with no counterparty doing anything or even
 * being told.
 *
 * Run: npm run scenario:revoke
 */

import { Client } from "xrpl";
import { XRPL_TESTNET } from "../config";
import {
  issuePassport,
  revokePassport,
  verifyPassport,
} from "../credentials/passport";
import {
  enableDepositAuthorisation,
  authoriseCredential,
  attemptPayment,
} from "../enforcement/depositGate";

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

const ONE_XRP = "1000000";

async function main(): Promise<void> {
  console.log("");
  line();
  console.log("  SCENARIO 4 — REVOCATION");
  console.log(`  ${XRPL_TESTNET.name}`);
  line();

  const client = new Client(XRPL_TESTNET.wsUrl);
  await client.connect();

  const failures: string[] = [];

  try {
    /* 1 ─ setup ----------------------------------------------------------- */
    step(1, "A supervised firm, its regulator, and a gated counterparty");

    const [regulator, firm, counterparty] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
      client.fundWallet(),
    ]).then((r) => r.map((x) => x.wallet));

    ok(`Regulator     ${regulator.address}`);
    ok(`Firm          ${firm.address}`);
    ok(`Counterparty  ${counterparty.address}`);

    const passport = await issuePassport(client, regulator, firm);
    ok(`passport issued — ${passport.credentialID}`);
    info(`attests ${passport.ruleUri}`);
    info(passport.explorerUrl);

    await enableDepositAuthorisation(client, counterparty);
    const gate = await authoriseCredential(client, counterparty, regulator.address);
    ok("counterparty gate is open only to holders of that passport");
    info(gate.explorerUrl);

    /* 2 ─ trading normally ------------------------------------------------ */
    step(2, "The firm transacts normally");

    let status = await verifyPassport(client, firm.address, regulator.address);
    ok(`passport status: ${status.valid ? "VALID" : "NOT VALID"}`);
    info(status.reason);

    const before = await attemptPayment(
      client,
      firm,
      counterparty.address,
      ONE_XRP,
      passport.credentialID
    );

    if (before.settled) {
      ok(`payment settled — ${before.result}`);
    } else {
      bad(`expected the payment to settle, got ${before.result}`);
      failures.push("payment before revocation");
    }
    info(before.reason);
    info(before.explorerUrl);

    /* 3 ─ supervisory action ---------------------------------------------- */
    step(3, "The regulator withdraws the firm's authorisation");
    info("One transaction. No gate is reconfigured, no counterparty is");
    info("notified, and no list anywhere is edited.");

    const revocation = await revokePassport(client, regulator, firm.address);
    ok(`passport withdrawn — ${revocation.hash}`);
    info(revocation.explorerUrl);

    status = await verifyPassport(client, firm.address, regulator.address);
    if (status.valid) {
      bad("passport still reports valid after withdrawal");
      failures.push("revocation not effective");
    } else {
      ok("passport no longer valid");
      info(status.reason);
    }

    /* 4 ─ the same payment, refused --------------------------------------- */
    step(4, "The firm attempts the identical payment");
    info("Same sender, same destination, same amount, same code path.");

    const after = await attemptPayment(
      client,
      firm,
      counterparty.address,
      ONE_XRP,
      passport.credentialID
    );

    if (after.settled) {
      bad(`payment settled after revocation — ${after.result}`);
      failures.push("payment after revocation");
    } else {
      ok(`payment refused — ${after.result}`);
    }
    info(after.reason);
    info(after.explorerUrl);

    /* 4b ─ the other refusal path ----------------------------------------- */
    step(5, "The firm tries again, presenting nothing at all");
    info("A refused firm's obvious next move is to retry without the passport.");

    const bare = await attemptPayment(
      client,
      firm,
      counterparty.address,
      ONE_XRP
    );

    if (bare.settled) {
      bad(`payment settled with no credential — ${bare.result}`);
      failures.push("bare payment after revocation");
    } else {
      ok(`payment refused — ${bare.result}`);
    }
    info(bare.reason);
    info(bare.explorerUrl);

    if (bare.result !== after.result) {
      ok("the two refusals carry different codes — the reason is legible");
      info(`presenting a withdrawn passport: ${after.result}`);
      info(`presenting nothing at all:       ${bare.result}`);
    }

    /* 5 ─ the comparison -------------------------------------------------- */
    step(6, "Before and after");

    console.log("");
    console.log("         Attempt   Presented          Result               Settled");
    console.log("         ───────   ────────────────   ──────────────────   ───────");
    console.log(
      `         first     valid passport     ${before.result.padEnd(18)}   ${before.settled ? "yes" : "no"}`
    );
    console.log(
      `         second    withdrawn passport ${after.result.padEnd(18)}   ${after.settled ? "yes" : "no"}`
    );
    console.log(
      `         third     nothing            ${bare.result.padEnd(18)}   ${bare.settled ? "yes" : "no"}`
    );
    console.log("");
    info("The firm did not change. Its authorisation did, and the ledger");
    info("enforced that on the very next transaction.");

    /* verdict ------------------------------------------------------------- */
    console.log("");
    line();
    if (failures.length === 0) {
      console.log("  SCENARIO 4 PASSED");
      console.log("");
      console.log("  Withdrawing one credential closed every gate that relied");
      console.log("  on it, immediately, with no counterparty taking any action.");
      console.log("  The gate reads current supervisory status rather than a");
      console.log("  decision recorded at some point in the past.");
    } else {
      console.log(`  SCENARIO 4 FAILED — ${failures.join(", ")}`);
    }
    line();
    console.log("");

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("\nScenario 4 aborted:", err);
  process.exit(1);
});
