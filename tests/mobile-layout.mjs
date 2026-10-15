// Dependency-free rendered-layout regression for the mobile idea surface.
// Runs against actual HTML/CSS using Google Chrome on GitHub's Ubuntu runner.
import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';

const repo = resolve(import.meta.dirname, '..');
const temporary = mkdtempSync(join(tmpdir(), '15funs-geometry-'));
try {
  const css = readFileSync(join(repo, 'style.css'), 'utf8')
    .replace(/^@import url\([^\n]+\);\s*/m, ''); // no external font requests
  let html = readFileSync(join(repo, 'index.html'), 'utf8')
    .replace('<script src="app.js" type="module"></script>', '');

  const probe = `<script>
    const box = selector => {
      const rect = document.querySelector(selector).getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, bottom: rect.bottom };
    };
    const measurement = {
      viewport: {width: innerWidth, height: innerHeight},
      layout: box('.layout'),
      card: box('#cardPanel'),
      body: box('#cardBody'),
      settings: box('.settings'),
      action: box('.draw-actions'),
      button: box('#drawBtn'),
      flexDirection: getComputedStyle(document.querySelector('.layout')).flexDirection,
      alignItems: getComputedStyle(document.querySelector('.layout')).alignItems,
    };
    document.body.dataset.layoutTest = encodeURIComponent(JSON.stringify(measurement));
  <\/script>`;
  html = html.replace('</body>', probe + '</body>');
  writeFileSync(join(temporary, 'index.html'), html);
  writeFileSync(join(temporary, 'style.css'), css);

  const browser = process.env.CHROME_PATH || 'google-chrome';
  function measure(width, height) {
    const profile = join(temporary, 'chrome-' + width + '-' + height);
    const args = [
      '--headless=new', '--no-sandbox', '--disable-gpu',
      '--disable-dev-shm-usage', '--disable-background-networking',
      '--no-first-run', '--no-default-browser-check', '--disable-extensions',
      '--user-data-dir=' + profile, '--window-size=' + width + ',' + height,
      '--force-device-scale-factor=1', '--virtual-time-budget=700',
      '--dump-dom', pathToFileURL(join(temporary, 'index.html')).href,
    ];
    const dom = execFileSync(browser, args, {encoding:'utf8', timeout:25000, stdio:['ignore','pipe','ignore']});
    const match = dom.match(/data-layout-test="([^"]+)"/);
    assert.ok(match, 'Chrome did not evaluate the mobile geometry probe');
    return JSON.parse(decodeURIComponent(match[1]));
  }

  for (const width of [500, 600]) {
    const g = measure(width, 850);
    assert.equal(g.flexDirection, 'column', 'Mobile layout must be vertical');
    assert.equal(g.alignItems, 'stretch', 'Mobile layout must stretch its card');
    assert.ok(Math.abs(g.card.width - g.settings.width) < 2,
      'Idea card must be as wide as the Filters panel: ' + JSON.stringify(g));
    assert.ok(g.card.width >= g.viewport.width - 50,
      'Idea card must fill the available screen width: ' + JSON.stringify(g));
    assert.ok(g.body.width >= g.card.width - 45,
      'Blank inner card must also fill the panel: ' + JSON.stringify(g));
    assert.ok(g.button.width >= g.card.width - 48,
      'Draw button should align with the card: ' + JSON.stringify(g));
    assert.ok(g.viewport.height - g.action.bottom >= 22,
      'Thumb action should have comfortable bottom breathing room');
    assert.ok(g.settings.bottom + 6 <= g.action.y,
      'Filters must not be covered by the elevated action: ' + JSON.stringify(g));
    console.log('Mobile geometry passed', {window:width, card:g.card.width,
      filters:g.settings.width, actionTop:g.action.y, actionBottom:g.action.bottom});
  }
} finally {
  rmSync(temporary, {recursive:true, force:true});
}
