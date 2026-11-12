import test from 'node:test';
import assert from 'node:assert/strict';
import { startAppExperience } from '../dist/pwa.js';

function surface({ local = false, optIn = false, ios = false, standalone = false, offline = false, registrationError = false } = {}) {
  const events = target => Object.assign(target, {
    handlers: new Map(),
    addEventListener(type, handler) { this.handlers.set(type, handler); },
    dispatch(type, event = {}) { return this.handlers.get(type)?.(event); },
  });
  const nodes = new Map();
  const doc = {
    readyState: 'complete',
    querySelector(selector) {
      if (!nodes.has(selector)) nodes.set(selector, events({
        hidden: true, textContent: '', attributes: {},
        setAttribute(name, value) { this.attributes[name] = value; },
      }));
      return nodes.get(selector);
    },
  };
  let reloads = 0;
  const address = {
    hostname: local ? '127.0.0.1' : 'example.com',
    protocol: local ? 'http:' : 'https:',
    href: local ? `http://127.0.0.1:4173/${optIn ? '?pwa=1' : ''}` : 'https://example.com/',
    reload() { reloads += 1; },
  };
  const media = events({ matches: standalone });
  const browser = events({ matchMedia: () => media });
  const messages = [];
  const worker = events({ state: 'installed', postMessage(message) { messages.push(message); } });
  const registration = events({ waiting: worker });
  const registrations = [];
  const navigator = {
    onLine: !offline,
    userAgent: ios ? 'iPhone' : 'Chrome',
    serviceWorker: events({
      controller: {},
      async register(...args) {
        registrations.push(args);
        if (registrationError) throw new Error('The connection failed.');
        return registration;
      },
    }),
  };
  let blocker = '';
  const ready = startAppExperience({ browser, doc, navigator, address, reloadBlocker: () => blocker });
  return {
    browser, doc, navigator, address, registrations, registration, worker, messages, media, ready,
    get: selector => doc.querySelector(selector),
    block: message => { blocker = message; },
    reloads: () => reloads,
  };
}

test('Installation uses the browser prompt once and falls back to readable instructions.', async () => {
  const app = surface();
  await app.ready;
  let prompts = 0;
  let prevented = false;
  app.browser.dispatch('beforeinstallprompt', {
    preventDefault() { prevented = true; },
    prompt: async () => { prompts += 1; },
    userChoice: Promise.resolve({ outcome: 'dismissed' }),
  });
  await app.get('#install-app').dispatch('click');
  await app.get('#install-app').dispatch('click');
  assert.equal(prevented, true);
  assert.equal(prompts, 1);
  assert.equal(app.get('#install-help').hidden, false);
  assert.match(app.get('#install-help').textContent, /browser menu/);
  assert.equal(app.get('#install-app').disabled, false);
});

test('Safari receives home-screen instructions and installed windows hide installation controls.', async () => {
  const app = surface({ ios: true });
  await app.ready;
  await app.get('#install-app').dispatch('click');
  assert.match(app.get('#install-help').textContent, /Safari.*Share.*Add to Home Screen/);
  app.media.matches = true;
  app.media.dispatch('change');
  assert.equal(app.get('#install-app').hidden, true);
  assert.equal(app.get('#install-help').hidden, true);
  const installed = surface({ standalone: true });
  await installed.ready;
  assert.equal(installed.get('#install-app').hidden, true);
});

test('Connectivity notices follow offline and online events.', async () => {
  const app = surface({ offline: true });
  await app.ready;
  assert.equal(app.get('#connection-status').hidden, false);
  assert.match(app.get('#connection-status').textContent, /Sign-in needs a connection/);
  app.navigator.onLine = true;
  app.browser.dispatch('online');
  assert.equal(app.get('#connection-status').hidden, true);
  app.navigator.onLine = false;
  app.browser.dispatch('offline');
  assert.equal(app.get('#connection-status').hidden, false);
});

test('An update never reloads drafts, guest records, or queued changes without a safe explicit click.', async () => {
  const app = surface();
  await app.ready;
  assert.deepEqual(app.registrations, [['./sw.js', { updateViaCache: 'none' }]]);
  assert.equal(app.get('#update-notice').hidden, false);
  app.navigator.serviceWorker.dispatch('controllerchange');
  assert.equal(app.reloads(), 0);
  for (const message of ['Please finish editing.', 'Please leave the guest session.', 'Please wait for sync.']) {
    app.block(message);
    app.get('#update-app').dispatch('click');
    assert.equal(app.get('#update-status').textContent, message);
    assert.equal(app.messages.length, 0);
  }
  app.block('');
  app.navigator.onLine = false;
  app.get('#update-app').dispatch('click');
  assert.equal(app.messages.length, 0);
  app.navigator.onLine = true;
  app.get('#update-app').dispatch('click');
  assert.deepEqual(app.messages, [{ type: 'ACTIVATE_UPDATE' }]);
  app.navigator.serviceWorker.dispatch('controllerchange');
  assert.equal(app.reloads(), 1);
});

test('A new installation does not display an update prompt.', async () => {
  const app = surface();
  app.navigator.serviceWorker.controller = null;
  await app.ready;
  assert.equal(app.get('#update-notice').hidden, true);
});

test('A newly downloaded worker offers an update without activating itself.', async () => {
  const app = surface();
  app.registration.waiting = null;
  app.registration.installing = app.worker;
  await app.ready;
  assert.equal(app.get('#update-notice').hidden, true);
  app.registration.dispatch('updatefound');
  app.worker.dispatch('statechange');
  assert.equal(app.get('#update-notice').hidden, false);
  assert.equal(app.messages.length, 0);
});

test('Local previews only register an offline cache when explicitly requested.', async () => {
  const preview = surface({ local: true });
  await preview.ready;
  assert.equal(preview.registrations.length, 0);
  const pwa = surface({ local: true, optIn: true });
  await pwa.ready;
  assert.equal(pwa.registrations.length, 1);
});

test('A registration failure leaves installation help and connected use available.', async () => {
  const app = surface({ registrationError: true });
  await app.ready;
  assert.equal(app.get('#install-help').hidden, false);
  assert.match(app.get('#install-help').textContent, /keep using the app while connected/);
  assert.equal(app.get('#update-notice').hidden, true);
});
