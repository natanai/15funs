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
const CHARADES_SOURCE = 'data/charades.csv';
const QUESTIONS_SOURCE = 'data/question_prompts.csv';

let state = loadState();
let dataset = [];          // {id, title, desc, category, need, duration, energy}
let deck = [];             // array of idea ids in draw order (we rebuild as needed)
let deckPtr = -1;          // points at last shown index
let current = null;        // current idea object
let currentWasCommitted = false;

const timerState = {
  intervalId: null,
  durationMs: 0,
  remainingMs: 0,
  running: false,
  endTime: null,
  elements: null,
};

let charadesPrompts = null;
let charadesQueue = [];
let charadesLoading = null;

let questionPrompts = null;
let questionQueue = [];
let questionLoading = null;

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
  els.drawBtn.onclick = () => draw();
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
    const link = obj.link ?? obj.url ?? '';
    const linkLabel = obj.link_label ?? obj.linklabel ?? '';
    const id = obj.id || makeId(`${title}|${desc}|${category}|${need}|${duration}|${energy}`);
    return {
      id, title: title || '(untitled)', desc, category, need,
      duration: clamp(int(duration, 15), 1, 240), energy,
      link, linkLabel
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

function draw(){
  if (!deck.length) rebuildDeck(true);
  let nextIdx = deckPtr + 1;

  // If we ran off the end, rebuild with fresh priorities
  if (nextIdx >= deck.length) { rebuildDeck(true); nextIdx = 0; }
  const idea = deck[nextIdx];
  if (!idea) { renderCard(null, 'No ideas match your filters.'); return; }

  current = idea;
  currentWasCommitted = false;
  deckPtr = nextIdx;

  renderCard(idea);

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
  renderCard(null, 'Nice! Press “Draw” when you’re ready for another.');
  els.undoBtn.disabled = getHistory().length === 0;
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
  teardownTimer();
  const card = els.cardBody;
  card.classList.remove('is-revealing');
  card.classList.toggle('has-idea', !!idea);

  if (!idea){
    current = null;
    currentWasCommitted = false;
    card.innerHTML = `<p class="hint">${note ?? 'Ready when you are.'}</p>`;
    els.doneBtn.disabled = true;
    return;
  }

  const tags = [];
  if (idea.category) tags.push(`<span class="badge">${escapeHtml(idea.category)}</span>`);
  if (idea.need) tags.push(`<span class="badge">${escapeHtml(idea.need)}</span>`);
  tags.push(`<span class="badge">${idea.duration} min</span>`);

  const descHtml = idea.desc ? escapeHtml(idea.desc).replace(/\n/g, '<br>') : '';
  const linkHtml = idea.link
    ? `<p class="resource"><a href="${escapeAttr(idea.link)}" target="_blank" rel="noopener">${escapeHtml(idea.linkLabel || 'Open resource')} ↗</a></p>`
    : '';
  const timerHtml = `
    <div class="timer" data-role="timer">
      <div class="timer-head">
        <span class="label">Countdown</span>
        <span class="timer-display" data-role="timerValue">${formatDurationMs(idea.duration * 60000)}</span>
      </div>
      <div class="timer-controls">
        <button type="button" class="timer-btn" data-role="timerToggle">Pause</button>
        <button type="button" class="timer-btn" data-role="timerReset">Reset</button>
      </div>
    </div>`;

  const charadesHtml = isCharadesIdea(idea)
    ? `
      <div class="charades" data-role="charades">
        <div class="charades-head">
          <span class="label">Charades prompt</span>
          <button type="button" class="timer-btn" data-role="charadesNext">New prompt</button>
        </div>
        <p class="charades-status" data-role="charadesStatus">Loading prompts…</p>
        <p class="charades-prompt" data-role="charadesPrompt"></p>
      </div>`
    : '';

  const questionHtml = isQuestionIdea(idea)
    ? `
      <div class="question-pool" data-role="questionPool">
        <div class="question-pool-head">
          <span class="label">Conversation spark</span>
          <button type="button" class="timer-btn" data-role="questionNext">New question</button>
        </div>
        <p class="question-status" data-role="questionStatus">Loading questions…</p>
        <p class="question-prompt" data-role="questionPrompt"></p>
      </div>`
    : '';

  card.innerHTML = `
    <div class="card-content">
      <div class="title">${escapeHtml(idea.title)}</div>
      ${descHtml ? `<p class="desc">${descHtml}</p>` : ''}
      ${linkHtml}
      <div class="meta">${tags.join('')}</div>
      ${timerHtml}
      ${charadesHtml}
      ${questionHtml}
    </div>
  `;

  els.doneBtn.disabled = false;
  void card.offsetWidth;
  requestAnimationFrame(() => card.classList.add('is-revealing'));
  setupTimer(idea.duration);
  if (isCharadesIdea(idea)) {
    setupCharadesFeature().catch(err => console.error(err));
  }
  if (isQuestionIdea(idea)) {
    setupQuestionPoolFeature().catch(err => console.error(err));
  }
}

function setupTimer(durationMinutes){
  const container = els.cardBody.querySelector('[data-role=timer]');
  if (!container) return;
  const duration = Math.max(1, Number(durationMinutes) || DEFAULTS.maxDuration);
  timerState.durationMs = duration * 60 * 1000;
  timerState.remainingMs = timerState.durationMs;
  timerState.elements = {
    container,
    value: container.querySelector('[data-role=timerValue]'),
    toggle: container.querySelector('[data-role=timerToggle]'),
    reset: container.querySelector('[data-role=timerReset]'),
  };
  if (timerState.elements.toggle) timerState.elements.toggle.addEventListener('click', onTimerToggle);
  if (timerState.elements.reset) timerState.elements.reset.addEventListener('click', onTimerReset);
  timerState.elements.container.classList.remove('is-finished');
  updateTimerDisplay();
  startTimerCountdown();
}

function teardownTimer(){
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
  }
  timerState.intervalId = null;
  timerState.durationMs = 0;
  timerState.remainingMs = 0;
  timerState.running = false;
  timerState.endTime = null;
  timerState.elements = null;
}

function startTimerCountdown(){
  if (!timerState.elements) return;
  timerState.running = true;
  timerState.endTime = Date.now() + timerState.remainingMs;
  if (timerState.intervalId) clearInterval(timerState.intervalId);
  timerState.intervalId = setInterval(tickTimer, 250);
  if (timerState.elements.toggle) timerState.elements.toggle.textContent = 'Pause';
  tickTimer();
}

function pauseTimer(){
  if (!timerState.running) return;
  timerState.running = false;
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  timerState.remainingMs = Math.max(0, timerState.endTime - Date.now());
  if (timerState.elements?.toggle) {
    timerState.elements.toggle.textContent = timerState.remainingMs > 0 ? 'Resume' : 'Restart';
  }
}

function finishTimer(){
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  timerState.running = false;
  timerState.remainingMs = 0;
  if (timerState.elements?.toggle) {
    timerState.elements.toggle.textContent = 'Restart';
  }
  if (timerState.elements?.container) {
    timerState.elements.container.classList.add('is-finished');
  }
  updateTimerDisplay();
}

function tickTimer(){
  if (!timerState.running) return;
  timerState.remainingMs = Math.max(0, timerState.endTime - Date.now());
  updateTimerDisplay();
  if (timerState.remainingMs <= 0) {
    finishTimer();
  }
}

function updateTimerDisplay(){
  if (!timerState.elements?.value) return;
  timerState.elements.value.textContent = formatDurationMs(timerState.remainingMs);
}

function toggleTimer(){
  if (!timerState.elements) return;
  if (timerState.running) {
    pauseTimer();
  } else {
    if (timerState.remainingMs <= 0) {
      timerState.remainingMs = timerState.durationMs;
      timerState.elements.container?.classList.remove('is-finished');
    }
    startTimerCountdown();
  }
}

function resetTimer(){
  if (!timerState.elements) return;
  if (timerState.intervalId) {
    clearInterval(timerState.intervalId);
    timerState.intervalId = null;
  }
  timerState.running = false;
  timerState.remainingMs = timerState.durationMs;
  timerState.elements.container?.classList.remove('is-finished');
  updateTimerDisplay();
  startTimerCountdown();
}

function onTimerToggle(evt){
  evt.preventDefault();
  toggleTimer();
}

function onTimerReset(evt){
  evt.preventDefault();
  resetTimer();
}

function formatDurationMs(ms){
  const totalSeconds = Math.max(0, Math.ceil(ms / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
}

function isCharadesIdea(idea){
  return !!idea && eqi(idea.title, 'Charades');
}

function isQuestionIdea(idea){
  if (!idea) return false;
  const titles = [
    '20 questions with a maybe',
    'Seven-minute question trade',
  ];
  return titles.some(title => eqi(idea.title, title));
}

async function setupCharadesFeature(){
  const wrap = els.cardBody.querySelector('[data-role=charades]');
  if (!wrap) return;
  const statusEl = wrap.querySelector('[data-role=charadesStatus]');
  const promptEl = wrap.querySelector('[data-role=charadesPrompt]');
  const button = wrap.querySelector('[data-role=charadesNext]');
  if (!statusEl || !promptEl || !button) return;

  button.disabled = true;
  statusEl.textContent = 'Loading prompts…';
  try {
    const prompts = await loadCharadesPrompts();
    if (!wrap.isConnected) return;
    if (!prompts.length) {
      statusEl.textContent = 'No prompts available yet.';
      button.disabled = true;
      return;
    }
    statusEl.textContent = '';
    promptEl.textContent = '';
    const showNext = () => {
      const prompt = drawCharadesPrompt();
      promptEl.textContent = prompt;
    };
    button.disabled = false;
    button.addEventListener('click', showNext);
    showNext();
  } catch (err) {
    if (!wrap.isConnected) return;
    statusEl.textContent = 'Could not load prompts.';
    button.disabled = true;
    throw err;
  }
}

async function loadCharadesPrompts(){
  if (charadesPrompts) return charadesPrompts;
  if (!charadesLoading) {
    charadesLoading = fetch(`${CHARADES_SOURCE}?_ts=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${CHARADES_SOURCE}`);
        return res.text();
      })
      .then(text => {
        const rows = parseCSV(text);
        if (!rows.length) return [];
        const header = rows[0].map(h => h.trim().toLowerCase());
        const idx = header.indexOf('prompt') >= 0 ? header.indexOf('prompt') : 0;
        return rows.slice(1)
          .map(r => (r[idx] ?? '').trim())
          .filter(Boolean);
      });
  }
  charadesPrompts = await charadesLoading;
  return charadesPrompts;
}

function drawCharadesPrompt(){
  if (!charadesPrompts || !charadesPrompts.length) return '';
  if (!charadesQueue.length) {
    charadesQueue = shuffle(charadesPrompts.slice());
  }
  return charadesQueue.pop();
}

async function setupQuestionPoolFeature(){
  const wrap = els.cardBody.querySelector('[data-role=questionPool]');
  if (!wrap) return;
  const statusEl = wrap.querySelector('[data-role=questionStatus]');
  const promptEl = wrap.querySelector('[data-role=questionPrompt]');
  const button = wrap.querySelector('[data-role=questionNext]');
  if (!statusEl || !promptEl || !button) return;

  button.disabled = true;
  statusEl.textContent = 'Loading questions…';
  try {
    const prompts = await loadQuestionPrompts();
    if (!wrap.isConnected) return;
    if (!prompts.length) {
      statusEl.textContent = 'No questions available yet.';
      button.disabled = true;
      return;
    }
    statusEl.textContent = '';
    promptEl.textContent = '';
    const showNext = () => {
      const prompt = drawQuestionPrompt();
      promptEl.textContent = prompt;
    };
    button.disabled = false;
    button.addEventListener('click', showNext);
    showNext();
  } catch (err) {
    if (!wrap.isConnected) return;
    statusEl.textContent = 'Could not load questions.';
    button.disabled = true;
    throw err;
  }
}

async function loadQuestionPrompts(){
  if (questionPrompts) return questionPrompts;
  if (!questionLoading) {
    questionLoading = fetch(`${QUESTIONS_SOURCE}?_ts=${Date.now()}`)
      .then(res => {
        if (!res.ok) throw new Error(`Fetch failed (${res.status}) for ${QUESTIONS_SOURCE}`);
        return res.text();
      })
      .then(text => {
        const rows = parseCSV(text);
        if (!rows.length) return [];
        const header = rows[0].map(h => h.trim().toLowerCase());
        const idx = header.indexOf('prompt') >= 0 ? header.indexOf('prompt') : 0;
        return rows.slice(1)
          .map(r => (r[idx] ?? '').trim())
          .filter(Boolean);
      });
  }
  questionPrompts = await questionLoading;
  return questionPrompts;
}

function drawQuestionPrompt(){
  if (!questionPrompts || !questionPrompts.length) return '';
  if (!questionQueue.length) {
    questionQueue = shuffle(questionPrompts.slice());
  }
  return questionQueue.pop();
}

function escapeAttr(s){
  return escapeHtml(String(s));
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
  [els.drawBtn, els.undoBtn, els.doneBtn].forEach(btn => btn.disabled = false);
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
