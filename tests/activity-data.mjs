// Validate the audited original catalog: node tests/activity-data.mjs
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

function parseCSV(text) {
  const rows = [];
  let row = [], cell = '', quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') { cell += '"'; i++; }
        else quoted = false;
      } else cell += char;
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      row.push(cell); cell = '';
    } else if (char === '\n') {
      row.push(cell); rows.push(row); row = []; cell = '';
    } else if (char !== '\r') {
      cell += char;
    }
  }
  if (cell || row.length) rows.push([...row, cell]);
  assert.equal(quoted, false, 'CSV contains an unclosed quoted cell');
  return rows.filter(cells => cells.some(value => value.trim()));
}

const rows = parseCSV(readFileSync(new URL('../data/ideas.csv', import.meta.url), 'utf8'));
const header = rows.shift();
assert.deepEqual(header, ['title','desc','category','needs','duration','energy','link','link_label','id']);
assert.equal(rows.length, 73, 'Audit must preserve all 73 existing activities, not add or remove ideas');
const baselineIds = [
  "iwxv186",
  "i1h4jvi5",
  "i920hbt",
  "ig624dg",
  "i1jvpnf6",
  "i1ux32q0",
  "i152vejn",
  "isi1aof",
  "i609pds",
  "i8w828x",
  "izxph19",
  "iz8upzv",
  "i13ymwwb",
  "i1uvlqar",
  "iqmr93x",
  "i12s7sni",
  "i17r6a2n",
  "ifzif7x",
  "i10jsh0j",
  "iy1cmk9",
  "i1trdmmm",
  "i8jq0rn",
  "ies23cw",
  "i16kepda",
  "i16n69rz",
  "i1dsjiu3",
  "iwhqvk",
  "i1afcys1",
  "iib17eu",
  "icpou9i",
  "i12b9xr4",
  "i1b3tfof",
  "i6ryf6o",
  "i1pe8cqg",
  "i1tyo1ku",
  "i1qcl7pw",
  "iud7o0j",
  "i24tdro",
  "i1smyahg",
  "i1hm7ttk",
  "i1lc3s9",
  "iptxs00",
  "ijm4v7f",
  "ivj3d67",
  "i1p78tdm",
  "i1e8ft6r",
  "i1pd7dji",
  "ib8ccup",
  "i1u0xu03",
  "i1kxcpg5",
  "i1thc3jx",
  "i13mv2mi",
  "i1xkud3u",
  "i1eomv8z",
  "i1b0n5xq",
  "ioifs3t",
  "i1s0jty2",
  "ibiv38x",
  "i1fj0lar",
  "iria4ly",
  "ilhn0p9",
  "i1cidl71",
  "i13378nz",
  "i1ualc6h",
  "iw0bock",
  "iao4au6",
  "if5pep9",
  "i1lf8gzo",
  "ia1g0ns",
  "invyxw0",
  "ig6n9yz",
  "i1fahckf",
  "isnb8zc"
];
assert.equal(new Set(baselineIds).size, 73);

const byId = new Map();
const titles = new Set();
for (const row of rows) {
  assert.equal(row.length, header.length, 'CSV column count changed');
  const [title, desc, category, needs, duration, energy, link, linkLabel, id] = row;
  assert.ok(title.trim() && desc.trim() && category.trim(), 'Missing required activity text');
  assert.ok(desc.trim().length >= 45, `Instructions for "${title}" appear incomplete`);
  assert.ok(!titles.has(title), `Duplicate activity title: ${title}`);
  assert.ok(!byId.has(id), `Duplicate history ID: ${id}`);
  assert.ok(/^i[a-z0-9]+$/.test(id), `Invalid legacy history ID on ${title}`);
  assert.ok(Number.isInteger(+duration) && +duration >= 1 && +duration <= 15, `Invalid duration: ${title}`);
  if (link) assert.ok(/^https:\/\//.test(link), `Non-HTTPS activity link: ${title}`);
  if (linkLabel) assert.ok(link, `Link label without URL: ${title}`);
  titles.add(title);
  byId.set(id, { title, desc, category, needs, duration, energy });
}
for (const id of baselineIds) assert.ok(byId.has(id), `Previously completed activity lost its historical identity: ${id}`);

const questionRows = parseCSV(readFileSync(new URL('../data/question_prompts.csv', import.meta.url), 'utf8'));
assert.equal(questionRows[0][0], 'prompt');
assert.equal(questionRows.length, 20, 'Keep the existing 19 conversation questions');
for (const row of questionRows.slice(1)) {
  assert.equal(row.length, 1);
  assert.doesNotMatch(row[0], /\b(?:me|my|our|us)\b/i, 'The site must not talk as if it were a partner');
}
for (const file of ['charades.csv','yes_no_questions.csv']) {
  const source = parseCSV(readFileSync(new URL('../data/' + file, import.meta.url), 'utf8'));
  assert.equal(source[0][0], 'prompt');
  assert.equal(source.length, 41, `Unexpected change to the ${file} prompt collection`);
}
console.log('Activity catalog: 73 legacy ideas; 19 conversation questions; both 40-prompt game pools verified');
