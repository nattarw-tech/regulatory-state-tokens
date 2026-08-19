/**
 * Independent verification of the Appendix A evidence.
 *
 * Re-fetches every transaction cited in the dissertation from a public XRPL
 * Testnet node and reports what the ledger actually says, rather than what the
 * demonstration's own output claimed. Two questions matter most:
 *
 *   1. Does the DepositPreauth entry reference the Regulatory State Token in
 *      any way? If it does not, the gate cannot be consulting the rule, and
 *      any claim that a rule change caused a refusal is causally wrong.
 *
 *   2. Was the CredentialAccept transaction recorded? A credential is not
 *      valid until accepted, so the appendix is incomplete without it.
 *
 * Run: npm run verify
 */

import { Client } from "xrpl";
import { XRPL_TESTNET } from "./config";

const HASHES: Record<string, string> = {
  "Act I  NFTokenMint": "A277A14B40E15CDFFB1F160D91168E011295D776668AC6BF1DE035D29006A99B",
  "Act II CredentialCreate": "17026398678CB77E4A803472AD499D9729FFD2BA71CBD619BC5CA7E41D779E98",
  "Act II DepositPreauth": "D3AF6C15083FB5E3C11BBC24EC7384BB5F6D9C8697533CD021FEC59D255B86FE",
  "Act II Payment": "D3CA3A9B1D1A56D0798E57B6529FC4A06970C774C8E6E4DC9367E75B7ED4F739",
  "Act III Payment": "3B7BE7030878B6A5F2B35B06CD3A03314D0D9932AD0AB328E58B9234D3E71562",
  "Act IV NFTokenModify": "4C6F5C2754794464EC046E81A74203ADE9E549A0F9CEDEBDC4610E00CF2A9559",
  "Act V  CredentialDelete": "34C73F69BB1A354F5171753116FEFF5FE0B239B45ED556F01B80A5275908C72F",
  "Act V  Payment": "DE64A26C16C96E1D0AD7DE4CF96AE3599712CF4DB304F819EF38546A10B0CDFF",
};

const RIPPLE_EPOCH = 946_684_800;
const line = (n = 78) => console.log("─".repeat(n));

function utc(rippleTime: number): string {
  return new Date((rippleTime + RIPPLE_EPOCH) * 1000).toISOString().replace(".000Z", "Z");
}

async function main(): Promise<void> {
  const client = new Client(XRPL_TESTNET.wsUrl);
  await client.connect();

  try {
    console.log("");
    line();
    console.log("  INDEPENDENT VERIFICATION OF APPENDIX A");
    console.log(`  ${XRPL_TESTNET.wsUrl}`);
    line();

    let depositPreauthTx: Record<string, unknown> | null = null;
    let caspAddress = "";
    let regulatorAddress = "";
    let allFound = true;

    for (const [label, hash] of Object.entries(HASHES)) {
      try {
        const res = await client.request({ command: "tx", transaction: hash });
        const tx = res.result as unknown as Record<string, unknown>;
        const meta = tx.meta as { TransactionResult?: string } | undefined;
        const code = meta?.TransactionResult ?? "?";
        const date = tx.date as number | undefined;
        const type = (tx.tx_json as Record<string, unknown> | undefined)?.TransactionType
          ?? tx.TransactionType;

        console.log(`\n  ${label}`);
        console.log(`    type      ${type}`);
        console.log(`    result    ${code}`);
        console.log(`    validated ${tx.validated}`);
        if (date !== undefined) console.log(`    time      ${utc(date)}`);

        if (label.includes("DepositPreauth")) depositPreauthTx = tx;
        if (label.includes("CredentialCreate")) {
          const j = (tx.tx_json ?? tx) as Record<string, unknown>;
          regulatorAddress = j.Account as string;
          caspAddress = j.Subject as string;
        }
      } catch (err) {
        allFound = false;
        console.log(`\n  ${label}`);
        console.log(`    NOT RETRIEVABLE — ${(err as Error).message}`);
      }
    }

    /* ── Question 1: does the gate reference the rule token? ───────────── */
    console.log("");
    line();
    console.log("  QUESTION 1  Does the DepositPreauth condition reference the rule token?");
    line();

    if (depositPreauthTx) {
      const j = (depositPreauthTx.tx_json ?? depositPreauthTx) as Record<string, unknown>;
      console.log("\n  DepositPreauth fields as recorded on the ledger:");
      console.log(JSON.stringify(j, null, 2).split("\n").map((l) => "    " + l).join("\n"));

      const raw = JSON.stringify(j);
      const mentionsNFT = /NFToken|rgt:|97794|53a3eb|v=1\.0|v=2\.0/i.test(raw);
      console.log("");
      console.log(`  references the rule token / rule URI / digest : ${mentionsNFT ? "YES" : "NO"}`);
      if (!mentionsNFT) {
        console.log("");
        console.log("  The authorisation names an issuer and a credential type only.");
        console.log("  It contains no reference to the Regulatory State Token, its URI,");
        console.log("  its version or its digest. The gate therefore cannot consult the");
        console.log("  encoded rule, and amending the rule cannot by itself change what");
        console.log("  the gate admits.");
      }
    } else {
      console.log("\n  DepositPreauth transaction was not retrievable.");
    }

    /* ── Question 2: locate the CredentialAccept ───────────────────────── */
    console.log("");
    line();
    console.log("  QUESTION 2  Was CredentialAccept recorded, and is it missing from Appendix A?");
    line();

    if (caspAddress) {
      console.log(`\n  regulator ${regulatorAddress}`);
      console.log(`  CASP-A    ${caspAddress}`);

      const hist = await client.request({
        command: "account_tx",
        account: caspAddress,
        limit: 50,
        forward: true,
      });

      const rows = (hist.result.transactions ?? []) as unknown as Record<string, unknown>[];
      console.log(`\n  ${rows.length} transaction(s) in this account's history:\n`);
      for (const row of rows) {
        const tx = (row.tx_json ?? row.tx) as Record<string, unknown> | undefined;
        const meta = row.meta as { TransactionResult?: string } | undefined;
        if (!tx) continue;
        const h = (row.hash ?? tx.hash) as string;
        console.log(
          `    ${String(tx.TransactionType).padEnd(20)} ${meta?.TransactionResult ?? "?"}  ${h}`
        );
      }

      const accept = rows.find((r) => {
        const tx = (r.tx_json ?? r.tx) as Record<string, unknown> | undefined;
        return tx?.TransactionType === "CredentialAccept";
      });

      if (accept) {
        const h = (accept.hash ?? (accept.tx as Record<string, unknown>).hash) as string;
        const d = (accept.tx_json ?? accept.tx) as Record<string, unknown>;
        console.log("");
        console.log("  CredentialAccept FOUND — and it is absent from Appendix A:");
        console.log(`    hash  ${h}`);
        if (d.date) console.log(`    time  ${utc(d.date as number)}`);
      } else {
        console.log("\n  No CredentialAccept found in the retrieved history.");
      }
    } else {
      console.log("\n  Could not determine the CASP address from CredentialCreate.");
    }

    console.log("");
    line();
    console.log(allFound ? "  All cited hashes retrievable." : "  SOME HASHES NOT RETRIEVABLE.");
    line();
    console.log("");
  } finally {
    await client.disconnect();
  }
}

main().catch((e) => {
  console.error("verification aborted:", e);
  process.exit(1);
});
