# Regulation as Ledger State

[![tests](https://github.com/nattarw-tech/regulatory-state-tokens/actions/workflows/tests.yml/badge.svg)](https://github.com/nattarw-tech/regulatory-state-tokens/actions/workflows/tests.yml)

**Enforcing a capital requirement before settlement, on the XRP Ledger**

A proof-of-concept for the MSc Industry Based Research Project (SMM095), MSc Financial
Technology and Innovation, Bayes Business School — Nisrin Attarwala, supervised by
Dr Zsofia Kraussl.

---

## The claim

Compliance today is *ex-post*. Firms transact, then demonstrate afterwards that they
were entitled to, through monitoring, reporting and audit. This project tests whether a
narrow, quantitative regulatory obligation can instead be enforced *ex-ante* — refused
by the ledger before it settles, so a non-compliant transaction never executes.

It can. And the result that matters is **how little it took**.

## The finding

**No smart contract was required.** Ex-ante enforcement was achieved entirely with
protocol primitives that are already live on XRPL Mainnet, already audited, and already
part of the consensus rules.

This is not a shortcut. XRPL deliberately keeps general smart contracts off Mainnet
because code executing at the protocol layer can endanger consensus for every
participant if it is wrong — which is why Hooks live on a separate network. A design
that achieves the same enforcement with *no* new code at that layer adds no new attack
surface. The absence of a contract is the contribution, not a gap in it.

An earlier version of this project split the work across two ledgers, mirroring state
onto Xahau under an explicit trust assumption, because account-level enforcement did not
exist on XRPL. Between September 2025 and February 2026 that ceased to be true. The
open engineering question the project set out to answer dissolved rather than being
solved, and reporting that honestly is part of the result.

## How it works

| Layer | Primitive | Role |
|---|---|---|
| **Regulatory state** | Dynamic NFT (XLS-46d), `tfMutable` | The current rule, amendable in place via `NFTokenModify` |
| **Regulatory passport** | Credential (XLS-70) | A regulator's attestation that a firm meets it |
| **Enforcement** | `asfDepositAuth` + `DepositPreauth{AuthorizeCredentials}` | Refuses payments from anyone not holding the attestation |

The gate names the **credential**, never an address. A conventional allowlist records a
decision taken in the past and stays wrong until every counterparty maintaining one
remembers to edit it. Here a regulator changes who may transact by issuing or
withdrawing attestations, and every gate relying on them closes at once — with no
counterparty acting, or even being told.

The rule token carries a pointer, not the rule: `rgt:<ruleId>?v=<version>&h=<digest>`.
The ledger holds the authoritative identifier and a SHA-256 commitment; the rule body is
published off-ledger. A verifier fetches the body, recomputes the digest and compares —
so a stale copy fails loudly instead of silently enforcing superseded law.

## Running it

```bash
npm install
npm run demo
```

Wallets are funded automatically from the testnet faucet; no configuration is needed.
The run writes `docs/demo-report.html` with every transaction hash as a clickable
explorer link.

| Command | What it does |
|---|---|
| `npm run demo` | The full five-act demonstration |
| `npm run preflight` | Smallest runnable proof of the enforcement chain |
| `npm run scenario:update` | Rule amendment in isolation |
| `npm run scenario:revoke` | Revocation in isolation |
| `npm test` | 17 unit tests on the rule encoding |

Also runnable in **GitHub Codespaces** (`< > Code → Codespaces`) with nothing installed
locally, which is the intended path for anyone verifying the work.

## The demonstration

| Act | What happens | Result |
|---|---|---|
| I | A regulator publishes the own-funds rule as ledger state | `NFTokenMint` |
| II | A firm meeting it is authorised, and pays | `tesSUCCESS` |
| III | A firm without authorisation attempts the same payment | `tecNO_PERMISSION` |
| IV | The threshold is raised — one transaction, nothing redeployed | `NFTokenModify` |
| V | The first firm now falls short, is suspended, and is refused | `tecBAD_CREDENTIALS` |

Acts II and V are the same payment, by the same firm, to the same counterparty. Between
them the law changed and a supervisor acted.

An unanticipated finding sits in Act V: the ledger returns **different codes for
different failures** — `tecNO_PERMISSION` when nothing is presented,
`tecBAD_CREDENTIALS` when an attestation is presented that cannot be honoured. A refused
firm can tell which without contacting anyone. That speaks to the standing objection
that automated compliance decisions are opaque and therefore hard to challenge.

Full transaction records: [`docs/EVIDENCE.md`](docs/EVIDENCE.md).

## Scope and limits

The encoded rule is a **MiCA Article 35(1)-style** own-funds threshold — deliberately
narrow, numerical, and chosen because it is testable. It is not a legal opinion, and
nothing here implements MiCA.

Three limits worth stating plainly:

- **The rule token is not legally authoritative.** Minting it records what a rule says.
  Who is entitled to mint one is a governance question this code does not answer.
- **The arithmetic runs off-ledger, by design.** A supervisor assesses periodic evidence
  — audited accounts, capital returns, attestations — which cannot be put on a ledger.
  The ledger enforces the *decision*, which is how prudential supervision actually works.
- **The EUR 500,000 threshold in Act IV is hypothetical**, constructed to exercise the
  amendment mechanism. The EU has not raised the Article 35(1) floor.

## Layout

```
src/
  rules/micaRules.ts              The obligation, encoded, with provenance
  state/regulatoryStateToken.ts   Publish and amend the rule on-ledger
  credentials/passport.ts         Issue, verify, revoke
  enforcement/depositGate.ts      The gate — no contract, ~200 lines
  evidence/recorder.ts            Captures hashes as they validate
  scenarios/                      Individual scenarios
  demo.ts                         The five-act demonstration
docs/
  EVIDENCE.md                     Every transaction, with explorer links
  archive/compliance_check.c      The abandoned Xahau Hook, kept as an exhibit
test/                             Rule-encoding tests
```

## Academic note

Portions of this codebase were developed with AI assistance, disclosed in line with the
project's positioning paper. The architecture, design decisions and evaluation are the
author's own.

## License

MIT — see [LICENSE](LICENSE).
