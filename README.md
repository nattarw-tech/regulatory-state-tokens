# regulatory-state-tokens

**Tokenising Regulatory State for Ex-Ante Compliance on XRPL/Xahau**

A proof-of-concept for the MSc Industry Based Research Project (SMM095), MSc Financial
Technology and Innovation, Bayes Business School — Nisrin Attarwala, supervised by
Dr Zsofia Kraussl.

> **Status:** Active development (baseline prototype migrated 21 Jul 2026). This README
> describes the *target* design; some components are still being completed — see
> [Current status](#current-status).

---

## The idea in one line

Compliance today is *ex-post* — firms transact first and prove compliance later through
audits. This PoC tests whether a narrow, quantitative regulatory rule can be enforced
*ex-ante* — checked on-chain **before** a transaction settles, so a non-compliant
transaction is never possible in the first place.

## Architecture

The design separates a **stable enforcement layer** from **mutable regulatory
parameters**, so a rule change is handled by updating on-chain state, not by
redeploying code.

| Component | Ledger | Primitive | Role |
|---|---|---|---|
| **Regulatory Passport** | XRPL testnet | XLS-70 Credential | Attests a firm meets the rule |
| **Regulatory State Token** | XRPL testnet | XLS-20 Dynamic NFT | Carries the current rule parameters (self-describing) |
| **Mirrored state** | Xahau testnet | URIToken / Hook State | Xahau-local copy the Hook can read |
| **Enforcement Hook** | Xahau testnet | Hook (C→WASM) | Allows/blocks payments based on rule + passport |

**Why two ledgers?** XRPL has native Credentials (live on mainnet since Feb 2026) but
Hooks were judged too risky for XRPL mainnet, so account-level enforcement code only
exists on Xahau. The two networks have no live bridge, so this PoC **mirrors** state
onto Xahau under an explicit, documented trust assumption (see the dissertation for the
governance discussion). Removing that trust assumption (a federated oracle / light-client
proof) is named as future work.

## The demonstration (three scenarios)

1. **ALLOW** — a credentialed firm's payment settles.
2. **RULE UPDATE** — the regulator raises the threshold with a single transaction; the
   Hook code is never redeployed.
3. **BLOCK** — a non-compliant payment is rejected before settlement, with a
   plain-English reason.

---

## Running it (GitHub Codespaces — recommended)

This project is designed to run in **Codespaces**, not on a local machine (the Hook
C→WASM toolchain is far easier in a Linux container).

1. Click **`< > Code` → Codespaces → Create codespace on main**.
2. Wait for the container to build (`npm install` runs automatically).
3. Run the end-to-end demo:
   ```bash
   npm run demo
   ```

Wallets are auto-funded from the testnet faucets, so no configuration is needed to start.
To reuse fixed wallets, copy `.env.example` to `.env` and fill in seeds.

## Project layout

```
src/
  config.ts                      Network endpoints + rule identifiers
  rules/micaRules.ts             The regulatory rule encoded as typed data
  credentials/issueCredential.ts XLS-70 Regulatory Passport (issue + verify)
  nft/mintRegulatoryToken.ts     Regulatory State Token (dynamic NFT)
  hooks/compliance_check.c       Enforcement Hook (C → WASM) for Xahau
  demo.ts                        End-to-end orchestrator
.devcontainer/                   Codespaces environment
```

## Current status

| Component | Status |
|---|---|
| Rule encoding | Working |
| XLS-70 credential (issue + verify) | Working on XRPL testnet |
| Regulatory State Token | **Being corrected** — must mint on XRPL (XLS-20), not Xahau |
| `mirrorToXahau` connector | **To build** |
| Enforcement Hook | **To complete** — logic currently a template |
| Rule legal basis | **To correct** — relabel to a MiCA Art. 35-style own-funds threshold |

## Academic note

Portions of this codebase were developed with AI assistance, disclosed in line with the
project's positioning paper. The architecture, design decisions, and evaluation are the
author's own.

## License

MIT — see [LICENSE](LICENSE).
