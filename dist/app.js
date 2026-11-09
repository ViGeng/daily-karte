import { DEFAULT_CARDS, DURATION_OPTIONS, createId, dateKey, shiftDay, formatDuration, createEntry, listEntriesForDay, summarizeDay, summarizeWeek, activityDays, weekStart, weekBlockLayout, resolveEndTime, saveActivity, undoActivity } from './model.js?v=20261109-merged';
import { icon, activityIcons, isActivityIcon } from './icons.js';
import { createAccountStore } from './account.js?v=20261109-timeline';
import { isValidState } from './schema.js';

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'daily-karte.v1';
const COLORS = ['sage', 'amber', 'rose', 'blue', 'lavender'];
const COLOR_NAMES = { sage: 'Sage', amber: 'Amber', rose: 'Rose', blue: 'Blue', lavender: 'Lavender' };
const VIEWS = [
  { id: 'today', name: 'Your day', icon: 'timeline' },
  { id: 'cards', name: 'Cards', icon: 'grid' },
  { id: 'insights', name: 'Review', icon: 'chart' },
];
const escapeHTML = (value) => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cloneCards = () => DEFAULT_CARDS.map(card => ({ ...card }));
let storageAvailable = true;
let storageMessage = '';

function loadState() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return { cards: cloneCards(), entries: [] };
    const parsed = JSON.parse(saved);
    if (parsed.version !== 1 || !isValidState({ cards: parsed.cards, entries: parsed.entries })) throw new Error('The saved format is not recognized.');
    return { cards: parsed.cards, entries: parsed.entries };
  } catch {
    storageAvailable = false;
    storageMessage = 'Saved browser data could not be read. Existing data will not be overwritten. New records will stay on this page temporarily.';
    return { cards: cloneCards(), entries: [] };
  }
}

const personal = { cards: cloneCards(), entries: [] };
let personalLoaded = false;
let previousAccountUid = null;
let loginRequested = false;
let signInBusy = false;
let loginError = '';
const account = createAccountStore({
  guest: personal,
  onChange: ({ accountChanged }) => {
    if (accountChanged) {
      const leavingDemo = (account.user && loginRequested) || (!account.user && previousAccountUid);
      if (!demo || leavingDemo) {
        dismissToast();
        if ($('#editor').open) closeEditor();
        $('#editor-content').replaceChildren();
        if (!account.user) {
          $('#toast').replaceChildren();
          $('#announcer').textContent = '';
        }
      }
      if (leavingDemo) {
        demo = false;
        demoState = null;
        loginRequested = false;
        account.setWritesPaused(false);
      }
      loginError = '';
      previousAccountUid = account.user?.uid ?? null;
    }
    render();
  },
  onStatus: () => renderAccount(),
});
let demo = false;
let demoState = null;
let selectedDay = dateKey();
let view = VIEWS.some(item => item.id === location.hash.slice(1)) ? location.hash.slice(1) : 'today';
let reviewYear = Number(selectedDay.slice(0, 4));
let reviewDayExpanded = false;
let reviewFullDay = false;
let toastTimer;
let toastAction = null;
let editorState = null;
let lastFocus = null;
const state = () => demo ? demoState : account.data;
const formatTime = value => new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
const dayLabel = key => new Intl.DateTimeFormat('en-GB', { month: 'short', day: 'numeric', weekday: 'short' }).format(new Date(`${key}T12:00:00`));
const timeInput = value => `${String(new Date(value).getHours()).padStart(2, '0')}:${String(new Date(value).getMinutes()).padStart(2, '0')}`;
const durationLabel = value => value === null ? 'No duration' : `About ${formatDuration(value)}`;
function summaryDuration(minutes) {
  return minutes ? `About ${formatDuration(minutes)}` : 'No duration';
}

function focusSelector(element) {
  if (!element || element === document.body) return null;
  if (element.id) return '#' + CSS.escape(element.id);
  if (element.hasAttribute('data-slot')) return `.week-slot[data-day="${CSS.escape(element.dataset.day)}"][data-slot="${CSS.escape(element.dataset.slot)}"]`;
  for (const attribute of ['data-record', 'data-edit-entry', 'data-edit-card', 'data-view', 'data-day', 'data-review-year-shift', 'data-review-shift', 'data-action']) {
    if (!element.hasAttribute(attribute)) continue;
    const container = element.closest('#desktop-nav, #mobile-nav');
    return `${container ? '#' + container.id + ' ' : ''}[${attribute}="${CSS.escape(element.getAttribute(attribute))}"]`;
  }
  return null;
}

function restoreFocus(selector) {
  const element = selector && [...document.querySelectorAll(selector)].find(item => item.getClientRects().length);
  element?.focus({ preventScroll: true });
  return Boolean(element);
}

function persist() {
  if (demo) return;
  if (account.user) {
    account.persist();
    return;
  }
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, ...personal }));
  } catch {
    storageAvailable = false;
    storageMessage = 'Your browser cannot save data. Your records are still on this page. Please export a backup before closing it.';
    render();
  }
}

function makeDemo() {
  const cards = cloneCards();
  const key = shiftDay(dateKey(), -1);
  const plan = [
    ['breakfast', '08:20', 'I started the day with a simple breakfast.'],
    ['meeting', '11:00', 'We discussed next steps with the team.'],
    ['lunch', '12:45', ''],
    ['coffee', '14:30', 'I took a short afternoon break.'],
    ['reading', '16:00', 'I read an interesting article.'],
    ['gym', '19:00', ''],
    ['german', '21:00', 'I practiced everyday conversation.'],
  ];
  return { cards, entries: plan.map(([id, time, note]) => createEntry(cards.find(card => card.id === id), { end: new Date(`${key}T${time}`).getTime(), note })) };
}

function toggleDemo() {
  dismissToast();
  demo = !demo;
  account.setWritesPaused(demo);
  if (demo) {
    demoState = makeDemo();
    selectedDay = shiftDay(dateKey(), -1);
  } else {
    demoState = null;
    selectedDay = dateKey();
  }
  view = 'today';
  reviewYear = Number(selectedDay.slice(0, 4));
  reviewDayExpanded = false;
  history.replaceState(null, '', '#today');
  render();
  if (!demo && !account.user) $('#google-sign-in').focus({ preventScroll: true });
  announce(demo ? 'You entered a guest session. Sample records stay separate from your account.' : account.user ? 'You returned to your records.' : 'You returned to the sign-in page.');
}

function announce(message) {
  $('#announcer').textContent = '';
  requestAnimationFrame(() => { $('#announcer').textContent = message; });
}

function dismissToast() {
  clearTimeout(toastTimer);
  $('#toast').hidden = true;
  toastAction = null;
}

function showToast(message, { undo, edit } = {}) {
  dismissToast();
  toastAction = { undo, edit };
  $('#toast').innerHTML = `<span class="toast-message">${icon('check')}<span>${escapeHTML(message)}</span></span><span class="toast-actions">${edit ? '<button data-toast="edit">Edit</button>' : ''}${undo ? '<button data-toast="undo">Undo</button>' : ''}<button class="toast-close" data-toast="close" aria-label="Dismiss notification">${icon('close')}</button></span>`;
  $('#toast').hidden = false;
  toastTimer = setTimeout(dismissToast, 12000);
}

function navMarkup() {
  return VIEWS.map(item => `<button class="nav-button ${view === item.id ? 'active' : ''}" data-view="${item.id}" ${view === item.id ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.name}</span></button>`).join('');
}

function render() {
  if (!renderAccess()) {
    $('#view-content').replaceChildren();
    $('#summary-strip').replaceChildren();
    $('#account-strip').replaceChildren();
    return;
  }
  if (account.user && !demo && !personalLoaded) {
    Object.assign(personal, loadState());
    personalLoaded = true;
  }
  const previousFocus = focusSelector(document.activeElement);
  const summary = summarizeDay(state().entries, selectedDay);
  const currentView = VIEWS.find(item => item.id === view);
  $('#desktop-nav').innerHTML = navMarkup();
  $('#mobile-nav').innerHTML = navMarkup();
  $('#breadcrumb').textContent = currentView.name;
  $('#demo-toggle').textContent = demo ? (account.user ? 'Return to your day' : 'Leave guest session') : 'Try a sample day';
  $('#demo-toggle').hidden = Boolean(account.user && !demo);
  $('.page-heading').classList.toggle('sr-only', view === 'today' || view === 'insights');
  $('#page-description').hidden = view === 'insights';
  $('.date-toolbar').hidden = view === 'insights';
  $('#summary-strip').hidden = view === 'insights';
  const headings = {
    today: ['Your day', 'Record what you just finished.'],
    cards: ['Activity cards', 'Keep your everyday activities one tap away.'],
    insights: ['Review', 'Look back at the activities you recorded.'],
  };
  const [title, description] = headings[view];
  $('#page-title').textContent = title;
  $('#page-description').textContent = description;
  $('#selected-date').innerHTML = `${icon('calendar')}${dayLabel(selectedDay)}${selectedDay === dateKey() ? '<small>Today</small>' : ''}`;
  $('#date-picker').value = selectedDay;
  $('#date-picker').max = dateKey();
  $('#next-day').disabled = selectedDay >= dateKey();
  $('#go-today').hidden = selectedDay === dateKey();
  $('#summary-strip').innerHTML = [
    ['timeline', 'Records', String(summary.count), ''],
    ['clock', 'Duration', summaryDuration(summary.totalMinutes), 'duration'],
  ].map(([symbol, label, value, className]) => `<div class="summary-item"><span class="summary-icon">${icon(symbol)}</span><div><p class="summary-label">${label}</p><p class="summary-value ${className}">${value}</p></div></div>`).join('');
  const warning = !demo && !account.user && storageMessage ? `<p class="storage-warning" role="alert">${storageMessage}</p>` : '';
  $('#view-content').innerHTML = warning + (view === 'today' ? renderToday() : view === 'cards' ? renderCards() : renderInsights(summary));
  const heatmap = $('.heatmap-scroll');
  const selectedCell = heatmap?.querySelector('[tabindex="0"]');
  if (selectedCell) heatmap.scrollLeft = Math.max(0, selectedCell.offsetLeft - heatmap.offsetLeft - heatmap.clientWidth / 2);
  renderAccount();
  if (previousFocus && !$('#editor').open && !restoreFocus(previousFocus)) $('#main').focus({ preventScroll: true });
}

function renderAccess() {
  const allowed = Boolean(account.user || demo);
  $('#login-screen').hidden = allowed;
  $('#workspace').hidden = !allowed;
  $('#mobile-nav').hidden = !allowed;
  $('.skip-link').href = allowed ? '#main' : '#login-title';
  if (!allowed && $('#editor').open) closeEditor();
  const connecting = account.status.kind === 'connecting';
  $('#google-sign-in').disabled = signInBusy || connecting;
  $('#google-sign-in-label').textContent = signInBusy ? 'Google sign-in is opening…' : connecting ? 'Sign-in is starting…' : 'Continue with Google';
  $('#login-status').hidden = !loginError;
  $('#login-status').textContent = loginError;
  return allowed;
}

function renderAccount() {
  if (!renderAccess()) return;
  const strip = $('#account-strip');
  if (!strip) return;
  const { status, user } = account;
  const local = status.kind === 'local';
  const label = demo ? 'Guest session' : local ? 'Your records are on this device' : user ? (user.displayName || user.email || 'Your account') : 'Your records can travel with you';
  const message = demo ? 'Sample records reset when you leave or refresh.' : (account.warning || (status.kind === 'ready' ? 'Synced' : status.message));
  const signInAvailable = !local && !user && status.kind !== 'connecting';
  strip.innerHTML = `<div class="account-copy">${icon(user ? 'shield' : 'leaf')}<div><strong>${escapeHTML(label)}</strong><p>${escapeHTML(message)}</p></div></div><div class="account-actions">${signInAvailable ? '<button data-action="sign-in">Continue with Google</button>' : ''}${user && !demo && personal.entries.length && account.connected ? '<button data-action="import-guest">Import local records</button>' : ''}${user && status.kind === 'error' ? '<button data-action="retry-sync">Retry sync</button>' : ''}${user ? '<button data-action="sign-out">Sign out</button>' : ''}</div>`;
  strip.dataset.status = status.kind;
  const loading = Boolean(user && !account.ready && !demo);
  $('#view-content').inert = loading;
  $('#summary-strip').setAttribute('aria-busy', String(loading));
}

function canChangeRecords() {
  if (!account.user && !demo) return false;
  if (!demo && account.user && !account.ready) {
    showToast('Your cloud records are loading. Please wait.');
    return false;
  }
  return true;
}

async function accountAction(action) {
  try {
    if (action === 'sign-in') {
      loginError = '';
      if (account.status.kind === 'local') {
        loginError = 'This is a local preview. Account sign-in requires Firebase setup. You can try the app as a guest.';
        renderAccess();
        if (demo) showToast('Account sign-in needs Firebase hosting. You can continue as a guest.');
        return;
      }
      loginRequested = true;
      signInBusy = true;
      renderAccess();
      await account.signIn();
    }
    if (action === 'sign-out') await account.signOut();
    if (action === 'retry-sync') await account.retry();
    if (action === 'import-guest') {
      account.importGuest();
      showToast('Local records were added to your account and are syncing.');
    }
  } catch (error) {
    if (action === 'sign-in') {
      loginRequested = false;
      loginError = error.message || 'Sign-in is unavailable. Please try again later.';
      renderAccess();
      if (demo) showToast(loginError);
    } else showToast(error.message || 'The connection is unavailable. Please try again later.');
  } finally {
    signInBusy = false;
    renderAccess();
  }
}

function quickCard(card) {
  return `<button class="quick-card" data-record="${escapeHTML(card.id)}" aria-label="Record ${escapeHTML(card.name)}, ${durationLabel(card.duration)}"><span class="activity-icon ${escapeHTML(card.color)}">${icon(card.icon)}</span><span class="quick-name">${escapeHTML(card.name)}</span><span class="quick-duration">${durationLabel(card.duration)}</span></button>`;
}

function renderToday() {
  const entries = listEntriesForDay(state().entries, selectedDay);
  const isToday = selectedDay === dateKey();
  return `<div class="content-grid"><section class="cards-panel" aria-labelledby="quick-title"><div class="section-heading"><h2 id="quick-title">${isToday ? 'Quick record' : 'Add a past activity'}</h2><button class="subtle-button" data-view="cards">Manage cards ${icon('right')}</button></div><div class="card-grid">${state().cards.map(quickCard).join('')}</div>${!state().cards.length ? '<button class="new-card" data-action="default-cards">Add the default cards</button>' : ''}<button class="new-card" data-action="new-card">${icon('plus')} New card</button></section><section class="timeline-panel" aria-labelledby="timeline-title"><div class="section-heading"><h2 id="timeline-title">Timeline</h2><button class="subtle-button" data-action="backfill">${icon('plus')} Add a past activity</button></div>${entries.length ? `<div class="timeline">${entries.map(entryMarkup).join('')}</div>` : emptyMarkup(isToday)}</section></div>`;
}

function entryMarkup(entry) {
  const crossDay = entry.start !== null && dateKey(entry.start) !== dateKey(entry.end);
  const interval = entry.duration === null ? 'At ' + formatTime(entry.end) : `${crossDay ? 'Previous day ' : ''}${formatTime(entry.start)} to ${formatTime(entry.end)}`;
  return `<article class="timeline-item"><time class="timeline-time" datetime="${new Date(entry.end).toISOString()}">${formatTime(entry.end)}</time><div class="entry-card"><span class="activity-icon ${escapeHTML(entry.color)}">${icon(entry.icon)}</span><div class="entry-body"><h3 class="entry-title">${escapeHTML(entry.name)}</h3><p class="entry-meta">${durationLabel(entry.duration)} · ${interval}</p>${entry.note ? `<p class="entry-note">${escapeHTML(entry.note)}</p>` : ''}</div><button class="entry-edit" data-edit-entry="${escapeHTML(entry.id)}" aria-label="Edit ${escapeHTML(entry.name)} record">${icon('edit')}</button></div></article>`;
}

function emptyMarkup(isToday) {
  return `<div class="empty-state">${icon('timeline')}<h3>${isToday ? 'Your day starts here.' : 'There are no records for this day.'}</h3><p>${isToday ? 'Tap a card to record what you just finished.' : 'Add an activity whenever you remember it.'}</p></div>`;
}

function renderCards() {
  return `<div class="section-heading"><h2>Your cards</h2><button class="subtle-button" data-action="new-card">${icon('plus')} New card</button></div><p class="view-intro">Each card remembers a duration. Changes apply to future records.</p><div class="library-grid">${state().cards.map(card => `<article class="library-card"><span class="activity-icon ${escapeHTML(card.color)}">${icon(card.icon)}</span><h3>${escapeHTML(card.name)}</h3><p>${durationLabel(card.duration)}</p><div class="library-actions"><button data-record="${escapeHTML(card.id)}">${icon('plus')} Record</button><button data-edit-card="${escapeHTML(card.id)}" aria-label="Edit ${escapeHTML(card.name)} card">${icon('edit')} Edit</button></div></article>`).join('')}<button class="library-card library-add" data-action="new-card">${icon('plus')}<span>New card</span></button></div>`;
}

function renderInsights(summary) {
  const week = summarizeWeek(state().entries, selectedDay);
  const start = weekStart(selectedDay);
  const end = shiftDay(start, 6);
  const rangeDate = (key, includeYear) => new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', ...(includeYear ? { year: 'numeric' } : {}) }).format(new Date(`${key}T12:00:00`));
  const label = `${rangeDate(start, start.slice(0, 4) !== end.slice(0, 4))} – ${rangeDate(end, true)}`;
  const nextDisabled = start >= weekStart(dateKey());
  return `${renderHeatmap(reviewYear)}<section class="review-week" aria-label="Weekly activity overview"><div class="review-period"><button class="icon-button" data-review-shift="-1" aria-label="Previous week">${icon('left')}</button><h2>${label}</h2><button class="icon-button" data-review-shift="1" aria-label="Next week" ${nextDisabled ? 'disabled' : ''}>${icon('right')}</button><button class="subtle-button" data-action="review-now">This week</button></div>${renderWeek(week)}</section>${renderDistribution(week)}${reviewDayExpanded ? `<section class="review-day" aria-label="Selected day details"><div class="section-heading"><h2>${dayLabel(selectedDay)}, ${selectedDay.slice(0, 4)}</h2><button class="subtle-button" data-action="close-review-day">Close details</button></div>${renderDayInsights(summary)}</section>` : ''}<button class="export-button" data-action="export">${icon('download')} Export ${demo ? 'sample' : 'your'} records</button>`;
}

function renderHeatmap(year) {
  const firstDay = `${year}-01-01`;
  const days = activityDays(state().entries, firstDay, `${year}-12-31`);
  const offset = (new Date(`${firstDay}T12:00:00`).getDay() + 6) % 7;
  const weeks = Math.ceil((offset + days.length) / 7);
  const focusDay = selectedDay.startsWith(`${year}-`) ? selectedDay : firstDay;
  const count = days.filter(day => day.day <= dateKey()).reduce((sum, day) => sum + day.count, 0);
  const minutes = days.filter(day => day.day <= dateKey()).reduce((sum, day) => sum + day.totalMinutes, 0);
  const monthLabels = days.flatMap((day, index) => day.day.endsWith('-01') ? [`<span class="heatmap-month" style="grid-column:${Math.floor((offset + index) / 7) + 2};grid-row:1">${new Intl.DateTimeFormat('en', { month: 'short' }).format(new Date(`${day.day}T12:00:00`))}</span>`] : []).join('');
  const weekdayLabels = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, index) => `<span class="heatmap-weekday" style="grid-column:1;grid-row:${index + 2}" aria-hidden="true">${index % 2 === 0 ? day : ''}</span>`).join('');
  const cells = days.map((day, index) => {
    const future = day.day > dateKey();
    const level = future ? 0 : [0, 60, 180, 360, Infinity].findIndex(limit => day.totalMinutes <= limit);
    const label = `${dayLabel(day.day)}, ${year}: ${day.count} ${day.count === 1 ? 'record' : 'records'}, ${summaryDuration(day.totalMinutes)}${future ? ', future date' : ''}`;
    return `<button class="heatmap-day heat-${level}${day.count && !day.totalMinutes ? ' duration-unknown' : ''}" data-day="${day.day}" style="grid-column:${Math.floor((offset + index) / 7) + 2};grid-row:${(offset + index) % 7 + 2}" aria-label="${label}" title="${label}" aria-pressed="${day.day === selectedDay}" tabindex="${day.day === focusDay ? '0' : '-1'}" ${future ? 'disabled' : ''}></button>`;
  }).join('');
  return `<section class="insight-card heatmap-card" aria-label="Yearly activity heatmap"><div class="heatmap-heading"><h2>Activity heatmap</h2><div class="heatmap-year"><button class="icon-button" data-review-year-shift="-1" aria-label="Previous heatmap year">${icon('left')}</button><span>${year}</span><button class="icon-button" data-review-year-shift="1" aria-label="Next heatmap year" ${year >= Number(dateKey().slice(0, 4)) ? 'disabled' : ''}>${icon('right')}</button></div></div><p class="review-summary"><strong>${summaryDuration(minutes)}</strong> <span>·</span> ${count} ${count === 1 ? 'record' : 'records'}</p><div class="heatmap-scroll" tabindex="0" role="region" aria-label="Scrollable activity heatmap"><div class="heatmap-grid" style="--weeks:${weeks}">${monthLabels}${weekdayLabels}${cells}</div></div><div class="heatmap-legend"><span>Less</span>${[0, 1, 2, 3, 4].map(level => `<span class="heatmap-swatch heat-${level}" title="${['No estimated duration', 'Up to 1 hour', 'Over 1 to 3 hours', 'Over 3 to 6 hours', 'Over 6 hours'][level]}"></span>`).join('')}<span>More</span></div><p class="review-help">Colors show estimated daily duration. Outlined squares have records without duration.</p><p class="sr-only">Select a square to review its week and day. Use the arrow keys to move between days in the heatmap.</p></section>`;
}

function renderWeek(summary) {
  const layout = weekBlockLayout(summary.blocks, reviewFullDay);
  const headers = summary.days.map(day => `<th scope="col"><button class="week-date ${day.day === dateKey() ? 'is-today' : ''}" data-day="${day.day}" aria-pressed="${day.day === selectedDay}" aria-label="Review ${dayLabel(day.day)}" ${day.day > dateKey() ? 'disabled' : ''}><span>${new Intl.DateTimeFormat('en', { weekday: 'short' }).format(new Date(`${day.day}T12:00:00`))}</span><strong>${Number(day.day.slice(-2))}</strong></button></th>`).join('');
  const selectedColumn = summary.blocks.find(column => column.day === selectedDay);
  const firstOccupied = selectedColumn?.slots.findIndex(slot => slot.activity || slot.points.length) ?? -1;
  const focusSlot = firstOccupied < 0 ? layout.startSlot : firstOccupied;
  const clockLabel = minute => `${String(Math.floor(minute / 60)).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`;
  const rows = Array.from({ length: layout.endSlot - layout.startSlot }, (_, offset) => {
    const index = layout.startSlot + offset;
    const cells = layout.columns.map(({ day, runs }) => {
      const run = runs.find(item => item.startSlot === index);
      if (!run) return '';
      const span = run.endSlot - run.startSlot;
      const time = `${clockLabel(index * 30)} to ${clockLabel(run.endSlot * 30)}`;
      const entry = run.activity ?? run.slots[0].points[0];
      const coverage = run.slots.reduce((sum, slot) => sum + (slot.activity?.minutes ?? 0), 0);
      const points = run.slots.flatMap(slot => slot.points).map(point => `${point.name} at ${formatTime(point.end)}, no duration`).join(', ');
      const available = run.slots.some(slot => slot.availableMinutes > 0);
      const label = `${dayLabel(day)}, ${time}. ${run.activity ? `${run.activity.name} covers ${Number(coverage.toFixed(1))} min.` : 'No recorded duration.'}${points ? ' ' + points + '.' : ''}${!available ? ' This local time does not occur.' : ''}`;
      const markers = run.slots.map((slot, pointIndex) => slot.points.length ? `<span class="slot-point" style="top:calc(${pointIndex} * (var(--slot-height) + 1px))" aria-hidden="true">•</span>` : '').join('');
      return `<td rowspan="${span}"><button class="week-slot ${entry ? 'has-records ' + escapeHTML(entry.color) : ''}${span > 1 ? ' is-merged' : ''}${!available ? ' unavailable' : ''}" style="--span:${span}" data-day="${day}" data-slot="${index}" data-slot-end="${run.endSlot}" tabindex="${day === selectedDay && index <= focusSlot && run.endSlot > focusSlot ? '0' : '-1'}" title="${escapeHTML(label)}" aria-label="${escapeHTML(label)}" ${day > dateKey() || !available ? 'disabled' : ''}><span class="slot-name">${run.activity ? escapeHTML(run.activity.name) : ''}</span>${markers}</button></td>`;
    }).join('');
    return `<tr>${offset % 2 === 0 ? `<th scope="rowgroup" rowspan="2">${clockLabel(index * 30)}</th>` : ''}${cells}</tr>`;
  }).join('');
  return `<section class="insight-card week-card" aria-label="Weekly activity blocks"><div class="week-summary"><p class="review-summary"><strong>${summaryDuration(summary.totalMinutes)}</strong> <span>·</span> ${summary.count} ${summary.count === 1 ? 'record ends' : 'records end'} this week</p><button class="subtle-button" data-action="week-range" aria-pressed="${reviewFullDay}">${reviewFullDay ? 'Fit activities' : 'Show full day'}</button></div><p class="week-range-label">${clockLabel(layout.startSlot * 30)} to ${clockLabel(layout.endSlot * 30)}</p><table class="week-table" style="--visible-rows:${layout.endSlot - layout.startSlot}" data-start-slot="${layout.startSlot}" data-end-slot="${layout.endSlot}"><caption class="sr-only">Consecutive half-hour blocks of the same activity appear as a single block.</caption><colgroup><col class="week-time-column">${'<col>'.repeat(7)}</colgroup><thead><tr><th scope="col">Time</th>${headers}</tr></thead><tbody>${rows}</tbody><tfoot><tr><th>${clockLabel(layout.endSlot * 30)}</th><td colspan="7"></td></tr></tfoot></table><p class="review-help">Matching activities are joined. Dots mark records without duration. Select a block to review its day.</p></section>`;
}

function renderDistribution(summary) {
  const timed = summary.byActivity.filter(activity => activity.minutes > 0);
  const circumference = 2 * Math.PI * 44;
  let offset = 0;
  const slices = timed.map(activity => {
    const length = activity.minutes / summary.totalMinutes * circumference;
    const slice = `<circle class="distribution-slice ${escapeHTML(activity.color)}" cx="60" cy="60" r="44" stroke-dasharray="${length} ${circumference - length}" stroke-dashoffset="${-offset}"><title>${escapeHTML(activity.name)}: ${durationLabel(activity.minutes)}</title></circle>`;
    offset += length;
    return slice;
  }).join('');
  const maximum = Math.max(1, ...timed.map(activity => activity.minutes));
  const bars = summary.byActivity.map(activity => `<div class="distribution-row"><span class="activity-icon ${escapeHTML(activity.color)}">${icon(activity.icon)}</span><span class="distribution-name">${escapeHTML(activity.name)}</span><span class="distribution-value">${activity.minutes ? `${formatDuration(activity.minutes)} · ${(activity.minutes / summary.totalMinutes * 100).toFixed(1)}%` : 'No duration'}</span><div class="distribution-track"><div class="distribution-fill ${escapeHTML(activity.color)}" style="--width:${activity.minutes / maximum * 100}%"></div></div></div>`).join('');
  const unknown = summary.byActivity.reduce((sum, activity) => sum + activity.days.reduce((count, day) => count + day.unknownCount, 0), 0);
  return `<section class="insight-card distribution-card" aria-labelledby="distribution-title"><h2 id="distribution-title">Activity time distribution</h2><p class="view-intro">These charts summarize records ending this week.</p>${timed.length ? `<div class="distribution-layout"><svg class="distribution-donut" viewBox="0 0 120 120" role="img" aria-label="Weekly estimated duration shares"><circle class="distribution-base" cx="60" cy="60" r="44"/><g transform="rotate(-90 60 60)">${slices}</g><text x="60" y="56" class="donut-label">Estimated time</text><text x="60" y="72" class="donut-total">${formatDuration(summary.totalMinutes)}</text></svg><div class="distribution-bars" role="group" aria-label="Estimated duration by activity">${bars}</div></div>` : `<p class="insight-empty">There are no duration estimates for this week.</p>${bars ? `<div class="distribution-bars">${bars}</div>` : ''}`}${unknown ? `<p class="review-help">${unknown} ${unknown === 1 ? 'record has' : 'records have'} no duration and ${unknown === 1 ? 'is' : 'are'} excluded from the duration shares.</p>` : ''}<p class="review-help">Durations are estimates and may overlap.</p></section>`;
}

function renderDayInsights(summary) {
  const maximum = Math.max(...summary.byActivity.map(item => item.minutes), 1);
  const entries = listEntriesForDay(state().entries, selectedDay);
  return `<section class="insight-card"><h2>Activity totals</h2><p class="view-intro">These estimates cover the activities you recorded.</p>${summary.count ? summary.byActivity.map(item => `<div class="stat-row"><span class="activity-icon ${escapeHTML(item.color)}">${icon(item.icon)}</span><span class="stat-name">${escapeHTML(item.name)}</span><div class="stat-track">${item.minutes ? `<div class="stat-fill ${escapeHTML(item.color)}" style="--width:${Math.max(3, item.minutes / maximum * 100)}%"></div>` : ''}</div><div class="stat-value">${item.minutes ? `About ${formatDuration(item.minutes)}` : 'No duration'}<p class="count-note">${item.count} ${item.count === 1 ? 'record' : 'records'}</p></div></div>`).join('') : '<div class="insight-empty">There are no records for this day.</div>'}<p class="insight-note">Activities can overlap. The total adds their estimates and does not account for your entire day.</p></section>${entries.length ? `<section class="review-timeline" aria-label="Records for the selected day"><h2>Timeline</h2><div class="timeline">${entries.map(entryMarkup).join('')}</div></section>` : ''}`;
}

function recordCard(id) {
  if (!canChangeRecords()) return;
  const card = state().cards.find(item => item.id === id);
  if (!card) return;
  if (selectedDay !== dateKey()) return openEntryEditor(null, card);
  const targetState = state();
  const entry = createEntry(card);
  const change = saveActivity(targetState.entries, entry);
  targetState.entries = change.entries;
  persist();
  render();
  showToast(change.merged ? `Nearby ${card.name} records were merged.` : `${card.name} was recorded.`, {
    undo: () => {
      undoSavedActivity(targetState, change);
    },
    edit: () => openEntryEditor(entry.id),
  });
}

function undoSavedActivity(source, change) {
  try {
    source.entries = undoActivity(source.entries, change);
    persist(); render(); announce('The change was undone.');
  } catch (error) { showToast(error.message); }
}

function durationFields(value, id = 'entry-duration') {
  return `<div class="form-field"><label for="${id}">Estimated duration <span class="field-help">(minutes, optional)</span></label><input id="${id}" name="duration" type="number" inputmode="numeric" min="1" max="1440" step="1" value="${value ?? ''}" placeholder="Leave blank for no duration"><div class="duration-options">${DURATION_OPTIONS.map(minutes => `<button type="button" class="duration-chip ${value === minutes ? 'active' : ''}" data-duration="${minutes}" aria-pressed="${value === minutes}">${formatDuration(minutes)}</button>`).join('')}<button type="button" class="duration-chip ${value === null ? 'active' : ''}" data-duration="none" aria-pressed="${value === null}">No duration</button></div></div>`;
}

function showEditor(markup, title, description) {
  dismissToast();
  lastFocus = { element: document.activeElement, selector: focusSelector(document.activeElement) };
  $('#editor-title').textContent = title;
  $('#editor').setAttribute('aria-description', description);
  $('#editor-content').innerHTML = markup;
  $('#editor').showModal();
}

function openEntryEditor(id = null, card = null) {
  if (!canChangeRecords()) return;
  const existing = id ? state().entries.find(item => item.id === id) : null;
  if (id && !existing) return;
  const chosen = card || existing || state().cards[0] || { id: '__once__', name: 'One-time activity', icon: 'leaf', color: 'sage', duration: null };
  const now = new Date();
  const end = existing?.end ?? new Date(`${selectedDay}T${timeInput(now)}`).getTime();
  editorState = { type: 'entry', id, cardId: existing?.cardId ?? chosen.id, source: state(), isDemo: demo, original: existing ? { ...existing } : null };
  showEditor(`<form id="entry-form"><div class="entry-preview"><span class="activity-icon ${escapeHTML(chosen.color)}" id="preview-icon">${icon(chosen.icon)}</span><div><strong id="preview-name">${escapeHTML(chosen.name)}</strong><p>${existing ? 'Changes apply to this record.' : 'An approximate time is enough.'}</p></div></div>${!existing ? `<div class="form-field"><label for="entry-card">Activity</label><select id="entry-card" name="cardId">${state().cards.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === chosen.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}<option value="__once__" ${chosen.id === '__once__' ? 'selected' : ''}>One-time activity</option></select></div><div class="form-field" id="oneoff-field" ${chosen.id !== '__once__' ? 'hidden' : ''}><label for="oneoff-name">Activity name</label><input id="oneoff-name" name="oneoffName" maxlength="32" placeholder="For example, visiting an exhibition" ${chosen.id === '__once__' ? 'required' : ''}></div>` : ''}<div class="field-row"><div class="form-field"><label for="entry-date">${chosen.duration === null ? 'Date' : 'End date'}</label><input id="entry-date" name="date" type="date" value="${dateKey(end)}" max="${dateKey()}" required></div><div class="form-field"><label for="entry-time">${chosen.duration === null ? 'Approximate time' : 'Approximate end time'}</label><input id="entry-time" name="time" type="time" value="${timeInput(end)}" required></div></div>${durationFields(existing ? existing.duration : chosen.duration)}<div class="form-field"><label for="entry-note">Note <span class="field-help">(optional)</span></label><textarea id="entry-note" name="note" maxlength="500" rows="2" placeholder="What would you like to remember?">${escapeHTML(existing?.note || '')}</textarea></div><p class="form-error" id="form-error" role="alert" hidden></p><div class="sheet-actions">${existing ? `<button type="button" class="delete-button" data-action="delete-entry" aria-label="Delete this record">${icon('trash')}</button>` : ''}<button class="primary-button" type="submit">${icon('check')}${existing ? 'Save record' : 'Record activity'}</button></div></form>`, existing ? 'Edit record' : 'Add a past activity', 'Edit a recorded activity.');
}

function openCardEditor(id = null) {
  if (!canChangeRecords()) return;
  const card = id ? state().cards.find(item => item.id === id) : null;
  if (id && !card) return;
  editorState = { type: 'card', id, source: state(), isDemo: demo, original: card ? { ...card } : null, icon: card?.icon || 'leaf', color: card?.color || 'sage' };
  const iconNames = { sun: 'Sun', utensils: 'Meal', moon: 'Moon', coffee: 'Coffee', book: 'Book', dumbbell: 'Exercise', languages: 'Language', users: 'People', leaf: 'Leaf', sparkles: 'Sparkles' };
  showEditor(`<form id="card-form"><div class="form-field"><label for="card-name">Activity name</label><input id="card-name" name="name" maxlength="32" value="${escapeHTML(card?.name || '')}" placeholder="For example, walking" required autocomplete="off"></div><div class="form-field"><span class="field-label">Icon</span><div class="icon-options" role="group" aria-label="Activity icons">${activityIcons.map(symbol => `<button type="button" class="icon-option ${symbol === editorState.icon ? 'active' : ''}" data-icon="${symbol}" aria-label="${iconNames[symbol]}" aria-pressed="${symbol === editorState.icon}">${icon(symbol)}</button>`).join('')}</div></div><div class="form-field"><label for="card-emoji">Custom emoji or symbol</label><input id="card-emoji" name="emoji" maxlength="38" value="${escapeHTML(card?.icon.startsWith('emoji:') ? card.icon.slice(6) : '')}" placeholder="🎨" autocomplete="off"><p class="field-help">You can use your device’s emoji keyboard or paste a symbol.</p></div><div class="form-field"><span class="field-label">Color</span><div class="color-options" role="group" aria-label="Card colors">${COLORS.map(color => `<button type="button" class="color-option ${color} ${color === editorState.color ? 'active' : ''}" data-color="${color}" aria-label="${COLOR_NAMES[color]}" aria-pressed="${color === editorState.color}"></button>`).join('')}</div></div>${durationFields(card?.duration ?? null, 'card-duration')}<p class="field-help">Changes to this card will apply to future records.</p><p class="form-error" id="form-error" role="alert" hidden></p><div class="sheet-actions">${card ? `<button type="button" class="delete-button" data-action="delete-card" aria-label="Delete this card">${icon('trash')}</button>` : ''}<button class="primary-button" type="submit">${icon('check')} ${card ? 'Save card' : 'Create card'}</button></div></form>`, card ? 'Edit card' : 'New card', 'Customize an activity card.');
}

function closeEditor() { $('#editor').close(); }

function formError(message) {
  $('#form-error').textContent = message;
  $('#form-error').hidden = false;
}

function checkEditorVersion(current) {
  if (!editorState.id) return;
  const original = editorState.original;
  if (!current || Object.keys(original).length !== Object.keys(current).length
    || Object.keys(original).some(key => original[key] !== current[key])) {
    throw new Error('This item changed on another device. Your input is still here. Please close and reopen the editor to review the latest version.');
  }
}

function readDuration(form) {
  const value = form.elements.duration.value.trim();
  if (!value) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('Please enter a whole number from 1 to 1440 minutes, or leave it blank.');
  return minutes;
}

function saveEntry(form) {
  try {
    const source = editorState.source;
    const duration = readDuration(form);
    const date = form.elements.date.value;
    const time = form.elements.time.value;
    const existing = source.entries.find(item => item.id === editorState.id);
    checkEditorVersion(existing);
    const end = resolveEndTime(date, time, existing?.end);
    if (end > Date.now() + 60_000) throw new Error('Please choose a time in the past or present.');
    const oneoff = form.elements.cardId?.value === '__once__';
    const oneoffName = form.elements.oneoffName?.value.trim();
    if (oneoff && !oneoffName) throw new Error('Please enter an activity name.');
    const card = existing || (oneoff ? { id: 'oneoff:' + oneoffName, name: oneoffName, icon: 'leaf', color: 'sage' } : source.cards.find(item => item.id === form.elements.cardId?.value));
    if (!card) throw new Error('This card no longer exists. Please choose another activity.');
    const note = form.elements.note.value.trim();
    const entry = createEntry({ ...card, id: existing?.cardId || card.id }, { end, duration, note });
    if (existing) Object.assign(entry, { id: existing.id, createdAt: existing.createdAt });
    const change = saveActivity(source.entries, entry);
    source.entries = change.entries;
    selectedDay = date;
    persist(); closeEditor(); render();
    showToast(change.merged ? `Nearby ${entry.name} records were merged.` : existing ? 'The record was updated.' : `${entry.name} was recorded.`, {
      undo: () => undoSavedActivity(source, change),
    });
  } catch (error) { formError(error.message); }
}

function saveCard(form) {
  try {
    const name = form.elements.name.value.trim();
    if (!name) throw new Error('Please give this card a name.');
    const duration = readDuration(form);
    const customIcon = form.elements.emoji.value.trim();
    const selectedIcon = customIcon ? `emoji:${customIcon}` : editorState.icon;
    if (!isActivityIcon(selectedIcon)) throw new Error('Please enter an emoji or a short symbol without spaces.');
    const source = editorState.source;
    const existing = source.cards.find(item => item.id === editorState.id);
    checkEditorVersion(existing);
    const card = { id: existing?.id || createId(), name, duration, icon: selectedIcon, color: editorState.color };
    const before = existing ? { ...existing } : null;
    if (existing) source.cards = source.cards.map(item => item.id === card.id ? card : item);
    else source.cards.push(card);
    persist(); closeEditor(); render();
    showToast(existing ? 'The card was updated.' : 'The new card is ready.', { undo: () => {
      source.cards = source.cards.filter(item => item.id !== card.id);
      if (before) source.cards.push(before);
      persist(); render(); announce('The card change was undone.');
    } });
  } catch (error) { formError(error.message); }
}

function deleteItem(kind) {
  const source = editorState.source;
  const list = kind === 'entry' ? 'entries' : 'cards';
  const index = source[list].findIndex(item => item.id === editorState.id);
  if (index < 0) return;
  const removed = source[list][index];
  try { checkEditorVersion(removed); } catch (error) { formError(error.message); return; }
  source[list].splice(index, 1);
  persist(); closeEditor(); render();
  showToast(kind === 'entry' ? 'The record was deleted.' : 'The card was deleted. Past records are retained.', { undo: () => {
    source[list].splice(Math.min(index, source[list].length), 0, removed);
    persist(); render(); announce('The item was restored.');
  } });
}

function exportData() {
  const blob = new Blob([JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), ...state() }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `daily-karte-${demo ? 'demo-' : ''}${dateKey()}.json`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast('Your backup is ready.');
}

document.addEventListener('click', event => {
  const button = event.target.closest('button');
  if (!button) return;
  if (button.dataset.view) {
    dismissToast(); view = button.dataset.view;
    history.replaceState(null, '', '#' + view);
    render(); window.scrollTo({ top: 0, behavior: 'instant' });
  } else if (button.dataset.record) recordCard(button.dataset.record);
  else if (button.dataset.editEntry) openEntryEditor(button.dataset.editEntry);
  else if (button.dataset.editCard) openCardEditor(button.dataset.editCard);
  else if (button.dataset.day) {
    selectedDay = button.dataset.day;
    reviewYear = Number(selectedDay.slice(0, 4));
    reviewDayExpanded = true;
    render();
  }
  else if (button.dataset.reviewYearShift) {
    reviewYear = Math.min(Number(dateKey().slice(0, 4)), reviewYear + Number(button.dataset.reviewYearShift));
    render();
  }
  else if (button.dataset.reviewShift) {
    const offset = Number(button.dataset.reviewShift);
    const next = shiftDay(selectedDay, offset * 7);
    selectedDay = next > dateKey() ? dateKey() : next;
    reviewYear = Number(selectedDay.slice(0, 4));
    reviewDayExpanded = false;
    render();
  }
  else if (button.dataset.toast) {
    const action = toastAction?.[button.dataset.toast];
    dismissToast(); action?.();
  } else if (button.dataset.duration) {
    const form = button.closest('form');
    form.elements.duration.value = button.dataset.duration === 'none' ? '' : button.dataset.duration;
    form.querySelectorAll('[data-duration]').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  } else if (button.dataset.icon) {
    editorState.icon = button.dataset.icon;
    $('#card-emoji').value = '';
    button.parentElement.querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  } else if (button.dataset.color) {
    editorState.color = button.dataset.color;
    button.parentElement.querySelectorAll('button').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-pressed', String(item === button)); });
  } else if (button.dataset.action === 'demo') toggleDemo();
  else if (button.dataset.action === 'guest-entry' && !demo) {
    loginError = '';
    toggleDemo();
    window.scrollTo({ top: 0, behavior: 'instant' });
  }
  else if (button.dataset.action === 'backfill') openEntryEditor();
  else if (button.dataset.action === 'new-card') openCardEditor();
  else if (button.dataset.action === 'delete-entry') deleteItem('entry');
  else if (button.dataset.action === 'delete-card') deleteItem('card');
  else if (button.dataset.action === 'export') exportData();
  else if (button.dataset.action === 'review-now') { selectedDay = dateKey(); reviewYear = Number(selectedDay.slice(0, 4)); reviewDayExpanded = false; render(); }
  else if (button.dataset.action === 'week-range') { reviewFullDay = !reviewFullDay; render(); }
  else if (button.dataset.action === 'close-review-day') { reviewDayExpanded = false; render(); }
  else if (button.dataset.action === 'default-cards' && canChangeRecords()) {
    const ids = new Set(state().cards.map(card => card.id));
    state().cards.push(...DEFAULT_CARDS.filter(card => !ids.has(card.id)).map(card => ({ ...card })));
    persist(); render(); showToast('The default cards are ready.');
  }
  else if (['sign-in', 'sign-out', 'retry-sync', 'import-guest'].includes(button.dataset.action)) void accountAction(button.dataset.action);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'entry-form') { event.preventDefault(); saveEntry(event.target); }
  if (event.target.id === 'card-form') { event.preventDefault(); saveCard(event.target); }
});

document.addEventListener('input', event => {
  if (event.target.id === 'card-emoji') {
    if (!event.target.value.trim() && editorState.icon.startsWith('emoji:')) editorState.icon = 'leaf';
    event.target.form.querySelectorAll('[data-icon]').forEach(button => {
      const active = !event.target.value.trim() && button.dataset.icon === editorState.icon;
      button.classList.toggle('active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }
  if (event.target.name === 'duration') event.target.closest('form').querySelectorAll('[data-duration]').forEach(button => {
    const active = button.dataset.duration === (event.target.value || 'none');
    button.classList.toggle('active', active);
    button.setAttribute('aria-pressed', String(active));
  });
});

document.addEventListener('change', event => {
  if (event.target.id !== 'entry-card') return;
  const oneoff = event.target.value === '__once__';
  const card = oneoff ? { name: 'One-time activity', icon: 'leaf', color: 'sage', duration: null } : state().cards.find(item => item.id === event.target.value);
  if (!card) return;
  $('#preview-icon').className = `activity-icon ${card.color}`;
  $('#preview-icon').innerHTML = icon(card.icon);
  $('#preview-name').textContent = card.name;
  $('#oneoff-field').hidden = !oneoff;
  $('#oneoff-name').required = oneoff;
  event.target.form.elements.duration.value = card.duration ?? '';
  event.target.form.elements.duration.dispatchEvent(new Event('input', { bubbles: true }));
  $('label[for="entry-date"]').textContent = card.duration === null ? 'Date' : 'End date';
  $('label[for="entry-time"]').textContent = card.duration === null ? 'Approximate time' : 'Approximate end time';
});

document.addEventListener('keydown', event => {
  const slot = event.target.closest('.week-slot');
  if (slot) {
    const offsets = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] }[event.key];
    if (!offsets) return;
    event.preventDefault();
    let index = offsets[0] > 0 ? Number(slot.dataset.slotEnd) : Number(slot.dataset.slot) + offsets[0];
    const day = shiftDay(slot.dataset.day, offsets[1]);
    const table = slot.closest('.week-table');
    const cells = [...table.querySelectorAll(`[data-day="${day}"][data-slot]`)].filter(cell => !cell.disabled);
    const coveringCell = position => cells.find(cell => Number(cell.dataset.slot) <= position && Number(cell.dataset.slotEnd) > position);
    let next = coveringCell(index);
    while (!next && offsets[0] && index >= Number(table.dataset.startSlot) && index < Number(table.dataset.endSlot)) {
      index += offsets[0];
      next = coveringCell(index);
    }
    if (!next) return;
    const previous = table.querySelector('[tabindex="0"]');
    if (previous) previous.tabIndex = -1;
    slot.tabIndex = -1;
    next.tabIndex = 0;
    next.focus();
    return;
  }
  const cell = event.target.closest('.heatmap-day');
  if (!cell) return;
  const offset = { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 }[event.key];
  if (offset === undefined) return;
  event.preventDefault();
  const next = cell.closest('.heatmap-grid').querySelector(`[data-day="${shiftDay(cell.dataset.day, offset)}"]:not(:disabled)`);
  if (!next) return;
  cell.tabIndex = -1;
  next.tabIndex = 0;
  next.focus();
});

$('#prev-day').innerHTML = icon('left');
$('#next-day').innerHTML = icon('right');
$('#close-editor').innerHTML = icon('close');
$('#prev-day').addEventListener('click', () => { selectedDay = shiftDay(selectedDay, -1); render(); });
$('#next-day').addEventListener('click', () => { if (selectedDay < dateKey()) { selectedDay = shiftDay(selectedDay, 1); render(); } });
$('#go-today').addEventListener('click', () => { selectedDay = dateKey(); render(); });
$('#selected-date').addEventListener('click', () => {
  try { $('#date-picker').showPicker(); } catch { $('#date-picker').focus(); $('#date-picker').click(); }
});
$('#date-picker').addEventListener('change', event => { if (event.target.value && event.target.value <= dateKey()) { selectedDay = event.target.value; render(); } });
$('#demo-toggle').addEventListener('click', toggleDemo);
$('#close-editor').addEventListener('click', closeEditor);
$('#editor').addEventListener('close', () => {
  editorState = null;
  if (lastFocus?.element?.isConnected) lastFocus.element.focus({ preventScroll: true });
  else if (!restoreFocus(lastFocus?.selector)) $('#main').focus({ preventScroll: true });
});
$('#editor').addEventListener('click', event => {
  if (event.target !== $('#editor')) return;
  const bounds = $('#editor').getBoundingClientRect();
  if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) closeEditor();
});
window.addEventListener('hashchange', () => {
  const id = location.hash.slice(1);
  if (VIEWS.some(item => item.id === id)) { view = id; render(); }
});
window.addEventListener('storage', event => {
  if (event.key !== STORAGE_KEY || !event.newValue || !account.user || demo) return;
  const updated = loadState();
  if (storageAvailable) {
    personal.cards = updated.cards; personal.entries = updated.entries;
    if (!demo && !$('#editor').open) render();
  }
});
document.addEventListener('visibilitychange', () => { if (!document.hidden && !$('#editor').open) render(); });
window.addEventListener('online', () => { void account.retry(); });
render();
void account.start().catch(() => { showToast('Cloud sync is unavailable. You can still use guest mode.'); });
