const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const C = require('../core.js');

const root = path.resolve(__dirname, '..');
const monday = '2026-10-19';
const fixedTime = '2026-10-19T03:26:00.000Z';
const localKey = 'sandsLunch.local.v1';
const imageKey = 'sandsLunch.menuImages.v1';
const connection = { url: 'https://script.google.com/macros/s/test_deployment/exec', key: 'a'.repeat(64) };
const png = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jNQAAAABJRU5ErkJggg==';
// A valid 2 x 2 JPEG returned by the canvas fixture. Pixel rendering is not tested.
const jpeg = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAUDBAQEAwUEBAQFBQUGBwwIBwcHBw8LCwkMEQ8SEhEPERETFhwXExQaFRERGCEYGh0dHx8fExciJCIeJBweHx7/2wBDAQUFBQcGBw4ICA4eFBEUHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh4eHh7/wAARCAACAAIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD7CooorID/2Q==';
const imageFile = { name: '런치타임 식단.png', type: 'image/png', size: 1024 };
const menuData = {
  '2026-10-19': ['월요일 곰탕', '월요일 볶음밥'],
  '2026-10-20': ['화요일 제육볶음'],
  '2026-10-21': [],
  '2026-10-22': ['목요일 생선까스'],
  '2026-10-23': ['금요일 우동']
};

const visibleText = html => String(html)
  .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
  .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '')
  .replace(/<[^>]*>/g, ' ')
  .replace(/\s+/g, ' ');

function stateDaysFor(date, stored = {}) {
  return Object.fromEntries([...new Set([...C.weekDates(date), date])].map(d => [d, C.clone(stored[d] || C.emptyDay())]));
}

function weeklyCellText(ui, member, date) {
  const id = `weekCell-${member}-${date}`;
  const match = ui.element('weekBody').innerHTML.match(new RegExp('<button\\b[^>]*\\bid="' + id + '"[^>]*>([\\s\\S]*?)<\\/button>'));
  assert.ok(match, 'Missing weekly cell markup ' + id);
  return visibleText(match[1]) + ' ' + (ui.element(id).getAttribute('aria-label') || '');
}

/*
 * Executes the real app.js with the DOM surface it uses. This is a functional
 * rendering/event test, not a browser or a layout/accessibility test. External
 * menu and shared-server responses are fixtures; network access is forbidden.
 */
async function boot(options = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const elements = new Map(), handlers = new Map(), storage = new Map();
  const requests = [], publicRequests = [], errors = [], posted = [];
  const imageWork = { created: [], revoked: [], draws: [], encoded: [] };
  let context, timerId = 0;
  for (const [key, value] of Object.entries(options.storage || {})) storage.set(key, JSON.stringify(value));
  if (options.identity !== null) storage.set('sandsLunch.identity.v1', JSON.stringify(options.identity || 'jingi'));
  if (options.connected) storage.set('sandsLunch.connection.v1', JSON.stringify(connection));

  function attrs(source) {
    return Object.fromEntries([...source.matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)]
      .map(m => [m[1], m[2] ?? m[3] ?? m[4] ?? '']));
  }
  class Element {
    constructor(tagName = 'div', attributes = {}) {
      this.tagName = tagName.toUpperCase(); this.id = attributes.id || '';
      this.attributes = attributes; this.dataset = {};
      for (const [key, value] of Object.entries(attributes)) {
        if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
      }
      this.value = attributes.value || ''; this.checked = 'checked' in attributes;
      this.hidden = 'hidden' in attributes; this.disabled = 'disabled' in attributes;
      this.className = attributes.class || ''; this.style = {}; this.open = false;
      this.children = []; this.events = new Map(); this._html = ''; this._text = '';
      this.classList = { toggle() {}, add() {}, remove() {} };
    }
    get innerHTML() { return this._html; }
    set innerHTML(value) {
      this._html = String(value); this._text = '';
      for (const child of this.children) if (child.id && elements.get(child.id) === child) elements.delete(child.id);
      this.children = registerMarkup(this._html);
    }
    get textContent() { return this._text || visibleText(this._html); }
    set textContent(value) { this._text = String(value); this._html = ''; }
    addEventListener(type, fn) { const list = this.events.get(type) || []; list.push(fn); this.events.set(type, list); }
    remove() {}
    closest(selector) { return selector === '[data-action]' && this.dataset.action ? this : null; }
    focus() { document.activeElement = this; }
    select() {}
    showModal() { this.open = true; }
    close() { this.open = false; }
    getBoundingClientRect() { return { left: 0, top: 0, right: 800, bottom: 800 }; }
    setAttribute(name, value) { this.attributes[name] = String(value); }
    getAttribute(name) { return this.attributes[name] ?? null; }
    querySelector(selector) {
      if (selector.startsWith('#')) return elements.get(selector.slice(1)) || null;
      const match = selector.match(/^(\w+)(?:\[([\w-]+)(?:=["']?([^"'\]]+)["']?)?\])?$/);
      if (!match) throw new Error('Unsupported fixture selector ' + selector);
      return this.children.find(child => child.tagName.toLowerCase() === match[1]
        && (!match[2] || (match[2] in child.attributes && (match[3] === undefined || child.attributes[match[2]] === match[3])))) || null;
    }
  }
  class Canvas extends Element {
    constructor() { super('canvas'); }
    getContext(type) {
      assert.equal(type, '2d');
      return { fillRect() {}, drawImage: (...args) => imageWork.draws.push(args.slice(1)) };
    }
    toDataURL(type, quality) {
      imageWork.encoded.push({ type, quality, width: this.width, height: this.height });
      assert.equal(type, 'image/jpeg');
      return jpeg;
    }
  }
  class FixtureImage {
    constructor() { this.naturalWidth = 3200; this.naturalHeight = 1800; }
    set src(value) {
      assert.match(value, /^blob:fixture-/);
      Promise.resolve().then(() => this.onload());
    }
  }
  class FixtureURL extends URL {
    static createObjectURL(file) {
      const url = 'blob:fixture-' + imageWork.created.length;
      imageWork.created.push({ file, url }); return url;
    }
    static revokeObjectURL(url) { imageWork.revoked.push(url); }
  }
  class FixtureFormData {
    constructor(form) {
      assert.equal(form.tagName, 'FORM');
      this.controls = form.children.filter(el => el.attributes.name && !el.disabled);
    }
    get(name) { return this.getAll(name)[0] ?? null; }
    getAll(name) { return this.controls.filter(el => el.attributes.name === name && (el.attributes.type !== 'checkbox' || el.checked)).map(el => el.value); }
  }
  function registerMarkup(source) {
    const children = [];
    for (const match of source.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)) {
      const attributes = attrs(match[2]);
      if (!attributes.id && !attributes['data-action'] && !['button', 'input', 'select', 'img'].includes(match[1])) continue;
      const element = new Element(match[1], attributes);
      element.markupStart = match.index; element.markupTagEnd = match.index + match[0].length;
      if (element.id) elements.set(element.id, element);
      children.push(element);
    }
    for (const element of children) if (element.tagName === 'FORM') {
      const end = source.indexOf('</form>', element.markupTagEnd);
      element.children = children.filter(child => child.markupStart >= element.markupTagEnd && child.markupStart < end);
    }
    return children;
  }
  registerMarkup(html);
  const document = {
    hidden: false, activeElement: null,
    getElementById: id => elements.get(id) || null,
    createElement: tag => tag === 'canvas' ? new Canvas() : new Element(tag),
    contains: element => !!element,
    addEventListener(type, fn) { const list = handlers.get(type) || []; list.push(fn); handlers.set(type, list); },
    querySelector: selector => selector.startsWith('#') ? elements.get(selector.slice(1)) || null : null,
    head: {
      appendChild(script) {
        const request = Object.fromEntries(new URL(script.src).searchParams);
        requests.push(request);
        Promise.resolve().then(async () => {
          if (!options.server) throw new Error('Unexpected shared-server request: ' + request.action);
          const result = await options.server(request);
          const callback = context[request.callback];
          if (typeof callback !== 'function') throw new Error('JSONP callback was not registered');
          callback(result);
        }).catch(error => { errors.push(error); if (script.onerror) script.onerror(error); });
      }
    }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [fixedTime])); }
    static now() { return Date.parse(fixedTime); }
  }
  context = vm.createContext({
    document, Date: FixedDate, console, URL: FixtureURL, URLSearchParams, TextEncoder, TextDecoder, AbortController,
    Image: FixtureImage, FormData: FixtureFormData,
    crypto: webcrypto, btoa, atob,
    navigator: { clipboard: { writeText: async () => {} } },
    location: { href: 'https://example.invalid/lunch/', protocol: 'https:', pathname: '/lunch/', search: '', hash: '' },
    history: { replaceState() {} },
    localStorage: {
      getItem: key => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, String(value)),
      removeItem: key => storage.delete(key)
    },
    setTimeout: () => ++timerId, clearTimeout() {}, setInterval: () => ++timerId, clearInterval() {},
    confirm: () => true,
    fetch: async (url, init) => {
      posted.push({ url, init });
      if (options.post) return options.post(url, init);
      throw new Error('Unexpected real fetch in UI test');
    },
    LunchMenuSource: {
      fetchDay: async date => {
        publicRequests.push(date);
        return { date, dishes: (options.menus || menuData)[date] || [], fetchedAt: fixedTime, source: 'https://welplan.pmh.codes/', ok: true };
      }
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'app.js'), 'utf8'), context, { filename: 'app.js' });

  const element = id => { assert.ok(elements.has(id), `Missing rendered element #${id}`); return elements.get(id); };
  async function settle() {
    for (let n = 0; n < 3; n++) await new Promise(resolve => setImmediate(resolve));
    if (errors.length) throw errors[0];
  }
  async function dispatch(type, target) {
    const event = { target, preventDefault() {} };
    if (target['on' + type]) await target['on' + type](event);
    for (const fn of target.events?.get(type) || []) await fn(event);
    for (const fn of handlers.get(type) || []) await fn(event);
    await settle();
  }
  function findControl(attributes, tagName) {
    const markup = [html, ...[...elements.values()].map(el => el.innerHTML)].join('\n');
    const match = [...markup.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)]
      .map(m => ({ tag: m[1], attrs: attrs(m[2]) }))
      .find(m => (!tagName || m.tag === tagName) && Object.entries(attributes).every(([key, value]) => m.attrs[key] === value));
    assert.ok(match, 'Missing rendered control ' + JSON.stringify(attributes));
    return new Element(match.tag, match.attrs);
  }
  async function action(actionName, id, extra = {}) {
    const attributes = { 'data-action': actionName, ...(id === undefined ? {} : { 'data-id': id }), ...extra };
    await dispatch('click', findControl(attributes));
  }
  async function checkbox(attributes, checked) {
    const input = findControl({ type: 'checkbox', ...attributes }, 'input');
    assert.equal(input.disabled, false, 'Cannot change a disabled checkbox');
    input.checked = checked;
    await dispatch('change', input);
  }
  async function press(id) {
    const target = element(id), event = { target, preventDefault() {} };
    if (target.onclick) await target.onclick(event);
    for (const fn of target.events.get('click') || []) await fn(event);
    await settle();
  }
  async function selectImage(scope) {
    await action('menuImageUpload');
    element('menuImageScope').value = scope;
    const fileInput = element('menuImageFile'); fileInput.files = [imageFile];
    await dispatch('change', fileInput);
    assert.equal(element('menuImagePreview').hidden, false);
    assert.match(element('menuImagePreview').innerHTML, /data:image\/jpeg;base64,/);
    assert.equal(element('uploadMenuImageButton').disabled, false);
  }
  await settle();
  return { html, element, action, press, dispatch, settle, selectImage, findControl, checkbox, requests, publicRequests, posted, imageWork,
    saved: key => storage.has(key) ? JSON.parse(storage.get(key)) : undefined };
}

test('기존 다섯 명의 저장값을 연 페이지에서 열 멤버와 새 문구를 실제 렌더링한다', async () => {
  const ui = await boot({ storage: { [localKey]: { days: {}, settings: {
    scheduleEnd: '2026-12-31', meetingTime: '12:00',
    ceoDays: { seongjun: [2,5], juri: [1,2,5], hyunsu: [1,2,5], yunchul: [3], jingi: [2] }
  } } } });
  assert.match(ui.element('identitySelect').innerHTML, /value="jingi">천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /디자인팀/);
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 6명');
  assert.equal((ui.element('membersGrid').innerHTML.match(/class="member-card/g) || []).length, 10);
  assert.match(ui.element('weekBody').innerHTML, /천진기/);
  assert.match(visibleText(ui.element('weekBody').innerHTML), /6명\s+5명\s+7명\s+9명\s+6명/);
  for (const name of ['최민준','오성은','장윤석','서지우','조현주']) {
    assert.ok(ui.element('identitySelect').innerHTML.includes(name));
    assert.ok(ui.element('membersGrid').innerHTML.includes(name));
    assert.ok(ui.element('weekBody').innerHTML.includes(name));
  }
  assert.doesNotMatch(visibleText(ui.html + ui.element('membersGrid').innerHTML + ui.element('weekBody').innerHTML), /CEO/);
  await ui.press('settingsBtn');
  assert.match(ui.element('dialogContent').innerHTML, /천진기/);
  for (const name of ['최민준','오성은','장윤석','서지우','조현주']) assert.ok(ui.element('dialogContent').innerHTML.includes(name));
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.doesNotMatch(visibleText(ui.element('dialogContent').innerHTML), /CEO/);
  await ui.action('availability');
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.doesNotMatch(visibleText(ui.element('dialogContent').innerHTML), /CEO/);
});

test('천진기의 선택이 화면과 저장값에 반영되고 화요일에는 참석 변경을 먼저 안내한다', async () => {
  const ui = await boot();
  await ui.action('vote', 'lunchtime');
  assert.equal(ui.saved(localKey).days[monday].votes.jingi, 'lunchtime');
  assert.match(ui.element('voteResults').innerHTML, /천진기/);
  await ui.action('date', '2026-10-20');
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 5명');
  await ui.action('vote', 'megazone');
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.equal(ui.saved(localKey).days['2026-10-20'], undefined);
});

test('새 다섯 명을 화면에서 각각 선택하고 투표하면 해당 이름으로 저장·집계된다', async () => {
  const ui = await boot();
  const members = [['minjun','최민준'],['seongeun','오성은'],['yunseok','장윤석'],['jiwoo','서지우'],['hyunju','조현주']];
  await ui.action('date', '2026-10-22');
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 9명');
  for (const [id, name] of members) {
    await ui.action('identity', id);
    assert.equal(ui.element('identitySelect').value, id);
    assert.equal(ui.saved('sandsLunch.identity.v1'), id);
    if (id === 'minjun') {
      await ui.action('availability');
      assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
      await ui.action('setAvailability', 'in');
      assert.equal(ui.saved(localKey).days['2026-10-22'].overrides.minjun, 'in');
      assert.equal(ui.element('heroCount').textContent, '오늘 함께 10명');
    }
    await ui.action('vote', 'lunchtime');
    assert.equal(ui.saved(localKey).days['2026-10-22'].votes[id], 'lunchtime');
    assert.ok(ui.element('voteResults').innerHTML.includes(name));
  }
  assert.match(ui.element('voteSummary').textContent, /10명 중 5명/);
});

test('주간 현황판을 멤버 카드와 식당 선택 사이에 두고 열 명의 월~금 상태를 표시한다', async () => {
  const ui = await boot();
  assert.ok(ui.html.indexOf('id="membersGrid"') < ui.html.indexOf('id="weekSection"'));
  assert.ok(ui.html.indexOf('id="weekSection"') < ui.html.indexOf('id="menuSection"'));
  assert.equal((ui.html.match(/id="weekSection"/g) || []).length, 1);
  for (const member of C.MEMBERS) for (const date of C.weekDates(monday)) {
    assert.equal(ui.element(`weekCell-${member.id}-${date}`).tagName, 'BUTTON');
  }
  for (const date of C.weekDates(monday)) assert.equal(ui.element('weekCancel-' + date).checked, false);
  for (const member of ['jingi', 'jiwoo']) {
    assert.match(weeklyCellText(ui, member, '2026-10-20'), /대표님과 점심/);
    assert.match(ui.element(`weekCell-${member}-2026-10-20`).className, /\bis-ceo\b/);
  }
});

test('날짜별 취소 체크는 현재 선택일을 바꾸지 않고 해당 날짜에만 저장하며 수동 예외를 유지한다', async () => {
  const tuesday = '2026-10-20';
  let day = C.applyOperation(C.emptyDay(),tuesday,C.settings(),{ type: 'availability', actor: 'yunchul', payload: { value: 'out', reason: '병원에 가요' } });
  day = C.applyOperation(day,tuesday,C.settings(),{ type: 'availability', actor: 'juri', payload: { value: 'ceo' } });
  const ui = await boot({ storage: { [localKey]: { days: { [tuesday]: day }, settings: C.settings() } } });
  for (const date of C.weekDates(monday)) for (const checked of [true, false]) {
    const previous = C.clone(ui.saved(localKey).days);
    await ui.checkbox({ 'data-action': 'weekCancel', 'data-date': date }, checked);
    const saved = ui.saved(localKey).days;
    assert.equal(ui.element('dateInput').value, monday);
    assert.equal(saved[date].ceoCancelled, checked);
    assert.equal(ui.element('weekCancel-' + date).checked, checked);
    delete previous[date];
    assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([d]) => d !== date)), previous);
    assert.equal(saved[tuesday].overrides.yunchul, 'out');
    assert.equal(saved[tuesday].absenceReasons.yunchul, '병원에 가요');
    assert.equal(saved[tuesday].overrides.juri, 'ceo');
    if (date === tuesday) {
      for (const member of ['jingi','jiwoo']) {
        if (checked) {
          assert.doesNotMatch(weeklyCellText(ui,member,date), /대표님과 점심/);
          assert.match(ui.element(`weekCell-${member}-${date}`).className, /\bis-in\b/);
        } else {
          assert.match(weeklyCellText(ui,member,date), /대표님과 점심/);
          assert.match(ui.element(`weekCell-${member}-${date}`).className, /\bis-ceo\b/);
        }
      }
      assert.match(weeklyCellText(ui,'juri',date), /대표님과 점심/);
      assert.match(weeklyCellText(ui,'yunchul',date), /개인 일정/);
      assert.match(weeklyCellText(ui,'yunchul',date), /병원에 가요/);
    }
  }
});

test('본인 주간 셀의 불참·참석·기본 복원은 누른 날짜에 적용되고 타인 셀은 읽기만 한다', async () => {
  const ui = await boot(), target = '2026-10-21';
  await ui.action('weekMember','jingi',{ 'data-date': target });
  assert.match(ui.element('dialogTitle').textContent, /10월 21일/);
  await ui.action('absence',undefined,{ 'data-date': target });
  assert.equal(ui.element('absenceForm').dataset.date, target);
  ui.element('absenceReason').value = '병원에 가요';
  await ui.dispatch('submit', ui.element('absenceForm'));
  assert.equal(ui.saved(localKey).days[target].overrides.jingi, 'out');
  assert.equal(ui.saved(localKey).days[target].absenceReasons.jingi, '병원에 가요');
  assert.equal(ui.saved(localKey).days[monday], undefined);
  assert.equal(ui.element('dateInput').value, monday);
  await ui.action('weekMember','jingi',{ 'data-date': target });
  await ui.action('setAvailability','auto',{ 'data-date': target });
  assert.equal(ui.saved(localKey).days[target].overrides.jingi, undefined);
  assert.equal(ui.saved(localKey).days[target].absenceReasons.jingi, undefined);
  await ui.action('weekMember','jingi',{ 'data-date': '2026-10-20' });
  await ui.action('setAvailability','in',{ 'data-date': '2026-10-20' });
  assert.equal(ui.saved(localKey).days['2026-10-20'].overrides.jingi, 'in');
  assert.equal(ui.element('dateInput').value, monday);
  const before = ui.saved(localKey);
  await ui.action('weekMember','jiwoo',{ 'data-date': target });
  assert.match(ui.element('dialogTitle').textContent + ui.element('dialogContent').innerHTML, /서지우/);
  assert.equal(ui.saved('sandsLunch.identity.v1'), 'jingi');
  assert.doesNotMatch(ui.element('dialogContent').innerHTML, /data-action="setAvailability"/);
  assert.deepEqual(ui.saved(localKey), before);
  assert.equal(ui.element('dateInput').value, monday);
});

test('주간 이전·다음·이번 주와 날짜 헤더 이동을 지원한다', async () => {
  const ui = await boot();
  await ui.action('weekPrev');
  assert.equal(ui.element('dateInput').value, '2026-10-12');
  ui.element('weekCell-jingi-2026-10-12');
  await ui.action('weekNext');
  assert.equal(ui.element('dateInput').value, monday);
  await ui.action('date', '2026-10-22');
  assert.equal(ui.element('dateInput').value, '2026-10-22');
  await ui.action('weekNext');
  assert.equal(ui.element('dateInput').value, '2026-10-29');
  ui.element('weekCell-jingi-2026-10-26');
  await ui.action('weekToday');
  assert.equal(ui.element('dateInput').value, monday);
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 6명');
});

test('공유 주간 취소와 본인 일정 수정도 POST 날짜와 수신 확인을 클릭한 날짜로 처리한다', async () => {
  const days = {}, receipts = {}, bodies = [];
  const server = request => {
    assert.equal(request.action, 'state');
    return { ok: true, days: stateDaysFor(request.date, days), settings: C.settings(), configRevision: 0,
      features: { menuImages: true }, menuImages: {}, receipt: receipts[request.receipt] };
  };
  const post = async (url, init) => {
    assert.equal(url, connection.url);
    const body = JSON.parse(init.body); bodies.push(body);
    days[body.date] = C.applyOperation(days[body.date], body.date, C.settings(), body.op);
    receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
  };
  const ui = await boot({ connected: true, server, post });
  await ui.checkbox({ 'data-action': 'weekCancel', 'data-date': '2026-10-20' }, true);
  await ui.action('weekMember','jingi',{ 'data-date': '2026-10-21' });
  await ui.action('setAvailability','ceo',{ 'data-date': '2026-10-21' });
  await ui.checkbox({ 'data-action': 'weekCancel', 'data-date': '2026-10-20' }, false);
  assert.deepEqual(bodies.map(b => [b.date, b.op.type]), [
    ['2026-10-20','ceo'], ['2026-10-21','availability'], ['2026-10-20','ceo']
  ]);
  assert.ok(bodies.every(body => body.op.actor === 'jingi'));
  assert.equal(days['2026-10-20'].ceoCancelled, false);
  assert.equal(days['2026-10-21'].overrides.jingi, 'ceo');
  assert.equal(days[monday], undefined);
  assert.equal(ui.element('dateInput').value, monday);
  const peer = await boot({ connected: true, server, identity: 'yunchul' });
  assert.equal(peer.element('weekCancel-2026-10-20').checked, false);
  assert.match(weeklyCellText(peer,'jingi','2026-10-21'), /대표님과 점심/);
});

test('토요일을 보며 화요일 일정을 저장해도 토요일 공유 식단 이미지를 유지한다', async () => {
  const saturday = '2026-10-24', days = {}, receipts = {}, bodies = [];
  const meta = { id: 'saturday-image', scope: 'day', date: saturday, startDate: saturday, endDate: saturday,
    name: '토요일 식단.png', mimeType: 'image/png', size: 67, uploadedBy: 'jingi', uploadedAt: fixedTime };
  let saturdayReads = 0, holdRefresh = false, releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  const server = async request => {
    if (request.action === 'menuImage') return { ok: true, image: { ...meta, dataUrl: png } };
    assert.equal(request.action, 'state');
    if (request.date === saturday && !request.receipt) {
      saturdayReads++;
      if (holdRefresh) await refreshGate;
    }
    return { ok: true, days: stateDaysFor(request.date,days), settings: C.settings(), configRevision: 0,
      features: { menuImages: true }, menuImages: request.date === saturday ? { ['day:' + saturday]: meta } : {},
      receipt: receipts[request.receipt] };
  };
  const post = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    days[body.date] = C.applyOperation(days[body.date],body.date,C.settings(),body.op);
    receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
  };
  const ui = await boot({ connected: true, server, post });
  ui.element('dateInput').value = saturday;
  await ui.dispatch('change', ui.element('dateInput'));
  assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
  holdRefresh = true;
  const saving = ui.checkbox({ 'data-action': 'weekCancel', 'data-date': '2026-10-20' }, true);
  try {
    await ui.settle();
    assert.equal(bodies[0].date, '2026-10-20');
    assert.equal(ui.element('dateInput').value, saturday);
    assert.equal(saturdayReads, 2);
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
  } finally { releaseRefresh(); }
  await saving; await ui.settle();
  assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
});

test('공유 연결 전에도 메가존 주간 식단 다섯 날짜를 조회하고 선택한 날로 이동한다', async () => {
  const ui = await boot();
  assert.match(ui.element('restaurantCards').innerHTML, /월요일 곰탕/);
  await ui.action('menuView', 'week');
  const week = ui.element('restaurantCards').innerHTML;
  assert.equal((week.match(/class="week-menu-day(?:\s|\")/g) || []).length, 5);
  assert.match(week, /화요일 제육볶음/);
  assert.match(week, /목요일 생선까스/);
  assert.match(week, /금요일 우동/);
  for (const date of Object.keys(menuData)) assert.ok(ui.publicRequests.includes(date), `${date} was not fetched`);
  assert.equal(ui.requests.length, 0);
  await ui.action('menuDate', '2026-10-20');
  assert.equal(ui.element('dateInput').value, '2026-10-20');
  assert.match(ui.element('restaurantCards').innerHTML, /화요일 제육볶음/);
  assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /월요일 곰탕/);
});

test('런치타임 카카오 채널 링크와 사진 업로드 대화상자를 제공한다', async () => {
  const ui = await boot();
  assert.match(ui.element('restaurantCards').innerHTML, /href="https:\/\/pf\.kakao\.com\/_xbbMPn"/);
  await ui.action('menuImageUpload');
  assert.equal(ui.element('appDialog').open, true);
  for (const id of ['menuImageForm','menuImageFile','menuImageScope','menuImagePreview','menuImageStatus']) ui.element(id);
  assert.match(ui.element('dialogContent').innerHTML, /기기/);
  assert.equal(ui.posted.length, 0);
});

test('독립된 두 공유 세션에서 같은 주간 사진을 불러오고 다음 주에 잘못 재사용하지 않는다', async () => {
  const meta = { id: 'img_test_week', scope: 'week', date: monday, startDate: monday, endDate: '2026-10-25',
    name: '런치타임 주간 식단.png', mimeType: 'image/png', size: 67, uploadedBy: 'jingi', uploadedAt: fixedTime };
  const server = request => {
    if (request.action === 'state') return { ok: true, serverVersion: 2, features: { menuImages: true },
      days: stateDaysFor(request.date), settings: {}, configRevision: 0, menuImages: { ['week:' + monday]: meta } };
    if (request.action === 'menuImage') return { ok: true, image: { ...meta, dataUrl: png } };
    throw new Error('Unexpected action ' + request.action);
  };
  const first = await boot({ connected: true, server });
  const second = await boot({ connected: true, server, identity: 'yunchul' });
  for (const ui of [first, second]) {
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
    assert.match(ui.element('restaurantCards').innerHTML, /천진기/);
    assert.ok(ui.requests.some(r => r.action === 'menuImage' && r.imageId === meta.id));
    assert.equal(ui.saved(imageKey), undefined, 'Shared image bodies should not be copied into local image storage');
  }
  await second.action('date', '2026-10-20');
  assert.match(second.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
  second.element('dateInput').value = '2026-10-26';
  for (const listener of second.element('dateInput').events.get('change') || []) await listener({ target: second.element('dateInput') });
  await second.settle();
  assert.doesNotMatch(second.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
});

function sharedImageServer(receiptGate) {
  const images = {}, receipts = {}, bodies = [];
  return {
    images, bodies,
    async read(request) {
      if (request.action === 'state') {
        if (request.receipt && receiptGate) await receiptGate;
        return { ok: true, serverVersion: 2, features: { menuImages: true }, days: stateDaysFor(request.date), settings: {}, configRevision: 0,
          menuImages: Object.fromEntries(Object.entries(images).map(([slot, image]) => {
            const { dataUrl, ...meta } = image; return [slot, meta];
          })), receipt: request.receipt ? receipts[request.receipt] : undefined };
      }
      if (request.action === 'menuImage') {
        const image = Object.values(images).find(image => image.id === request.imageId);
        assert.ok(image, 'The UI requested a missing image'); return { ok: true, image };
      }
      throw new Error('Unexpected shared action ' + request.action);
    },
    async post(url, init) {
      assert.equal(url, connection.url); assert.equal(init.method, 'POST'); assert.equal(init.mode, 'no-cors');
      const body = JSON.parse(init.body), { op } = body, { scope, dataUrl, name, expectedImageId } = op.payload;
      assert.equal(body.key, connection.key); assert.equal(op.type, 'menuImageUpload'); assert.equal(op.actor, 'jingi');
      assert.ok(C.validDate(body.date)); assert.ok(['week', 'day'].includes(scope)); assert.equal(dataUrl, jpeg);
      const startDate = scope === 'week' ? C.weekDates(body.date)[0] : body.date, slot = scope + ':' + startDate;
      assert.equal(expectedImageId, images[slot]?.id || '');
      bodies.push(body);
      images[slot] = { id: 'image_' + bodies.length, scope, date: startDate, startDate,
        endDate: scope === 'week' ? C.shiftDate(startDate, 6) : body.date, name, mimeType: 'image/jpeg',
        size: Buffer.from(dataUrl.split(',')[1], 'base64').length, uploadedBy: op.actor, uploadedAt: fixedTime, dataUrl };
      receipts[op.id] = { ok: true }; return { type: 'opaque', status: 0 };
    }
  };
}

for (const scope of ['week', 'day']) {
  test(`${scope === 'week' ? '주간' : '하루'} 이미지 선택·미리보기·업로드 후 수신 확인을 받아야 완료하고 동료에게 표시한다`, async () => {
    let releaseReceipt;
    const receiptGate = new Promise(resolve => { releaseReceipt = resolve; });
    const server = sharedImageServer(receiptGate);
    const ui = await boot({ connected: true, server: server.read, post: server.post });
    await ui.action('date', '2026-10-20');
    await ui.selectImage(scope);
    const saving = ui.dispatch('submit', ui.element('menuImageForm'));
    try {
      await ui.settle();
      assert.equal(ui.posted.length, 1);
      assert.equal(server.bodies[0].date, '2026-10-20');
      assert.equal(server.bodies[0].op.payload.scope, scope);
      assert.ok(ui.requests.some(r => r.receipt === server.bodies[0].op.id));
      assert.equal(ui.element('appDialog').open, true, 'An opaque POST alone must not finish the upload');
      assert.equal(ui.element('uploadMenuImageButton').disabled, true);
      assert.match(ui.element('menuImageStatus').textContent, /공유하고/);
      await ui.press('closeDialog');
      assert.equal(ui.element('appDialog').open, true, 'The dialog stays open while waiting for the server receipt');
    } finally { releaseReceipt(); }
    await saving;
    assert.equal(ui.element('appDialog').open, false);
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/jpeg;base64,/);
    assert.match(ui.element('toast').textContent, /식단 이미지를 공유했어요/);
    assert.equal(ui.saved(imageKey), undefined);
    assert.equal(ui.imageWork.encoded.length, 1);
    assert.equal(ui.imageWork.encoded[0].width, 2800);
    assert.equal(ui.imageWork.draws.length, 1);
    assert.deepEqual(ui.imageWork.revoked, ui.imageWork.created.map(item => item.url));
    const meta = Object.values(server.images)[0];
    assert.equal(meta.startDate, scope === 'week' ? monday : '2026-10-20');
    assert.equal(meta.endDate, scope === 'week' ? '2026-10-25' : '2026-10-20');
    const peer = await boot({ connected: true, server: server.read, identity: 'yunchul' });
    if (scope === 'day') {
      assert.doesNotMatch(peer.element('restaurantCards').innerHTML, /data:image\/jpeg;base64,/);
      await peer.action('date', '2026-10-20');
    }
    assert.match(peer.element('restaurantCards').innerHTML, /data:image\/jpeg;base64,/);
    assert.match(peer.element('restaurantCards').innerHTML, /천진기/);
    assert.ok(peer.requests.some(r => r.action === 'menuImage' && r.imageId === meta.id));
  });
}

test('공유 연결 전 주간·하루 사진은 이 기기에만 저장하고 POST를 보내지 않는다', async () => {
  const ui = await boot();
  for (const scope of ['week', 'day']) {
    await ui.selectImage(scope);
    await ui.dispatch('submit', ui.element('menuImageForm'));
    assert.equal(ui.element('appDialog').open, false);
    assert.equal(ui.saved(imageKey)[scope + ':' + monday].scope, scope);
    assert.equal(ui.saved(imageKey)[scope + ':' + monday].dataUrl, jpeg);
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/jpeg;base64,/);
    assert.match(ui.element('restaurantCards').innerHTML, /이 기기에서만 미리보기/);
    assert.match(ui.element('toast').textContent, /이 기기에 미리보기를 저장했어요/);
  }
  assert.equal(ui.posted.length, 0); assert.equal(ui.requests.length, 0);
});

test('공유 이미지 기능이 없는 구버전 서버는 업데이트를 안내하고 업로드하지 않는다', async () => {
  const ui = await boot({ connected: true, server: request => {
    assert.equal(request.action, 'state');
    return { ok: true, days: stateDaysFor(request.date), settings: {}, configRevision: 0, features: {} };
  } });
  await ui.action('menuImageUpload');
  assert.match(ui.element('dialogTitle').textContent, /업데이트/);
  assert.match(ui.element('dialogContent').innerHTML, /setup\.html#update/);
  assert.doesNotMatch(ui.element('dialogContent').innerHTML, /id="menuImageForm"/);
  assert.equal(ui.posted.length, 0);
});
