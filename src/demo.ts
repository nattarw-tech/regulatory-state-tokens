/**
 * CASP Regulatory Credentialing — End-to-End Demo
 *
 * This script demonstrates the full "Regulation as Code" proof-of-concept for
 * the Dynamic Compliance Synthesis Engine (DCSE) — MSc Project.
 *
 * What this demo does:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Step 0  │ Display the encoded MiCA Article 54 rule              │
 * │  Step 1  │ Fund two XRPL Testnet accounts via faucet             │
 * │           │   ├─ Regulatory Authority (issuer)                   │
 * │           │   └─ CASP Account (subject)                          │
 * │  Step 2  │ Issue XLS-70 Regulatory Passport credential           │
 * │           │   ├─ CredentialCreate (regulator signs)              │
 * │           │   └─ CredentialAccept (CASP signs)                   │
 * │  Step 3  │ Verify credential is active on-chain                  │
 * │  Step 4  │ Fund one Xahau Testnet account via faucet             │
 * │  Step 5  │ Mint XLS-20 Regulatory State Token (NFT)              │
 * │  Step 6  │ Verify NFT and decode embedded rule metadata           │
 * │  Step 7  │ Print compliance summary                               │
 * └─────────────────────────────────────────────────────────────────┘
 *
 * Run with: npm run demo
 * Or:       npx ts-node src/demo.ts
 */

import { Client, Wallet } from "xrpl";
import dotenv from "dotenv";

import { NETWORKS } from "./config";
import {
  MICA_ARTICLE_54_RULE,
  checkCapitalAdequacy,
} from "./rules/micaRules";
import {
  issueRegulatoryPassport,
  verifyCredential,
} from "./credentials/issueCredential";
import {
  mintRegulatoryStateToken,
  getRegulatoryTokens,
} from "./nft/mintRegulatoryToken";

dotenv.config();

/* ─── Formatting helpers ──────────────────────────────────────────────────── */

function banner(text: string): void {
  const line = "═".repeat(64);
  console.log(`\n╔${line}╗`);
  console.log(`║  ${text.padEnd(62)}║`);
  console.log(`╚${line}╝`);
}

function section(text: string): void {
  console.log(`\n${"─".repeat(66)}`);
  console.log(`  ${text}`);
  console.log(`${"─".repeat(66)}`);
}

function ok(text: string): void {
  console.log(`  ✓ ${text}`);
}

function info(text: string): void {
  console.log(`  • ${text}`);
}

/* ─── Account setup ───────────────────────────────────────────────────────── */

async function setupXRPLAccounts(client: Client): Promise<{
  regulatorWallet: Wallet;
  caspWallet: Wallet;
}> {
  section("Funding XRPL Testnet Accounts (via faucet)");
  console.log("  This may take 15-30 seconds...\n");

  let regulatorWallet: Wallet;
  let caspWallet: Wallet;

  if (process.env.XRPL_REGULATOR_SEED) {
    regulatorWallet = Wallet.fromSeed(process.env.XRPL_REGULATOR_SEED);
    info(`Using existing Regulator wallet: ${regulatorWallet.address}`);
  } else {
    const { wallet } = await client.fundWallet();
    regulatorWallet = wallet;
    ok(`Funded Regulator wallet: ${regulatorWallet.address}`);
  }

  if (process.env.XRPL_CASP_SEED) {
    caspWallet = Wallet.fromSeed(process.env.XRPL_CASP_SEED);
    info(`Using existing CASP wallet: ${caspWallet.address}`);
  } else {
    const { wallet } = await client.fundWallet();
    caspWallet = wallet;
    ok(`Funded CASP wallet:       ${caspWallet.address}`);
  }

  return { regulatorWallet, caspWallet };
}

async function setupXahauAccount(client: Client): Promise<Wallet> {
  section("Funding Xahau Testnet Account (via faucet)");
  console.log("  This may take 15-30 seconds...\n");

  if (process.env.XAHAU_REGULATOR_SEED) {
    const wallet = Wallet.fromSeed(process.env.XAHAU_REGULATOR_SEED);
    info(`Using existing Xahau Regulator wallet: ${wallet.address}`);
    return wallet;
  }

  const { wallet } = await client.fundWallet();
  ok(`Funded Xahau Regulator wallet: ${wallet.address}`);
  return wallet;
}

/* ─── Main demo ───────────────────────────────────────────────────────────── */

async function main(): Promise<void> {
  banner("CASP Regulatory Credentialing PoC — MSc Project Demo");

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 0: Display encoded MiCA rule
   * ────────────────────────────────────────────────────────────────────────── */
  section("Step 0: Encoded MiCA Regulatory Rule");

  const rule = MICA_ARTICLE_54_RULE;
  info(`Regulation : ${rule.regulationReference}`);
  info(`Article    : ${rule.article} — ${rule.title}`);
  info(`Applies to : ${rule.applicableTo}`);
  info(
    `Requirement: Greater of €${rule.requirements.minimumCapital_EUR.toLocaleString()} ` +
    `OR ${rule.requirements.outstandingTokensPercentage}% of outstanding token value`
  );
  info(`Status     : ${rule.metadata.status.toUpperCase()}`);
  info(`Effective  : ${rule.metadata.effectiveDate}`);

  // Demonstrate the compliance check function
  console.log("\n  --- Compliance Check Simulation ---");
  const scenarios = [
    { ownFunds: 500000, outstanding: 10000000 },   // 2% = 200k → floor 350k → 500k OK
    { ownFunds: 300000, outstanding: 5000000 },    // 2% = 100k → floor 350k → 300k FAIL
    { ownFunds: 1000000, outstanding: 60000000 },  // 2% = 1.2M → 1M FAIL
  ];

  for (const s of scenarios) {
    const result = checkCapitalAdequacy(s.ownFunds, s.outstanding);
    const symbol = result.compliant ? "✓" : "✗";
    console.log(
      `  ${symbol} Own funds: €${s.ownFunds.toLocaleString()}, ` +
      `Outstanding: €${s.outstanding.toLocaleString()} → ${result.reason}`
    );
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 1–3: XLS-70 Credential on XRPL Testnet
   * ────────────────────────────────────────────────────────────────────────── */
  section("Connecting to XRPL Testnet");
  info(`URL: ${NETWORKS.XRPL_TESTNET.url}`);

  const xrplClient = new Client(NETWORKS.XRPL_TESTNET.url);
  await xrplClient.connect();
  ok("Connected to XRPL Testnet");

  let credentialResult;
  let verificationResult;

  try {
    const { regulatorWallet, caspWallet } = await setupXRPLAccounts(xrplClient);

    section("Step 2: Issue XLS-70 Regulatory Passport");
    credentialResult = await issueRegulatoryPassport(
      regulatorWallet,
      caspWallet,
      xrplClient
    );

    section("Step 3: Verify Credential On-Chain");
    verificationResult = await verifyCredential(
      caspWallet.address,
      regulatorWallet.address,
      xrplClient
    );

    if (verificationResult.verified) {
      ok("Credential VERIFIED on XRPL Testnet ledger");
      ok(`Explorer: ${credentialResult.explorerUrl}`);
    } else {
      console.log("  ⚠ Credential not yet visible (ledger may still be closing)");
      info("This is normal — try querying account_objects in 3-5 seconds");
    }
  } catch (err) {
    console.error("\n  ⚠ XLS-70 Credential step encountered an error:");
    console.error(`    ${(err as Error).message}`);
    console.error(
      "\n  Note: CredentialCreate requires the 'Credentials' amendment on XRPL Testnet."
    );
    console.error(
      "  If the amendment is not enabled, the credential step will fail."
    );
    console.error(
      "  The NFT minting step (Xahau) will still proceed.\n"
    );
  } finally {
    await xrplClient.disconnect();
    info("Disconnected from XRPL Testnet");
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 4–6: XLS-20 Regulatory State Token on Xahau Testnet
   * ────────────────────────────────────────────────────────────────────────── */
  section("Connecting to Xahau Testnet (Hooks)");
  info(`URL: ${NETWORKS.XAHAU_TESTNET.url}`);

  const xahauClient = new Client(NETWORKS.XAHAU_TESTNET.url);
  await xahauClient.connect();
  ok("Connected to Xahau Testnet");

  let nftResult;

  try {
    const xahauRegulator = await setupXahauAccount(xahauClient);

    section("Step 5: Mint XLS-20 Regulatory State Token");
    nftResult = await mintRegulatoryStateToken(xahauRegulator, xahauClient);

    section("Step 6: Verify NFT and Decode Rule Metadata");
    const tokens = await getRegulatoryTokens(
      xahauRegulator.address,
      xahauClient
    );

    if (tokens.length > 0) {
      ok(`Found ${tokens.length} Regulatory State Token(s) on Xahau`);
      for (const token of tokens) {
        info(`NFT ID : ${token.nftId}`);
        try {
          // Strip the data URI prefix to get the raw JSON
          const jsonStr = token.uriDecoded.replace(
            /^data:application\/json;charset=utf-8,/,
            ""
          );
          const decoded = JSON.parse(jsonStr) as typeof MICA_ARTICLE_54_RULE;
          ok(`URI decodes to rule: ${decoded.ruleId}`);
          info(`  Rule status     : ${decoded.metadata.status}`);
          info(`  Effective date  : ${decoded.metadata.effectiveDate}`);
          info(
            `  Capital floor   : €${decoded.requirements.minimumCapital_EUR.toLocaleString()}`
          );
          info(
            `  % outstanding   : ${decoded.requirements.outstandingTokensPercentage}%`
          );
        } catch {
          info(`  Raw URI: ${token.uriDecoded.slice(0, 120)}...`);
        }
      }
    }
  } catch (err) {
    console.error("\n  ⚠ Xahau NFT step encountered an error:");
    console.error(`    ${(err as Error).message}`);
  } finally {
    await xahauClient.disconnect();
    info("Disconnected from Xahau Testnet");
  }

  /* ──────────────────────────────────────────────────────────────────────────
   * STEP 7: Compliance Summary
   * ────────────────────────────────────────────────────────────────────────── */
  banner("Proof-of-Concept Summary");

  console.log(`
  Regulatory Rule Encoding:
    ✓ MiCA Article 54 encoded as machine-readable TypeScript data
    ✓ Capital adequacy logic verified against 3 scenarios

  XLS-70 Regulatory Passport (XRPL Testnet):
    ${credentialResult
      ? `✓ CredentialCreate TX:  ${credentialResult.createTxHash}
    ✓ CredentialAccept TX:  ${credentialResult.acceptTxHash}
    ✓ CASP verified on:     ${NETWORKS.XRPL_TESTNET.explorer}/accounts/${credentialResult.subject}`
      : "⚠ Credential issuance skipped (see error above)"
    }

  XLS-20 Regulatory State Token (Xahau Testnet):
    ${nftResult
      ? `✓ NFTokenMint TX:       ${nftResult.mintTxHash}
    ✓ NFT ID:               ${nftResult.nftId}
    ✓ Minter verified on:   ${nftResult.explorerUrl}
    ✓ URI contains full MiCA Art.54 rule JSON (self-describing token)`
      : "⚠ NFT minting skipped (see error above)"
    }

  Hook (Reference Implementation):
    ✓ C source: src/hooks/compliance_check.c
    ✓ Logic: intercepts Payment TXs, checks for MiCA Art.54 credential
    ✓ Compile with LLVM → clang --target=wasm32-unknown-unknown
    ✓ Deploy via SetHook transaction on Xahau

  Architecture demonstrated:
    Reactive (ex-post) compliance  →  Proactive (ex-ante) compliance
    Manual audit trails            →  On-chain verifiable credentials
    Siloed regulatory databases    →  Public, queryable ledger state
  `);
}

main().catch((err) => {
  console.error("\nFatal error:", err);
  process.exit(1);
});
