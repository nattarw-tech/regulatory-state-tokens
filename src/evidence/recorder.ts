/**
 * Evidence recorder.
 *
 * The project's assessment guidance is explicit that a submission "will not be
 * accepted unless supported by such evidence", and testnets are periodically
 * reset — so the moment a transaction validates is the only reliable moment to
 * capture it. This module records every submission as it happens and writes the
 * result to disk, rather than leaving hashes to be transcribed by hand from a
 * terminal afterwards.
 *
 * It emits two artefacts:
 *
 *   evidence.json  — machine-readable, for reproducibility
 *   demo-report.html — a single page with clickable explorer links, suitable
 *                      for opening in front of an examiner
 */

import { writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { XRPL_TESTNET } from "../config";

export interface EvidenceRecord {
  act: string;
  step: string;
  transactionType: string;
  result: string;
  settled: boolean | null;
  hash: string;
  explorerUrl: string;
  note: string;
  recordedAt: string;
}

export interface RunMetadata {
  network: string;
  wsUrl: string;
  serverVersion: string;
  ledgerAtStart: number;
  startedAt: string;
}

export class EvidenceRecorder {
  private records: EvidenceRecord[] = [];
  private accounts: Record<string, string> = {};
  private metadata: RunMetadata | null = null;

  setMetadata(meta: RunMetadata): void {
    this.metadata = meta;
  }

  noteAccount(role: string, address: string): void {
    this.accounts[role] = address;
  }

  record(entry: Omit<EvidenceRecord, "explorerUrl" | "recordedAt">): void {
    this.records.push({
      ...entry,
      explorerUrl: `${XRPL_TESTNET.explorer}/transactions/${entry.hash}`,
      recordedAt: new Date().toISOString(),
    });
  }

  get all(): EvidenceRecord[] {
    return this.records;
  }

  /** Writes both artefacts into `dir`, creating it if needed. */
  write(dir: string): { json: string; html: string } {
    mkdirSync(dir, { recursive: true });

    const jsonPath = join(dir, "evidence.json");
    writeFileSync(
      jsonPath,
      JSON.stringify(
        { metadata: this.metadata, accounts: this.accounts, transactions: this.records },
        null,
        2
      ),
      "utf8"
    );

    const htmlPath = join(dir, "demo-report.html");
    writeFileSync(htmlPath, this.renderHtml(), "utf8");

    return { json: jsonPath, html: htmlPath };
  }

  /* ─── Report ────────────────────────────────────────────────────────────── */

  private renderHtml(): string {
    const acts = [...new Set(this.records.map((r) => r.act))];

    const accountRows = Object.entries(this.accounts)
      .map(
        ([role, address]) => `
        <tr>
          <td class="role">${esc(role)}</td>
          <td><code><a href="${XRPL_TESTNET.explorer}/accounts/${esc(address)}"
             target="_blank" rel="noopener">${esc(address)}</a></code></td>
        </tr>`
      )
      .join("");

    const actSections = acts
      .map((act) => {
        const rows = this.records
          .filter((r) => r.act === act)
          .map(
            (r) => `
          <tr class="${r.settled === false ? "refused" : r.settled === true ? "settled" : ""}">
            <td>${esc(r.step)}</td>
            <td><code>${esc(r.transactionType)}</code></td>
            <td><span class="code ${codeClass(r.result)}">${esc(r.result)}</span></td>
            <td class="note">${esc(r.note)}</td>
            <td><a href="${esc(r.explorerUrl)}" target="_blank" rel="noopener"
               title="${esc(r.hash)}">${esc(r.hash.slice(0, 10))}…</a></td>
          </tr>`
          )
          .join("");

        return `
      <section>
        <h2>${esc(act)}</h2>
        <table>
          <thead>
            <tr><th>Step</th><th>Transaction</th><th>Result</th><th>What happened</th><th>Explorer</th></tr>
          </thead>
          <tbody>${rows}</tbody>
        </table>
      </section>`;
      })
      .join("");

    const settledCount = this.records.filter((r) => r.settled === true).length;
    const refusedCount = this.records.filter((r) => r.settled === false).length;

    return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Regulation as Ledger State — demonstration record</title>
<style>
  :root {
    --bg: #ffffff; --fg: #1a1a1a; --muted: #5f5f5c; --line: #e2e0d9;
    --panel: #faf9f6; --ok: #2c6e49; --no: #a32d2d; --okbg: #eaf3de; --nobg: #fceaea;
  }
  @media (prefers-color-scheme: dark) {
    :root {
      --bg: #161614; --fg: #ececea; --muted: #a3a29c; --line: #34332f;
      --panel: #1f1f1c; --ok: #97c459; --no: #f09595; --okbg: #24301a; --nobg: #351b1b;
    }
  }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 2.5rem 1.25rem 4rem; background: var(--bg); color: var(--fg);
    font: 15px/1.6 ui-sans-serif, -apple-system, "Segoe UI", system-ui, sans-serif;
  }
  main { max-width: 1000px; margin: 0 auto; }
  h1 { font-size: 1.65rem; margin: 0 0 .35rem; letter-spacing: -0.01em; }
  .sub { color: var(--muted); margin: 0 0 2rem; }
  h2 {
    font-size: 1.05rem; margin: 2.25rem 0 .75rem; padding-bottom: .4rem;
    border-bottom: 1px solid var(--line);
  }
  table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
  th {
    text-align: left; font-weight: 600; color: var(--muted); padding: .5rem .6rem;
    border-bottom: 1px solid var(--line); font-size: 12px;
    text-transform: uppercase; letter-spacing: .04em;
  }
  td { padding: .6rem; border-bottom: 1px solid var(--line); vertical-align: top; }
  td.note { color: var(--muted); max-width: 30ch; }
  td.role { font-weight: 600; white-space: nowrap; }
  code { font: 12.5px ui-monospace, "Cascadia Code", Menlo, monospace; }
  a { color: inherit; text-decoration: underline; text-underline-offset: 2px; }
  a:hover { opacity: .7; }
  .code {
    display: inline-block; padding: .1rem .45rem; border-radius: 4px;
    font: 12px ui-monospace, Menlo, monospace; white-space: nowrap;
  }
  .code.pass { background: var(--okbg); color: var(--ok); }
  .code.fail { background: var(--nobg); color: var(--no); }
  .panel {
    background: var(--panel); border: 1px solid var(--line); border-radius: 8px;
    padding: 1rem 1.25rem; margin: 1.5rem 0;
  }
  .panel p { margin: .5rem 0; }
  .tally { display: flex; gap: 2rem; margin: 1.25rem 0 0; flex-wrap: wrap; }
  .tally div { }
  .tally b { display: block; font-size: 1.5rem; line-height: 1.2; }
  .tally span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .04em; }
  footer { margin-top: 3rem; padding-top: 1rem; border-top: 1px solid var(--line); color: var(--muted); font-size: 12.5px; }
  .scroll { overflow-x: auto; }
</style>
</head>
<body>
<main>
  <h1>Regulation as Ledger State</h1>
  <p class="sub">Demonstration record · ${esc(this.metadata?.network ?? "XRPL Testnet")} · ${esc(
      this.metadata?.startedAt ?? new Date().toISOString()
    )}</p>

  <div class="panel">
    <p><strong>What this records.</strong> Every row below is a real transaction on a
    public ledger. Follow any explorer link to verify it independently — the
    outcomes were produced by the network's own consensus rules, not by this
    program.</p>
    <p><strong>The claim being tested.</strong> That a regulatory obligation can be
    enforced <em>before</em> a transaction settles, rather than audited after it
    has. Refused payments below did not settle and were not reversed; they never
    executed at all.</p>
    <div class="tally">
      <div><b>${settledCount}</b><span>settled</span></div>
      <div><b>${refusedCount}</b><span>refused pre-settlement</span></div>
      <div><b>0</b><span>smart contracts deployed</span></div>
    </div>
  </div>

  <section>
    <h2>Accounts</h2>
    <div class="scroll"><table><tbody>${accountRows}</tbody></table></div>
  </section>

  <div class="scroll">${actSections}</div>

  <footer>
    <p>Server ${esc(this.metadata?.serverVersion ?? "—")}, validated ledger
    ${this.metadata?.ledgerAtStart ?? "—"} at start.
    Regenerate with <code>npm run demo</code>.</p>
    <p>Testnet transactions become unretrievable after a network reset. Where a
    link has expired, the hash and result code recorded here remain the primary
    evidence.</p>
  </footer>
</main>
</body>
</html>`;
  }
}

/* ─── helpers ─────────────────────────────────────────────────────────────── */

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function codeClass(result: string): string {
  return result === "tesSUCCESS" ? "pass" : "fail";
}
