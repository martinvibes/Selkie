// Activity log. Every entry is written only after the ledger has accepted the
// transaction, so this file is a readable index of real Canton state changes,
// never a source of truth in its own right. Balances always come from the
// ledger; this is here because archived contracts fall out of the active
// contract set and users still want to see what happened.

import { appendFile, readFile, mkdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { dirname } from "node:path";

export class History {
  constructor(path) {
    this.path = path;
  }

  async append(entry) {
    const row = { id: randomUUID(), ts: new Date().toISOString(), ...entry };
    await mkdir(dirname(this.path), { recursive: true });
    await appendFile(this.path, JSON.stringify(row) + "\n");
    return row;
  }

  async all() {
    try {
      const text = await readFile(this.path, "utf8");
      return text
        .split("\n")
        .filter(Boolean)
        .map((line) => {
          try {
            return JSON.parse(line);
          } catch {
            return null;
          }
        })
        .filter(Boolean);
    } catch (err) {
      if (err.code === "ENOENT") return [];
      throw err;
    }
  }

  async find(id) {
    return (await this.all()).find((r) => r.id === id) ?? null;
  }

  /** Newest first, only what this handle took part in. */
  async forHandle(handle, limit = 50) {
    const h = handle.toLowerCase();
    const rows = await this.all();
    return rows
      .filter((r) => String(r.from).toLowerCase() === h || String(r.to).toLowerCase() === h)
      .reverse()
      .slice(0, limit)
      .map((r) => ({ ...r, direction: String(r.from).toLowerCase() === h ? "out" : "in" }));
  }
}
