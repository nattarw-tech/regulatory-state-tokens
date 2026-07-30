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
| 3 — RULE UPDATE (`NFTokenModify`) | Not yet run |
| 4 — REVOCATION / LAPSE | Not yet run |
| 5 — THRESHOLD (Smart Escrow, Devnet) | Not yet run — stretch scope |
