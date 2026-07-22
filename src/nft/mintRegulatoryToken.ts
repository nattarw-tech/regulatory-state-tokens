/**
 * XLS-20 Regulatory State Token — NFT Minting
 *
 * This module implements Step 3 of the PoC: minting a "Regulatory State Token"
 * on the Xahau Testnet using the XLS-20 Non-Fungible Token standard.
 *
 * The NFT represents the *current state* of the MiCA Article 54 rule. Its URI
 * field contains the full, machine-readable rule parameters encoded as JSON.
 * This demonstrates the key property: regulatory changes can be "broadcast"
 * across the network by minting a new NFT with updated metadata — all
 * participants can query the canonical rule state without off-chain lookups.
 *
 * Design choices:
 * - NFTokenTaxon = 54 (maps to the MiCA article number, enabling efficient filtering)
 * - tfTransferable = NOT set (non-transferable — the rule is bound to the regulator)
 * - The URI embeds the full rule JSON, making the NFT self-describing
 * - Burning and re-minting simulates a regulatory rule update cycle
 *
 * XLS-20 Specification: https://xrpl.org/docs/references/protocol/transactions/types/nftokenmint
 */

import { Client, Wallet, convertStringToHex, NFTokenMint, AccountNFToken } from "xrpl";
import { NETWORKS, REGULATORY_NFT_TAXON } from "../config";
import {
  MiCARule,
  MICA_ARTICLE_54_RULE,
  encodeRuleAsJSON,
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
 * @param client          - Connected Xahau client
 * @param rule            - The MiCA rule to embed (defaults to Article 54)
 */
export async function mintRegulatoryStateToken(
  regulatorWallet: Wallet,
  client: Client,
  rule: MiCARule = MICA_ARTICLE_54_RULE
): Promise<RegulatoryTokenResult> {
  // Construct the URI: a data URI embedding the full rule JSON.
  // In a production system this would be an IPFS CID or a verifiable credential URL.
  const ruleJson = encodeRuleAsJSON(rule);
  const nftUri = `data:application/json;charset=utf-8,${ruleJson}`;
  const nftUriHex = convertStringToHex(nftUri);

  console.log("\n--- Minting Regulatory State Token (XLS-20 NFT) ---");
  console.log(`  Minter  : ${regulatorWallet.address}`);
  console.log(`  Taxon   : ${REGULATORY_NFT_TAXON} (MiCA Article ${rule.article})`);
  console.log(`  Rule ID : ${rule.ruleId}`);
  console.log(`  URI     : ${nftUri.slice(0, 80)}...`);

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
    explorerUrl: `${NETWORKS.XAHAU_TESTNET.explorer}/accounts/${regulatorWallet.address}`,
  };
}

/**
 * Queries the Xahau ledger and retrieves all Regulatory State Tokens
 * held by the given account (filtered by taxon = article 54).
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
