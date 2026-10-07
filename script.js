// My Wallet — all the app logic lives in this file.
const KEY = 'mywallet.v1';
const $ = s => document.querySelector(s);
const pad = n => String(n).padStart(2, '0');
const iso = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const sum = a => a.reduce((x, y) => x + y, 0);
const monthId = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
const monthName = id => new Date(id.slice(0, 4), id.slice(5, 7) - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
const nextId = id => monthId(new Date(id.slice(0, 4), +id.slice(5, 7), 1));
const showDate = d => d.split('-').reverse().join('/');

// ---------- Data (kept in localStorage) ----------
// frozen: [{id,name,amount}]  months: [{id:'2026-10', start, tx:[...]}]
// tx: {id,ts,date,type:'in'|'out'|'tf', amount, motive, dir:'toActive'|'toFrozen', loc, locName}
function fresh() { return { currency: 'DA', frozen: [], months: [] }; }
function load() { try { const s = JSON.parse(localStorage.getItem(KEY)); if (s && Array.isArray(s.months) && Array.isArray(s.frozen)) return s; } catch (e) {} return fresh(); }
let S = load();
const save = () => localStorage.setItem(KEY, JSON.stringify(S));
const fmt = n => (Math.round(n * 100) / 100).toLocaleString('en-US') + ' ' + S.currency;

// ---------- Money maths ----------
const delta = t => t.type === 'in' ? t.amount : t.type === 'out' ? (t.loc ? 0 : -t.amount) : (t.dir === 'toActive' ? t.amount : -t.amount);
const active = m => m.start + sum(m.tx.map(delta));            // Active = start + entrées - sorties +/- transfers
const frozenTotal = () => sum(S.frozen.filter(f => !f.excluded).map(f => f.amount));   // excluded locations are not counted
const excludedTotal = () => sum(S.frozen.filter(f => f.excluded).map(f => f.amount));
const cur = () => S.months[S.months.length - 1];
const byDate = (a, b) => b.date.localeCompare(a.date) || b.ts - a.ts;

// ---------- Screens ----------
let view = 'home', pick = null;   // pick = month id opened from History
function render() {
  const v = { home: homeV, stats: statsV, frozen: frozenV, history: pick ? monthV : historyV, settings: settingsV }[view];
  $('#app').innerHTML = v();
  const tab = view === 'frozen' ? 'home' : view;
  $('#nav').innerHTML = [['home', '🏠', 'Home'], ['stats', '📊', 'Stats'], ['history', '📋', 'History'], ['settings', '⚙️', 'Settings']]
    .map(([k, i, l]) => `<button data-act="nav" data-v="${k}" class="${k === tab ? 'on' : ''}"><span>${i}</span>${l}</button>`).join('');
}
function txRow(t, canEdit) {
  const sym = t.type === 'in' ? '↑' : t.type === 'out' ? '↓' : '⇄';
  const title = t.type === 'tf' ? (t.dir === 'toActive' ? `${esc(t.locName)} → Active` : `Active → ${esc(t.locName)}`) : esc(t.motive || (t.type === 'in' ? 'Entrée' : 'Sortie'));
  const label = (t.type === 'in' ? 'Entrée' : t.type === 'out' ? 'Sortie' : 'Transfer') + (t.type === 'out' && t.loc ? ' · 🔒 ' + esc(t.locName) : '');
  const sign = t.type === 'in' ? '+' : t.type === 'out' ? '-' : '';
  return `<button class="row" ${canEdit ? `data-act="tx" data-id="${t.id}"` : ''}><span class="ic ${t.type}">${sym}</span><div><b>${title}</b><small>${showDate(t.date)} · ${label}</small></div><b class="${t.type}">${sign}${fmt(t.amount)}</b></button>`;
}
function homeV() {
  const m = cur();
  if (!m) return `<div class="top"><h1>My Wallet</h1></div><div class="card"><b>Welcome 👋</b><p class="muted">Set the Active money you start with for ${monthName(monthId(new Date()))}.</p>
    <label>Starting Active amount (${S.currency})<input id="st" type="number" inputmode="decimal" min="0"></label><button class="btn main" data-act="first">Start my budget</button></div>
    <div class="card frozen"><small>TOTAL FROZEN</small><div class="big">${fmt(frozenTotal())}</div>${exNote()}<button class="ghost" data-act="go" data-v="frozen">Manage Frozen</button></div>`;
  const a = active(m), now = monthId(new Date());
  const recent = [...m.tx].sort(byDate).slice(0, 5);
  return `<div class="top"><div><small>Current month</small><h1>${monthName(m.id)}</h1></div><button class="pill" data-act="newmonth">＋ New month</button></div>
  ${m.id < now ? `<div class="card"><b>It is now ${monthName(now)}.</b><button class="btn main" data-act="newmonth" data-m="${now}">Start ${monthName(now)} budget</button></div>` : ''}
  <div class="card active"><small>ACTIVE BALANCE</small><div class="big ${a < 0 ? 'neg' : ''}">${fmt(a)}</div></div>
  <div class="card frozen"><small>TOTAL FROZEN</small><div class="big">${fmt(frozenTotal())}</div>${exNote()}<button class="ghost" data-act="go" data-v="frozen">Manage Frozen</button></div>
  <div class="btns"><button class="btn" data-act="add"><span>➕</span>Add Money</button><button class="btn" data-act="spend"><span>➖</span>Spend Money</button><button class="btn" data-act="transfer"><span>⇄</span>Transfer Money</button></div>
  <h2>Recent transactions</h2>${recent.length ? recent.map(t => txRow(t, true)).join('') : '<p class="muted">Nothing yet this month.</p>'}`;
}
function frozenV() {
  return `<div class="top"><div><small>Frozen money</small><h1>Total ${fmt(frozenTotal())}</h1>${exNote()}</div><button class="pill" data-act="go" data-v="home">‹ Home</button></div>
  ${S.frozen.map(f => `<div class="row zr ${f.excluded ? 'exc' : ''}"><span class="ic tf">${f.excluded ? '🚫' : '🔒'}</span><button class="lnk" data-act="editf" data-id="${f.id}"><b>${esc(f.name)}</b><small>${f.excluded ? 'Not counted in total' : 'Counted in total'}</small></button><b>${fmt(f.amount)}</b><button class="tog" data-act="togf" data-id="${f.id}">${f.excluded ? '🚫 Excluded' : 'Included ✓'}</button></div>`).join('') || '<p class="muted">No frozen locations yet.</p>'}
  <button class="btn main" data-act="addf">＋ Add location</button>`;
}
function historyV() {
  const list = [...S.months].reverse();
  return `<div class="top"><h1>History</h1><button class="pill" data-act="newmonth">＋ New month</button></div>` +
    (list.map(m => `<button class="row" data-act="month" data-id="${m.id}"><span class="ic">📅</span><div><b>${monthName(m.id)}</b><small>${m.tx.length} transaction${m.tx.length === 1 ? '' : 's'}${m === cur() ? ' · current' : ''}</small></div><b>${fmt(active(m))}</b></button>`).join('') || '<p class="muted">No months yet.</p>');
}
function monthV() {
  const m = S.months.find(x => x.id === pick), isCur = m === cur();
  return `<div class="top"><div><small>${isCur ? 'Current month' : 'Past month'}</small><h1>${monthName(m.id)}</h1></div><button class="pill" data-act="nav" data-v="history">‹ Back</button></div>
  <div class="card"><div class="row" style="background:none;padding:0;margin:0 0 8px;grid-template-columns:1fr auto"><span>Starting Active</span><b>${fmt(m.start)}</b></div>
  <div class="row" style="background:none;padding:0;margin:0;grid-template-columns:1fr auto"><span>Active balance</span><b>${fmt(active(m))}</b></div></div>
  <h2>Transactions</h2>${m.tx.length ? [...m.tx].sort(byDate).map(t => txRow(t, true)).join('') : '<p class="muted">No transactions.</p>'}`;
}
function settingsV() {
  return `<div class="top"><h1>Settings</h1></div>
  <div class="card"><label>Currency<input id="cur" value="${esc(S.currency)}" maxlength="6"></label><button class="btn main" data-act="savecur">Save currency</button></div>
  <div class="card"><b>Your data</b><p class="muted">Everything stays on this device. Export a backup from time to time.</p>
  <button class="ghost" data-act="export">Export data</button>
  <label class="ghost" style="cursor:pointer">Import data<input id="imp" type="file" accept=".json,application/json" hidden></label>
  <button class="danger" data-act="reset">Reset all data</button></div>`;
}

// ---------- Statistics (Spending = every Sortie, from Active or Frozen) ----------
const firstOf = (y, m) => iso(new Date(y, m, 1));
let rng = null;   // [from, to] chosen on the Stats screen
function preset(k) {
  const n = new Date(), y = n.getFullYear(), m = n.getMonth(), t = iso(n);
  const all = S.months.flatMap(x => x.tx.map(q => q.date)).sort();
  return { month: [firstOf(y, m), t], last: [firstOf(y, m - 1), iso(new Date(y, m, 0))], three: [firstOf(y, m - 2), t], year: [`${y}-01-01`, t], all: [all[0] || t, t] }[k];
}
function statsData(from, to) {   // dates are ISO strings, so >= and <= include both end dates
  const rows = {}; let total = 0, froz = 0, n = 0;
  for (const mo of S.months) for (const t of mo.tx) {
    if (t.type !== 'out' || t.date < from || t.date > to) continue;
    const k = t.date.slice(0, 7); rows[k] = rows[k] || { sum: 0, n: 0 };
    rows[k].sum += t.amount; rows[k].n++; total += t.amount; n++; if (t.loc) froz += t.amount;
  }
  return { rows, total, froz, n };
}
function statsV() {
  if (!rng) rng = preset('month');
  const [from, to] = rng, d = statsData(from, to), keys = [];
  for (let c = new Date(from.slice(0, 4), from.slice(5, 7) - 1, 1); iso(c) <= to; c.setMonth(c.getMonth() + 1)) keys.push(iso(c).slice(0, 7));
  const chip = (k, l) => `<button class="pill" data-act="preset" data-k="${k}">${l}</button>`;
  return `<div class="top"><h1>Spending</h1></div>
  <div class="chips">${chip('month', 'This month')}${chip('last', 'Last month')}${chip('three', 'Last 3 months')}${chip('year', 'This year')}${chip('all', 'All time')}</div>
  <div class="card dates"><label>From<input id="r-from" type="date" value="${from}"></label><label>To<input id="r-to" type="date" value="${to}"></label></div>
  <div class="card"><small>TOTAL SPENT</small><div class="big out">${fmt(d.total)}</div><small class="xs">${d.n} transaction${d.n === 1 ? '' : 's'}${d.froz ? ` · ${fmt(d.froz)} paid from Frozen` : ''}</small></div>
  <h2>By month</h2>${keys.map(k => { const r = d.rows[k] || { sum: 0, n: 0 }; return `<div class="row"><span class="ic">📅</span><div><b>${monthName(k)}</b><small>${r.n} transaction${r.n === 1 ? '' : 's'}</small></div><b class="${r.n ? 'out' : ''}">${fmt(r.sum)}</b></div>`; }).join('') || '<p class="muted">Choose a valid range.</p>'}`;
}
const exNote = () => (cur() ? `<small class="xs">Total money (Active + Frozen): ${fmt(active(cur()) + frozenTotal())}</small>` : '') +
  (S.frozen.some(f => f.excluded) ? `<small class="xs">${fmt(excludedTotal())} excluded from totals</small>` : '');
const locOpts = (sel, add = {}) => S.frozen.map(f => `<option value="${f.id}" ${f.id === sel ? 'selected' : ''}>🔒 ${esc(f.name)} (${fmt(f.amount + (add[f.id] || 0))})</option>`).join('');
const srcOpts = (sel, add) => `<option value="">💵 Active money</option>` + locOpts(sel, add);
const locHist = id => { const l = S.months.flatMap(m => m.tx).filter(t => t.loc === id).sort(byDate).slice(0, 20); return '<h2>Transactions</h2>' + (l.length ? l.map(t => txRow(t, false)).join('') : '<p class="muted">None yet.</p>'); };

// ---------- Pop-ups ----------
const openModal = h => { $('#modal').innerHTML = `<div class="sheet">${h}</div>`; $('#modal').classList.add('open'); };
const closeModal = () => { $('#modal').classList.remove('open'); $('#modal').innerHTML = ''; };
let tt;
function toast(m) { const t = $('#toast'); t.textContent = m; t.classList.add('show'); clearTimeout(tt); tt = setTimeout(() => t.classList.remove('show'), 2400); }
const done = m => { save(); closeModal(); render(); toast(m); };

function moneyModal(type) {
  if (!cur()) return toast('Start your budget first.');
  openModal(`<h2 style="margin-top:0">${type === 'in' ? 'Add Money (Entrée)' : 'Spend Money (Sortie)'}</h2>
  <label>Amount (${S.currency})<input id="f-amt" type="number" inputmode="decimal" min="0"></label>
  ${type === 'out' ? `<label>Paid from<select id="f-src">${srcOpts('')}</select></label>` : ''}
  <label>Motive<input id="f-mot" maxlength="60" placeholder="${type === 'in' ? 'e.g. Salary' : 'e.g. Coffee'}"></label>
  <label>Date<input id="f-date" type="date" value="${iso(new Date())}"></label>
  <button class="btn main" data-act="savemoney" data-t="${type}">Save</button>`);
}
function saveMoney(type) {
  const amount = +$('#f-amt').value;
  if (!(amount > 0)) return toast('Enter an amount above 0.');
  const f = type === 'out' ? S.frozen.find(x => x.id === $('#f-src').value) : null;   // paid from a Frozen location?
  if (f && amount > f.amount) return toast('Not enough money in this Frozen location.');
  if (f) f.amount -= amount;                                                         // the location stays frozen
  cur().tx.push({ id: uid(), ts: Date.now(), date: $('#f-date').value || iso(new Date()), type, amount, motive: $('#f-mot').value.trim(), ...(f ? { loc: f.id, locName: f.name } : {}) });
  done(type === 'in' ? 'Money added ✓' : 'Expense saved ✓');
}
function transferModal() {
  if (!cur()) return toast('Start your budget first.');
  if (!S.frozen.length) return toast('Add a Frozen location first.');
  openModal(`<h2 style="margin-top:0">Transfer Money</h2>
  <label>Direction<select id="t-dir"><option value="toActive">Frozen → Active</option><option value="toFrozen">Active → Frozen</option></select></label>
  <label>Frozen location<select id="t-loc">${S.frozen.map(f => `<option value="${f.id}">${esc(f.name)} (${fmt(f.amount)})</option>`).join('')}</select></label>
  <label>Amount (${S.currency})<input id="t-amt" type="number" inputmode="decimal" min="0"></label>
  <label>Date<input id="t-date" type="date" value="${iso(new Date())}"></label>
  <button class="btn main" data-act="savetf">Transfer</button>`);
}
function saveTransfer() {
  const dir = $('#t-dir').value, f = S.frozen.find(x => x.id === $('#t-loc').value), amount = +$('#t-amt').value;
  if (!(amount > 0)) return toast('Enter an amount above 0.');
  if (dir === 'toActive' && amount > f.amount) return toast('Not enough money in this Frozen location.');
  if (dir === 'toFrozen' && amount > active(cur())) return toast('Not enough Active money.');
  f.amount += dir === 'toActive' ? -amount : amount;
  cur().tx.push({ id: uid(), ts: Date.now(), date: $('#t-date').value || iso(new Date()), type: 'tf', dir, amount, loc: f.id, locName: f.name });
  done('Transfer done ✓');
}
function frozenModal(id) {
  const f = id ? S.frozen.find(x => x.id === id) : { name: '', amount: '' };
  openModal(`<h2 style="margin-top:0">${id ? 'Edit location' : 'New Frozen location'}</h2>
  <label>Name<input id="z-name" value="${esc(f.name)}" maxlength="30"></label>
  <label>Amount (${S.currency})<input id="z-amt" type="number" inputmode="decimal" min="0" value="${f.amount}"></label>
  <button class="btn main" data-act="savef" data-id="${id || ''}">Save</button>
  ${id ? locHist(id) : ''}
  ${id ? `<button class="danger" data-act="delf" data-id="${id}">Delete location</button>` : ''}`);
}
function saveFrozen(id) {
  const name = $('#z-name').value.trim(), amount = +$('#z-amt').value || 0;
  if (!name) return toast('Give the location a name.');
  if (amount < 0) return toast('Amount cannot be negative.');
  if (id) Object.assign(S.frozen.find(x => x.id === id), { name, amount }); else S.frozen.push({ id: uid(), name, amount });
  done('Saved ✓');
}
function monthModal(mid) {
  const last = cur(), id = mid || (last ? (nextId(last.id) > monthId(new Date()) ? nextId(last.id) : monthId(new Date())) : monthId(new Date()));
  openModal(`<h2 style="margin-top:0">New month budget</h2>
  <label>Month<input id="nm-m" type="month" value="${id}"></label>
  <label>Starting Active amount (${S.currency})<input id="nm-s" type="number" inputmode="decimal" min="0" value="${last ? Math.max(0, Math.round(active(last) * 100) / 100) : ''}"></label>
  <p class="muted">The new month starts with its own empty list of transactions. Previous months stay in History.</p>
  <button class="btn main" data-act="savemonth">Create month</button>`);
}
function addMonth(id, start) {
  if (!/^\d{4}-\d{2}$/.test(id)) return toast('Choose a month.');
  if (S.months.some(m => m.id === id)) return toast('That month already exists.');
  if (!(start >= 0)) return toast('Enter the starting amount.');
  S.months.push({ id, start, tx: [] }); S.months.sort((a, b) => a.id.localeCompare(b.id));
  view = 'home'; pick = null; done(monthName(id) + ' started ✓');
}
const findTx = id => { for (const m of S.months) { const t = m.tx.find(x => x.id === id); if (t) return { m, t }; } };
// Apply (+1) or undo (-1) a transaction's effect on its Frozen location. Active is always recomputed from the list.
function frozenFx(t, sign) {
  const f = S.frozen.find(x => x.id === t.loc); if (!f) return;
  if (t.type === 'out' && t.loc) f.amount -= sign * t.amount;
  if (t.type === 'tf') f.amount += sign * (t.dir === 'toFrozen' ? t.amount : -t.amount);
}
function txModal(id) {
  const { t } = findTx(id), tf = t.type === 'tf', gone = t.loc && !S.frozen.some(x => x.id === t.loc);
  const back = t.loc ? { [t.loc]: tf && t.dir === 'toFrozen' ? -t.amount : t.amount } : {};   // balance if this entry were undone
  const ghost = gone ? `<option value="${t.loc}" selected>🔒 ${esc(t.locName)} (deleted)</option>` : '';
  openModal(`<h2 style="margin-top:0">Edit ${tf ? 'transfer' : t.type === 'in' ? 'Entrée' : 'Sortie'}</h2>
  <label>Amount (${S.currency})<input id="e-amt" type="number" inputmode="decimal" min="0" value="${t.amount}"></label>
  ${tf ? `<label>Direction<select id="e-dir"><option value="toActive" ${t.dir === 'toActive' ? 'selected' : ''}>Frozen → Active</option><option value="toFrozen" ${t.dir === 'toFrozen' ? 'selected' : ''}>Active → Frozen</option></select></label>
  <label>Frozen location<select id="e-loc">${ghost}${locOpts(t.loc, back)}</select></label>`
  : `${t.type === 'out' ? `<label>Paid from<select id="e-src">${ghost}${srcOpts(t.loc || '', back)}</select></label>` : ''}
  <label>Motive<input id="e-mot" maxlength="60" value="${esc(t.motive || '')}"></label>`}
  <label>Date<input id="e-date" type="date" value="${t.date}"></label>
  <button class="btn main" data-act="saveedit" data-id="${id}">Save changes</button>
  <button class="danger" data-act="deltx" data-id="${id}">Delete transaction</button>`);
}
function saveEdit(id) {
  const { t } = findTx(id), amount = +$('#e-amt').value;
  if (!(amount > 0)) return toast('Enter an amount above 0.');
  const nt = { ...t, amount, date: $('#e-date').value || t.date };
  if (t.type !== 'tf') nt.motive = $('#e-mot').value.trim();
  if (t.type === 'tf') { nt.dir = $('#e-dir').value; nt.loc = $('#e-loc').value; }
  if (t.type === 'out') nt.loc = $('#e-src').value;
  const f = S.frozen.find(x => x.id === nt.loc); if (f) nt.locName = f.name;
  const before = S.frozen.map(x => x.amount);
  frozenFx(t, -1); frozenFx(nt, 1);          // give the old amount back, take the new one
  if (S.frozen.some(x => x.amount < -0.005)) { S.frozen.forEach((x, i) => x.amount = before[i]); return toast('Not enough money in that Frozen location.'); }
  Object.assign(t, nt);
  if (t.type !== 'tf' && !t.loc) { delete t.loc; delete t.locName; }
  done('Changes saved ✓');
}
function deleteTx(id) {
  const { m, t } = findTx(id), before = S.frozen.map(x => x.amount);
  frozenFx(t, -1);
  if (S.frozen.some(x => x.amount < -0.005)) { S.frozen.forEach((x, i) => x.amount = before[i]); return toast('Not enough in that Frozen location to undo this.'); }
  m.tx = m.tx.filter(x => x.id !== id); done('Deleted');
}

// ---------- Backup ----------
function exportData() {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(S, null, 2)], { type: 'application/json' }));
  a.download = `my-wallet-backup-${iso(new Date())}.json`; a.click(); URL.revokeObjectURL(a.href);
}
document.addEventListener('change', e => {
  if (e.target.id === 'r-from' || e.target.id === 'r-to') {
    const f = $('#r-from').value, t = $('#r-to').value;
    if (!f || !t) return;
    if (f > t) return toast('"From" must be before "To".');
    rng = [f, t]; return render();
  }
  if (e.target.id !== 'imp' || !e.target.files[0]) return;
  const r = new FileReader();
  r.onload = () => {
    try {
      const d = JSON.parse(r.result);
      if (!Array.isArray(d.months) || !Array.isArray(d.frozen)) throw 0;
      if (!confirm('Replace all current data with this backup?')) return;
      S = { currency: d.currency || 'DA', frozen: d.frozen, months: d.months }; save(); render(); toast('Data imported ✓');
    } catch (err) { toast('This file is not a valid backup.'); }
  };
  r.readAsText(e.target.files[0]); e.target.value = '';
});

// ---------- Clicks ----------
document.addEventListener('click', e => {
  if (e.target.id === 'modal') return closeModal();
  const b = e.target.closest('[data-act]'); if (!b) return;
  const id = b.dataset.id;
  ({
    nav() { view = b.dataset.v; pick = null; render(); scrollTo(0, 0); },
    go() { view = b.dataset.v; render(); scrollTo(0, 0); },
    first() { const s = +$('#st').value; if (!($('#st').value !== '' && s >= 0)) return toast('Enter the starting amount.'); addMonth(monthId(new Date()), s); },
    newmonth() { monthModal(b.dataset.m); },
    savemonth() { addMonth($('#nm-m').value, $('#nm-s').value === '' ? NaN : +$('#nm-s').value); },
    add() { moneyModal('in'); }, spend() { moneyModal('out'); },
    savemoney() { saveMoney(b.dataset.t); },
    transfer() { transferModal(); }, savetf() { saveTransfer(); },
    addf() { frozenModal(); }, editf() { frozenModal(id); }, savef() { saveFrozen(id); },
    delf() { const f = S.frozen.find(x => x.id === id); if (confirm(`Delete "${f.name}"? Total Frozen will decrease by ${fmt(f.amount)}.`)) { S.frozen = S.frozen.filter(x => x.id !== id); done('Location deleted'); } },
    month() { pick = id; render(); scrollTo(0, 0); },
    tx() { txModal(id); }, saveedit() { saveEdit(id); }, deltx() { deleteTx(id); },
    togf() { const f = S.frozen.find(x => x.id === id); f.excluded = !f.excluded; save(); render(); },
    preset() { rng = preset(b.dataset.k); render(); },
    savecur() { S.currency = $('#cur').value.trim() || 'DA'; save(); render(); toast('Currency saved ✓'); },
    export() { exportData(); },
    reset() { if (confirm('Erase ALL data on this device? This cannot be undone.')) { S = fresh(); save(); view = 'home'; pick = null; render(); toast('Data reset'); } }
  })[b.dataset.act]?.();
});

render();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('service-worker.js');
