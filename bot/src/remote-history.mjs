// A History that lives on another host.
//
// The bot settles payments on Canton from this machine, but the web dashboard
// reads its activity log on the server (Railway) — a different filesystem. So
// instead of writing a local file the browser can never reach, we POST each
// entry to the server's authenticated ingest endpoint. The entry then lands in
// the same store /api/history and /api/tx/:id read from, so a pay-from-X
// transfer shows in the feed and earns a shareable receipt.
//
// append() never throws: a payment that already settled on-ledger must not be
// undone by a logging blip. On failure it logs and returns { id: null }, and
// the caller simply omits the receipt link.

export class RemoteHistory {
  /**
   * @param {object} cfg
   * @param {string} cfg.apiUrl  - server base, e.g. https://selkie-api-production.up.railway.app
   * @param {string} cfg.secret  - shared ingest secret (SELKIE_INGEST_SECRET)
   * @param {(msg: string) => void} [cfg.log]
   */
  constructor({ apiUrl, secret, log = console.log }) {
    this.url = `${String(apiUrl).replace(/\/+$/, "")}/api/ingest`;
    this.secret = secret;
    this.log = log;
  }

  async append(entry) {
    try {
      const res = await fetch(this.url, {
        method: "POST",
        headers: { "content-type": "application/json", "x-ingest-secret": this.secret },
        body: JSON.stringify(entry),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error ?? `ingest ${res.status}`);
      return { id: json.id ?? null };
    } catch (err) {
      this.log(`history ingest failed: ${err.message}`);
      return { id: null };
    }
  }

  // The X surface never serves history in public (it points people to their
  // wallet), so these exist only to satisfy the History interface.
  async forHandle() {
    return [];
  }
  async find() {
    return null;
  }
  async all() {
    return [];
  }
}
