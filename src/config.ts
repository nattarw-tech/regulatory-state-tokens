/**
 * Network configuration for the CASP Regulatory PoC
 *
 * Two networks are used:
 * - XRPL Testnet: supports the XLS-70 Credentials amendment (CredentialCreate/Accept)
 * - Xahau Testnet: supports XLS-20 NFTs and Hooks (smart contracts)
 */

export const NETWORKS = {
  /**
   * XRPL Testnet — used for XLS-70 Regulatory Passport credential issuance.
   * The `Credentials` amendment (XLS-70) is enabled on this network.
   */
  XRPL_TESTNET: {
    url: "wss://s.altnet.rippletest.net:51233",
    explorer: "https://testnet.xrpl.org",
    faucet: "https://faucet.altnet.rippletest.net/accounts",
    name: "XRPL Testnet",
  },
  /**
   * Xahau Testnet — used for XLS-20 NFT minting (Regulatory State Token)
   * and as the target environment for Hook deployment.
   * Hooks enable on-chain enforcement of compliance rules at the transaction layer.
   */
  XAHAU_TESTNET: {
    url: "wss://hooks-testnet-v3.xrpl-labs.com",
    explorer: "https://hooks-testnet-v3.xrpl-labs.com",
    faucet: "https://hooks-testnet-v3.xrpl-labs.com",
    name: "Xahau Testnet (Hooks)",
  },
} as const;

/**
 * XLS-70 Credential type identifier for MiCA Article 54 compliance.
 * Must be hex-encoded when sent as a transaction field.
 * Max 64 bytes (128 hex chars).
 */
export const CREDENTIAL_TYPE_STRING =
  "MiCA_ART54_EMT_CAPITAL_COMPLIANT";

/**
 * NFTokenTaxon for Regulatory State Tokens.
 * Using the MiCA article number (54) as the taxon — a simple but meaningful convention.
 */
export const REGULATORY_NFT_TAXON = 54;
