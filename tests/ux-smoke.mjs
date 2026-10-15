// Run with: node tests/ux-smoke.mjs
// Dependency-free interaction regression tests for the mobile draw-first experience.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(source.includes("init().catch(err => showError(err));"), 'Expected app bootstrap');
assert.ok(source.includes('<div class="timer" data-role="timer"'), 'Timer should be visible without disclosure');
assert.ok(!source.includes('<details class="timer"'), 'Timer must not require a dropdown');
assert.ok(!source.includes('durationBadge'), 'Do not duplicate the time value');
assert.ok(!source.includes('⏱'), 'Timer should use site typography instead of an emoji');

function makeElement(id) {
  return {
    id, value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', checked: false,
    children: [], options: [{ value: '' }],
    classList: {
      tokens: new Set(),
      add(...names) { names.forEach(name => this.tokens.add(name)); },
      remove(...names) { names.forEach(name => this.tokens.delete(name)); },
      toggle(name, force) {
        const include = force === undefined ? !this.tokens.has(name) : !!force;
        if (include) this.tokens.add(name);
        else this.tokens.delete(name);
        return include;
      },
      contains(name) { return this.tokens.has(name); },
    },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, querySelector() { return null; },
    focus() { this.focusCount = (this.focusCount || 0) + 1; }, scrollIntoView() {}, addEventListener() {},
  };
}

function harness(initialCsv) {
  const ids = [...source.matchAll(/document\.getElementById\('([^']+)'\)/g)].map(match => match[1]);
  const elements = Object.fromEntries(ids.map(id => [id, makeElement(id)]));
  elements.dataUrl.value = 'data/ideas.csv';
  elements.avoidDays.value = '7';
  elements.avoidCount.value = '10';
  elements.maxDuration.value = '15';
  elements.hideRecentlySeen.checked = true;
  const document = {
    getElementById: id => elements[id],
    createDocumentFragment: () => makeElement('fragment'),
    createElement: name => makeElement(name),
  };
  const saved = new Map();
  const localStorage = {
    getItem: key => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  };
  let csv = initialCsv;
  let fetchShouldFail = false;
  const fetch = async () => {
    if (fetchShouldFail) throw new Error('Simulated network error');
    return { ok: true, text: async () => csv };
  };
  // No bootstrap: exercise flows with deterministic fake elements and fetch.
  const build = new Function(
    'document', 'localStorage', 'fetch', 'confirm', 'requestAnimationFrame', 'setInterval', 'clearInterval',
    source.replace('init().catch(err => showError(err));', '') + `
      return {
        reloadData, draw, markDone, filtersChanged, renderList, resetHistory,
        getCurrent: () => current, getHistory: () => getHistory(),
        getDataset: () => dataset, getSession: () => [...sessionDrawnIds],
        showLibrary, hideLibrary,
        setupTimer, toggleTimer, resetTimer, teardownTimer, formatDurationMs,
        getTimerState: () => timerState,
        normalizeNeeds,
      };
    `
  );
  const app = build(document, localStorage, fetch, () => true, cb => cb(), () => 42, () => {});
  return {
    app, elements, saved,
    installTimerControl() {
      const value = makeElement('timerValue');
      const toggle = makeElement('timerToggle');
      toggle.textContent = 'Start';
      const reset = makeElement('timerReset');
      reset.textContent = 'Reset';
      reset.hidden = true;
      const timer = makeElement('timer');
      timer.querySelector = selector => {
        if (selector === '[data-role=timerValue]') return value;
        if (selector === '[data-role=timerToggle]') return toggle;
        if (selector === '[data-role=timerReset]') return reset;
        return null;
      };
      elements.cardBody.querySelector = selector => selector === '[data-role=timer]' ? timer : null;
      return { timer, value, toggle, reset };
    },
    setCsv(value) { csv = value; },
    failFetch(value) { fetchShouldFail = value; },
  };
}

const csv = (...names) =>
  'title,desc,category,needs,duration,energy,link,link_label\n' +
  names.map(name => `${name},Instructions,play,,15,calm,,`).join('\n');

const { app, elements, saved, setCsv, failFetch, installTimerControl } = harness(csv('A', 'B', 'C'));
await app.reloadData();
assert.equal(app.getDataset().length, 3);
assert.equal(app.getCurrent(), null);
assert.equal(elements.drawBtn.hidden, false);
assert.equal(elements.cardPanel.classList.contains('is-idle'), true, 'Ready state expands the idea surface');

const firstCycle = [];
for (let i = 0; i < 3; i++) {
  await app.draw();
  firstCycle.push(app.getCurrent().title);
}
assert.equal(elements.cardPanel.classList.contains('is-idle'), false, 'Drawing leaves the blank-card state');
assert.equal(new Set(firstCycle).size, 3, 'Redraw should not repeat during a cycle');
assert.equal(app.getHistory().length, 0, 'Drawing/rejecting is not completing');
await app.draw();
assert.notEqual(app.getCurrent().title, firstCycle[2], 'Avoid the previous idea across a new cycle');

const completed = app.getCurrent().title;
app.markDone();
assert.equal(app.getHistory().length, 1, 'Complete should save history');
assert.equal(app.getCurrent(), null, 'Complete returns to ready state');
assert.equal(elements.cardPanel.classList.contains('is-idle'), true, 'Completing restores the large blank card');
assert.equal(elements.drawBtn.hidden, false, 'Draw should return in place');
assert.equal(elements.doneBtn.hidden, true);
assert.ok(elements.actionStatus.textContent.includes(completed));
await app.draw();
assert.ok(app.getCurrent(), 'Another idea should be reachable immediately');

// Explicitly completing the same activity twice is two real completions.
const duplicated = app.getCurrent();
app.markDone();
assert.equal(app.getHistory().length, 2);
app.renderList(); // Ensure rendering the library doesn't alter history.
assert.equal(app.getHistory().length, 2);

// Refreshing an unchanged source must not restart the shuffle.
await app.draw();
const justSeen = app.getCurrent().id;
await app.draw();
assert.notEqual(app.getCurrent().id, justSeen);

// Changed CSV source must be adopted on the next draw.
setCsv(csv('D', 'E'));
await app.draw();
assert.equal(app.getDataset().length, 2);
assert.ok(['D','E'].includes(app.getCurrent().title));

// An impossible redraw should keep the current idea instead of silently completing it.
setCsv(csv('Solo'));
await app.draw();
assert.equal(app.getCurrent().title, 'Solo');
await app.draw();
assert.equal(app.getCurrent().title, 'Solo');
assert.equal(app.getHistory().length, 2);
assert.match(elements.actionStatus.textContent, /No other ideas/);

// Network failure preserves the current idea and existing completion history.
failFetch(true);
await app.draw();
assert.equal(app.getCurrent().title, 'Solo');
assert.equal(app.getHistory().length, 2);
assert.equal(elements.redrawBtn.disabled, false);
failFetch(false);

// A completed activity is recorded each time the user explicitly presses Complete.
app.markDone();
assert.equal(app.getHistory().length, 3);
assert.ok(saved.has('15funs.v1.state'));

// The timer is a single compact, visible row. It never starts without a tap.
const timer = installTimerControl();
app.setupTimer(10);
assert.equal(app.formatDurationMs(10 * 60 * 1000), '10:00');
assert.equal(timer.value.textContent, '10:00');
assert.equal(timer.toggle.textContent, 'Start');
assert.equal(timer.reset.hidden, true);
assert.equal(app.getTimerState().running, false, 'Timer must not start automatically');

app.toggleTimer();
assert.equal(app.getTimerState().running, true);
assert.equal(timer.toggle.textContent, 'Pause');
assert.equal(timer.reset.hidden, false, 'Reset becomes available once started');

app.toggleTimer();
assert.equal(app.getTimerState().running, false);
assert.equal(timer.toggle.textContent, 'Resume');
assert.equal(timer.reset.hidden, false);

app.toggleTimer();
assert.equal(app.getTimerState().running, true);
assert.equal(timer.toggle.textContent, 'Pause');

app.resetTimer();
assert.equal(app.getTimerState().running, false, 'Reset must not restart');
assert.equal(timer.value.textContent, '10:00');
assert.equal(timer.toggle.textContent, 'Start');
assert.equal(timer.reset.hidden, true, 'Reset goes away in ready state');
app.teardownTimer();
assert.equal(app.getTimerState().elements, null);

// Library browsing should preserve compact list semantics and keyboard focus.
const library = harness(csv('Dance', 'Read', 'Sketch'));
await library.app.reloadData();
assert.equal(library.elements.counts.textContent, '3 ideas');
library.elements.librarySearch.value = 'dance';
library.app.renderList();
assert.equal(library.elements.counts.textContent, '1 idea');
const firstRow = library.elements.ideasList.children[0].children[0];
assert.equal(firstRow.children[0].children[0].textContent, 'Dance');
assert.equal(firstRow.children[0].children[1].textContent, 'play · 15 min');
library.app.showLibrary();
assert.equal(library.elements.libraryPanel.hidden, false);
firstRow.children[1].children[0].onclick();
assert.equal(library.app.getCurrent().title, 'Dance');
assert.equal(library.elements.libraryPanel.hidden, true);
assert.ok(library.elements.doneBtn.focusCount >= 1, 'Choosing from library returns focus to activity action');
assert.equal(library.elements.showLibraryBtn.focusCount || 0, 0, 'Avoid focusing the now-closed library trigger after selecting');

library.elements.librarySearch.value = 'not-found-123';
library.app.renderList();
assert.equal(library.elements.counts.textContent, '0 ideas');
assert.equal(library.elements.ideasList.children[0].children[0].className, 'library-empty');
library.app.showLibrary();
library.app.hideLibrary();
assert.ok(library.elements.showLibraryBtn.focusCount >= 1, 'Closing the library restores focus to trigger');

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../style.css', import.meta.url), 'utf8');
assert.ok(html.includes('id="librarySearch"'), 'Library search input should exist');
assert.ok(!html.includes('<footer class="foot"'), 'Do not repeat storage information below the main flow');
assert.ok(!html.includes('id="libraryStatus"'), 'Do not use space for a top-level count');
assert.ok(source.includes('<details class="idea-tags">'), 'Keep extra tags optional');
assert.ok(source.includes('<div class="activity-tools">'), 'Timer and tags share one compact row');
assert.ok(!source.includes('metaToggle'), 'Remove redundant Show categories & needs button');
assert.ok(!css.includes("content: '⚙'"), 'Do not use browser-dependent gear emoji');

// Needs tags not in the initial NVC list must remain visible and filterable.
const needsCase = harness('title,desc,category,needs,duration,energy,link,link_label\nPlay together,Do a shared playful activity.,play,Play|Mutuality|Play,5,calm,,');
await needsCase.app.reloadData();
assert.deepEqual(needsCase.app.getDataset()[0].needs, ['Play', 'Mutuality']);
assert.deepEqual(needsCase.app.normalizeNeeds('Focus|Play|Focus'), ['Focus', 'Play']);
assert.match(needsCase.elements.needFilter.innerHTML, /Play/);
assert.match(needsCase.elements.needFilter.innerHTML, /Mutuality/);
// The viewport is devoted to a proper blank idea card; thumb controls float higher.
assert.match(html, /id="cardPanel"[^>]*aria-label="Activity picker"/);
assert.match(css, /--draw-dock-bottom:\s*calc\(34px \+ env\(safe-area-inset-bottom/);
assert.match(css, /--draw-dock-clearance:\s*calc\(112px \+ env\(safe-area-inset-bottom/);
assert.match(css, /\.layout > \.card \.card-body\s*\{/);
assert.match(css, /align-items:\s*stretch;/, 'The mobile stack must override desktop alignment');
assert.match(css, /\.card\.is-idle \.card-body > \.hint/);
assert.match(css, /body:has\(#libraryPanel:not\(\[hidden\]\)\)/);

console.log('15funs UX smoke tests passed');
