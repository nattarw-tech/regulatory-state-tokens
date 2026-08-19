/**
 * Regulatory State Token — the current rule, as a ledger object.
 *
 * The project's architectural claim is that enforcement logic and regulatory
 * parameters should be separable: when a threshold moves, the regulator should
 * be able to change the parameter without anyone redeploying code. This module
 * is the parameter half of that split.
 *
 * ── Why a Dynamic NFT ────────────────────────────────────────────────────────
 * The token is minted with `tfMutable` (XLS-46d, live on Mainnet since 11 June
 * 2025), which permits the issuer to rewrite the URI in place via
 * `NFTokenModify`. The earlier design burned the old token and minted a
 * replacement, which changed the NFTokenID on every amendment and so broke any
 * reference held elsewhere. Mutating in place keeps the identifier stable
 * across rule versions, which is what a long-lived reference needs.
 *
 * It is deliberately NOT minted `tfTransferable`. A statement of what the law
 * currently requires is not a bearer asset and should not be tradeable.
 *
 * ── Why a pointer rather than the rule itself ────────────────────────────────
 * An NFToken URI is capped at 256 bytes and the encoded rule is far larger, so
 * the token carries `rgt:<ruleId>?v=<version>&h=<digest>` — an identifier, a
 * version, and a SHA-256 commitment to the canonical rule JSON. The ledger
 * holds the authoritative pointer and the integrity proof; the rule body is
 * published off-ledger. A verifier fetches the body, recomputes the digest, and
 * compares. This is the same reason the credential design keeps documents off
 * the ledger and stores only status.
 *
 * ── Scope limit ──────────────────────────────────────────────────────────────
 * Minting this token records what a rule says. It does not make the token
 * legally authoritative, and nothing here confers regulatory power on the
 * issuing account. Who is entitled to mint such a token is a governance
 * question the dissertation discusses and this code does not answer.
 */

import { Client, Wallet, convertStringToHex, convertHexToString } from "xrpl";
import { REGULATORY_NFT_TAXON, XRPL_TESTNET } from "../config";
import {
  MiCARule,
  buildRulePointerURI,
  computeRuleDigest,
} from "../rules/micaRules";

/** xrpl.js 4.6 does not type NFTokenModify, so it is submitted raw. */
type RawTransaction = Record<string, unknown>;

/* ─── NFToken flags ───────────────────────────────────────────────────────── */

/** Issuer may burn the token — lets a superseded rule be retired. */
const tfBurnable = 0x00000001;
/** Issuer may rewrite the URI via NFTokenModify (XLS-46d). */
const tfMutable = 0x00000010;

/**
 * Burnable and mutable, but not transferable. The regulator retains control of
 * the object; nobody can trade the current state of the law.
 */
export const REGULATORY_TOKEN_FLAGS = tfBurnable | tfMutable;

/* ─── Results ─────────────────────────────────────────────────────────────── */

export interface StateTokenResult {
  nftokenID: string;
  uri: string;
  digest: string;
  hash: string;
  explorerUrl: string;
}

export interface StateTokenReading {
  nftokenID: string;
  /** The decoded rgt: pointer as recorded on the ledger */
  uri: string;
  ruleId: string;
  version: string;
  /** First 32 hex characters of the rule digest, as committed on-chain */
  digestPrefix: string;
}

const POINTER_PATTERN = /^rgt:([^?]+)\?v=([^&]+)&h=([0-9a-f]+)$/;

/* ─── Submission ──────────────────────────────────────────────────────────── */

async function submitOrThrow(
  client: Client,
  wallet: Wallet,
  tx: RawTransaction,
  label: string
) {
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
  return res;
}

/**
 * Pulls the minted NFTokenID out of transaction metadata.
 *
 * `meta.nftoken_id` is populated by most servers, but not universally, so this
 * falls back to scanning the affected NFTokenPage nodes for the identifier that
 * was not present before the transaction.
 */
function extractNFTokenID(meta: unknown): string {
  if (typeof meta === "object" && meta !== null && "nftoken_id" in meta) {
    const direct = (meta as { nftoken_id?: string }).nftoken_id;
    if (direct) return direct;
  }

  const nodes =
    (meta as { AffectedNodes?: Record<string, never>[] })?.AffectedNodes ?? [];

  const idsIn = (entry: Record<string, unknown> | undefined): string[] => {
    const tokens = (entry?.NFTokens as { NFToken: { NFTokenID: string } }[]) ?? [];
    return tokens.map((t) => t.NFToken.NFTokenID);
  };

  for (const node of nodes) {
    const created = (node as Record<string, never>).CreatedNode as
      | Record<string, never>
      | undefined;
    const modified = (node as Record<string, never>).ModifiedNode as
      | Record<string, never>
      | undefined;

    if (created?.LedgerEntryType === "NFTokenPage") {
      const ids = idsIn(created.NewFields as Record<string, unknown>);
      if (ids.length) return ids[ids.length - 1];
    }

    if (modified?.LedgerEntryType === "NFTokenPage") {
      const after = idsIn(modified.FinalFields as Record<string, unknown>);
      const before = idsIn(modified.PreviousFields as Record<string, unknown>);
      const added = after.filter((id) => !before.includes(id));
      if (added.length) return added[0];
    }
  }

  throw new Error("Could not determine NFTokenID from transaction metadata");
}

/* ─── Mint ────────────────────────────────────────────────────────────────── */

/**
 * Mints the Regulatory State Token carrying a pointer to `rule`.
 *
 * The regulator holds the token. Taxon 35 records which obligation it concerns,
 * making regulatory tokens filterable on-ledger by article.
 */
export async function mintRegulatoryStateToken(
  client: Client,
  regulator: Wallet,
  rule: MiCARule
): Promise<StateTokenResult> {
  const uri = buildRulePointerURI(rule);
  const digest = computeRuleDigest(rule);

  const res = await submitOrThrow(
    client,
    regulator,
    {
      TransactionType: "NFTokenMint",
      Account: regulator.address,
      NFTokenTaxon: REGULATORY_NFT_TAXON,
      Flags: REGULATORY_TOKEN_FLAGS,
      URI: convertStringToHex(uri),
    },
    "NFTokenMint"
  );

  return {
    nftokenID: extractNFTokenID(res.result.meta),
    uri,
    digest,
    hash: res.result.hash,
    explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${res.result.hash}`,
  };
}

/* ─── Amend ───────────────────────────────────────────────────────────────── */

/**
 * Rewrites the token's URI to point at a new rule version.
 *
 * This is the operation the project's central claim rests on. Amending a
 * regulatory threshold is a single transaction against ledger state. No
 * enforcement code is recompiled, redeployed or even restarted, because the
 * enforcement layer never held the threshold in the first place — it reads it.
 *
 * Requires the token to have been minted with `tfMutable`, and only the issuer
 * may do it.
 */
export async function updateRegulatoryState(
  client: Client,
  regulator: Wallet,
  nftokenID: string,
  newRule: MiCARule
): Promise<StateTokenResult> {
  const uri = buildRulePointerURI(newRule);
  const digest = computeRuleDigest(newRule);

  const res = await submitOrThrow(
    client,
    regulator,
    {
      TransactionType: "NFTokenModify",
      Account: regulator.address,
      NFTokenID: nftokenID,
      URI: convertStringToHex(uri),
    },
    "NFTokenModify"
  );

  return {
    nftokenID,
    uri,
    digest,
    hash: res.result.hash,
    explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${res.result.hash}`,
  };
}

/* ─── Read ────────────────────────────────────────────────────────────────── */

/** Reads back every Regulatory State Token held by `address`. */
export async function readRegulatoryState(
  client: Client,
  address: string
): Promise<StateTokenReading[]> {
  const res = await client.request({
    command: "account_nfts",
    account: address,
    ledger_index: "validated",
  });

  return res.result.account_nfts
    .filter((nft) => nft.NFTokenTaxon === REGULATORY_NFT_TAXON)
    .map((nft) => {
      const uri = nft.URI ? convertHexToString(nft.URI) : "";
      const parsed = POINTER_PATTERN.exec(uri);

      return {
        nftokenID: nft.NFTokenID,
        uri,
        ruleId: parsed?.[1] ?? "(unparseable)",
        version: parsed?.[2] ?? "(unparseable)",
        digestPrefix: parsed?.[3] ?? "",
      };
    });
}

/**
 * Confirms that what the ledger says matches the rule held locally.
 *
 * A verifier does exactly this: read the on-chain pointer, recompute the digest
 * of the rule text it holds, and compare. A mismatch means the local copy is
 * stale or has been tampered with, and the caller should refuse to rely on it.
 */
export function verifyStateMatchesRule(
  reading: StateTokenReading,
  rule: MiCARule
): { matches: boolean; reason: string } {
  const expected = computeRuleDigest(rule).slice(0, 32);

  if (reading.digestPrefix === expected) {
    return {
      matches: true,
      reason:
        `On-chain state commits to ${reading.ruleId} v${reading.version}, ` +
        `digest ${expected} — matches the local rule.`,
    };
  }

  return {
    matches: false,
    reason:
      `On-chain state commits to digest ${reading.digestPrefix} but the local ` +
      `rule hashes to ${expected}. The local copy is stale or altered; the ` +
      `ledger is authoritative.`,
  };
}
