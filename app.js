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
  historyList: document.getElementById('historyList'),
};

const STORAGE_KEY = '15funs.v1.state';
const DEFAULTS = { avoidDays: 7, avoidCount: 10, maxDuration: 15, dataUrl: 'data/ideas.csv' };
const ALLOWED_NEEDS = [
  'Love/Caring', 'Nurturing', 'Connection', 'Belonging', 'Support', 'Consideration',
  'Need for all living things to flourish', 'Inclusion', 'Community', 'Safety', 'Contribution',
  'Peer Respect', 'Respect', 'Autonomy', 'To be seen', 'Acknowledgement', 'Appreciation', 'Trust',
  'Dependability', 'Honesty', 'Honor', 'Commitment', 'Clarity', 'Accountability', 'Causality',
  'Fairness', 'Justice', 'Choice', 'Freedom', 'Reliability', 'Act Freely', 'Choose Freely',
  'Understanding', 'Recognition', 'Non-judgmental Communication', 'Need to matter', 'Friendship',
  'Space', 'Peace', 'Serenity', 'Do things at my own pace and in my own way', 'Calm',
  'Participation', 'To be heard', 'Equality', 'Empowerment', 'Consistency', 'Genuineness', 'Mattering',
  'Rest', 'Mutuality', 'Relaxation', 'Closeness', 'Authenticity', 'Self expression', 'Integrity',
  'Empathy', 'Privacy', 'Order', 'Beauty', 'Control', 'Predictability', 'Accomplishment',
  'Physical Fitness', 'Acceptance', 'Growth', 'Security'
];
const NEED_CANON = new Map(ALLOWED_NEEDS.map(name => [name.toLowerCase(), name]));
const NEED_SYNONYMS = new Map([
  ['creativity', 'Self expression'],
  ['creative', 'Self expression'],
  ['play', 'Participation'],
  ['playful', 'Participation'],
  ['closeness', 'Closeness'],
  ['connection', 'Connection'],
  ['care', 'Love/Caring'],
  ['grounding', 'Calm'],
  ['rest', 'Rest'],
  ['learning', 'Growth'],
  ['meaning', 'Need to matter'],
  ['curiosity', 'Understanding'],
  ['clarity', 'Clarity'],
  ['order', 'Order'],
  ['beauty', 'Beauty'],
  ['freedom', 'Freedom'],
  ['serenity', 'Serenity'],
  ['calm', 'Calm'],
  ['contribution', 'Contribution'],
  ['appreciation', 'Appreciation'],
  ['commitment', 'Commitment'],
  ['friendship', 'Friendship'],
  ['love/caring', 'Love/Caring'],
  ['nurturing', 'Nurturing'],
  ['physical fitness', 'Physical Fitness'],
  ['relaxation', 'Relaxation'],
  ['self expression', 'Self expression'],
  ['self-expression', 'Self expression'],
]);
let timeFormatter;
try {
  timeFormatter = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });
} catch {
  timeFormatter = null;
}

let state = loadState();
let dataset = [];          // {id, title, desc, category, need, duration, energy}
let deck = [];             // array of idea ids in draw order (we rebuild as needed)
let deckPtr = -1;          // points at last shown index
let current = null;        // current idea object
let currentSource = null;  // 'deck' | 'peek' | 'library' | null
let currentHasEntry = false; // whether history already has an entry for current
let currentFinalized = false; // whether current idea has been marked done/skipped
let lastShownIndex = -1;   // deck index of the last shown idea
const ideaIndex = new Map();

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
  els.skipBtn.onclick = skipCurrent;
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
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed.history)) parsed.history = [];
    parsed.history = parsed.history
      .map(upgradeHistoryEntry)
      .filter(Boolean);
    return parsed;
  } catch {
    return { history: [], settingsVersion: 1 };
  }
}
function saveState() { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }

function upgradeHistoryEntry(entry){
  if (!entry || typeof entry !== 'object') return null;
  const upgraded = { ...entry };
  upgraded.id = upgraded.id ?? upgraded.ideaId ?? null;
  const numericT = Number(upgraded.t);
  upgraded.t = Number.isFinite(numericT) ? numericT : now();
  upgraded.action = upgraded.action ?? 'drawn';
  if (upgraded.action === 'done' && !Number.isFinite(upgraded.doneAt)) {
    const numericDone = Number(upgraded.doneAt);
    upgraded.doneAt = Number.isFinite(numericDone) ? numericDone : upgraded.t;
  }
  if (upgraded.action === 'skipped' && !Number.isFinite(upgraded.skippedAt)) {
    const numericSkip = Number(upgraded.skippedAt);
    upgraded.skippedAt = Number.isFinite(numericSkip) ? numericSkip : upgraded.t;
  }
  return upgraded.id ? upgraded : null;
}

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
    renderHistory();
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
    const need = normalizeNeed(obj.need ?? '');
    const duration = obj.duration ?? obj.minutes ?? '15';
    const energy = obj.energy ?? '';
    const id = obj.id || makeId(`${title}|${desc}|${category}|${need}|${duration}|${energy}`);
    return {
      id, title: title || '(untitled)', desc, category, need,
      duration: clamp(int(duration, 15), 1, 240), energy
    };
  });
}
function normalizeNeed(value){
  if (!value) return '';
  const trimmed = String(value).trim();
  if (!trimmed) return '';
  const lower = trimmed.toLowerCase();
  if (NEED_CANON.has(lower)) return NEED_CANON.get(lower);
  if (NEED_SYNONYMS.has(lower)) return NEED_SYNONYMS.get(lower);
  console.warn(`Need “${value}” is not in the allowed NVC list; it will be hidden from filters.`);
  return '';
}
function indexById(list){
  ideaIndex.clear();
  list.forEach(item => {
    ideaIndex.set(item.id, item);
  });
}
function lookupIdea(id){
  return ideaIndex.get(id) || null;
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
function pushHistory(id, action='drawn'){
  const h = getHistory();
  h.push({ id, t: now(), action });
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
function lastHistoryEntry(){
  const h = getHistory();
  return h.length ? h[h.length - 1] : null;
}
function finalizeCurrent(action){
  if (!current) return false;
  const h = getHistory();
  const last = h[h.length - 1];
  const ts = now();
  if (last && last.id === current.id && last.action === 'drawn' && currentHasEntry && !currentFinalized) {
    last.action = action;
    last.t = ts;
    if (action === 'done') last.doneAt = ts;
    if (action === 'skipped') last.skippedAt = ts;
    saveState();
  } else {
    pushHistory(current.id, action);
    const updated = lastHistoryEntry();
    if (updated) {
      if (action === 'done') updated.doneAt = updated.t;
      if (action === 'skipped') updated.skippedAt = updated.t;
      saveState();
    }
  }
  currentFinalized = true;
  currentHasEntry = true;
  return true;
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
  if (!idea) {
    renderCard(null, 'No ideas match your filters.');
    current = null;
    currentSource = null;
    currentHasEntry = false;
    currentFinalized = false;
    lastShownIndex = -1;
    return;
  }

  renderCard(idea);
  current = idea;
  currentSource = commit ? 'deck' : 'peek';
  currentHasEntry = false;
  currentFinalized = false;
  lastShownIndex = nextIdx;

  els.skipBtn.disabled = false;
  els.doneBtn.disabled = false;
  els.undoBtn.disabled = getHistory().length === 0;

  if (commit){
    deckPtr = nextIdx;
    currentHasEntry = true;
    pushHistory(idea.id, 'drawn');
    currentFinalized = false;
    renderList(); // refresh recent badges
    renderHistory();
  }
}

function undoLast(){
  const h = getHistory();
  if (!h.length) return;
  const last = h.pop();
  saveState();
  // Move pointer one back if it matches
  if (current && last.id === current.id && deckPtr > -1) {
    deckPtr--;
  }
  renderList();
  renderHistory();
  els.undoBtn.disabled = getHistory().length === 0;
  renderCard(null, 'Undid last pick.');
}

function markDone(){
  if (!current) return;
  const hadEntry = currentHasEntry;
  const source = currentSource;
  finalizeCurrent('done');
  renderList();
  renderHistory();

  if (source === 'peek' && !hadEntry && lastShownIndex > -1) {
    deckPtr = lastShownIndex;
  }
  if (source === 'library' && !hadEntry) {
    rebuildDeck(true);
  }

  current = null;
  currentSource = null;
  currentHasEntry = false;
  currentFinalized = false;
  lastShownIndex = -1;

  draw({commit:true});
}

function resetHistory(){
  if (!confirm('Reset local history and deck on this device?')) return;
  state.history = [];
  saveState();
  rebuildDeck(true);
  renderList();
  renderHistory();
  renderCard(null, 'History cleared.');
}

function skipCurrent(){
  if (!current) {
    draw({commit:true});
    return;
  }
  const hadEntry = currentHasEntry;
  const source = currentSource;
  finalizeCurrent('skipped');
  renderList();
  renderHistory();

  if (source === 'peek' && !hadEntry && lastShownIndex > -1) {
    deckPtr = lastShownIndex;
  }
  if (source === 'library' && !hadEntry) {
    rebuildDeck(true);
  }

  current = null;
  currentSource = null;
  currentHasEntry = false;
  currentFinalized = false;
  lastShownIndex = -1;

  draw({commit:true});
}

function renderCard(idea, note){
  if (els.doneBtn) els.doneBtn.disabled = !idea;
  if (els.skipBtn) els.skipBtn.disabled = !idea;
  if (!idea){
    els.cardBody.innerHTML = `<p class="hint">${note ?? 'Ready when you are.'}</p>`;
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
      currentSource = 'library';
      currentHasEntry = false;
      currentFinalized = false;
      lastShownIndex = -1;
    };
    right.appendChild(go);
    li.appendChild(left); li.appendChild(right);
    if (!(hideRecent && isRecent)) frag.appendChild(li);
  });
  els.ideasList.replaceChildren(frag);
}

function renderHistory(){
  if (!els.historyList) return;
  const h = getHistory();
  if (!h.length) {
    const empty = document.createElement('li');
    empty.className = 'history-empty';
    empty.textContent = 'No history yet. Mark ideas as done or skipped to see them here.';
    els.historyList.replaceChildren(empty);
    return;
  }
  const frag = document.createDocumentFragment();
  const entries = h.slice().reverse().slice(0, 60);
  entries.forEach(entry => {
    const li = document.createElement('li');
    li.className = `history-item history-${entry.action}`;
    const idea = lookupIdea(entry.id);
    const when = entry.action === 'done' ? (entry.doneAt ?? entry.t) : entry.action === 'skipped' ? (entry.skippedAt ?? entry.t) : entry.t;
    const actionLabel = entry.action === 'done' ? 'Done' : entry.action === 'skipped' ? 'Skipped' : 'Drawn';
    const titleEl = document.createElement('span');
    titleEl.className = 'history-title';
    titleEl.textContent = idea ? idea.title : '(removed idea)';
    const meta = document.createElement('span');
    meta.className = 'history-meta';
    const parts = [`${actionLabel} • ${formatTime(when)}`];
    if (idea?.need) parts.push(`need: ${idea.need}`);
    meta.textContent = parts.join(' • ');
    li.appendChild(titleEl);
    li.appendChild(meta);
    frag.appendChild(li);
  });
  els.historyList.replaceChildren(frag);
}

function formatTime(ts){
  if (!Number.isFinite(ts)) return '—';
  try {
    return timeFormatter.format(new Date(ts));
  } catch {
    return new Date(ts).toLocaleString();
  }
}

function populateFilters(list){
  const cats = Array.from(new Set(list.map(x => x.category).filter(Boolean))).sort();
  const needSet = new Set(list.map(x => x.need).filter(Boolean));
  const needs = ALLOWED_NEEDS.filter(name => needSet.has(name));

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
