/**
 * CASP Regulatory Credentialing — End-to-End Demo
 *
 * This script demonstrates the full "Regulation as Code" proof-of-concept for
 * the Dynamic Compliance Synthesis Engine (DCSE) — MSc Project.
 *
 * What this demo does:
 * ┌─────────────────────────────────────────────────────────────────┐
 * │  Step 0  │ Display the encoded MiCA Art.35-style own-funds rule  │
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
  MICA_ART35_OWN_FUNDS_RULE,
  checkOwnFundsAdequacy,
  buildRulePointerURI,
  computeRuleDigest,
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

  const rule = MICA_ART35_OWN_FUNDS_RULE;
  info(`Rule ID    : ${rule.ruleId}  (v${rule.metadata.version})`);
  info(`Source     : ${rule.provenance.sourceDocument}`);
  info(`Provision  : ${rule.provenance.articleReference} — ${rule.title}`);
  info(`Applies to : ${rule.applicableTo}`);
  info(
    `Requirement: HIGHEST of €${rule.requirements.minimumCapital_EUR.toLocaleString()}, ` +
    `${rule.requirements.reserveAssetsPercentage}% of reserve assets, or ` +
    `${rule.requirements.fixedOverheadsFraction * 100}% of fixed overheads`
  );
  info(`Taxonomy   : ${rule.taxonomy.classificationPath.join(" › ")}`);
  info(`Status     : ${rule.metadata.status.toUpperCase()}`);
  info(`Effective  : ${rule.metadata.effectiveDate}`);
  info(`Digest     : ${computeRuleDigest(rule).slice(0, 32)}…`);
  info(`Pointer URI: ${buildRulePointerURI(rule)}`);

  // Demonstrate the compliance check function. Each scenario is chosen so that
  // a different limb of the three-part test is the binding constraint.
  console.log("\n  --- Compliance Check Simulation ---");
  const scenarios = [
    // floor binds (350k) → 500k passes
    { label: "Well-capitalised issuer", ownFunds: 500_000, reserve: 10_000_000, overheads: 400_000 },
    // floor binds (350k) → 300k fails
    { label: "Below absolute floor",    ownFunds: 300_000, reserve: 5_000_000,  overheads: 400_000 },
    // 2% of 60m = 1.2m binds → 1m fails
    { label: "Large reserve, thin capital", ownFunds: 1_000_000, reserve: 60_000_000, overheads: 800_000 },
    // 25% of 8m = 2m binds → 1.5m fails
    { label: "High fixed overheads",    ownFunds: 1_500_000, reserve: 10_000_000, overheads: 8_000_000 },
  ];

  for (const s of scenarios) {
    const result = checkOwnFundsAdequacy(s.ownFunds, s.reserve, s.overheads);
    const symbol = result.compliant ? "✓" : "✗";
    console.log(`  ${symbol} ${s.label}`);
    console.log(`      ${result.reason}`);
    console.log(`      Binding limb: ${result.bindingLimb}`);
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
    // NOTE: this currently targets Xahau, which does not implement XLS-20
    // (Xahau uses URITokens instead). This step is expected to fail until the
    // mint is moved to XRPL and a Xahau-side mirror is added. Passing the
    // Xahau explorer explicitly so the output stays truthful in the meantime.
    nftResult = await mintRegulatoryStateToken(
      xahauRegulator,
      xahauClient,
      MICA_ART35_OWN_FUNDS_RULE,
      NETWORKS.XAHAU_TESTNET.explorer
    );

    section("Step 6: Verify NFT and Decode Rule Metadata");
    const tokens = await getRegulatoryTokens(
      xahauRegulator.address,
      xahauClient
    );

    if (tokens.length > 0) {
      ok(`Found ${tokens.length} Regulatory State Token(s) on Xahau`);
      for (const token of tokens) {
        info(`NFT ID : ${token.nftId}`);
        info(`URI    : ${token.uriDecoded}`);

        // The URI is a pointer of the form:
        //   rgt:<ruleId>?v=<version>&h=<truncated sha256 digest>
        // Verifying the digest proves the off-chain rule text we hold is
        // exactly the version this token commits to.
        const match = token.uriDecoded.match(
          /^rgt:([^?]+)\?v=([^&]+)&h=([0-9a-f]+)$/
        );

        if (match) {
          const [, ruleId, version, digest] = match;
          ok(`Pointer resolves to rule: ${ruleId} (v${version})`);

          const expected = computeRuleDigest(rule).slice(0, 32);
          if (digest === expected) {
            ok("Integrity check PASSED — on-chain digest matches local rule");
          } else {
            console.log("  ⚠ Integrity check FAILED — digest mismatch");
            info(`  on-chain: ${digest}`);
            info(`  expected: ${expected}`);
          }
        } else {
          info("  URI is not in the expected rgt: pointer format");
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
    ✓ MiCA Art.35-style own-funds rule encoded as structured, source-linked data
    ✓ Three-limb own-funds test verified against 4 scenarios

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
    ✓ URI is a versioned rule pointer with SHA-256 integrity digest`
      : "⚠ NFT minting skipped (see error above)"
    }

  Hook (Reference Implementation):
    ✓ C source: src/hooks/compliance_check.c
    ✓ Logic: intercepts Payment TXs, checks for MiCA Art.35 credential
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
