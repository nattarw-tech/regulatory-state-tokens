/**
 * Network configuration.
 *
 * ── Why this file changed (July 2026) ────────────────────────────────────────
 * The original design split the proof-of-concept across two ledgers: XRPL held
 * the credential, Xahau ran the enforcement Hook, and state was mirrored
 * between them under an explicit trust assumption. That split existed for one
 * reason only — account-level enforcement code did not exist on XRPL.
 *
 * That is no longer true. The following are live on XRPL Mainnet:
 *
 *   Credentials         (XLS-70)   4 September 2025
 *   Dynamic NFTs        (XLS-46d)  11 June 2025
 *   Multi-Purpose Tokens(XLS-33)   1 October 2025
 *   Permissioned Domains(XLS-80)   4 February 2026
 *   Token Escrow        (XLS-85)   12 February 2026
 *   Permissioned DEX    (XLS-81)   18 February 2026
 *
 * DepositPreauth now accepts AuthorizeCredentials, and Payment, EscrowFinish,
 * PaymentChannelClaim and AccountDelete accept CredentialIDs. An account with
 * asfDepositAuth set rejects an incoming payment with tecNO_PERMISSION unless
 * the sender presents a valid credential from an authorised issuer — which is
 * pre-settlement enforcement at the protocol layer, with no smart contract and
 * no cross-ledger bridge.
 *
 * The project therefore runs entirely on XRPL. Xahau is retained below for
 * reference because the dissertation compares the two substrates, but no code
 * path targets it. The previous endpoint (wss://hooks-testnet-v3.xrpl-labs.com)
 * was stale; the current Xahau testnet is wss://xahau-test.net.
 */

export interface NetworkConfig {
  /** WebSocket endpoint */
  wsUrl: string;
  /** Block explorer base URL */
  explorer: string;
  /** HTTP faucet endpoint, where one is offered */
  faucet: string | null;
  /** Human-readable name for logs */
  name: string;
}

/**
 * XRPL Testnet — the network for every scenario in this project.
 * Carries the same amendments as Mainnet, and is faucet-funded so an examiner
 * can reproduce the whole demonstration at no cost.
 */
export const XRPL_TESTNET: NetworkConfig = {
  wsUrl: "wss://s.altnet.rippletest.net:51233",
  explorer: "https://testnet.xrpl.org",
  faucet: "https://faucet.altnet.rippletest.net/accounts",
  name: "XRPL Testnet",
};

/**
 * XRPL Devnet — carries amendments ahead of Testnet. Needed only for the
 * Smart Escrow (XLS-100) scenario, which is not yet on Testnet or Mainnet.
 */
export const XRPL_DEVNET: NetworkConfig = {
  wsUrl: "wss://s.devnet.rippletest.net:51233",
  explorer: "https://devnet.xrpl.org",
  faucet: "https://faucet.devnet.rippletest.net/accounts",
  name: "XRPL Devnet",
};

/**
 * Xahau Testnet — REFERENCE ONLY. No code path targets this network.
 * Retained so the dissertation's substrate comparison cites a live endpoint.
 * Note that Xahau does not implement XLS-20; it uses URITokens (XLS-35d), which
 * is why the original NFT mint against this network could never have succeeded.
 */
export const XAHAU_TESTNET: NetworkConfig = {
  wsUrl: "wss://xahau-test.net",
  explorer: "https://explorer.xahau-test.net",
  faucet: "https://xahau-test.net/accounts",
  name: "Xahau Testnet (reference only)",
};

/**
 * The credential type identifying a Regulatory Passport.
 *
 * This names the OBLIGATION, not the version of it. The rule version the
 * passport attests against is pinned in the credential's URI, so a rule can be
 * updated without reissuing every credential type in the system — which is the
 * separation of enforcement from parameters that the project argues for.
 *
 * Limit is 64 bytes; this is 30.
 */
export const CREDENTIAL_TYPE_STRING = "MiCA_ART35_OWN_FUNDS_COMPLIANT";

/**
 * NFTokenTaxon for Regulatory State Tokens. Using the article number makes
 * regulatory tokens filterable on-ledger by the obligation they carry.
 */
export const REGULATORY_NFT_TAXON = 35;

/** Ripple Epoch offset: seconds between 1970-01-01 and 2000-01-01. */
export const RIPPLE_EPOCH_OFFSET = 946_684_800;

/** Converts a JS Date to the seconds-since-Ripple-Epoch used by Expiration. */
export function toRippleTime(date: Date): number {
  return Math.floor(date.getTime() / 1000) - RIPPLE_EPOCH_OFFSET;
}
