/**
 * Preflight — proves the enforcement chain end-to-end on XRPL Testnet.
 *
 * This is the project's central technical claim reduced to its smallest
 * runnable form: a payment is REJECTED BY THE PROTOCOL, before settlement,
 * because the sender does not hold a regulator-issued credential.
 *
 * It runs the chain in six steps:
 *
 *   1. Fund a Regulator, a compliant CASP (A), a non-compliant CASP (B),
 *      and a Beneficiary.
 *   2. Regulator issues a Credential to CASP-A; CASP-A accepts it.
 *   3. Beneficiary enables Deposit Authorisation (asfDepositAuth), which
 *      blocks all incoming payments by default.
 *   4. Beneficiary authorises the *credential*, not the account, via
 *      DepositPreauth{AuthorizeCredentials}. Nobody is whitelisted by address.
 *   5. CASP-A pays, presenting CredentialIDs      -> expect tesSUCCESS
 *   6. CASP-B pays, with no credential to present -> expect tecNO_PERMISSION
 *
 * Step 6 is the result the dissertation turns on. The transaction does not
 * settle and then get reversed; it never settles at all.
 *
 * Run: npm run preflight
 */

import { Client, Wallet, convertStringToHex } from "xrpl";
import { XRPL_TESTNET, CREDENTIAL_TYPE_STRING } from "./config";

/** xrpl.js 4.6 does not yet type the Credentials / DepositPreauth-credential
 *  fields, so transactions carrying them are submitted as raw objects. */
type RawTransaction = Record<string, unknown>;

const CREDENTIAL_TYPE_HEX = convertStringToHex(CREDENTIAL_TYPE_STRING);

/* ─── output helpers ──────────────────────────────────────────────────────── */

const line = (n = 74) => console.log("─".repeat(n));
const step = (n: number, s: string) => {
  console.log("");
  line();
  console.log(`STEP ${n}  ${s}`);
  line();
};
const ok = (s: string) => console.log(`  [ok]   ${s}`);
const info = (s: string) => console.log(`         ${s}`);
const bad = (s: string) => console.log(`  [FAIL] ${s}`);

/* ─── submission ──────────────────────────────────────────────────────────── */

interface SubmitOutcome {
  result: string;
  hash: string;
}

/**
 * Submits and waits for validation. Unlike a throwing helper, this RETURNS the
 * engine result, because a rejection (tecNO_PERMISSION) is a successful test
 * outcome here, not an error.
 */
async function submit(
  client: Client,
  wallet: Wallet,
  tx: RawTransaction
): Promise<SubmitOutcome> {
  const prepared = await client.autofill(tx as never);
  const signed = wallet.sign(prepared as never);
  const res = await client.submitAndWait(signed.tx_blob);

  const meta = res.result.meta;
  const result =
    typeof meta === "object" && meta !== null && "TransactionResult" in meta
      ? (meta as { TransactionResult: string }).TransactionResult
      : "UNKNOWN";

  return { result, hash: res.result.hash };
}

/** Asserts an engine result, printing the explorer link either way. */
function expect(
  label: string,
  outcome: SubmitOutcome,
  wanted: string
): boolean {
  const pass = outcome.result === wanted;
  const msg = `${label}: ${outcome.result}`;
  pass ? ok(msg) : bad(`${msg}  (expected ${wanted})`);
  info(`${XRPL_TESTNET.explorer}/transactions/${outcome.hash}`);
  return pass;
}

/* ─── the credential's ledger entry id ────────────────────────────────────── */

/**
 * Finds the ledger entry ID of a credential held by `subject` and issued by
 * `issuer`. This ID is what a Payment must carry in CredentialIDs — the
 * protocol resolves it and checks issuer, subject, acceptance and expiry.
 */
async function findCredentialID(
  client: Client,
  subject: string,
  issuer: string
): Promise<string | null> {
  const res = await client.request({
    command: "account_objects",
    account: subject,
    ledger_index: "validated",
  });

  const objects = res.result
    .account_objects as unknown as Record<string, unknown>[];

  const match = objects.find(
    (o) =>
      o.LedgerEntryType === "Credential" &&
      o.Issuer === issuer &&
      o.CredentialType === CREDENTIAL_TYPE_HEX
  );

  return match ? (match.index as string) : null;
}

/* ─── main ────────────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  console.log("");
  line();
  console.log("  PREFLIGHT — credential-gated payment on XRPL Testnet");
  console.log(`  ${XRPL_TESTNET.name}  ·  ${XRPL_TESTNET.wsUrl}`);
  line();

  const client = new Client(XRPL_TESTNET.wsUrl);
  await client.connect();

  const failures: string[] = [];

  try {
    const srv = await client.request({ command: "server_info" });
    const v = srv.result.info.build_version;
    const ledger = srv.result.info.validated_ledger?.seq;
    ok(`connected — rippled ${v}, validated ledger ${ledger}`);

    /* 1 ─ accounts ------------------------------------------------------- */
    step(1, "Fund four accounts from the testnet faucet");

    const [regulator, caspA, caspB, beneficiary] = await Promise.all([
      client.fundWallet(),
      client.fundWallet(),
      client.fundWallet(),
      client.fundWallet(),
    ]).then((r) => r.map((x) => x.wallet));

    ok(`Regulator    ${regulator.address}`);
    ok(`CASP-A       ${caspA.address}   (will hold the passport)`);
    ok(`CASP-B       ${caspB.address}   (will not)`);
    ok(`Beneficiary  ${beneficiary.address}`);

    /* 2 ─ credential ----------------------------------------------------- */
    step(2, "Regulator issues the Regulatory Passport; CASP-A accepts it");
    info(`CredentialType "${CREDENTIAL_TYPE_STRING}"`);
    info(`  hex ${CREDENTIAL_TYPE_HEX} (${CREDENTIAL_TYPE_HEX.length / 2} bytes, limit 64)`);

    const created = await submit(client, regulator, {
      TransactionType: "CredentialCreate",
      Account: regulator.address,
      Subject: caspA.address,
      CredentialType: CREDENTIAL_TYPE_HEX,
    });
    if (!expect("CredentialCreate", created, "tesSUCCESS"))
      failures.push("CredentialCreate");

    const accepted = await submit(client, caspA, {
      TransactionType: "CredentialAccept",
      Account: caspA.address,
      Issuer: regulator.address,
      CredentialType: CREDENTIAL_TYPE_HEX,
    });
    if (!expect("CredentialAccept", accepted, "tesSUCCESS"))
      failures.push("CredentialAccept");

    const credentialID = await findCredentialID(
      client,
      caspA.address,
      regulator.address
    );
    if (credentialID) {
      ok(`credential ledger entry ${credentialID}`);
    } else {
      bad("credential not found on ledger after accept");
      failures.push("findCredentialID");
    }

    /* 3 ─ close the account ---------------------------------------------- */
    step(3, "Beneficiary enables Deposit Authorisation (blocks everyone)");

    const depositAuth = await submit(client, beneficiary, {
      TransactionType: "AccountSet",
      Account: beneficiary.address,
      SetFlag: 9, // asfDepositAuth
    });
    if (!expect("AccountSet asfDepositAuth", depositAuth, "tesSUCCESS"))
      failures.push("asfDepositAuth");

    /* 4 ─ authorise the credential, not the account ----------------------- */
    step(4, "Beneficiary authorises the CREDENTIAL, not any address");
    info("This is the regulatory perimeter: membership is earned by holding");
    info("a regulator-issued attestation, not by being on a whitelist.");

    const preauth = await submit(client, beneficiary, {
      TransactionType: "DepositPreauth",
      Account: beneficiary.address,
      AuthorizeCredentials: [
        {
          Credential: {
            Issuer: regulator.address,
            CredentialType: CREDENTIAL_TYPE_HEX,
          },
        },
      ],
    });
    if (!expect("DepositPreauth AuthorizeCredentials", preauth, "tesSUCCESS"))
      failures.push("DepositPreauth");

    /* 5 ─ ALLOW ----------------------------------------------------------- */
    step(5, "SCENARIO ALLOW — CASP-A pays, presenting its passport");

    const allow = await submit(client, caspA, {
      TransactionType: "Payment",
      Account: caspA.address,
      Destination: beneficiary.address,
      Amount: "1000000", // 1 XRP in drops
      ...(credentialID ? { CredentialIDs: [credentialID] } : {}),
    });
    if (!expect("Payment with CredentialIDs", allow, "tesSUCCESS"))
      failures.push("ALLOW");

    /* 6 ─ BLOCK ----------------------------------------------------------- */
    step(6, "SCENARIO BLOCK — CASP-B pays, holding no passport");

    const block = await submit(client, caspB, {
      TransactionType: "Payment",
      Account: caspB.address,
      Destination: beneficiary.address,
      Amount: "1000000",
    });
    if (!expect("Payment without credential", block, "tecNO_PERMISSION"))
      failures.push("BLOCK");

    /* verdict ------------------------------------------------------------- */
    console.log("");
    line();
    if (failures.length === 0) {
      console.log("  PREFLIGHT PASSED");
      console.log("");
      console.log("  A payment was refused by the XRP Ledger itself because the");
      console.log("  sender held no regulator-issued credential. Enforcement");
      console.log("  happened before settlement, with no smart contract, no");
      console.log("  bridge, and no off-ledger check.");
    } else {
      console.log(`  PREFLIGHT FAILED — ${failures.length} step(s): ${failures.join(", ")}`);
    }
    line();
    console.log("");

    if (failures.length > 0) process.exitCode = 1;
  } finally {
    await client.disconnect();
  }
}

main().catch((err) => {
  console.error("\nPreflight aborted:", err);
  process.exit(1);
});
