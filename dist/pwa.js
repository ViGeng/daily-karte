export function startAppExperience({
  reloadBlocker = () => '',
  browser = window,
  doc = document,
  navigator = globalThis.navigator,
  address = location,
} = {}) {
  const $ = selector => doc.querySelector(selector);
  const installButton = $('#install-app');
  const help = $('#install-help');
  const connection = $('#connection-status');
  const updateButton = $('#update-app');
  const updateStatus = $('#update-status');
  const standalone = browser.matchMedia?.('(display-mode: standalone)');
  const isStandalone = () => standalone?.matches || navigator?.standalone;
  const local = ['localhost', '127.0.0.1', '[::1]'].includes(address.hostname);
  const secure = address.protocol === 'https:' || local;
  const ios = /iPad|iPhone|iPod/.test(navigator?.userAgent ?? '')
    || (navigator?.platform === 'MacIntel' && navigator?.maxTouchPoints > 1);
  let installPrompt = null;
  let waitingWorker = null;
  let requestedUpdate = false;

  const refreshInstall = () => {
    installButton.hidden = !secure || isStandalone();
    if (installButton.hidden) help.hidden = true;
  };
  const showInstallHelp = () => {
    help.textContent = ios
      ? 'In Safari, tap Share, then choose Add to Home Screen.'
      : 'Open your browser menu and choose Install app or Add to Home Screen, if available.';
    help.hidden = false;
    installButton.setAttribute('aria-expanded', 'true');
  };
  const refreshConnection = () => {
    connection.hidden = navigator?.onLine !== false;
    connection.textContent = 'You are offline. Sign-in needs a connection. Guest records reset on reload.';
  };
  installButton.setAttribute('aria-controls', 'install-help');
  installButton.setAttribute('aria-expanded', 'false');
  refreshInstall();
  refreshConnection();
  standalone?.addEventListener('change', refreshInstall);
  browser.addEventListener('online', refreshConnection);
  browser.addEventListener('offline', refreshConnection);
  browser.addEventListener('beforeinstallprompt', event => {
    event.preventDefault();
    installPrompt = event;
    refreshInstall();
  });
  browser.addEventListener('appinstalled', () => {
    installPrompt = null;
    installButton.hidden = true;
    help.hidden = true;
  });
  installButton.addEventListener('click', async () => {
    const prompt = installPrompt;
    if (!prompt) {
      showInstallHelp();
      return;
    }
    installPrompt = null;
    installButton.disabled = true;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === 'accepted') installButton.hidden = true;
      else showInstallHelp();
    } catch {
      showInstallHelp();
    } finally {
      installButton.disabled = false;
    }
  });
  updateButton.addEventListener('click', () => {
    if (!waitingWorker) return;
    const blocker = reloadBlocker() || (navigator?.onLine === false ? 'Please reconnect before updating.' : '');
    if (blocker) {
      updateStatus.textContent = blocker;
      return;
    }
    requestedUpdate = true;
    updateButton.disabled = true;
    updateStatus.textContent = 'The app is updating…';
    waitingWorker.postMessage({ type: 'ACTIVATE_UPDATE' });
  });

  // Local previews opt in so the service worker cannot hide edits during development.
  if (!secure || !navigator?.serviceWorker || (local && !new URL(address.href).searchParams.has('pwa'))) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (requestedUpdate) address.reload();
  });
  const showUpdate = worker => {
    if (!worker || !navigator.serviceWorker.controller) return;
    waitingWorker = worker;
    $('#update-notice').hidden = false;
  };
  const register = async () => {
    try {
      const registration = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
      showUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => {
          if (worker.state === 'installed') showUpdate(registration.waiting ?? worker);
        });
      });
      return registration;
    } catch {
      help.textContent = 'Offline startup could not be prepared. You can keep using the app while connected.';
      help.hidden = false;
    }
  };
  if (doc.readyState === 'complete') return register();
  browser.addEventListener('load', () => { void register(); }, { once: true });
}
