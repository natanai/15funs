// Run with: node tests/ux-smoke.mjs
// Dependency-free interaction regression tests for the mobile draw-first experience.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
assert.ok(source.includes("init().catch(err => showError(err));"), 'Expected app bootstrap');

function makeElement(id) {
  return {
    id, value: '', hidden: false, disabled: false, textContent: '', innerHTML: '', checked: false,
    children: [], options: [{ value: '' }],
    classList: { add() {}, remove() {}, toggle() {} },
    appendChild(child) { this.children.push(child); },
    replaceChildren(...children) { this.children = children; },
    setAttribute() {}, querySelector() { return null; },
    focus() {}, scrollIntoView() {}, addEventListener() {},
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
        getDataset: () => dataset, getSession: () => [...sessionDrawnIds]
      };
    `
  );
  const app = build(document, localStorage, fetch, () => true, cb => cb(), () => 42, () => {});
  return {
    app, elements, saved,
    setCsv(value) { csv = value; },
    failFetch(value) { fetchShouldFail = value; },
  };
}

const csv = (...names) =>
  'title,desc,category,needs,duration,energy,link,link_label\n' +
  names.map(name => `${name},Instructions,play,,15,calm,,`).join('\n');

const { app, elements, saved, setCsv, failFetch } = harness(csv('A', 'B', 'C'));
await app.reloadData();
assert.equal(app.getDataset().length, 3);
assert.equal(app.getCurrent(), null);
assert.equal(elements.drawBtn.hidden, false);

const firstCycle = [];
for (let i = 0; i < 3; i++) {
  await app.draw();
  firstCycle.push(app.getCurrent().title);
}
assert.equal(new Set(firstCycle).size, 3, 'Redraw should not repeat during a cycle');
assert.equal(app.getHistory().length, 0, 'Drawing/rejecting is not completing');
await app.draw();
assert.notEqual(app.getCurrent().title, firstCycle[2], 'Avoid the previous idea across a new cycle');

const completed = app.getCurrent().title;
app.markDone();
assert.equal(app.getHistory().length, 1, 'Complete should save history');
assert.equal(app.getCurrent(), null, 'Complete returns to ready state');
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

console.log('15funs UX smoke tests passed');
