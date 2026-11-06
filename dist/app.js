import { DEFAULT_CARDS, createId, dateKey, shiftDay, formatDuration, createEntry, listEntriesForDay, summarizeDay, resolveEndTime } from './model.js';
import { icon, activityIcons } from './icons.js';
import { createAccountStore } from './account.js';
import { isValidState } from './schema.js';

const $ = (selector) => document.querySelector(selector);
const STORAGE_KEY = 'daily-karte.v1';
const COLORS = ['sage', 'amber', 'rose', 'blue', 'lavender'];
const COLOR_NAMES = { sage: '鼠尾草绿', amber: '燕麦黄', rose: '陶土粉', blue: '雾蓝', lavender: '浅紫' };
const VIEWS = [
  { id: 'today', name: '我的一天', icon: 'timeline', number: '01' },
  { id: 'cards', name: '活动卡片', icon: 'grid', number: '02' },
  { id: 'insights', name: '活动回顾', icon: 'chart', number: '03' },
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
    if (parsed.version !== 1 || !isValidState({ cards: parsed.cards, entries: parsed.entries })) throw new Error('保存格式无法识别');
    return { cards: parsed.cards, entries: parsed.entries };
  } catch {
    storageAvailable = false;
    storageMessage = '浏览器保存的数据暂时无法读取。已有数据不会被覆盖，新记录只会暂存在本页。';
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
let toastTimer;
let toastAction = null;
let editorState = null;
let lastFocus = null;
let newEntryId = null;
const state = () => demo ? demoState : account.data;
const formatTime = value => new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(value);
const dayLabel = key => new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date(`${key}T12:00:00`));
const timeInput = value => `${String(new Date(value).getHours()).padStart(2, '0')}:${String(new Date(value).getMinutes()).padStart(2, '0')}`;
const durationLabel = value => value === null ? '只记一次' : `约 ${formatDuration(value)}`;
function summaryDuration(minutes) {
  if (!minutes) return '还没有时长';
  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return `${hours ? `<span>约 ${hours} 小时</span>` : ''}${hours && remainder ? ' ' : ''}${remainder ? `<span>${hours ? '' : '约 '}${remainder} 分钟</span>` : ''}`;
}

function focusSelector(element) {
  if (!element || element === document.body) return null;
  if (element.id) return '#' + CSS.escape(element.id);
  for (const attribute of ['data-record', 'data-edit-entry', 'data-edit-card', 'data-view', 'data-day', 'data-action']) {
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
    storageMessage = '浏览器暂时无法保存数据。当前记录仍在本页，请先导出备份，并避免关闭页面。';
    render();
  }
}

function makeDemo() {
  const cards = cloneCards();
  const key = shiftDay(dateKey(), -1);
  const plan = [
    ['breakfast', '08:20', '一份简单的早餐，慢慢开始。'],
    ['meeting', '11:00', '和团队聊了聊下一步的想法。'],
    ['lunch', '12:45', ''],
    ['coffee', '14:30', '午后的一小段放空。'],
    ['reading', '16:00', '读到一篇很有启发的文章。'],
    ['gym', '19:00', ''],
    ['german', '21:00', '今天练习了日常对话。'],
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
  history.replaceState(null, '', '#today');
  render();
  if (!demo && !account.user) $('#google-sign-in').focus({ preventScroll: true });
  announce(demo ? '已进入独立的游客体验，测试记录不会保存到账号。' : account.user ? '已回到你的真实记录。' : '已返回登录页。');
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
  $('#toast').innerHTML = `<span class="toast-message">${icon('check')}<span>${escapeHTML(message)}</span></span><span class="toast-actions">${edit ? '<button data-toast="edit">调整</button>' : ''}${undo ? '<button data-toast="undo">撤销</button>' : ''}<button class="toast-close" data-toast="close" aria-label="关闭提示">${icon('close')}</button></span>`;
  $('#toast').hidden = false;
  toastTimer = setTimeout(dismissToast, 12000);
}

function navMarkup() {
  return VIEWS.map(item => `<button class="nav-button ${view === item.id ? 'active' : ''}" data-view="${item.id}" ${view === item.id ? 'aria-current="page"' : ''}>${icon(item.icon)}<span>${item.name}</span><span class="nav-small" aria-hidden="true">${item.number}</span></button>`).join('');
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
  $('#local-note').innerHTML = `${icon('shield')}<span>${demo ? '示例与个人记录分开' : account.user ? '记录仅属于当前账号' : '记录仅保存在此浏览器'}</span>`;
  $('#demo-toggle').textContent = demo ? (account.user ? '返回我的一天' : '退出游客体验') : '看看示例一天';
  $('#demo-banner').hidden = !demo;
  $('#demo-banner').innerHTML = `<span>${icon('sparkles')}你正在体验示例日，测试记录不会保存到账号。</span><button data-action="demo">${account.user ? '返回我的记录' : '返回登录页'}</button>`;
  const headings = {
    today: ['A LITTLE RECORD OF YOUR DAY', '把今天，轻轻记下来', '不用写日记。点一张卡，就留住一件小事。'],
    cards: ['FAMILIAR THINGS, ONE TAP AWAY', '熟悉的小事，一点就好', '把常做的事放在这里，下次记录就更轻松。'],
    insights: ['MAKE ROOM TO LOOK BACK', '看看时间，留下的足迹', '从留下的记录里，慢慢看见自己的日常。'],
  };
  const [eyebrow, title, description] = headings[view];
  $('#page-eyebrow').textContent = eyebrow;
  $('#page-title').innerHTML = `${title}<span>。</span>`;
  $('#page-description').textContent = description;
  $('#selected-date').innerHTML = `${icon('calendar')}${dayLabel(selectedDay)}${selectedDay === dateKey() ? '<small>今天</small>' : ''}`;
  $('#date-picker').value = selectedDay;
  $('#date-picker').max = dateKey();
  $('#next-day').disabled = selectedDay >= dateKey();
  $('#go-today').hidden = selectedDay === dateKey();
  $('#summary-strip').innerHTML = [
    ['timeline', '已记录的小事', `${summary.count}<small>件</small>`, ''],
    ['clock', '记录的估计时长', summaryDuration(summary.totalMinutes), 'duration'],
    ['leaf', '今天的活动种类', `${summary.byActivity.length}<small>种</small>`, ''],
  ].map(([symbol, label, value, className]) => `<div class="summary-item"><span class="summary-icon">${icon(symbol)}</span><div><p class="summary-label">${label}</p><p class="summary-value ${className}">${value}</p></div></div>`).join('');
  const warning = !demo && !account.user && storageMessage ? `<p class="storage-warning" role="alert">${storageMessage}</p>` : '';
  $('#view-content').innerHTML = warning + (view === 'today' ? renderToday() : view === 'cards' ? renderCards() : renderInsights(summary));
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
  $('#google-sign-in-label').textContent = signInBusy ? '正在打开 Google 登录…' : connecting ? '正在准备登录…' : '使用 Google 登录';
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
  const label = demo ? '你正在以游客身份体验' : local ? '记录保存在这台设备' : user ? (user.displayName || user.email || '我的账号') : '让日常记录，跟着你走';
  const message = demo ? '你可以放心试用，测试记录只留在本次体验中。' : (account.warning || status.message);
  const signInAvailable = !local && !user && status.kind !== 'connecting';
  strip.innerHTML = `<div class="account-copy">${icon(user ? 'shield' : 'leaf')}<div><strong>${escapeHTML(label)}</strong><p>${escapeHTML(message)}</p></div></div><div class="account-actions">${signInAvailable ? '<button data-action="sign-in">使用 Google 登录</button>' : ''}${user && !demo && personal.entries.length && account.connected ? '<button data-action="import-guest">导入这台设备的记录</button>' : ''}${user && status.kind === 'error' ? '<button data-action="retry-sync">重试同步</button>' : ''}${user ? '<button data-action="sign-out">退出账号</button>' : ''}</div>`;
  strip.dataset.status = status.kind;
  const loading = Boolean(user && !account.ready && !demo);
  $('#view-content').inert = loading;
  $('#summary-strip').setAttribute('aria-busy', String(loading));
}

function canChangeRecords() {
  if (!account.user && !demo) return false;
  if (!demo && account.user && !account.ready) {
    showToast('正在读取你的云端记录，请稍等。');
    return false;
  }
  return true;
}

async function accountAction(action) {
  try {
    if (action === 'sign-in') {
      loginError = '';
      if (account.status.kind === 'local') {
        loginError = '当前为预览模式。账号登录需要完成站点配置，你可以先从页面底部进入游客体验。';
        renderAccess();
        if (demo) showToast('账号登录将在网站发布后启用，游客体验可以继续使用');
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
      showToast('这台设备的记录已加入当前账号，正在同步');
    }
  } catch (error) {
    if (action === 'sign-in') {
      loginRequested = false;
      loginError = error.message || '暂时无法登录，请稍后再试。';
      renderAccess();
      if (demo) showToast(loginError);
    } else showToast(error.message || '暂时无法连接，请稍后再试。');
  } finally {
    signInBusy = false;
    renderAccess();
  }
}

function quickCard(card) {
  return `<button class="quick-card" data-record="${escapeHTML(card.id)}" aria-label="记一次${escapeHTML(card.name)}，${durationLabel(card.duration)}"><span class="activity-icon ${escapeHTML(card.color)}">${icon(card.icon)}</span><span class="quick-name">${escapeHTML(card.name)}</span><span class="quick-duration">${durationLabel(card.duration)}</span><span class="quick-add">${icon('plus')}</span></button>`;
}

function renderToday() {
  const entries = listEntriesForDay(state().entries, selectedDay);
  const isToday = selectedDay === dateKey();
  return `<div class="content-grid"><section class="timeline-panel" aria-labelledby="timeline-title"><div class="section-heading"><h2 id="timeline-title">这一天的小事 <span>${entries.length ? String(entries.length).padStart(2, '0') : 'your story'}</span></h2><button class="subtle-button" data-action="backfill">${icon('plus')}补记一件事</button></div>${entries.length ? `<div class="day-story">Little moments, a day well remembered.</div><div class="timeline">${entries.map(entryMarkup).join('')}</div><div class="timeline-end">${isToday ? '今天还在继续' : '这一天，已被轻轻收好'}</div>` : emptyMarkup(isToday)}<div class="thought-card">${icon('leaf')}<div><p>不必填满每一分钟，记下你想留下的就好。</p><small>空白也是日常的一部分。</small></div></div></section><aside class="cards-panel" aria-labelledby="quick-title"><div class="section-heading"><h2 id="quick-title">常用活动卡</h2><button class="subtle-button" data-view="cards">管理${icon('right')}</button></div><p class="cards-caption">${isToday ? '刚做完什么？点一下，就记好了。' : '选择一张卡，补记到这一天。'}</p><div class="card-grid">${state().cards.map(quickCard).join('')}</div>${!state().cards.length ? '<button class="new-card" data-action="default-cards">使用八张常用活动卡</button>' : ''}<button class="new-card" data-action="new-card">${icon('plus')}添加自己的活动卡</button><p class="panel-footnote">${icon('clock')}时长来自卡片预设，随时可以调整。</p></aside></div>`;
}

function entryMarkup(entry) {
  const crossDay = entry.start !== null && dateKey(entry.start) !== dateKey(entry.end);
  const interval = entry.duration === null ? '记录于 ' + formatTime(entry.end) : `${crossDay ? '前一天 ' : ''}${formatTime(entry.start)} 至 ${formatTime(entry.end)}`;
  return `<article class="timeline-item"><time class="timeline-time" datetime="${new Date(entry.end).toISOString()}">${formatTime(entry.end)}</time><span class="timeline-dot" aria-hidden="true"></span><div class="entry-card"><span class="activity-icon ${escapeHTML(entry.color)}">${icon(entry.icon)}</span><div class="entry-body"><h3 class="entry-title">${escapeHTML(entry.name)} ${entry.id === newEntryId ? '<span class="entry-new-badge">刚记下</span>' : ''}</h3><p class="entry-meta"><span>${durationLabel(entry.duration)}</span><i>·</i><span>${interval}</span></p>${entry.note ? `<p class="entry-note">${escapeHTML(entry.note)}</p>` : ''}</div><button class="entry-edit" data-edit-entry="${escapeHTML(entry.id)}" aria-label="调整${escapeHTML(entry.name)}的记录">${icon('edit')}</button></div></article>`;
}

function emptyMarkup(isToday) {
  return `<div class="empty-state"><div class="empty-art" aria-hidden="true"><div class="art-card">${icon('coffee')}<i></i></div><div class="art-card">${icon('book')}<i></i></div><div class="art-card">${icon('leaf')}<i></i></div></div><h3>${isToday ? '今天的故事，从一张卡开始。' : '这一天，还没有留下记录。'}</h3><p>${isToday ? '吃了早餐，读了几页书，或喝了一杯咖啡。<br>这些平常的小事，都值得有个位置。' : '想起什么，就补记一点。<br>大概的时间，也足够留下回忆。'}</p>${!demo ? `<button class="empty-demo" data-action="demo">先看看示例一天${icon('arrow')}</button>` : ''}</div>`;
}

function renderCards() {
  return `<div class="section-heading"><h2>我的活动卡 <span>${String(state().cards.length).padStart(2, '0')}</span></h2><button class="subtle-button" data-action="new-card">${icon('plus')}新建活动卡</button></div><p class="view-intro">每张卡都记住你的常用时长。修改预设，只会影响以后的快捷记录。</p><div class="library-grid">${state().cards.map(card => `<article class="library-card"><span class="activity-icon ${escapeHTML(card.color)}">${icon(card.icon)}</span><h3>${escapeHTML(card.name)}</h3><p>${durationLabel(card.duration)} · 默认刚完成</p><div class="library-actions"><button data-record="${escapeHTML(card.id)}">${icon('plus')}记一次</button><button data-edit-card="${escapeHTML(card.id)}" aria-label="编辑${escapeHTML(card.name)}活动卡">${icon('edit')}编辑</button></div></article>`).join('')}<button class="library-card library-add" data-action="new-card">${icon('plus')}<span>添加自己的活动卡</span></button></div>`;
}

function renderInsights(summary) {
  const maximum = Math.max(...summary.byActivity.map(item => item.minutes), 1);
  return `<div class="week-strip" aria-label="最近七天">${Array.from({ length: 7 }, (_, index) => shiftDay(dateKey(), index - 6)).map(key => `<button class="week-day ${key === selectedDay ? 'active' : ''}" data-day="${key}" ${key === selectedDay ? 'aria-current="date"' : ''}><span>${new Intl.DateTimeFormat('zh-CN', { weekday: 'short' }).format(new Date(key + 'T12:00:00'))}</span><strong>${Number(key.slice(-2))}</strong></button>`).join('')}</div><section class="insight-card"><h2>这一天，时间留给了什么？</h2><p class="view-intro">这里汇总已记录的活动。时长是估计值，没有记录的时间保持空白。</p>${summary.count ? summary.byActivity.map(item => `<div class="stat-row"><span class="activity-icon ${escapeHTML(item.color)}">${icon(item.icon)}</span><span class="stat-name">${escapeHTML(item.name)}</span><div class="stat-track">${item.minutes ? `<div class="stat-fill ${escapeHTML(item.color)}" style="--width:${Math.max(3, item.minutes / maximum * 100)}%"></div>` : ''}</div><div class="stat-value">${item.minutes ? `约 ${formatDuration(item.minutes)}` : '未记录时长'}<p class="count-note">${item.count} 次</p></div></div>`).join('') : `<div class="insight-empty">${icon('leaf')}这一天还没有记录。<br>点一张常用卡，慢慢留下自己的日常。</div>`}<p class="insight-note">${icon('clock')}活动可能同时发生，各项时长会分别累计。这里的总时长不代表一天实际占用的时间。</p></section><button class="export-button" data-action="export">${icon('download')}导出${demo ? '示例' : '我的'}记录备份</button>`;
}

function recordCard(id) {
  if (!canChangeRecords()) return;
  const card = state().cards.find(item => item.id === id);
  if (!card) return;
  if (selectedDay !== dateKey()) return openEntryEditor(null, card);
  const targetState = state();
  const entry = createEntry(card);
  targetState.entries.push(entry);
  newEntryId = entry.id;
  persist();
  render();
  showToast(`记下了${card.name}`, {
    undo: () => {
      targetState.entries = targetState.entries.filter(item => item.id !== entry.id);
      persist(); render(); announce('已撤销这次记录。');
    },
    edit: () => openEntryEditor(entry.id),
  });
}

function durationFields(value, id = 'entry-duration') {
  return `<div class="form-field"><label for="${id}">估计时长 <span class="field-help">（分钟，可留空）</span></label><input id="${id}" name="duration" type="number" inputmode="numeric" min="1" max="1440" step="1" value="${value ?? ''}" placeholder="留空，只记一次"><div class="duration-options">${[15, 30, 60].map(minutes => `<button type="button" class="duration-chip ${value === minutes ? 'active' : ''}" data-duration="${minutes}">${formatDuration(minutes)}</button>`).join('')}<button type="button" class="duration-chip ${value === null ? 'active' : ''}" data-duration="none">只记一次</button></div><p class="field-help">不用回忆到每一分钟，大致就好。</p></div>`;
}

function showEditor(markup, title, eyebrow) {
  dismissToast();
  lastFocus = { element: document.activeElement, selector: focusSelector(document.activeElement) };
  $('#editor-title').textContent = title;
  $('#editor-eyebrow').textContent = eyebrow;
  $('#editor-content').innerHTML = markup;
  $('#editor').showModal();
}

function openEntryEditor(id = null, card = null) {
  if (!canChangeRecords()) return;
  const existing = id ? state().entries.find(item => item.id === id) : null;
  if (id && !existing) return;
  const chosen = card || existing || state().cards[0] || { id: '__once__', name: '临时活动', icon: 'leaf', color: 'sage', duration: null };
  const now = new Date();
  const end = existing?.end ?? new Date(`${selectedDay}T${timeInput(now)}`).getTime();
  editorState = { type: 'entry', id, cardId: existing?.cardId ?? chosen.id, source: state(), isDemo: demo, original: existing ? { ...existing } : null };
  showEditor(`<form id="entry-form"><div class="entry-preview"><span class="activity-icon ${escapeHTML(chosen.color)}" id="preview-icon">${icon(chosen.icon)}</span><div><strong id="preview-name">${escapeHTML(chosen.name)}</strong><p>${existing ? '只调整这次记录，卡片预设不会改变。' : '补记发生过的小事，大约的时间就好。'}</p></div></div>${!existing ? `<div class="form-field"><label for="entry-card">活动</label><select id="entry-card" name="cardId">${state().cards.map(item => `<option value="${escapeHTML(item.id)}" ${item.id === chosen.id ? 'selected' : ''}>${escapeHTML(item.name)}</option>`).join('')}<option value="__once__" ${chosen.id === '__once__' ? 'selected' : ''}>临时活动，不创建卡片</option></select></div><div class="form-field" id="oneoff-field" ${chosen.id !== '__once__' ? 'hidden' : ''}><label for="oneoff-name">这次做了什么？</label><input id="oneoff-name" name="oneoffName" maxlength="32" placeholder="比如，去看了一场展览" ${chosen.id === '__once__' ? 'required' : ''}></div>` : ''}<div class="field-row"><div class="form-field"><label for="entry-date">${chosen.duration === null ? '发生日期' : '结束日期'}</label><input id="entry-date" name="date" type="date" value="${dateKey(end)}" max="${dateKey()}" required></div><div class="form-field"><label for="entry-time">大约${chosen.duration === null ? '发生' : '结束'}时间</label><input id="entry-time" name="time" type="time" value="${timeInput(end)}" required></div></div>${durationFields(existing ? existing.duration : chosen.duration)}<div class="form-field"><label for="entry-note">留下一句话 <span class="field-help">（可选）</span></label><textarea id="entry-note" name="note" maxlength="500" rows="2" placeholder="有什么想记住的吗？">${escapeHTML(existing?.note || '')}</textarea></div><p class="form-error" id="form-error" role="alert" hidden></p><div class="sheet-actions">${existing ? `<button type="button" class="delete-button" data-action="delete-entry" aria-label="删除这次记录">${icon('trash')}</button>` : ''}<button class="primary-button" type="submit">${icon('check')}${existing ? '保存这次调整' : '记下这件小事'}</button></div></form>`, existing ? '调整这次记录' : '补记一件小事', 'A LITTLE MOMENT');
}

function openCardEditor(id = null) {
  if (!canChangeRecords()) return;
  const card = id ? state().cards.find(item => item.id === id) : null;
  if (id && !card) return;
  editorState = { type: 'card', id, source: state(), isDemo: demo, original: card ? { ...card } : null, icon: card?.icon || 'leaf', color: card?.color || 'sage' };
  showEditor(`<form id="card-form"><div class="form-field"><label for="card-name">活动名称</label><input id="card-name" name="name" maxlength="32" value="${escapeHTML(card?.name || '')}" placeholder="比如，散步或练钢琴" required autocomplete="off"></div><div class="form-field"><span class="field-label">挑一个小图标</span><div class="icon-options" role="group" aria-label="活动图标">${activityIcons.map(symbol => `<button type="button" class="icon-option ${symbol === editorState.icon ? 'active' : ''}" data-icon="${symbol}" aria-label="${{ sun: '太阳', utensils: '餐具', moon: '月亮', coffee: '咖啡', book: '书本', dumbbell: '哑铃', languages: '语言', users: '会议', leaf: '叶子', sparkles: '星光' }[symbol]}" aria-pressed="${symbol === editorState.icon}">${icon(symbol)}</button>`).join('')}</div></div><div class="form-field"><span class="field-label">卡片颜色</span><div class="color-options" role="group" aria-label="卡片颜色">${COLORS.map(color => `<button type="button" class="color-option ${color} ${color === editorState.color ? 'active' : ''}" data-color="${color}" aria-label="${COLOR_NAMES[color]}" aria-pressed="${color === editorState.color}"></button>`).join('')}</div></div>${durationFields(card?.duration ?? null, 'card-duration')}<p class="field-help">${card ? '修改卡片不会改变已经记录的活动。' : '以后点一下这张卡，就能记下刚完成的活动。'}</p><p class="form-error" id="form-error" role="alert" hidden></p><div class="sheet-actions">${card ? `<button type="button" class="delete-button" data-action="delete-card" aria-label="删除这张活动卡">${icon('trash')}</button>` : ''}<button class="primary-button" type="submit">${icon('check')}${card ? '保存活动卡' : '添加活动卡'}</button></div></form>`, card ? '调整这张活动卡' : '添加自己的活动卡', 'MAKE IT YOURS');
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
    throw new Error('这项内容已在其他设备修改或删除。你的输入仍保留在面板中，请关闭后重新打开，再确认修改。');
  }
}

function readDuration(form) {
  const value = form.elements.duration.value.trim();
  if (!value) return null;
  const minutes = Number(value);
  if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) throw new Error('请填写 1 到 1440 分钟之间的整数，或留空只记一次。');
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
    if (end > Date.now() + 60_000) throw new Error('这里记录已经发生的事情，请选择现在或之前的时间。');
    const oneoff = form.elements.cardId?.value === '__once__';
    const oneoffName = form.elements.oneoffName?.value.trim();
    if (oneoff && !oneoffName) throw new Error('请简单写下这次做了什么。');
    const card = existing || (oneoff ? { id: 'oneoff:' + oneoffName, name: oneoffName, icon: 'leaf', color: 'sage' } : source.cards.find(item => item.id === form.elements.cardId?.value));
    if (!card) throw new Error('这张活动卡已经不存在，请重新选择活动。');
    const note = form.elements.note.value.trim();
    const entry = createEntry({ ...card, id: existing?.cardId || card.id }, { end, duration, note });
    if (existing) Object.assign(entry, { id: existing.id, createdAt: existing.createdAt });
    const before = existing ? { ...existing } : null;
    if (existing) source.entries = source.entries.map(item => item.id === entry.id ? entry : item);
    else source.entries.push(entry);
    selectedDay = date;
    newEntryId = entry.id;
    persist(); closeEditor(); render();
    showToast(existing ? '这次记录已调整' : `记下了${entry.name}`, { undo: () => {
      source.entries = source.entries.filter(item => item.id !== entry.id);
      if (before) source.entries.push(before);
      persist(); render(); announce('已撤销这次修改。');
    } });
  } catch (error) { formError(error.message); }
}

function saveCard(form) {
  try {
    const name = form.elements.name.value.trim();
    if (!name) throw new Error('请给这张活动卡起个名字。');
    const duration = readDuration(form);
    const source = editorState.source;
    const existing = source.cards.find(item => item.id === editorState.id);
    checkEditorVersion(existing);
    const card = { id: existing?.id || createId(), name, duration, icon: editorState.icon, color: editorState.color };
    const before = existing ? { ...existing } : null;
    if (existing) source.cards = source.cards.map(item => item.id === card.id ? card : item);
    else source.cards.push(card);
    persist(); closeEditor(); render();
    showToast(existing ? '活动卡已更新' : '新的活动卡，准备好了', { undo: () => {
      source.cards = source.cards.filter(item => item.id !== card.id);
      if (before) source.cards.push(before);
      persist(); render(); announce('已撤销活动卡修改。');
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
  showToast(kind === 'entry' ? '已移除这次记录' : '已移除卡片，过去的记录仍然保留', { undo: () => {
    source[list].splice(Math.min(index, source[list].length), 0, removed);
    persist(); render(); announce('已恢复。');
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
  showToast('已准备好记录备份');
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
  else if (button.dataset.day) { selectedDay = button.dataset.day; render(); }
  else if (button.dataset.toast) {
    const action = toastAction?.[button.dataset.toast];
    dismissToast(); action?.();
  } else if (button.dataset.duration) {
    const form = button.closest('form');
    form.elements.duration.value = button.dataset.duration === 'none' ? '' : button.dataset.duration;
    form.querySelectorAll('[data-duration]').forEach(item => item.classList.toggle('active', item === button));
  } else if (button.dataset.icon) {
    editorState.icon = button.dataset.icon;
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
  else if (button.dataset.action === 'default-cards' && canChangeRecords()) {
    const ids = new Set(state().cards.map(card => card.id));
    state().cards.push(...DEFAULT_CARDS.filter(card => !ids.has(card.id)).map(card => ({ ...card })));
    persist(); render(); showToast('常用活动卡已准备好');
  }
  else if (['sign-in', 'sign-out', 'retry-sync', 'import-guest'].includes(button.dataset.action)) void accountAction(button.dataset.action);
});

document.addEventListener('submit', event => {
  if (event.target.id === 'entry-form') { event.preventDefault(); saveEntry(event.target); }
  if (event.target.id === 'card-form') { event.preventDefault(); saveCard(event.target); }
});

document.addEventListener('input', event => {
  if (event.target.name === 'duration') event.target.closest('form').querySelectorAll('[data-duration]').forEach(button => {
    button.classList.toggle('active', button.dataset.duration === (event.target.value || 'none'));
  });
});

document.addEventListener('change', event => {
  if (event.target.id !== 'entry-card') return;
  const oneoff = event.target.value === '__once__';
  const card = oneoff ? { name: '临时活动', icon: 'leaf', color: 'sage', duration: null } : state().cards.find(item => item.id === event.target.value);
  if (!card) return;
  $('#preview-icon').className = `activity-icon ${card.color}`;
  $('#preview-icon').innerHTML = icon(card.icon);
  $('#preview-name').textContent = card.name;
  $('#oneoff-field').hidden = !oneoff;
  $('#oneoff-name').required = oneoff;
  event.target.form.elements.duration.value = card.duration ?? '';
  event.target.form.elements.duration.dispatchEvent(new Event('input', { bubbles: true }));
  $('label[for="entry-date"]').textContent = card.duration === null ? '发生日期' : '结束日期';
  $('label[for="entry-time"]').textContent = card.duration === null ? '大约发生时间' : '大约结束时间';
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
void account.start().catch(() => { showToast('云同步暂时不可用，本机记录仍可继续使用。'); });
