/**
 * Regulatory Passport — an XLS-70 Credential.
 *
 * A regulator attests on the ledger that a firm meets an encoded obligation.
 * Three properties of the standard matter to this project:
 *
 * **The firm must opt in.** Issuance is a two-transaction handshake:
 * `CredentialCreate` by the issuer, then `CredentialAccept` by the subject. An
 * unaccepted credential does not gate anything, so a regulator cannot silently
 * attach status to a firm that has not agreed to hold it.
 *
 * **Only status goes on-chain.** The ledger records that an attestation exists,
 * who made it, and what it concerns. The audited accounts and capital returns
 * that justified it stay off-chain, where they belong. This is the same reason
 * the rule token stores a pointer rather than the rule body.
 *
 * **It can lapse or be withdrawn.** Credentials carry an optional `Expiration`,
 * and either party may delete one. This is what makes the gate consult live
 * status rather than perform a one-time check — a firm that ceases to comply
 * stops being able to transact, without anyone rewriting any code.
 *
 * Standard: XLS-70. Limits: CredentialType 1–64 bytes, URI 1–256 bytes.
 */

import { Client, Wallet, convertStringToHex, convertHexToString } from "xrpl";
import { CREDENTIAL_TYPE_STRING, XRPL_TESTNET, toRippleTime } from "../config";
import { MiCARule, MICA_ART35_OWN_FUNDS_RULE, buildRulePointerURI } from "../rules/micaRules";

/** xrpl.js 4.6 does not type the Credential transactions, so they go raw. */
type RawTransaction = Record<string, unknown>;

export const CREDENTIAL_TYPE_HEX = convertStringToHex(CREDENTIAL_TYPE_STRING);

/** Credential ledger object flag: the subject has accepted. */
const lsfAccepted = 0x00010000;

export interface PassportResult {
  issuer: string;
  subject: string;
  credentialType: string;
  /** Ledger entry ID — this is what a Payment presents in CredentialIDs */
  credentialID: string;
  /** rgt: pointer to the rule version this passport attests against */
  ruleUri: string;
  createTxHash: string;
  acceptTxHash: string;
  expiresAt: string | null;
  explorerUrl: string;
}

export interface PassportStatus {
  held: boolean;
  accepted: boolean;
  expired: boolean;
  /** True only when the passport would actually satisfy a credential gate */
  valid: boolean;
  credentialID: string | null;
  /** The rule version the passport attests against, if readable */
  attestsRule: string | null;
  reason: string;
}

/* ─── Submission ──────────────────────────────────────────────────────────── */

async function submitOrThrow(
  client: Client,
  wallet: Wallet,
  tx: RawTransaction,
  label: string
): Promise<string> {
  const prepared = await client.autofill(tx as never);
  const signed = wallet.sign(prepared as never);
  const res = await client.submitAndWait(signed.tx_blob);

  const meta = res.result.meta;
  const code =
    typeof meta === "object" && meta !== null && "TransactionResult" in meta
      ? (meta as { TransactionResult: string }).TransactionResult
      : "UNKNOWN";

  if (code !== "tesSUCCESS") {
    throw new Error(`${label} failed with ${code} (tx ${res.result.hash})`);
  }
  return res.result.hash;
}

/* ─── Lookup ──────────────────────────────────────────────────────────────── */

async function findCredential(
  client: Client,
  subject: string,
  issuer: string
): Promise<Record<string, unknown> | null> {
  const res = await client.request({
    command: "account_objects",
    account: subject,
    ledger_index: "validated",
  });

  const objects = res.result
    .account_objects as unknown as Record<string, unknown>[];

  return (
    objects.find(
      (o) =>
        o.LedgerEntryType === "Credential" &&
        o.Issuer === issuer &&
        o.CredentialType === CREDENTIAL_TYPE_HEX
    ) ?? null
  );
}

/* ─── Issue ───────────────────────────────────────────────────────────────── */

/**
 * Issues a passport and has the subject accept it.
 *
 * The URI pins the rule version being attested. That link matters: a passport
 * is not an open-ended statement that a firm is "compliant", it is a statement
 * that the firm met a specific, hash-identified version of a specific rule at
 * the time of issue.
 *
 * @param expiresInSeconds omit for a passport that does not lapse on its own
 */
export async function issuePassport(
  client: Client,
  regulator: Wallet,
  firm: Wallet,
  options: { rule?: MiCARule; expiresInSeconds?: number } = {}
): Promise<PassportResult> {
  const rule = options.rule ?? MICA_ART35_OWN_FUNDS_RULE;
  const ruleUri = buildRulePointerURI(rule);

  const expiration =
    options.expiresInSeconds !== undefined
      ? toRippleTime(new Date(Date.now() + options.expiresInSeconds * 1000))
      : undefined;

  const createTxHash = await submitOrThrow(
    client,
    regulator,
    {
      TransactionType: "CredentialCreate",
      Account: regulator.address,
      Subject: firm.address,
      CredentialType: CREDENTIAL_TYPE_HEX,
      URI: convertStringToHex(ruleUri),
      ...(expiration !== undefined ? { Expiration: expiration } : {}),
    },
    "CredentialCreate"
  );

  const acceptTxHash = await submitOrThrow(
    client,
    firm,
    {
      TransactionType: "CredentialAccept",
      Account: firm.address,
      Issuer: regulator.address,
      CredentialType: CREDENTIAL_TYPE_HEX,
    },
    "CredentialAccept"
  );

  const entry = await findCredential(client, firm.address, regulator.address);
  if (!entry) {
    throw new Error("Passport accepted but not found on the validated ledger");
  }

  return {
    issuer: regulator.address,
    subject: firm.address,
    credentialType: CREDENTIAL_TYPE_STRING,
    credentialID: entry.index as string,
    ruleUri,
    createTxHash,
    acceptTxHash,
    expiresAt:
      options.expiresInSeconds !== undefined
        ? new Date(Date.now() + options.expiresInSeconds * 1000).toISOString()
        : null,
    explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${createTxHash}`,
  };
}

/* ─── Revoke ──────────────────────────────────────────────────────────────── */

/**
 * Withdraws a passport.
 *
 * The regulator deletes the credential entry. Nothing else in the system is
 * touched: no code is redeployed, no gate is reconfigured, and no list is
 * edited. The firm simply no longer holds what the gate requires, so its next
 * payment fails on the same rule that let the previous one through.
 *
 * A real supervisor would do this on a finding of non-compliance. The
 * demonstration compresses to one transaction what would otherwise be a
 * suspension notice followed by manual changes across every counterparty.
 */
export async function revokePassport(
  client: Client,
  regulator: Wallet,
  firmAddress: string
): Promise<{ hash: string; explorerUrl: string }> {
  const hash = await submitOrThrow(
    client,
    regulator,
    {
      TransactionType: "CredentialDelete",
      Account: regulator.address,
      Subject: firmAddress,
      CredentialType: CREDENTIAL_TYPE_HEX,
    },
    "CredentialDelete"
  );

  return {
    hash,
    explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${hash}`,
  };
}

/* ─── Verify ──────────────────────────────────────────────────────────────── */

/**
 * Reports whether a firm currently holds a usable passport.
 *
 * Distinguishes the three ways a passport can fail to gate: it was never
 * issued, it was issued but never accepted, or it has expired. A gate treats
 * all three identically — the payment is refused — but a compliance officer
 * investigating a refusal needs to know which.
 */
export async function verifyPassport(
  client: Client,
  firmAddress: string,
  regulatorAddress: string
): Promise<PassportStatus> {
  const entry = await findCredential(client, firmAddress, regulatorAddress);

  if (!entry) {
    return {
      held: false,
      accepted: false,
      expired: false,
      valid: false,
      credentialID: null,
      attestsRule: null,
      reason: "No passport from this regulator. Never issued, or withdrawn.",
    };
  }

  const credentialID = entry.index as string;
  const accepted = ((entry.Flags as number) & lsfAccepted) !== 0;

  const expirationField = entry.Expiration as number | undefined;
  const nowRipple = toRippleTime(new Date());
  const expired = expirationField !== undefined && expirationField <= nowRipple;

  const attestsRule = entry.URI
    ? convertHexToString(entry.URI as string)
    : null;

  if (!accepted) {
    return {
      held: true,
      accepted: false,
      expired,
      valid: false,
      credentialID,
      attestsRule,
      reason: "Passport issued but not accepted by the firm; it does not gate.",
    };
  }

  if (expired) {
    return {
      held: true,
      accepted: true,
      expired: true,
      valid: false,
      credentialID,
      attestsRule,
      reason: "Passport has lapsed. Attestations are time-bound by design.",
    };
  }

  return {
    held: true,
    accepted: true,
    expired: false,
    valid: true,
    credentialID,
    attestsRule,
    reason: `Valid passport attesting ${attestsRule ?? "an unrecorded rule"}.`,
  };
}
