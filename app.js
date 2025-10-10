// 15funs — zero-backend picker with “no recent repeats” memory.
// Data format: CSV or JSON (see README). State is stored in localStorage.
// MIT License.

const els = {
  layout: document.getElementById('layout'),
  dataUrl: document.getElementById('dataUrl'),
  reloadBtn: document.getElementById('reloadBtn'),
  avoidDays: document.getElementById('avoidDays'),
  avoidCount: document.getElementById('avoidCount'),
  categoryFilter: document.getElementById('categoryFilter'),
  needFilter: document.getElementById('needFilter'),
  maxDuration: document.getElementById('maxDuration'),
  hideRecentlySeen: document.getElementById('hideRecentlySeen'),
  resetBtn: document.getElementById('resetBtn'),
  drawBtn: document.getElementById('drawBtn'),
  skipBtn: document.getElementById('skipBtn'),
  undoBtn: document.getElementById('undoBtn'),
  doneBtn: document.getElementById('doneBtn'),
  cardBody: document.getElementById('cardBody'),
  ideasList: document.getElementById('ideasList'),
  counts: document.getElementById('counts'),
  libraryPanel: document.getElementById('libraryPanel'),
  showLibraryBtn: document.getElementById('showLibraryBtn'),
  hideLibraryBtn: document.getElementById('hideLibraryBtn'),
  libraryStatus: document.getElementById('libraryStatus'),
};

const STORAGE_KEY = '15funs.v1.state';
const DEFAULTS = { avoidDays: 7, avoidCount: 10, maxDuration: 15, dataUrl: 'data/ideas.csv' };

let state = loadState();
let dataset = [];          // {id, title, desc, category, need, duration, energy}
let deck = [];             // array of idea ids in draw order (we rebuild as needed)
let deckPtr = -1;          // points at last shown index
let current = null;        // current idea object
let currentWasCommitted = false;

init().catch(err => showError(err));

async function init() {
  // populate form with saved settings
  els.dataUrl.value = state.dataUrl ?? DEFAULTS.dataUrl;
  els.avoidDays.value = state.avoidDays ?? DEFAULTS.avoidDays;
  els.avoidCount.value = state.avoidCount ?? DEFAULTS.avoidCount;
  els.maxDuration.value = state.maxDuration ?? DEFAULTS.maxDuration;

  // wire events
  els.reloadBtn.onclick = reloadData;
  els.dataUrl.onchange = persistSettings;
  [els.avoidDays, els.avoidCount, els.maxDuration].forEach(el => el.onchange = settingsChanged);
  [els.categoryFilter, els.needFilter, els.hideRecentlySeen].forEach(el => el.onchange = filtersChanged);
  els.resetBtn.onclick = resetHistory;
  els.drawBtn.onclick = () => draw({commit:true});
  els.skipBtn.onclick = () => draw({commit:false});  // peek new idea without adding to recent
  els.undoBtn.onclick = undoLast;
  els.doneBtn.onclick = markDone;
  els.showLibraryBtn.onclick = showLibrary;
  els.hideLibraryBtn.onclick = hideLibrary;
  els.libraryPanel.addEventListener('keydown', evt => {
    if (evt.key === 'Escape') {
      evt.preventDefault();
      hideLibrary();
    }
  });

  await reloadData();
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { history: [], settingsVersion: 1 };
    return JSON.parse(raw);
  } catch {
    return { history: [], settingsVersion: 1 };
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function persistSettings() {
  state.dataUrl = els.dataUrl.value.trim();
  state.avoidDays = int(els.avoidDays.value, DEFAULTS.avoidDays);
  state.avoidCount = int(els.avoidCount.value, DEFAULTS.avoidCount);
  state.maxDuration = int(els.maxDuration.value, DEFAULTS.maxDuration);
  saveState();
}
function settingsChanged() { persistSettings(); rebuildDeck(); renderList(); }
function filtersChanged()   { renderList(); }

async function reloadData() {
  persistSettings();
  try {
    const ideas = await fetchIdeas(state.dataUrl);
    dataset = ideas;
    indexById(dataset);
    populateFilters(dataset);
    rebuildDeck(/*resetPtr=*/true);
    renderList();
    renderCard(null);
    enableControls();
  } catch (e) {
    showError(e);
  }
}

function showError(e) {
  console.error(e);
  els.cardBody.innerHTML = `<p class="hint">Couldn’t load ideas.<br><small>${escapeHtml(String(e.message || e))}</small></p>`;
}

async function fetchIdeas(url) {
  const res = await fetch(url + (url.includes('?') ? '&' : '?') + '_ts=' + Date.now());
  if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${url}`);
  const text = await res.text();
  const lowered = url.toLowerCase();
  if (lowered.endsWith('.json')) {
    const arr = JSON.parse(text);
    return normalize(arr);
  } else {
    const rows = parseCSV(text);
    return normalize(csvRowsToObjects(rows));
  }
}

// --- CSV parsing (minimal but handles quoted cells & commas) ---
function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', i = 0, q = false;
  while (i < text.length) {
    const c = text[i];
    if (q) {
      if (c === '"') {
        if (text[i+1] === '"') { cell += '"'; i++; } // escaped quote
        else q = false;
      } else cell += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { row.push(cell); cell=''; }
      else if (c === '\n') { row.push(cell); rows.push(row); row=[]; cell=''; }
      else if (c === '\r') {/* swallow */}
      else cell += c;
    }
    i++;
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x && x.trim().length));
}
function csvRowsToObjects(rows) {
  if (!rows.length) return [];
  const header = rows[0].map(h => h.trim());
  return rows.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

// --- Normalize data into known shape ---
function normalize(arr) {
  // Expected fields (case-insensitive): id?, title, desc?, category?, need?, duration?, energy?
  return arr.map(x => {
    const obj = Object.fromEntries(Object.entries(x).map(([k,v]) => [k.toLowerCase().trim(), v]));
    const title = obj.title ?? obj.idea ?? obj.name ?? '';
    const desc  = obj.desc ?? obj.description ?? '';
    const category = obj.category ?? '';
    const need = obj.need ?? '';
    const duration = obj.duration ?? obj.minutes ?? '15';
    const energy = obj.energy ?? '';
    const id = obj.id || makeId(`${title}|${desc}|${category}|${need}|${duration}|${energy}`);
    return {
      id, title: title || '(untitled)', desc, category, need,
      duration: clamp(int(duration, 15), 1, 240), energy
    };
  });
}
function indexById(list){
  // No-op, but could build a map if needed. Keeping simple.
}
function makeId(str){
  // djb2 hash → base36
  let h = 5381;
  for (let i=0;i<str.length;i++) h = ((h<<5)+h) + str.charCodeAt(i);
  return 'i' + (h >>> 0).toString(36);
}
function int(v, def){ v = Number.parseInt(v,10); return Number.isFinite(v) ? v : def; }
function clamp(n, min, max){ return Math.max(min, Math.min(max, n)); }
function escapeHtml(s){ return s.replace(/[&<>"']/g, m => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// --- Deck + history logic ---
function now(){ return Date.now(); }
function cutoffTime(days){ return now() - days*24*60*60*1000; }

function getHistory(){ return state.history ?? (state.history = []); }
function pushHistory(id){
  const h = getHistory();
  h.push({ id, t: now() });
  state.history = h.slice(-2000); // cap growth
  saveState();
}
function uniqueRecentIds(count){
  const seen = new Set(), res = [];
  for (let i = getHistory().length - 1; i >= 0 && res.length < count; i--){
    const id = getHistory()[i].id;
    if (!seen.has(id)) { seen.add(id); res.push(id); }
  }
  return res;
}
function idsNotUsedSince(days){
  const cut = cutoffTime(days);
  const recent = new Set(getHistory().filter(h => h.t >= cut).map(h => h.id));
  return { recent, cut };
}
function applyFilters(list){
  const category = els.categoryFilter.value;
  const need = els.needFilter.value;
  const maxDur = int(els.maxDuration.value, DEFAULTS.maxDuration);
  return list.filter(x =>
    (!category || eqi(x.category, category)) &&
    (!need     || eqi(x.need, need)) &&
    (x.duration <= maxDur)
  );
}
function eqi(a,b){ return String(a||'').toLowerCase() === String(b||'').toLowerCase(); }

function rebuildDeck(resetPtr=false){
  // Build a new deck prioritizing items not seen recently by days and count.
  const avoidDays = int(els.avoidDays.value, DEFAULTS.avoidDays);
  const avoidCount = int(els.avoidCount.value, DEFAULTS.avoidCount);

  const filtered = applyFilters(dataset);

  const { recent: recentByDays } = idsNotUsedSince(avoidDays);
  const recentByCount = new Set(uniqueRecentIds(avoidCount));
  const avoidSet = new Set([...recentByDays, ...recentByCount]);

  const notRecent = filtered.filter(x => !avoidSet.has(x.id));
  const recent    = filtered.filter(x =>  avoidSet.has(x.id));

  deck = shuffle(notRecent).concat(shuffle(recent)); // prefer not-recent first
  deckPtr = resetPtr ? -1 : deckPtr;
  saveState();
}

function shuffle(arr){
  arr = arr.slice();
  for (let i=arr.length-1; i>0; i--){
    const j = Math.floor(Math.random()*(i+1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function draw({commit}){
  if (!deck.length) rebuildDeck(true);
  let nextIdx = deckPtr + 1;

  // If we ran off the end, rebuild with fresh priorities
  if (nextIdx >= deck.length) { rebuildDeck(true); nextIdx = 0; }
  const idea = deck[nextIdx];
  if (!idea) { renderCard(null, 'No ideas match your filters.'); return; }

  current = idea;
  currentWasCommitted = commit;
  deckPtr = nextIdx;

  renderCard(idea);
  els.skipBtn.disabled = false;
  els.doneBtn.disabled = false;

  if (commit){
    pushHistory(idea.id);
    renderList(); // refresh recent badges
  }

  els.undoBtn.disabled = getHistory().length === 0;
}

function undoLast(){
  const h = getHistory();
  if (!h.length) return;
  const last = h.pop();
  saveState();
  // Move pointer one back if it matches
  if (current && currentWasCommitted && last.id === current.id && deckPtr > -1) {
    deckPtr = Math.max(deckPtr - 1, -1);
  }
  renderList();
  els.undoBtn.disabled = getHistory().length === 0;
  renderCard(null, 'Undid last pick.');
}

function markDone(){
  const h = getHistory();
  const last = h[h.length - 1];
  if (current && (!last || last.id !== current.id)) {
    pushHistory(current.id);
    currentWasCommitted = true;
    renderList();
  }
  // “Done” commits the current idea (if needed) and draws the next one immediately.
  draw({commit:true});
}

function resetHistory(){
  if (!confirm('Reset local history and deck on this device?')) return;
  state.history = [];
  saveState();
  rebuildDeck(true);
  renderList();
  renderCard(null, 'History cleared.');
}

function renderCard(idea, note){
  if (!idea){
    current = null;
    currentWasCommitted = false;
    els.cardBody.innerHTML = `<p class="hint">${note ?? 'Ready when you are.'}</p>`;
    els.skipBtn.disabled = true;
    els.doneBtn.disabled = true;
    return;
  }
  const tags = [];
  if (idea.category) tags.push(`<span class="badge">${escapeHtml(idea.category)}</span>`);
  if (idea.need) tags.push(`<span class="badge">${escapeHtml(idea.need)}</span>`);
  tags.push(`<span class="badge">${idea.duration} min</span>`);

  els.cardBody.innerHTML = `
    <div class="title">${escapeHtml(idea.title)}</div>
    ${idea.desc ? `<p class="desc">${escapeHtml(idea.desc)}</p>` : ''}
    <div class="meta">${tags.join('')}</div>
  `;
}

function renderList(){
  const list = applyFilters(dataset);
  const { recent } = idsNotUsedSince(int(els.avoidDays.value, DEFAULTS.avoidDays));
  const lastN = new Set(uniqueRecentIds(int(els.avoidCount.value, DEFAULTS.avoidCount)));
  const hideRecent = els.hideRecentlySeen.checked;

  const statusText = `${list.length} visible • ${dataset.length} total • ${getHistory().length} picks in history`;
  els.counts.textContent = statusText;
  if (els.libraryStatus) {
    els.libraryStatus.textContent = `${dataset.length} ideas loaded (${list.length} matching filters)`;
  }

  const frag = document.createDocumentFragment();
  list.forEach(item => {
    const li = document.createElement('li');
    const left = document.createElement('div');
    left.innerHTML = `<strong>${escapeHtml(item.title)}</strong>
      ${item.category ? ` <span class="tag">· ${escapeHtml(item.category)}</span>`:''}
      ${item.need ? ` <span class="tag">· ${escapeHtml(item.need)}</span>`:''}
      <span class="tag">· ${item.duration}m</span>`;
    const right = document.createElement('div'); right.className='right';
    const isRecent = recent.has(item.id) || lastN.has(item.id);
    if (isRecent) {
      const b = document.createElement('span');
      b.className='badge recent';
      b.textContent = 'recent';
      right.appendChild(b);
    }
    const go = document.createElement('button');
    go.textContent = 'Pick';
    go.onclick = () => {
      renderCard(item);
      current = item;
      const h = getHistory();
      const last = h[h.length - 1];
      currentWasCommitted = !!(last && last.id === item.id);
      const idx = deck.findIndex(d => d.id === item.id);
      deckPtr = idx !== -1 ? idx : -1;
      els.skipBtn.disabled = false;
      els.doneBtn.disabled = false;
    };
    right.appendChild(go);
    li.appendChild(left); li.appendChild(right);
    if (!(hideRecent && isRecent)) frag.appendChild(li);
  });
  els.ideasList.replaceChildren(frag);
}

function populateFilters(list){
  const cats = Array.from(new Set(list.map(x => x.category).filter(Boolean))).sort();
  const needs = Array.from(new Set(list.map(x => x.need).filter(Boolean))).sort();

  fillSelect(els.categoryFilter, cats);
  fillSelect(els.needFilter, needs);
}
function fillSelect(sel, values){
  const cur = sel.value;
  sel.innerHTML = `<option value="">— any —</option>` + values.map(v => `<option>${escapeHtml(v)}</option>`).join('');
  // restore if still present
  const opt = Array.from(sel.options).find(o => o.value === cur);
  if (opt) sel.value = cur;
}

function enableControls(){
  [els.drawBtn, els.skipBtn, els.undoBtn, els.doneBtn].forEach(btn => btn.disabled = false);
  els.skipBtn.disabled = true;
  els.undoBtn.disabled = getHistory().length === 0;
  els.doneBtn.disabled = true;
  if (els.showLibraryBtn) els.showLibraryBtn.disabled = false;
}

function showLibrary(){
  els.libraryPanel.hidden = false;
  els.layout.classList.add('with-library');
  els.showLibraryBtn.setAttribute('aria-expanded', 'true');
  requestAnimationFrame(() => {
    els.libraryPanel.focus();
  });
}

function hideLibrary(){
  els.libraryPanel.hidden = true;
  els.layout.classList.remove('with-library');
  els.showLibraryBtn.setAttribute('aria-expanded', 'false');
  els.showLibraryBtn.focus();
}
