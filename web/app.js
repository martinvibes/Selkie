// Selkie web client. Talks to our own server only; the browser never holds a
// ledger token. Every number rendered here came back from a Canton contract.

const LABEL = { CC: "CC", USDCX: "USDCx", CBTC: "cBTC", CETH: "cETH" };
const $ = (id) => document.getElementById(id);

const state = { me: null, mode: "one" };

/**
 * Money should read cleanly and never jitter: always two decimals so columns
 * line up, and up to eight for small crypto amounts that would otherwise
 * round away to nothing.
 */
function money(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return "0.00";
  const small = n !== 0 && Math.abs(n) < 1;
  const text = n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: small ? 8 : 2,
  });
  // Trim only the extra precision, never the standard two decimals.
  return small ? text.replace(/(\.\d{2}\d*?[1-9])0+$/, "$1") : text;
}

const parseHandles = (text) =>
  [...new Set(String(text).split(/[\s,;]+/).map((h) => h.replace(/^@+/, "").trim()).filter(Boolean))];

async function api(path, options) {
  const res = await fetch(path, {
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (res.status === 401) return { unauthorized: true };
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? `request failed (${res.status})`);
  return body;
}

// --- rendering ---------------------------------------------------------

function renderBalances({ balances }) {
  const list = $("balances");
  const assets = state.me?.assets ?? Object.keys(balances);
  const total = assets.reduce((sum, a) => sum + Number(balances[a] ?? 0), 0);

  list.replaceChildren(
    ...assets.map((asset) => {
      const amount = Number(balances[asset] ?? 0);
      const li = document.createElement("li");
      li.className = `holding${amount === 0 ? " is-zero" : ""}`;
      li.innerHTML = `
        <span class="holding-asset">${LABEL[asset] ?? asset}</span>
        <span class="holding-amount num">${money(amount)}</span>`;
      return li;
    }),
  );
  $("emptyState").hidden = total > 0;
}

function renderFeed({ entries }) {
  const feed = $("feed");
  $("feedEmpty").hidden = entries.length > 0;
  feed.replaceChildren(
    ...entries.map((e) => {
      const li = document.createElement("li");
      li.className = `event is-${e.direction}`;
      const who = e.direction === "in" ? `from ${e.from}` : `to ${e.to}`;
      const badge = e.direction === "out" && e.onboarded ? `<span class="event-new">new wallet</span>` : "";
      li.innerHTML = `
        <span class="event-dir">${e.direction === "in" ? "↓" : "↑"}</span>
        <span class="event-amount">${money(e.amount)}</span>
        <span class="holding-asset">${LABEL[e.asset] ?? e.asset}</span>
        <span class="event-who">${who}</span>
        ${badge}
        ${e.memo ? `<span class="event-memo">${e.memo}</span>` : ""}`;
      return li;
    }),
  );
}

function showReceipt(html) {
  const receipt = $("receipt");
  receipt.innerHTML = html;
  receipt.hidden = false;
  receipt.scrollIntoView({ behavior: "smooth", block: "nearest" });
}

function sentReceipt(result) {
  const amount = `<span class="receipt-amount">${money(result.amount)} ${LABEL[result.asset] ?? result.asset}</span>`;
  const note = result.onboarded
    ? `${result.to} had no wallet. Selkie made one, and the money is already theirs.`
    : `Settled on Canton. The amount stays between you two.`;
  showReceipt(
    `<p class="receipt-line">Sent ${amount} to <strong>${result.to}</strong>.</p>
     <p class="receipt-note">${note}</p>`,
  );
}

function campaignReceipt(result, asset, amountEach) {
  const failed = result.failed.length;
  const stats = [
    ["paid", result.paid],
    ["onboarded", result.onboarded],
    ["unclaimed", failed],
  ]
    .map(
      ([label, value]) =>
        `<div><span class="stat-num">${value}</span><span class="stat-label">${label}</span></div>`,
    )
    .join("");
  const trouble = failed
    ? `<p class="receipt-note">${result.failed.map((f) => `${f.handle}: ${f.error}`).join(" · ")}</p>`
    : `<p class="receipt-note">Every winner was paid ${money(amountEach)} ${LABEL[asset] ?? asset}. Nobody had to claim anything.</p>`;
  showReceipt(`<ul class="receipt-stats">${stats}</ul>${trouble}`);
}

// --- actions -----------------------------------------------------------

async function refresh() {
  const [balance, history] = await Promise.all([api("/api/balance"), api("/api/history")]);
  renderBalances(balance);
  renderFeed(history);
}

function setMode(mode) {
  state.mode = mode;
  const many = mode === "many";
  $("modeOne").classList.toggle("is-active", !many);
  $("modeMany").classList.toggle("is-active", many);
  $("modeOne").setAttribute("aria-selected", String(!many));
  $("modeMany").setAttribute("aria-selected", String(many));
  $("fieldOne").hidden = many;
  $("fieldMany").hidden = !many;
  $("amountEach").hidden = !many;
  $("sendBtn").textContent = many ? "Pay everyone" : "Send";
}

async function submit(event) {
  event.preventDefault();
  const button = $("sendBtn");
  const error = $("formError");
  const asset = $("asset").value;
  const amount = Number($("amount").value);
  const memo = $("memo").value.trim();
  const many = state.mode === "many";
  const winners = parseHandles($("toMany").value);
  const to = $("toHandle").value.replace(/^@+/, "").trim();

  error.hidden = true;
  if (many ? winners.length === 0 : !to) {
    error.textContent = many ? "Add at least one winner." : "Who are you sending to?";
    error.hidden = false;
    return;
  }
  if (!(amount > 0)) {
    error.textContent = "Enter an amount greater than zero.";
    error.hidden = false;
    return;
  }

  const label = button.textContent;
  button.disabled = true;
  button.textContent = many ? `Paying ${winners.length}…` : "Sending…";

  try {
    if (many) {
      const result = await api("/api/campaign", {
        method: "POST",
        body: JSON.stringify({ winners, asset, amountEach: amount, memo: memo || "reward" }),
      });
      campaignReceipt(result, asset, amount);
      $("toMany").value = "";
    } else {
      const result = await api("/api/send", {
        method: "POST",
        body: JSON.stringify({ to, asset, amount, memo }),
      });
      sentReceipt(result);
      $("toHandle").value = "";
    }
    $("amount").value = "";
    $("memo").value = "";
    await refresh();
  } catch (err) {
    error.textContent = err.message;
    error.hidden = false;
  } finally {
    button.disabled = false;
    button.textContent = label;
  }
}

// --- boot --------------------------------------------------------------

function showLanding() {
  $("landing").hidden = false;
  // The thesis animates the idea: a handle, and value surfacing beneath it.
  const target = 0.75;
  const el = $("thesisNum");
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    el.textContent = target.toFixed(2);
    return;
  }
  const start = performance.now();
  const tick = (now) => {
    const t = Math.min((now - start - 700) / 1100, 1);
    if (t > 0) el.textContent = (target * (1 - Math.pow(1 - t, 3))).toFixed(2);
    if (t < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function boot() {
  const me = await api("/api/me");
  if (me.unauthorized) return showLanding();

  state.me = me;
  $("app").hidden = false;
  $("meHandle").textContent = me.handle;
  $("bigHandle").textContent = me.handle;
  document.title = `${me.handle} · Selkie`;

  $("asset").replaceChildren(
    ...me.assets.map((asset) => {
      const option = document.createElement("option");
      option.value = asset;
      option.textContent = LABEL[asset] ?? asset;
      return option;
    }),
  );

  $("modeOne").addEventListener("click", () => setMode("one"));
  $("modeMany").addEventListener("click", () => setMode("many"));
  $("sendForm").addEventListener("submit", submit);
  $("toMany").addEventListener("input", (e) => {
    $("winnerCount").textContent = String(parseHandles(e.target.value).length);
  });

  await refresh();
}

boot().catch((err) => {
  console.error(err);
  showLanding();
  $("loginHint").textContent = `Can't reach the wallet service: ${err.message}`;
});
