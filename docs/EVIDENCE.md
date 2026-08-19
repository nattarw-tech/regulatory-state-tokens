# Evidence

Every claim in this project is backed by a transaction on a public ledger. This
file records those transactions with explorer links so a reader can verify them
independently.

> **On testnet resets.** XRPL Testnet is periodically reset, after which these
> transactions cease to be retrievable. Where a link has gone dead, the hash and
> engine result recorded here remain the primary evidence, and the run is
> reproducible with `npm run preflight` against a current testnet. Archived
> explorer screenshots are held in `docs/evidence-archive/`.

---

## Run 001 — Credential-gated payment (the core claim)

| | |
|---|---|
| **Date** | 30 July 2026 |
| **Network** | XRPL Testnet (`wss://s.altnet.rippletest.net:51233`) |
| **Server** | rippled 3.3.0-rc5 |
| **Validated ledger at start** | 19,495,963 |
| **Command** | `npm run preflight` |
| **Result** | PASSED — 7 of 7 steps |

### Accounts

| Role | Address |
|---|---|
| Regulator (credential issuer) | `r4jE7DP6qsQzB6KveCQTbYNiLpa5EgPD2E` |
| CASP-A (holds the passport) | `rpUQBhePL5cAttZmJ9SCxmWJtdTANJBpPk` |
| CASP-B (holds no passport) | `rpqgyNqxV61k8egHTiLiu1dUCcZuwoes7Q` |
| Beneficiary (gated account) | `rUoZkXiuPnffQA86fVSPfyrPq7hBYHnBcX` |

### Credential

| | |
|---|---|
| CredentialType (string) | `MiCA_ART35_OWN_FUNDS_COMPLIANT` |
| CredentialType (hex, 30 bytes) | `4D6943415F41525433355F4F574E5F46554E44535F434F4D504C49414E54` |
| Ledger entry ID | `B1AC5AB1C0C46F1FCB3E08E661FE3520C886A445CDE6524FF48776554FE7928A` |

### Transactions

| # | Transaction | Result | Hash |
|---|---|---|---|
| 1 | `CredentialCreate` — Regulator → CASP-A | `tesSUCCESS` | [`7BA8F7DB…332F`](https://testnet.xrpl.org/transactions/7BA8F7DBD5285F5BAAE21B02C380C63FD6B8D8880CF2F1DD919613F4C551332F) |
| 2 | `CredentialAccept` — CASP-A opts in | `tesSUCCESS` | [`6AA159E0…FFFD`](https://testnet.xrpl.org/transactions/6AA159E08438B1A709881FA1B8EC17680BC9F7C8A0709DC8F4574BB2B338FFFD) |
| 3 | `AccountSet` `asfDepositAuth` — Beneficiary closes its account | `tesSUCCESS` | [`A2C05C37…1438`](https://testnet.xrpl.org/transactions/A2C05C373CCC7597AB59311CA3E47B000B36703C09B4CE544C395CC25B851438) |
| 4 | `DepositPreauth` `AuthorizeCredentials` — authorises the credential, not an address | `tesSUCCESS` | [`39992041…88C5`](https://testnet.xrpl.org/transactions/39992041C9D7688565280013B68F708125051B776299545B5C6081DD4DB788C5) |
| 5 | **ALLOW** — `Payment` from CASP-A carrying `CredentialIDs` | `tesSUCCESS` | [`254DF204…5A26`](https://testnet.xrpl.org/transactions/254DF20432A137FBD6A4012E3F6ADC66ECFBFBF1E506CF6E9EE8D2E595F75A26) |
| 6 | **BLOCK** — `Payment` from CASP-B with no credential | **`tecNO_PERMISSION`** | [`63801109…8B9E`](https://testnet.xrpl.org/transactions/6380110917FFD0AB9633DEF0F4A075AD5A11B08ABAB8BB4C791C206C10B78B9E) |

### What transaction 6 establishes

CASP-B's payment was **refused by the XRP Ledger's own transaction processing**,
not by an application sitting in front of it. There is no smart contract in this
run, no oracle, no off-ledger compliance service, and no second ledger. The
refusal is a consequence of protocol rules alone:

1. The Beneficiary account carries the `lsfDepositAuth` flag, so the protocol
   rejects incoming value by default.
2. The only standing exception is a `DepositPreauth` entry naming a *credential*
   — an issuer and a credential type — rather than any specific account. No
   address is whitelisted at any point.
3. CASP-B holds no such credential and can therefore present no `CredentialIDs`,
   so the exception does not apply and the transaction fails.

The distinction that matters for the project's argument is that transaction 6
**never settled**. It was not executed and then reversed, flagged for review, or
reported after the fact. `tecNO_PERMISSION` is returned during transaction
processing, and no value moved. That is *ex-ante* enforcement in the sense the
dissertation uses the term.

Transaction 5 is the necessary control: the same payment, to the same account,
for the same amount, succeeds when the sender presents a valid credential. The
gate discriminates on regulatory status and on nothing else.

---

## Run 002 — Rule update without redeployment

| | |
|---|---|
| **Date** | 30 July 2026 |
| **Network** | XRPL Testnet |
| **Command** | `npm run scenario:update` |
| **Result** | PASSED — 5 of 5 steps |

| Role | Address |
|---|---|
| Regulator (token issuer) | `r3Q7uxK3yrTcPzFNzFb5uCpxWaYRPcRiao` |

### The Regulatory State Token

| | |
|---|---|
| NFTokenID (unchanged across the amendment) | `001100005139BF8A27383D5ABDF6B544E2A69506C88D1B1C99E54A3C01297C84` |
| Taxon | 35 |
| Flags | `tfBurnable \| tfMutable` (17) — deliberately **not** transferable |

### Transactions

| # | Transaction | Result | Hash |
|---|---|---|---|
| 1 | `NFTokenMint` — publishes rule v1 | `tesSUCCESS` | [`9A38FEC9…6953`](https://testnet.xrpl.org/transactions/9A38FEC9933AF45EA62B43E496C94B378835529C20D150CD624BD5ECCA246953) |
| 2 | `NFTokenModify` — amends to rule v2 | `tesSUCCESS` | [`6E22A053…14B7`](https://testnet.xrpl.org/transactions/6E22A0532BC1FCBCBF2195F0AE63C826095222470238230CFCE63D5DACA714B7) |

### State before and after

| | Before | After |
|---|---|---|
| On-chain URI | `rgt:MiCA-ART35-OWNFUNDS-V1?v=1.0&h=977945e627b8f330f4d31918937b0340` | `rgt:MiCA-ART35-OWNFUNDS-V2?v=2.0&h=53a3ebd3f3f32ca663904fe18f947dd3` |
| Article 35(1)(a) floor | EUR 350,000 | EUR 500,000 *(hypothetical)* |
| NFTokenID | `0011…7C84` | `0011…7C84` — unchanged |

### What this establishes

**The amendment cost one transaction.** No code was recompiled, redeployed or
restarted. Nothing that enforces the rule was modified, because the enforcement
layer never held the threshold — it reads it. This is the separation of stable
enforcement from mutable parameters that the project argues for, demonstrated
rather than asserted.

**Token identity survived the amendment.** The NFTokenID is byte-identical
before and after, so any system holding a reference to the rule keeps a working
reference. The earlier burn-and-remint design could not do this: every
amendment minted a new identifier and invalidated every reference to it.

**A stale copy fails loudly rather than quietly.** A verifier still holding v1
recomputes digest `977945e6…` against an on-chain commitment of `53a3ebd3…`,
and verification fails. It cannot keep enforcing a superseded threshold without
noticing. This is the property that makes the pointer design safe: the ledger is
authoritative, and divergence is detectable by construction.

**The regulatory consequence is real.** A firm holding EUR 400,000 of own funds
was compliant under v1 and is non-compliant under v2. Nothing about the firm
changed. Its status changed because the law did — which is precisely the event
that conventional compliance systems handle slowly and this one handles in a
single ledger write.

> **A necessary caveat.** The move from EUR 350,000 to EUR 500,000 is a
> *hypothetical* amendment constructed to exercise the mechanism. The EU has not
> raised the Article 35(1) floor. See the note on `MICA_ART35_OWN_FUNDS_RULE_V2`
> in `src/rules/micaRules.ts`.

---

## Run 003 — Revocation, and the legibility of refusals

| | |
|---|---|
| **Date** | 30 July 2026 |
| **Network** | XRPL Testnet |
| **Command** | `npm run scenario:revoke` |
| **Result** | PASSED — 6 of 6 steps |

| Role | Address |
|---|---|
| Regulator | `r4kHwtqj6DkFaL5RxFLEzYd7ajVcbMutJt` |
| Firm | `rLnWmFVU3tHCqrF5KypkEZho4qoxWCCC4g` |
| Counterparty (gated) | `rKnhJiggznRJWEijCjwUkqjPgQCZoWmc24` |

### The same payment, three times

Identical sender, destination, amount and code path throughout. The only
variable is the firm's supervisory status.

| Attempt | Presented | Result | Settled | Transaction |
|---|---|---|---|---|
| 1 | Valid passport | `tesSUCCESS` | **yes** | [`F4AEDC7D…3510`](https://testnet.xrpl.org/transactions/F4AEDC7DCEA354F7C05AA5EB5A96CFA254117DF8336D4AD83DEDE823F12E3510) |
| 2 | Withdrawn passport | `tecBAD_CREDENTIALS` | no | [`6C21DFA0…FE82`](https://testnet.xrpl.org/transactions/6C21DFA093E136781327E1FA5AFA8F7636C8567406D34D186064AE079918FE82) |
| 3 | Nothing | `tecNO_PERMISSION` | no | [`144B426C…18C1`](https://testnet.xrpl.org/transactions/144B426CEE4C491AB8B4F0E7F252B21E2A43A84FF064514DB20F44EA8FE718C1) |

The supervisory act itself:
`CredentialDelete` — [`A9A43B21…7F3A`](https://testnet.xrpl.org/transactions/A9A43B2158BDFA62A083AB95073A1C024D6AF6339E4F0D51416510A6AD147F3A)

### What this establishes

**Status is read live, not cached.** Attempts 1 and 2 are the same transaction
submitted by the same account minutes apart. Between them the regulator sent one
`CredentialDelete`. No gate was reconfigured, no counterparty was notified, and
no list was edited anywhere — yet the second attempt failed. This is the
property that separates the design from an allowlist, which records a past
decision and remains wrong until somebody remembers to amend it at every
counterparty that maintains one.

**Withdrawal propagates without coordination.** One transaction by the regulator
closed every gate relying on that credential, simultaneously. The counterparty
took no action and needed no knowledge of the firm's change in status. In a
conventional arrangement this is a suspension notice followed by manual updates
at each counterparty, over days.

**Refusals are legible at the protocol layer.** This was not anticipated in the
design and is a finding of the run. The ledger returns *different* codes for
*different* failures: `tecBAD_CREDENTIALS` when an attestation is presented that
cannot be honoured, and `tecNO_PERMISSION` when none is presented at all. A
refused firm can therefore tell whether its authorisation has been withdrawn or
whether it simply failed to present it — without contacting the regulator or the
counterparty.

This matters to the project's argument. A standing objection to automated
compliance is opacity: an automated refusal that cannot be explained cannot be
challenged, and the FCA's December 2025 action against BeAccount for
"overreliance on automated screening" reflects that concern. Here the reason for
refusal is carried in the protocol's own result code, not reconstructed
afterwards from logs.

---

## Amendment status at time of run

Verified against the live amendment registry. Each primitive relied on is
enabled on **Mainnet**, not merely on Testnet, so the mechanism demonstrated
here is available in production today.

| Amendment | Standard | Enabled on Mainnet |
|---|---|---|
| `Credentials` | XLS-70 | 4 September 2025 |
| `DynamicNFT` | XLS-46d | 11 June 2025 |
| `MPTokensV1` | XLS-33 | 1 October 2025 |
| `PermissionedDomains` | XLS-80 | 4 February 2026 |
| `TokenEscrow` | XLS-85 | 12 February 2026 |
| `PermissionedDEX` | XLS-81 | 18 February 2026 |

Source: `https://api.xrpscan.com/api/v1/amendments`, retrieved 30 July 2026.

---

## Pending runs

| Scenario | Status |
|---|---|
| 1 — ALLOW | Recorded above (run 001, tx 5) |
| 2 — BLOCK | Recorded above (run 001, tx 6) |
| 3 — RULE UPDATE (`NFTokenModify`) | Recorded above (run 002) |
| 4 — REVOCATION / LAPSE | Recorded above (run 003) |
| 5 — THRESHOLD (Smart Escrow) | **Not being built.** See below. |

### On scenario 5

An earlier plan included a Smart Escrow (XLS-100) carrying the quantitative
three-limb test as WebAssembly, so that the arithmetic itself ran on-ledger.
That scenario has been dropped deliberately, for two reasons.

**It would weaken the central finding.** The result this project reports is that
ex-ante enforcement required *no* new code at the protocol layer. XRPL keeps
general smart contracts off Mainnet by design, because code executing in
consensus can endanger every participant if it is wrong. Adding a contract to a
demonstration whose point is that no contract was needed would obscure it.

**The credential model is the more faithful one.** Prudential supervision does
not recompute a firm's capital position at each transaction. A supervisor
assesses periodic evidence — audited accounts, capital returns, third-party
attestations, exactly what `complianceCheckpoint.evidence` records in
`src/rules/micaRules.ts` — and then grants or withholds permission. That
evidence is off-chain by nature and cannot be otherwise. Putting the arithmetic
on-ledger would model a supervisory process that does not exist.

Smart Escrows remain the natural vehicle for a rule whose inputs *are* on-ledger
(a reserve ratio computed from on-chain holdings, for instance), and are
discussed as future work.
