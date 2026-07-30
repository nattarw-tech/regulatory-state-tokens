/**
 * The credential gate — enforcement, without a smart contract.
 *
 * This is where the project's central claim is realised, and the notable thing
 * about this file is how little it contains. There is no contract, no bytecode,
 * no deployed logic and no off-ledger service. Enforcement is a property of two
 * standing settings on an account:
 *
 *   1. `asfDepositAuth` — the account refuses incoming value by default.
 *   2. `DepositPreauth` with `AuthorizeCredentials` — a standing exception for
 *      anyone holding a named credential from a named issuer.
 *
 * A sender that holds the credential presents it in `CredentialIDs` and the
 * payment settles. A sender that does not gets `tecNO_PERMISSION` during
 * transaction processing, and no value moves.
 *
 * ── Why this matters more than it looks ──────────────────────────────────────
 * XRPL does not run general smart contracts on Mainnet, deliberately: code
 * executing at the protocol layer can endanger consensus for every participant
 * if it is wrong. That is why Hooks live on a separate network. This design
 * needs no such code. It composes primitives that are already live, already
 * audited, and already part of the consensus rules — so it adds no new attack
 * surface to the ledger it runs on.
 *
 * ── What it does NOT do ──────────────────────────────────────────────────────
 * It does not monitor the ledger. It has no visibility into, and no effect on,
 * any account other than the one that opted in by enabling deposit
 * authorisation. It is a gate on a door, not surveillance of the street.
 */

import { Client, Wallet } from "xrpl";
import { XRPL_TESTNET } from "../config";
import { CREDENTIAL_TYPE_HEX } from "../credentials/passport";

type RawTransaction = Record<string, unknown>;

/** AccountSet flag 9 — refuse incoming value unless preauthorised. */
const asfDepositAuth = 9;

export interface GateResult {
  hash: string;
  explorerUrl: string;
}

export interface PaymentOutcome {
  /** The engine result code, e.g. tesSUCCESS or tecNO_PERMISSION */
  result: string;
  settled: boolean;
  hash: string;
  explorerUrl: string;
  /** Plain-English account of what the ledger decided and why */
  reason: string;
}

/* ─── Submission ──────────────────────────────────────────────────────────── */

async function submit(
  client: Client,
  wallet: Wallet,
  tx: RawTransaction
): Promise<{ result: string; hash: string }> {
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

async function submitOrThrow(
  client: Client,
  wallet: Wallet,
  tx: RawTransaction,
  label: string
): Promise<GateResult> {
  const { result, hash } = await submit(client, wallet, tx);
  if (result !== "tesSUCCESS") {
    throw new Error(`${label} failed with ${result} (tx ${hash})`);
  }
  return { hash, explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${hash}` };
}

/* ─── Building the gate ───────────────────────────────────────────────────── */

/**
 * Closes an account to unauthorised senders.
 *
 * On its own this refuses everyone, including senders who hold a passport.
 * It must be paired with `authoriseCredential` to be useful.
 */
export async function enableDepositAuthorisation(
  client: Client,
  account: Wallet
): Promise<GateResult> {
  return submitOrThrow(
    client,
    account,
    {
      TransactionType: "AccountSet",
      Account: account.address,
      SetFlag: asfDepositAuth,
    },
    "AccountSet asfDepositAuth"
  );
}

/**
 * Opens the account to holders of a credential — not to any particular address.
 *
 * This is the design's most consequential detail. A conventional allowlist
 * names counterparties, so it must be edited whenever a firm is authorised or
 * suspended, by every counterparty that maintains one. Naming the *credential*
 * inverts that: the gate is written once, and a regulator changes who may
 * transact by issuing or withdrawing attestations. Nobody edits a list, and no
 * counterparty needs to learn that a firm's status changed.
 */
export async function authoriseCredential(
  client: Client,
  account: Wallet,
  issuerAddress: string
): Promise<GateResult> {
  return submitOrThrow(
    client,
    account,
    {
      TransactionType: "DepositPreauth",
      Account: account.address,
      AuthorizeCredentials: [
        {
          Credential: {
            Issuer: issuerAddress,
            CredentialType: CREDENTIAL_TYPE_HEX,
          },
        },
      ],
    },
    "DepositPreauth AuthorizeCredentials"
  );
}

/* ─── Passing through it ──────────────────────────────────────────────────── */

/**
 * Attempts a payment, optionally presenting a passport.
 *
 * Returns the outcome rather than throwing, because a refusal is a legitimate
 * and expected result here — it is what the demonstration is for.
 *
 * @param credentialID omit to attempt the payment with nothing to present
 */
export async function attemptPayment(
  client: Client,
  sender: Wallet,
  destination: string,
  dropsAmount: string,
  credentialID?: string | null
): Promise<PaymentOutcome> {
  const { result, hash } = await submit(client, sender, {
    TransactionType: "Payment",
    Account: sender.address,
    Destination: destination,
    Amount: dropsAmount,
    ...(credentialID ? { CredentialIDs: [credentialID] } : {}),
  });

  const explorerUrl = `${XRPL_TESTNET.explorer}/transactions/${hash}`;
  const settled = result === "tesSUCCESS";

  return { result, settled, hash, explorerUrl, reason: explain(result, credentialID) };
}

/**
 * Turns an engine result into something a compliance officer could act on.
 *
 * A bare result code tells a firm it was refused but not why, which is exactly
 * the opacity that makes automated compliance decisions hard to challenge. The
 * project argues that an enforced decision should be explainable; this is the
 * minimum version of that.
 */
function explain(result: string, credentialID?: string | null): string {
  switch (result) {
    case "tesSUCCESS":
      return credentialID
        ? "Settled. The sender presented a valid regulator-issued passport and " +
            "the destination's standing authorisation accepted it."
        : "Settled. The destination did not require a credential from this sender.";

    case "tecNO_PERMISSION":
      return credentialID
        ? "Refused before settlement. A passport was presented but it did not " +
            "satisfy the destination's requirement — it may have lapsed, been " +
            "withdrawn, or been issued by a different authority."
        : "Refused before settlement. The destination admits only holders of a " +
            "regulator-issued passport, and none was presented. No value moved.";

    case "tecBAD_CREDENTIALS":
      return "Refused before settlement. A passport was presented but the " +
        "ledger could not honour it — most often because it has been " +
        "withdrawn by its issuer, or was never accepted by the firm. Note " +
        "that this is a DIFFERENT refusal from tecNO_PERMISSION: the protocol " +
        "distinguishes presenting nothing from presenting something invalid, " +
        "so the reason for a refusal is legible without off-ledger enquiry.";

    case "tecEXPIRED":
      return "Refused before settlement. The passport presented has lapsed.";

    case "temMALFORMED":
      return "Rejected as malformed — the credential reference was not well formed.";

    default:
      return `Transaction returned ${result}.`;
  }
}
