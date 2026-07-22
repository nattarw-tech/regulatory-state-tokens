/**
 * XRPL Hooks — MiCA Compliance Gate
 * File: compliance_check.c
 *
 * PURPOSE
 * -------
 * This Hook implements the on-chain enforcement layer of the CASP Regulatory
 * Credentialing PoC. When deployed on the Xahau testnet, it intercepts every
 * outgoing Payment transaction from the CASP account and checks whether the
 * originating account holds a valid "MiCA Art.54 Capital Compliance" credential
 * (issued under the XLS-70 standard).
 *
 * If the credential is present and accepted → the transaction is allowed.
 * If the credential is absent or expired  → the transaction is REJECTED with
 * a human-readable compliance error.
 *
 * This shifts compliance from a retrospective audit (ex-post) to a mandatory
 * prerequisite for transaction finality (ex-ante) — the core thesis of the PoC.
 *
 * DEPLOYMENT
 * ----------
 * 1. Install the Hooks toolkit:
 *      https://github.com/XRPLF/hook-cleaner-c
 *      https://github.com/XRPLF/hooks-toolkit
 *
 * 2. Compile to WebAssembly:
 *      clang -I./hookapi -I./sfcodes \
 *        --target=wasm32-unknown-unknown \
 *        -DNDEBUG -O3 \
 *        -nostdlib -lc \
 *        -Wl,--no-entry,--export=hook,--export=cbak \
 *        -o compliance_check.wasm \
 *        compliance_check.c
 *
 * 3. Deploy via SetHook transaction (using xrpl.js or Hooks toolkit):
 *      See: https://xrpl-hooks.readme.io/docs/sethook
 *
 * REFERENCES
 * ----------
 * - Hooks documentation: https://xrpl-hooks.readme.io/
 * - Hook API reference:  https://xrpl-hooks.readme.io/reference
 * - XLS-30d (Hooks standard): https://github.com/XRPLF/XRPL-Standards
 * - Credential (XLS-70) object: https://xrpl.org/docs/references/protocol/ledger-data/ledger-entry-types/credential
 */

#include <stdint.h>

/* --------------------------------------------------------------------------
 * Hooks C API (provided by the Hooks runtime environment)
 * These declarations are available when compiling with the Hooks toolkit.
 * -------------------------------------------------------------------------- */

extern int32_t  hook_account    (uint32_t, uint32_t);
extern int32_t  hook_param      (uint32_t, uint32_t, uint32_t, uint32_t);
extern int32_t  otxn_field      (uint32_t, uint32_t, uint32_t);
extern int32_t  otxn_type       ();
extern int32_t  account_objects (uint32_t, uint32_t, uint32_t, uint32_t, uint32_t);
extern int64_t  accept          (uint32_t, uint32_t, int64_t);
extern int64_t  rollback        (uint32_t, uint32_t, int64_t);
extern int32_t  util_sha512h    (uint32_t, uint32_t, uint32_t, uint32_t);

/* Macro for computing byte lengths of string literals at compile time */
#define SVAR(x) x, sizeof(x)

/* --------------------------------------------------------------------------
 * MiCA Credential Type
 *
 * This is the hex-encoded form of: "MiCA_ART54_EMT_CAPITAL_COMPLIANT"
 * (32 bytes → 64 hex chars)
 *
 * Any CredentialCreate transaction using this type string will produce a
 * Credential object whose CredentialType field equals this value.
 * -------------------------------------------------------------------------- */
#define MICA_CREDENTIAL_TYPE \
    "\x4d\x69\x43\x41\x5f\x41\x52\x54\x35\x34\x5f\x45\x4d\x54\x5f" \
    "\x43\x41\x50\x49\x54\x41\x4c\x5f\x43\x4f\x4d\x50\x4c\x49\x41" \
    "\x4e\x54"
#define MICA_CREDENTIAL_TYPE_LEN 32

/* Transaction types (numeric codes used by the XRPL protocol) */
#define ttPAYMENT 0

/* Ledger entry types */
#define ltCREDENTIAL 0x0050

/* Credential flags: lsfAccepted means the subject has called CredentialAccept */
#define lsfAccepted 0x00010000

/* --------------------------------------------------------------------------
 * Hook Entry Point: hook()
 *
 * Called for every transaction that triggers this Hook (configured via SetHook).
 * Return value conventions:
 *   accept(msg, len, 0)   → transaction proceeds
 *   rollback(msg, len, 0) → transaction is rejected (not included in ledger)
 * -------------------------------------------------------------------------- */
int64_t hook(uint32_t reserved)
{
    /* -----------------------------------------------------------------------
     * 0. Only enforce on outgoing Payment transactions.
     *    Other transaction types (e.g. account setup, credential management)
     *    are allowed through unconditionally.
     * ----------------------------------------------------------------------- */
    int32_t tx_type = otxn_type();
    if (tx_type != ttPAYMENT) {
        accept(SVAR("Non-payment transaction — compliance gate not applicable"), 0);
        return 0;
    }

    /* -----------------------------------------------------------------------
     * 1. Retrieve the originating account address (20-byte AccountID).
     * ----------------------------------------------------------------------- */
    uint8_t account_id[20];
    if (hook_account((uint32_t)account_id, 20) < 20) {
        rollback(SVAR("COMPLIANCE_ERROR: Could not retrieve originating account"), 1);
        return 1;
    }

    /* -----------------------------------------------------------------------
     * 2. Query the account_objects for a Credential entry matching:
     *      - LedgerEntryType == Credential (0x0050)
     *      - CredentialType  == MICA_CREDENTIAL_TYPE
     *      - Flags           == lsfAccepted (credential has been accepted by subject)
     *
     * In the Hook runtime, account_objects() streams ledger objects for the
     * given account. We iterate until we find a matching Credential or exhaust
     * the object list.
     *
     * NOTE: In a production Hook, this would use the slot API to inspect
     * individual field values. The pseudocode below illustrates the logic;
     * the full slot-based implementation requires the complete Hook toolkit.
     * ----------------------------------------------------------------------- */

    /*
     * Pseudocode (slot-based API):
     *
     *   int slot_no = 0;
     *   while (slot_no >= 0) {
     *     slot_no = account_objects(account_id, 20, ltCREDENTIAL, slot_no, 1);
     *     if (slot_no < 0) break;  // no more objects
     *
     *     // Read CredentialType field from the current object
     *     uint8_t cred_type[64];
     *     int cred_type_len = slot_subfield(slot_no, sfCredentialType, cred_type, 64);
     *
     *     // Read Flags field
     *     uint32_t flags = 0;
     *     slot_subfield(slot_no, sfFlags, &flags, 4);
     *
     *     // Check: is this the MiCA Art.54 credential, and is it accepted?
     *     if (cred_type_len == MICA_CREDENTIAL_TYPE_LEN &&
     *         memcmp(cred_type, MICA_CREDENTIAL_TYPE, MICA_CREDENTIAL_TYPE_LEN) == 0 &&
     *         (flags & lsfAccepted) != 0) {
     *
     *         accept("MiCA_ART54_COMPLIANT: Credential verified on-chain", 50, 0);
     *         return 0;  // ALLOW the transaction
     *     }
     *   }
     *
     *   // No matching credential found → reject the transaction
     *   rollback("COMPLIANCE_BLOCK: MiCA Art.54 credential required. "
     *            "Contact your National Competent Authority.", 90, 1);
     *   return 1;
     */

    /* -----------------------------------------------------------------------
     * 3. For this PoC reference implementation, we demonstrate the decision
     *    logic clearly. A fully compiled Hook would use the slot API above.
     * ----------------------------------------------------------------------- */

    /* Placeholder: assume credential check result is stored in found_credential */
    int found_credential = 0;  /* In real Hook: set by the loop above */

    if (found_credential) {
        accept(
            SVAR("COMPLIANCE_OK: MiCA Art.54 EMT Capital credential verified on-chain."),
            0
        );
    } else {
        rollback(
            SVAR("COMPLIANCE_BLOCK: MiCA Art.54 EMT Capital credential required. "
                 "This account has not been credentialed by an authorised regulator. "
                 "Please contact your National Competent Authority to complete the "
                 "registration process under MiCA Regulation (EU) 2023/1114, Art.54."),
            1
        );
    }

    return 0;
}

/* --------------------------------------------------------------------------
 * Callback Entry Point: cbak()
 *
 * Called when a transaction emitted BY this Hook is validated (success or fail).
 * This Hook does not emit transactions, so cbak is a no-op.
 * -------------------------------------------------------------------------- */
int64_t cbak(uint32_t reserved)
{
    accept(SVAR("cbak: no emitted transactions to handle"), 0);
    return 0;
}
