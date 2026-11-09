import test from 'node:test';
import assert from 'node:assert/strict';
import { dateKey } from '../dist/model.js';

test('Review keeps the heatmap above weekly blocks during navigation and day inspection.', async () => {
  const nodes = new Map();
  const handlers = new Map();
  const element = selector => {
    if (!nodes.has(selector)) {
      const events = new Map();
      nodes.set(selector, {
        id: selector.startsWith('#') ? selector.slice(1) : '',
        dataset: {}, hidden: false, open: false, innerHTML: '', textContent: '',
        classList: { toggle() {} },
        setAttribute() {},
        replaceChildren() { this.innerHTML = ''; },
        addEventListener(type, callback) { events.set(type, callback); },
        dispatch(type) { events.get(type)?.(); },
        querySelector() { return null; },
        focus() {},
        getClientRects() { return [{}]; },
        closest(selector) { return selector === 'button' ? this : null; },
      });
    }
    return nodes.get(selector);
  };
  const document = {
    body: element('body'), activeElement: element('body'),
    querySelector: selector => selector === '.heatmap-scroll' ? null : element(selector),
    querySelectorAll: selector => [element(selector)],
    addEventListener(type, callback) { handlers.set(type, callback); },
  };
  const globals = {
    document,
    location: { hash: '#insights', hostname: '127.0.0.1' },
    history: { replaceState() {} },
    window: { addEventListener() {}, scrollTo() {} },
    requestAnimationFrame(callback) { callback(); },
    CSS: { escape: value => value },
  };
  const previous = new Map(Object.keys(globals).map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)]));
  try {
    for (const [name, value] of Object.entries(globals)) {
      Object.defineProperty(globalThis, name, { value, configurable: true, writable: true });
    }
    await import('../dist/app.js');
    assert.equal(element('#workspace').hidden, true);
    const click = dataset => handlers.get('click')({ target: { dataset, closest() { return this; } } });
    click({ action: 'guest-entry' });
    assert.equal(element('#login-screen').hidden, true);
    assert.equal(element('#workspace').hidden, false);
    assert.match(element('#account-strip').innerHTML, /Guest session/);
    assert.match(element('#view-content').innerHTML, /class="quick-card"/);
    click({ view: 'insights' });
    const assertReview = () => {
      const markup = element('#view-content').innerHTML;
      assert.match(markup, /Yearly activity heatmap/);
      assert.match(markup, /Weekly activity blocks/);
      assert.ok(markup.indexOf('Yearly activity heatmap') < markup.indexOf('Weekly activity blocks'));
      assert.doesNotMatch(markup, /review-tabs|week-calendar|calendar-hours/);
      assert.equal((markup.match(/scope="col"/g) || []).length, 8);
      const range = markup.match(/data-start-slot="(\d+)" data-end-slot="(\d+)"/);
      assert.ok(range);
      const spans = [...markup.matchAll(/<td rowspan="(\d+)"><button class="week-slot /g)].map(match => Number(match[1]));
      assert.equal(spans.reduce((sum, span) => sum + span, 0), 7 * (Number(range[2]) - Number(range[1])));
      assert.match(markup, /Activity time distribution/);
      assert.ok(markup.indexOf('Weekly activity blocks') < markup.indexOf('Activity time distribution'));
      return markup;
    };
    const initialReview = assertReview();
    assert.match(initialReview, /class="distribution-donut"/);
    assert.match(initialReview, /class="distribution-slice /);
    assert.match(initialReview, /class="distribution-fill /);
    assert.match(initialReview, /20 min · 7.7%/);
    assert.match(initialReview, /1 record has no duration and is excluded/);
    assert.doesNotMatch(initialReview, /NaN|Infinity/);
    assert.match(initialReview, /data-start-slot="14" data-end-slot="44"/);
    assert.match(initialReview, /is-merged/);
    assert.equal((initialReview.match(/class="slot-name">Meeting<\/span>/g) || []).length, 1);
    click({ action: 'week-range' });
    const fullReview = assertReview();
    assert.match(fullReview, /data-start-slot="0" data-end-slot="48"/);
    assert.match(fullReview, /Fit activities/);
    assert.match(fullReview, /20 min · 7.7%/);
    click({ action: 'week-range' });
    assert.match(assertReview(), /data-start-slot="14" data-end-slot="44"/);
    click({ reviewShift: '-1' });
    const emptyReview = assertReview();
    assert.match(emptyReview, /There are no duration estimates for this week/);
    assert.doesNotMatch(emptyReview, /distribution-slice|NaN|Infinity/);
    click({ action: 'review-now' });
    assertReview();
    click({ reviewYearShift: '-1' });
    assertReview();
    const day = dateKey();
    click({ day });
    assert.match(assertReview(), /Selected day details/);
    click({ action: 'close-review-day' });
    assert.doesNotMatch(assertReview(), /Selected day details/);
    const focused = [];
    const table = {
      dataset: { startSlot: '14', endSlot: '22' },
      querySelectorAll(selector) { return cells.filter(cell => selector.includes(`data-day="${cell.dataset.day}"`)); },
      querySelector() { return cells.find(cell => cell.tabIndex === 0); },
    };
    const makeCell = (day, start, end) => ({
      dataset: { day, slot: String(start), slotEnd: String(end) },
      disabled: false, tabIndex: -1,
      closest(selector) { return selector === '.week-slot' ? this : table; },
      focus() { focused.push(this); },
    });
    const cells = [makeCell('2026-11-04', 16, 20), makeCell('2026-11-04', 20, 22), makeCell('2026-11-05', 14, 18)];
    cells[0].tabIndex = 0;
    const press = (target, key) => handlers.get('keydown')({ target, key, preventDefault() {} });
    press(cells[0], 'ArrowDown');
    assert.equal(focused.at(-1), cells[1]);
    press(cells[1], 'ArrowUp');
    assert.equal(focused.at(-1), cells[0]);
    press(cells[0], 'ArrowRight');
    assert.equal(focused.at(-1), cells[2]);
    assert.equal(cells.filter(cell => cell.tabIndex === 0).length, 1);
    element('#demo-toggle').dispatch('click');
    assert.equal(element('#workspace').hidden, true);
    assert.equal(element('#login-screen').hidden, false);
  } finally {
    for (const [name, descriptor] of previous) {
      if (descriptor) Object.defineProperty(globalThis, name, descriptor);
      else delete globalThis[name];
    }
  }
});
