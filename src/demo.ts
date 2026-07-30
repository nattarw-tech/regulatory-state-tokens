/**
 * The demonstration.
 *
 * Five acts, one continuous story, run live against XRPL Testnet:
 *
 *   I    A regulator publishes a capital-adequacy rule as ledger state.
 *   II   A firm that meets it is authorised, and transacts.
 *   III  A firm that is not authorised is refused before settlement.
 *   IV   The law changes. One transaction. No code is redeployed.
 *   V    The first firm no longer meets the new threshold, its authorisation
 *        is withdrawn, and the same payment that worked in Act II now fails.
 *
 * Acts IV and V are the point. A firm that was trading legitimately becomes
 * unable to trade — not because anything about the firm changed, but because
 * the law did and its supervisor acted. In a conventional arrangement that is a
 * notice, a remediation period, and manual changes at every counterparty. Here
 * it is two transactions, effective on the next payment.
 *
 * Everything is written to docs/demo-report.html as it happens.
 *
 * Run: npm run demo
 */

import { Client, Wallet } from "xrpl";
import { join } from "path";
import { XRPL_TESTNET } from "./config";
import {
  MICA_ART35_OWN_FUNDS_RULE,
  MICA_ART35_OWN_FUNDS_RULE_V2,
  checkOwnFundsAdequacy,
} from "./rules/micaRules";
import {
  mintRegulatoryStateToken,
  updateRegulatoryState,
  readRegulatoryState,
  verifyStateMatchesRule,
} from "./state/regulatoryStateToken";
import { issuePassport, revokePassport, verifyPassport } from "./credentials/passport";
import {
  enableDepositAuthorisation,
  authoriseCredential,
  attemptPayment,
} from "./enforcement/depositGate";
import { EvidenceRecorder } from "./evidence/recorder";

/* ─── presentation ────────────────────────────────────────────────────────── */

const W = 76;
const rule = (c = "─") => console.log(c.repeat(W));
const act = (n: string, title: string) => {
  console.log("");
  rule("━");
  console.log(`  ACT ${n}   ${title.toUpperCase()}`);
  rule("━");
};
const beat = (s: string) => console.log(`\n  ${s}`);
const ok = (s: string) => console.log(`    [ok] ${s}`);
const no = (s: string) => console.log(`    [!!] ${s}`);
const note = (s: string) => console.log(`         ${s}`);

const ONE_XRP = "1000000";

/** A firm positioned deliberately between the two thresholds. */
const FIRM_POSITION = {
  ownFunds: 400_000,
  reserveAssets: 1_000_000,
  fixedOverheads: 200_000,
};

async function main(): Promise<void> {
  const recorder = new EvidenceRecorder();

  console.log("");
  rule("━");
  console.log("  REGULATION AS LEDGER STATE");
  console.log("  Enforcing a capital requirement before settlement, on XRPL");
  rule("━");

  const client = new Client(XRPL_TESTNET.wsUrl);
  await client.connect();

  const failures: string[] = [];

  try {
    const info = await client.request({ command: "server_info" });
    recorder.setMetadata({
      network: XRPL_TESTNET.name,
      wsUrl: XRPL_TESTNET.wsUrl,
      serverVersion: info.result.info.build_version,
      ledgerAtStart: info.result.info.validated_ledger?.seq ?? 0,
      startedAt: new Date().toISOString(),
    });
    note(`connected — rippled ${info.result.info.build_version}`);

    const [regulator, firmA, firmB, counterparty]: Wallet[] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
      client.fundWallet(),
      client.fundWallet(),
    ]).then((r) => r.map((x) => x.wallet));

    recorder.noteAccount("Regulator", regulator.address);
    recorder.noteAccount("Firm A (authorised)", firmA.address);
    recorder.noteAccount("Firm B (not authorised)", firmB.address);
    recorder.noteAccount("Counterparty (gated)", counterparty.address);

    /* ── ACT I ─────────────────────────────────────────────────────────── */
    act("I", "The rule becomes ledger state");

    beat("A regulator publishes the current own-funds requirement.");
    note("MiCA Article 35(1): own funds of at least the highest of");
    note("EUR 350,000, 2% of average reserve assets, or a quarter of");
    note("the preceding year's fixed overheads.");

    const stateV1 = await mintRegulatoryStateToken(
      client,
      regulator,
      MICA_ART35_OWN_FUNDS_RULE
    );
    ok(`published as ${stateV1.nftokenID.slice(0, 16)}…`);
    note(`pointer  ${stateV1.uri}`);
    note(stateV1.explorerUrl);

    recorder.record({
      act: "Act I — The rule becomes ledger state",
      step: "Regulator publishes rule v1",
      transactionType: "NFTokenMint",
      result: "tesSUCCESS",
      settled: null,
      hash: stateV1.hash,
      note: "The threshold is now an object on the ledger, not a constant inside a program.",
    });

    const reading = (await readRegulatoryState(client, regulator.address))[0];
    const match = verifyStateMatchesRule(reading, MICA_ART35_OWN_FUNDS_RULE);
    match.matches ? ok("digest verifies against the local rule") : no(match.reason);
    if (!match.matches) failures.push("Act I verification");

    /* ── ACT II ────────────────────────────────────────────────────────── */
    act("II", "A compliant firm is authorised and transacts");

    const assessV1 = checkOwnFundsAdequacy(
      FIRM_POSITION.ownFunds,
      FIRM_POSITION.reserveAssets,
      FIRM_POSITION.fixedOverheads,
      MICA_ART35_OWN_FUNDS_RULE
    );

    beat("The regulator assesses Firm A against the published rule.");
    note(`own funds EUR ${FIRM_POSITION.ownFunds.toLocaleString()}`);
    note(assessV1.reason);
    if (!assessV1.compliant) {
      no("Firm A should meet the v1 threshold — demo mis-parameterised");
      failures.push("Act II premise");
    }

    const passport = await issuePassport(client, regulator, firmA);
    ok("passport issued and accepted");
    note(`attests ${passport.ruleUri}`);
    note(passport.explorerUrl);

    recorder.record({
      act: "Act II — A compliant firm is authorised",
      step: "Regulator issues Firm A a passport",
      transactionType: "CredentialCreate",
      result: "tesSUCCESS",
      settled: null,
      hash: passport.createTxHash,
      note: "Only status goes on-ledger. The audited accounts behind it stay off it.",
    });
    recorder.record({
      act: "Act II — A compliant firm is authorised",
      step: "Firm A accepts",
      transactionType: "CredentialAccept",
      result: "tesSUCCESS",
      settled: null,
      hash: passport.acceptTxHash,
      note: "A firm cannot be given regulatory status it has not agreed to hold.",
    });

    beat("A counterparty closes its account to unauthorised senders.");
    const authTx = await enableDepositAuthorisation(client, counterparty);
    const gateTx = await authoriseCredential(client, counterparty, regulator.address);
    ok("gate open only to holders of that regulator's passport");
    note("No address is whitelisted. The gate names the credential, not the firm.");
    note(gateTx.explorerUrl);

    recorder.record({
      act: "Act II — A compliant firm is authorised",
      step: "Counterparty requires authorisation",
      transactionType: "AccountSet (asfDepositAuth)",
      result: "tesSUCCESS",
      settled: null,
      hash: authTx.hash,
      note: "The account now refuses incoming value by default.",
    });
    recorder.record({
      act: "Act II — A compliant firm is authorised",
      step: "Counterparty authorises the credential",
      transactionType: "DepositPreauth",
      result: "tesSUCCESS",
      settled: null,
      hash: gateTx.hash,
      note: "A standing exception for anyone holding the named attestation.",
    });

    beat("Firm A pays.");
    const paymentA = await attemptPayment(
      client,
      firmA,
      counterparty.address,
      ONE_XRP,
      passport.credentialID
    );
    paymentA.settled ? ok(`${paymentA.result} — settled`) : no(paymentA.result);
    note(paymentA.reason);
    note(paymentA.explorerUrl);
    if (!paymentA.settled) failures.push("Act II payment");

    recorder.record({
      act: "Act II — A compliant firm is authorised",
      step: "Firm A pays, presenting its passport",
      transactionType: "Payment (CredentialIDs)",
      result: paymentA.result,
      settled: paymentA.settled,
      hash: paymentA.hash,
      note: paymentA.reason,
    });

    /* ── ACT III ───────────────────────────────────────────────────────── */
    act("III", "An unauthorised firm is refused");

    beat("Firm B holds no passport, and attempts the same payment.");
    const paymentB = await attemptPayment(client, firmB, counterparty.address, ONE_XRP);
    paymentB.settled
      ? no(`${paymentB.result} — should have been refused`)
      : ok(`${paymentB.result} — refused`);
    note(paymentB.reason);
    note(paymentB.explorerUrl);
    if (paymentB.settled) failures.push("Act III should have been refused");

    recorder.record({
      act: "Act III — An unauthorised firm is refused",
      step: "Firm B pays with nothing to present",
      transactionType: "Payment",
      result: paymentB.result,
      settled: paymentB.settled,
      hash: paymentB.hash,
      note: paymentB.reason,
    });

    beat("This is the ex-ante claim.");
    note("The payment did not settle and was not reversed. It never executed.");
    note("No smart contract was involved and no off-ledger service consulted.");

    /* ── ACT IV ────────────────────────────────────────────────────────── */
    act("IV", "The law changes");

    beat("The threshold is raised to EUR 500,000 (a hypothetical amendment).");
    const stateV2 = await updateRegulatoryState(
      client,
      regulator,
      stateV1.nftokenID,
      MICA_ART35_OWN_FUNDS_RULE_V2
    );
    ok("amended in one transaction");
    note(`pointer  ${stateV2.uri}`);
    note(`token identity unchanged: ${stateV2.nftokenID === stateV1.nftokenID}`);
    note(stateV2.explorerUrl);

    recorder.record({
      act: "Act IV — The law changes",
      step: "Regulator amends the rule in place",
      transactionType: "NFTokenModify",
      result: "tesSUCCESS",
      settled: null,
      hash: stateV2.hash,
      note: "Nothing recompiled or redeployed. The token keeps its identity, so existing references stay valid.",
    });

    const assessV2 = checkOwnFundsAdequacy(
      FIRM_POSITION.ownFunds,
      FIRM_POSITION.reserveAssets,
      FIRM_POSITION.fixedOverheads,
      MICA_ART35_OWN_FUNDS_RULE_V2
    );

    beat("Firm A is reassessed. Nothing about the firm has changed.");
    note(`own funds still EUR ${FIRM_POSITION.ownFunds.toLocaleString()}`);
    note(assessV2.reason);
    assessV2.compliant
      ? no("expected Firm A to fall below the raised threshold")
      : ok("Firm A no longer meets the requirement");
    if (assessV2.compliant) failures.push("Act IV premise");

    /* ── ACT V ─────────────────────────────────────────────────────────── */
    act("V", "The regulator acts, and the gate closes");

    const revocation = await revokePassport(client, regulator, firmA.address);
    ok("passport withdrawn");
    note(revocation.explorerUrl);

    recorder.record({
      act: "Act V — The regulator acts",
      step: "Regulator withdraws Firm A's passport",
      transactionType: "CredentialDelete",
      result: "tesSUCCESS",
      settled: null,
      hash: revocation.hash,
      note: "One transaction. No counterparty is notified and no list is edited.",
    });

    const status = await verifyPassport(client, firmA.address, regulator.address);
    status.valid ? no("passport still valid") : ok(status.reason);
    if (status.valid) failures.push("Act V revocation");

    beat("Firm A attempts the identical payment from Act II.");
    const paymentAfter = await attemptPayment(
      client,
      firmA,
      counterparty.address,
      ONE_XRP,
      passport.credentialID
    );
    paymentAfter.settled
      ? no(`${paymentAfter.result} — should have been refused`)
      : ok(`${paymentAfter.result} — refused`);
    note(paymentAfter.reason);
    note(paymentAfter.explorerUrl);
    if (paymentAfter.settled) failures.push("Act V should have been refused");

    recorder.record({
      act: "Act V — The regulator acts",
      step: "Firm A repeats the Act II payment",
      transactionType: "Payment (CredentialIDs)",
      result: paymentAfter.result,
      settled: paymentAfter.settled,
      hash: paymentAfter.hash,
      note: paymentAfter.reason,
    });

    /* ── close ─────────────────────────────────────────────────────────── */
    console.log("");
    rule("━");
    if (failures.length === 0) {
      console.log("  DEMONSTRATION COMPLETE");
      console.log("");
      console.log("  The same payment, by the same firm, to the same counterparty:");
      console.log(`    Act II   ${paymentA.result.padEnd(20)} settled`);
      console.log(`    Act V    ${paymentAfter.result.padEnd(20)} refused before settlement`);
      console.log("");
      console.log("  Between them the law changed and a supervisor acted.");
      console.log("  Nothing was redeployed. No smart contract exists in this system.");
    } else {
      console.log(`  DEMONSTRATION INCOMPLETE — ${failures.length} issue(s):`);
      failures.forEach((f) => console.log(`    · ${f}`));
    }
    rule("━");

    const out = recorder.write(join(__dirname, "..", "docs"));
    console.log("");
    console.log(`  Report  ${out.html}`);
    console.log(`  Data    ${out.json}`);
    console.log("");
    console.log("  Open the report and follow any explorer link to verify these");
    console.log("  transactions independently.");
    console.log("");

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("\nDemonstration aborted:", err);
  process.exit(1);
});
