/**
 * XLS-20 Regulatory State Token — NFT Minting
 *
 * This module implements Step 3 of the PoC: minting a "Regulatory State Token"
 * on the Xahau Testnet using the XLS-20 Non-Fungible Token standard.
 *
 * The NFT represents the *current state* of the encoded MiCA Article 35-style
 * own-funds rule. Its URI field carries a compact pointer to that rule, so
 * regulatory changes can be "broadcast" by updating or re-minting the token.
 *
 * Design choices:
 * - NFTokenTaxon = 35 (maps to the MiCA article number, enabling efficient filtering)
 * - tfTransferable = NOT set (non-transferable — the rule is bound to the regulator)
 * - The URI is an authoritative POINTER (ruleId + version + integrity digest),
 *   not the rule body: the NFToken URI field is capped at 256 bytes, and the
 *   full rule JSON is far larger. The rule body is published off-chain and the
 *   digest lets a verifier confirm it matches what the token commits to.
 * - Burning and re-minting simulates a regulatory rule update cycle
 *
 * XLS-20 Specification: https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint
 */

import { Client, Wallet, convertStringToHex, NFTokenMint, AccountNFToken } from "xrpl";
import { NETWORKS, REGULATORY_NFT_TAXON } from "../config";
import {
  MiCARule,
  MICA_ART35_OWN_FUNDS_RULE,
  buildRulePointerURI,
} from "../rules/micaRules";

export interface RegulatoryTokenResult {
  minter: string;
  nftId: string;
  taxon: number;
  uri: string;
  uriDecoded: string;
  mintTxHash: string;
  explorerUrl: string;
}

/**
 * Mints a Regulatory State Token NFT on the Xahau Testnet.
 *
 * The URI embeds the encoded MiCA rule so that any network participant can
 * read the rule parameters directly from the ledger — no external database
 * or oracle required.
 *
 * @param regulatorWallet - The Regulatory Authority account that mints the NFT
 * @param client          - Connected XRPL client (XLS-20 is native to XRPL)
 * @param rule            - The rule to point at (defaults to the Art.35-style rule)
 * @param explorerBase    - Explorer base URL for the network in use
 */
export async function mintRegulatoryStateToken(
  regulatorWallet: Wallet,
  client: Client,
  rule: MiCARule = MICA_ART35_OWN_FUNDS_RULE,
  explorerBase: string = NETWORKS.XRPL_TESTNET.explorer
): Promise<RegulatoryTokenResult> {
  // Compact pointer URI (ruleId + version + integrity digest), kept under the
  // 256-byte NFToken URI limit. In production this could instead be an IPFS
  // CID resolving to the full rule document.
  const nftUri = buildRulePointerURI(rule);
  const nftUriHex = convertStringToHex(nftUri);

  console.log("\n--- Minting Regulatory State Token (XLS-20 NFT) ---");
  console.log(`  Minter  : ${regulatorWallet.address}`);
  console.log(`  Taxon   : ${REGULATORY_NFT_TAXON} (${rule.provenance.articleReference})`);
  console.log(`  Rule ID : ${rule.ruleId}`);
  console.log(`  URI     : ${nftUri}`);

  const mintTx: NFTokenMint = {
    TransactionType: "NFTokenMint",
    Account: regulatorWallet.address,
    NFTokenTaxon: REGULATORY_NFT_TAXON,
    // Flags: 0 — non-transferable (tfTransferable flag is NOT set)
    // This binds the regulatory state token to the regulator's account
    Flags: 0,
    URI: nftUriHex,
  };

  const mintResult = await client.submitAndWait(mintTx, {
    wallet: regulatorWallet,
  });

  if (
    typeof mintResult.result.meta === "object" &&
    mintResult.result.meta !== null &&
    "TransactionResult" in mintResult.result.meta &&
    mintResult.result.meta.TransactionResult !== "tesSUCCESS"
  ) {
    throw new Error(
      `NFTokenMint failed: ${JSON.stringify(mintResult.result.meta)}`
    );
  }

  const mintTxHash = mintResult.result.hash;

  // Extract the NFT ID from the transaction metadata
  const nftId = extractNFTId(mintResult.result.meta);

  console.log(`  TX Hash : ${mintTxHash}`);
  console.log(`  NFT ID  : ${nftId}`);
  console.log(`  Result  : tesSUCCESS`);

  return {
    minter: regulatorWallet.address,
    nftId,
    taxon: REGULATORY_NFT_TAXON,
    uri: nftUriHex,
    uriDecoded: nftUri,
    mintTxHash,
    explorerUrl: `${explorerBase}/accounts/${regulatorWallet.address}`,
  };
}

/**
 * Queries the ledger and retrieves all Regulatory State Tokens held by the
 * given account (filtered by taxon = the MiCA article number).
 */
export async function getRegulatoryTokens(
  accountAddress: string,
  client: Client
): Promise<Array<{ nftId: string; uri: string; uriDecoded: string }>> {
  const response = await client.request({
    command: "account_nfts",
    account: accountAddress,
  });

  const nfts: AccountNFToken[] = response.result.account_nfts;

  return nfts
    .filter((nft) => nft.NFTokenTaxon === REGULATORY_NFT_TAXON)
    .map((nft) => {
      const uriHex = nft.URI ?? "";
      const uriDecoded = Buffer.from(uriHex, "hex").toString("utf8");
      return {
        nftId: nft.NFTokenID,
        uri: uriHex,
        uriDecoded,
      };
    });
}

/**
 * Burns an existing Regulatory State Token to simulate a rule version update.
 * The caller should then mint a new token with updated rule metadata.
 *
 * This burn-and-remint pattern models how regulators could invalidate old
 * rule states and publish new ones — creating an auditable history on-chain.
 */
export async function burnRegulatoryStateToken(
  regulatorWallet: Wallet,
  nftId: string,
  client: Client
): Promise<string> {
  console.log(`\n--- Burning outdated Regulatory State Token ---`);
  console.log(`  NFT ID : ${nftId}`);

  const burnTx = {
    TransactionType: "NFTokenBurn",
    Account: regulatorWallet.address,
    NFTokenID: nftId,
  } as Parameters<typeof client.submitAndWait>[0];

  const result = await client.submitAndWait(burnTx, {
    wallet: regulatorWallet,
  });

  console.log(`  TX Hash: ${result.result.hash}`);
  console.log(`  Result : tesSUCCESS`);

  return result.result.hash;
}

/** Extracts the NFTokenID from transaction metadata after a successful NFTokenMint. */
function extractNFTId(meta: unknown): string {
  if (
    meta &&
    typeof meta === "object" &&
    "nftoken_id" in meta
  ) {
    return (meta as { nftoken_id: string }).nftoken_id;
  }

  // Fall back: scan AffectedNodes for the new NFToken
  if (
    meta &&
    typeof meta === "object" &&
    "AffectedNodes" in meta
  ) {
    const nodes = (meta as { AffectedNodes: unknown[] }).AffectedNodes;
    for (const node of nodes) {
      const modified = (node as Record<string, unknown>).ModifiedNode as
        | Record<string, unknown>
        | undefined;
      if (modified?.LedgerEntryType === "NFTokenPage") {
        const finalFields = modified.FinalFields as
          | Record<string, unknown>
          | undefined;
        const nfts = finalFields?.NFTokens as
          | Array<{ NFToken: { NFTokenID: string } }>
          | undefined;
        if (nfts && nfts.length > 0) {
          return nfts[nfts.length - 1].NFToken.NFTokenID;
        }
      }
      const created = (node as Record<string, unknown>).CreatedNode as
        | Record<string, unknown>
        | undefined;
      if (created?.LedgerEntryType === "NFTokenPage") {
        const newFields = created.NewFields as
          | Record<string, unknown>
          | undefined;
        const nfts = newFields?.NFTokens as
          | Array<{ NFToken: { NFTokenID: string } }>
          | undefined;
        if (nfts && nfts.length > 0) {
          return nfts[nfts.length - 1].NFToken.NFTokenID;
        }
      }
    }
  }

  return "NFT_ID_UNAVAILABLE";
}
