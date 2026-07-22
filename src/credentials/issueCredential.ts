/**
 * XLS-70 Regulatory Passport — Credential Issuance
 *
 * This module implements Step 2 of the PoC: issuing an on-chain "Regulatory
 * Passport" using the XLS-70 Verified Identity States (Credentials) standard
 * on the XRPL Testnet.
 *
 * The credential flow involves two transactions:
 *   1. CredentialCreate  — issued BY the Regulatory Authority TO the CASP account
 *   2. CredentialAccept  — accepted BY the CASP account (opt-in consent model)
 *
 * On-chain, the credential is queryable via account_objects with type="credential",
 * enabling any Hook or off-chain validator to verify CASP compliance status
 * without contacting the regulator directly.
 *
 * XLS-70 Specification: https://github.com/XRPLF/XRPL-Standards/discussions/213
 * XRPL Credentials Docs: https://xrpl.org/docs/references/protocol/transactions/types/credentialcreate
 */

import { Client, Wallet, convertStringToHex } from "xrpl";
import { NETWORKS, CREDENTIAL_TYPE_STRING } from "../config";
import { MICA_ARTICLE_54_RULE, encodeRuleAsJSON } from "../rules/micaRules";

// CredentialCreate and CredentialAccept may not yet be typed in xrpl.js v4.
// We use the Transaction interface with type casting for forward compatibility.
type RawTransaction = Record<string, unknown>;

export interface CredentialResult {
  issuer: string;
  subject: string;
  credentialType: string;
  credentialTypeHex: string;
  createTxHash: string;
  acceptTxHash: string;
  explorerUrl: string;
}

/**
 * Issues a MiCA Art.54 Regulatory Passport credential on XRPL Testnet.
 *
 * @param regulatorWallet - The "Regulatory Authority" account that issues the credential
 * @param caspWallet      - The "CASP" account that receives and accepts the credential
 * @param client          - Connected XRPL client
 */
export async function issueRegulatoryPassport(
  regulatorWallet: Wallet,
  caspWallet: Wallet,
  client: Client
): Promise<CredentialResult> {
  const credentialTypeHex = convertStringToHex(CREDENTIAL_TYPE_STRING);

  // Build a URI that encodes the rule this credential attests to.
  // We embed the MiCA rule JSON so the credential is self-describing.
  const credentialUri = `data:application/json;charset=utf-8,${encodeRuleAsJSON(MICA_ARTICLE_54_RULE)}`;
  const credentialUriHex = convertStringToHex(credentialUri);

  console.log("\n--- Step 1: CredentialCreate (Regulator → CASP) ---");
  console.log(`  Issuer  : ${regulatorWallet.address}`);
  console.log(`  Subject : ${caspWallet.address}`);
  console.log(`  Type    : ${CREDENTIAL_TYPE_STRING}`);
  console.log(`  Type Hex: ${credentialTypeHex}`);

  // CredentialCreate: Regulator asserts that the CASP meets MiCA Art.54 capital requirements.
  const createTx: RawTransaction = {
    TransactionType: "CredentialCreate",
    Account: regulatorWallet.address,
    Subject: caspWallet.address,
    CredentialType: credentialTypeHex,
    URI: credentialUriHex,
  };

  const createResult = await client.submitAndWait(
    createTx as Parameters<typeof client.submitAndWait>[0],
    { wallet: regulatorWallet }
  );

  if (
    typeof createResult.result.meta === "object" &&
    createResult.result.meta !== null &&
    "TransactionResult" in createResult.result.meta &&
    createResult.result.meta.TransactionResult !== "tesSUCCESS"
  ) {
    throw new Error(
      `CredentialCreate failed: ${JSON.stringify(createResult.result.meta)}`
    );
  }

  const createTxHash = createResult.result.hash;
  console.log(`  TX Hash : ${createTxHash}`);
  console.log(`  Result  : tesSUCCESS`);

  // CredentialAccept: The CASP explicitly accepts the credential (XLS-70 opt-in model).
  // This prevents unsolicited credential issuance — only accepted credentials are active.
  console.log("\n--- Step 2: CredentialAccept (CASP opts in) ---");

  const acceptTx: RawTransaction = {
    TransactionType: "CredentialAccept",
    Account: caspWallet.address,
    Issuer: regulatorWallet.address,
    CredentialType: credentialTypeHex,
  };

  const acceptResult = await client.submitAndWait(
    acceptTx as Parameters<typeof client.submitAndWait>[0],
    { wallet: caspWallet }
  );

  if (
    typeof acceptResult.result.meta === "object" &&
    acceptResult.result.meta !== null &&
    "TransactionResult" in acceptResult.result.meta &&
    acceptResult.result.meta.TransactionResult !== "tesSUCCESS"
  ) {
    throw new Error(
      `CredentialAccept failed: ${JSON.stringify(acceptResult.result.meta)}`
    );
  }

  const acceptTxHash = acceptResult.result.hash;
  console.log(`  TX Hash : ${acceptTxHash}`);
  console.log(`  Result  : tesSUCCESS`);

  return {
    issuer: regulatorWallet.address,
    subject: caspWallet.address,
    credentialType: CREDENTIAL_TYPE_STRING,
    credentialTypeHex,
    createTxHash,
    acceptTxHash,
    explorerUrl: `${NETWORKS.XRPL_TESTNET.explorer}/accounts/${caspWallet.address}`,
  };
}

/**
 * Verifies that a credential is active on the XRPL by querying account_objects.
 * Returns true if the CASP holds an accepted credential from the regulator.
 */
export async function verifyCredential(
  caspAddress: string,
  regulatorAddress: string,
  client: Client
): Promise<{ verified: boolean; credential: unknown }> {
  const credentialTypeHex = convertStringToHex(CREDENTIAL_TYPE_STRING);

  const response = await client.request({
    command: "account_objects",
    account: caspAddress,
    type: "credential" as "check", // type cast: "credential" is valid but may not be in older typings
  } as Parameters<typeof client.request>[0]);

  const objects = (response.result as { account_objects: unknown[] })
    .account_objects;

  // Find the credential matching our issuer + type
  const match = (objects as Array<Record<string, unknown>>).find(
    (obj) =>
      obj.LedgerEntryType === "Credential" &&
      obj.Issuer === regulatorAddress &&
      obj.CredentialType === credentialTypeHex
  );

  return {
    verified: match !== undefined,
    credential: match ?? null,
  };
}
