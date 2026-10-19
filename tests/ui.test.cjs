const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { webcrypto } = require('node:crypto');
const C = require('../core.js');
const G = require('../restaurant-guide.js');
const M = require('../menu-source.js');
const richMenuFixture = require('./fixtures/welplan-20261019.json');

const root = path.resolve(__dirname, '..');
const monday = '2026-10-19';
const fixedTime = '2026-10-19T03:26:00.000Z';
const localKey = 'sandsLunch.local.v1';
const imageKey = 'sandsLunch.menuImages.v1';
const kakaoKey = 'sandsLunch.kakaoProfile.v1';
const kakaoChannel = 'https://pf.kakao.com/_xbbMPn';
const kakaoImage = 'https://k.kakaocdn.net/dn/lunch-profile/fixture/img_m.jpg';
const connection = { url: 'https://script.google.com/macros/s/test_deployment/exec', key: 'a'.repeat(64) };
const sharedFeatures = { menuImages: true, menuImageDelete: true, explicitAttendance: true, lunchPairs: true, kakaoProfile: true };
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

function basicSharedState(request, extra = {}) {
  assert.equal(request.action, 'state');
  return { ok: true, serverVersion: 3, features: sharedFeatures, days: stateDaysFor(request.date),
    settings: C.settings(), configRevision: 0, menuImages: {}, ...extra };
}

const profileData = (imageUrl = kakaoImage, checkedAt = fixedTime) => ({ ok: true, sourceUrl: kakaoChannel, imageUrl, checkedAt });

const orderedTeams = [
  ['경영지원팀', ['yunchul', 'seongeun', 'yunseok']],
  ['디자인팀', ['jiwoo', 'jingi']],
  ['연구기획팀', ['minjun']],
  ['영업팀', ['hyunju']],
  ['전략사업팀', ['juri', 'hyunsu']],
  ['커뮤니케이션팀', ['seongjun']]
];
const orderedMembers = orderedTeams.flatMap(([, ids]) => ids);

function dailyGroup(ui, kind) {
  const id = 'dailyGroup-' + kind;
  const match = ui.element('membersGrid').innerHTML.match(new RegExp('<article\\b(?=[^>]*\\bid="' + id + '")[^>]*>([\\s\\S]*?)<\\/article>'));
  assert.ok(match, 'Missing daily group markup ' + id);
  return match[1];
}

function dailyMembers(ui, kind) {
  return [...dailyGroup(ui, kind).matchAll(/<button\b[^>]*\bid="dailyMember-([^"]+)"[^>]*>/g)].map(match => match[1]);
}

function assertDailyBoard(ui, date, expected) {
  const board = ui.element('membersGrid').innerHTML;
  assert.equal((board.match(/\bid="dailyGroup-(?:in|ceo|out|pending)"/g) || []).length, 4);
  assert.equal((board.match(/\bid="dailyMember-[^"]+"/g) || []).length, 10);
  const all = [];
  for (const kind of ['in', 'ceo', 'out', 'pending']) {
    assert.match(ui.element('dailyGroup-' + kind).className, new RegExp('\\bis-' + kind + '\\b'));
    const ids = dailyMembers(ui, kind);
    assert.deepEqual(ids, expected[kind]);
    assert.match(visibleText(dailyGroup(ui, kind)), new RegExp('(?:^|\\s)' + ids.length + '\\s*명(?:\\s|$)'));
    all.push(...ids);
  }
  assert.deepEqual(all.slice().sort(), C.MEMBERS.map(member => member.id).sort());
  for (const member of C.MEMBERS) {
    const button = ui.element('dailyMember-' + member.id);
    assert.equal(button.tagName, 'BUTTON');
    assert.equal(button.dataset.action, 'dailyMember');
    assert.equal(button.dataset.id, member.id);
    assert.equal(button.dataset.date, date);
    assert.equal((visibleText(board).match(new RegExp(member.name, 'g')) || []).length, 1, member.name + ' must appear once on the daily board');
  }
}

/*
 * Executes the real app.js with the DOM surface it uses. This is a functional
 * rendering/event test, not a browser or a layout/accessibility test. External
 * menu and shared-server responses are fixtures; network access is forbidden.
 */
async function boot(options = {}) {
  const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
  const elements = new Map(), handlers = new Map(), storage = new Map();
  const requests = [], publicRequests = [], kakaoRequests = [], errors = [], posted = [];
  const imageWork = { created: [], revoked: [], draws: [], encoded: [] };
  let context, timerId = 0, now = Date.parse(fixedTime);
  const intervals = new Map();
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
      this.className = attributes.class || ''; this.style = {}; this.open = 'open' in attributes;
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
    close() {
      const wasOpen = this.open; this.open = false;
      if (wasOpen) for (const fn of this.events.get('close') || []) fn({ target: this });
    }
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
          let result;
          if (request.action === 'kakaoProfile') {
            kakaoRequests.push(request);
            result = options.kakaoRequest ? await options.kakaoRequest(request)
              : options.kakaoError ? { ok: false, error: 'Fixture channel unavailable' }
              : options.kakaoResponse || { ok: true, profile: { ok: true, sourceUrl: kakaoChannel, imageUrl: kakaoImage, checkedAt: new Date(now).toISOString() } };
          } else {
            if (!options.server) throw new Error('Unexpected shared-server request: ' + request.action);
            result = await options.server(request);
          }
          const callback = context[request.callback];
          if (typeof callback !== 'function') throw new Error('JSONP callback was not registered');
          callback(result);
        }).catch(error => { errors.push(error); if (script.onerror) script.onerror(error); });
      }
    }
  };
  class FixedDate extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
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
    setTimeout: () => ++timerId, clearTimeout() {},
    setInterval(fn, delay) { const id = ++timerId; intervals.set(id, { fn, delay }); return id; },
    clearInterval(id) { intervals.delete(id); },
    confirm: () => true,
    fetch: async (url, init) => {
      posted.push({ url, init });
      if (options.post) return options.post(url, init);
      throw new Error('Unexpected real fetch in UI test');
    },
    LunchMenuSource: {
      validImageURL: M.validImageURL,
      fetchDay: async date => {
        publicRequests.push(date);
        const value = (options.menus || menuData)[date];
        const response = Array.isArray(value) ? { dishes: value } : value || { dishes: [] };
        return C.clone({ ...response, ...(options.courseDetails?.[date] ? { courses: options.courseDetails[date] } : {}),
          date, fetchedAt: fixedTime, source: 'https://welplan.pmh.codes/', ok: true });
      }
    }
  });
  context.window = context;
  vm.runInContext(fs.readFileSync(path.join(root, 'core.js'), 'utf8'), context, { filename: 'core.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'restaurant-guide.js'), 'utf8'), context, { filename: 'restaurant-guide.js' });
  vm.runInContext(fs.readFileSync(path.join(root, 'lunchtime-source.js'), 'utf8'), context, { filename: 'lunchtime-source.js' });
  if (options.omitKakaoSource) {
    context.LunchKakaoSource = undefined;
    assert.equal(vm.runInContext('window.LunchKakaoSource', context), undefined);
  }
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
    const markup = elements.get('appDialog')?.open ? elements.get('dialogContent').innerHTML
      : [html, ...[...elements.values()].map(el => el.innerHTML)].join('\n');
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
  async function chooseDate(date) { element('dateInput').value = date; await dispatch('change', element('dateInput')); }
  async function selectIdentity(id) { element('identitySelect').value = id; await dispatch('change', element('identitySelect')); }
  async function toggleCancelled(checked) {
    const input = element('ceoCancelled');
    assert.equal(input.disabled, false, 'Cannot change a disabled cancellation switch');
    input.checked = checked; await dispatch('change', input);
  }
  async function press(id) {
    const target = element(id);
    assert.equal(target.disabled, false, 'Cannot press disabled control #' + id);
    await dispatch('click', target);
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
  return { html, element, action, press, dispatch, settle, selectImage, findControl, chooseDate, selectIdentity, toggleCancelled, requests, publicRequests, kakaoRequests, posted, imageWork,
    visibilityChange: (hidden = false) => { document.hidden = hidden; return dispatch('visibilitychange', document); },
    advanceTime: ms => { now += ms; },
    async runIntervals(delay) {
      const selected = [...intervals.values()].filter(interval => interval.delay === delay);
      assert.ok(selected.length, 'No interval registered for ' + delay + ' ms');
      for (const interval of selected) await interval.fn();
      await settle();
    },
    saved: key => storage.has(key) ? JSON.parse(storage.get(key)) : undefined,
    storeFromOtherTab: (key, value) => storage.set(key, JSON.stringify(value)) };
}

test('기존 다섯 명의 저장값에서 열 멤버를 한 번씩 표시하고 이름 선택과 설정을 팀·이름 순으로 정렬한다', async () => {
  const ui = await boot({ storage: { [localKey]: { days: {}, settings: {
    scheduleEnd: '2026-12-31', meetingTime: '12:00',
    ceoDays: { seongjun: [2,5], juri: [1,2,5], hyunsu: [1,2,5], yunchul: [3], jingi: [2] }
  } } } });
  assert.match(ui.element('identitySelect').innerHTML, /value="jingi">천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /디자인팀/);
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 0명');
  assertDailyBoard(ui, monday, {
    in: [], ceo: ['minjun', 'hyunju', 'juri', 'hyunsu'], out: [],
    pending: ['yunchul', 'seongeun', 'yunseok', 'jiwoo', 'jingi', 'seongjun']
  });
  const identityGroups = [...ui.element('identitySelect').innerHTML.matchAll(/<optgroup\b[^>]*label="([^"]+)"[^>]*>([\s\S]*?)<\/optgroup>/g)]
    .map(match => [match[1], [...match[2].matchAll(/<option\b[^>]*value="([^"]+)"[^>]*>/g)].map(option => option[1])]);
  assert.deepEqual(identityGroups, orderedTeams);
  for (const name of ['최민준','오성은','장윤석','서지우','조현주']) {
    assert.ok(ui.element('identitySelect').innerHTML.includes(name));
    assert.ok(ui.element('membersGrid').innerHTML.includes(name));
  }
  assert.doesNotMatch(visibleText(ui.html + ui.element('membersGrid').innerHTML), /CEO/);
  await ui.press('settingsBtn');
  assert.match(ui.element('dialogContent').innerHTML, /천진기/);
  for (const name of ['최민준','오성은','장윤석','서지우','조현주']) assert.ok(ui.element('dialogContent').innerHTML.includes(name));
  const settingsOrder = [...new Set([...ui.element('dialogContent').innerHTML.matchAll(/<input\b[^>]*name="([^"]+)"[^>]*>/g)]
    .map(match => match[1]).filter(id => orderedMembers.includes(id)))];
  assert.deepEqual(settingsOrder, orderedMembers);
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.doesNotMatch(visibleText(ui.element('dialogContent').innerHTML), /CEO/);
  await ui.press('closeDialog');
  await ui.action('dailyMember', 'jingi', { 'data-date': monday });
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.doesNotMatch(visibleText(ui.element('dialogContent').innerHTML), /CEO/);
});

test('함께 먹기를 직접 선택해야 녹색 그룹과 투표에 반영되고 화요일 대표님 일정도 자동 참석하지 않는다', async () => {
  const ui = await boot();
  await ui.action('vote', 'lunchtime');
  assert.equal(ui.saved(localKey), undefined);
  assert.match(ui.element('dialogContent').innerHTML, /함께/);
  await ui.press('closeDialog');
  await ui.press('choiceIn');
  assert.equal(ui.saved(localKey).days[monday].overrides.jingi, 'in');
  assert.deepEqual(dailyMembers(ui, 'in'), ['jingi']);
  assert.equal(ui.element('choiceIn').getAttribute('aria-pressed'), 'true');
  await ui.action('vote', 'lunchtime');
  assert.equal(ui.saved(localKey).days[monday].votes.jingi, 'lunchtime');
  assert.match(ui.element('voteResults').innerHTML, /천진기/);
  await ui.chooseDate('2026-10-20');
  assert.equal(ui.element('heroCount').textContent, '이날 함께 0명');
  await ui.action('vote', 'megazone');
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.equal(ui.saved(localKey).days['2026-10-20'], undefined);
});

test('새 다섯 명을 화면에서 각각 선택하고 투표하면 해당 이름으로 저장·집계된다', async () => {
  const ui = await boot();
  const members = [['minjun','최민준'],['seongeun','오성은'],['yunseok','장윤석'],['jiwoo','서지우'],['hyunju','조현주']];
  await ui.chooseDate('2026-10-22');
  assert.equal(ui.element('heroCount').textContent, '이날 함께 0명');
  for (const [index, [id, name]] of members.entries()) {
    await ui.selectIdentity(id);
    assert.equal(ui.element('identitySelect').value, id);
    assert.equal(ui.saved('sandsLunch.identity.v1'), id);
    if (id === 'minjun') {
      await ui.action('dailyMember', id, { 'data-date': '2026-10-22' });
      assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
      await ui.press('closeDialog');
    }
    await ui.press('choiceIn');
    assert.equal(ui.saved(localKey).days['2026-10-22'].overrides[id], 'in');
    assert.equal(ui.element('heroCount').textContent, `이날 함께 ${index + 1}명`);
    await ui.action('vote', 'lunchtime');
    assert.equal(ui.saved(localKey).days['2026-10-22'].votes[id], 'lunchtime');
    assert.ok(ui.element('voteResults').innerHTML.includes(name));
  }
  assert.match(ui.element('voteSummary').textContent, /5명 중 5명/);
});

test('하루 현황의 네 그룹 위에 내 선택과 전체 대표님 일정 취소를 구분해서 표시한다', async () => {
  const ui = await boot();
  assert.ok(ui.html.indexOf('id="peopleSection"') < ui.html.indexOf('id="membersGrid"'));
  assert.ok(ui.html.indexOf('id="membersGrid"') < ui.html.indexOf('id="menuSection"'));
  assert.equal((ui.html.match(/id="membersGrid"/g) || []).length, 1);
  for (const id of ['dateInput', 'prevDate', 'nextDate', 'todayBtn']) {
    assert.equal((ui.html.match(new RegExp('id="' + id + '"', 'g')) || []).length, 1);
    assert.ok(ui.html.indexOf('id="peopleSection"') < ui.html.indexOf('id="' + id + '"'));
    assert.ok(ui.html.indexOf('id="' + id + '"') < ui.html.indexOf('id="membersGrid"'));
  }
  assert.ok(ui.html.indexOf('id="myResponsePanel"') < ui.html.indexOf('id="identitySelect"'));
  assert.ok(ui.html.indexOf('id="myResponsePanel"') < ui.html.indexOf('id="ceoControls"'));
  assert.ok(ui.html.indexOf('id="ceoControls"') < ui.html.indexOf('id="membersGrid"'));
  for (const id of ['choiceIn', 'choiceSeparate', 'choiceOut']) assert.equal(ui.element(id).tagName, 'BUTTON');
  assert.match(ui.element('myResponseContent').innerHTML, /함께 먹기/);
  assert.match(ui.element('myResponseContent').innerHTML, /따로 먹기/);
  assert.match(ui.element('myResponseContent').innerHTML, /안 먹기/);
  assert.match(ui.element('membersGrid').className, /\bdaily-groups\b/);
  assert.doesNotMatch(ui.html + ui.element('membersGrid').innerHTML, /(?:id="(?:weekSection|weekTableScroll|weekHead|weekBody|prevWeek|thisWeek|nextWeek)"|data-action="week[^\"]*"|class="member-card)/);
  await ui.chooseDate('2026-10-20');
  assertDailyBoard(ui, '2026-10-20', {
    in: [], ceo: ['jiwoo', 'jingi', 'juri', 'hyunsu', 'seongjun'], out: [],
    pending: ['yunchul', 'seongeun', 'yunseok', 'minjun', 'hyunju']
  });
  assert.equal(ui.element('heroCount').textContent, '이날 함께 0명');
  assert.equal(ui.element('ceoCancelled').checked, false);
  assert.match(visibleText(dailyGroup(ui, 'ceo')), /대표님과 점심/);
});

test('대표님과 점심 취소·복원은 선택한 하루에만 저장하고 수동 불참과 개별 대표님 일정을 유지한다', async () => {
  const tuesday = '2026-10-20';
  let day = C.applyOperation(C.emptyDay(),tuesday,C.settings(),{ type: 'availability', actor: 'yunchul', payload: { value: 'out', reason: '병원에 가요' } });
  day = C.applyOperation(day,tuesday,C.settings(),{ type: 'availability', actor: 'juri', payload: { value: 'ceo' } });
  const ui = await boot({ storage: { [localKey]: { days: { [tuesday]: day }, settings: C.settings() } } });
  for (const date of C.weekDates(monday)) {
    await ui.chooseDate(date);
    for (const checked of [true, false]) {
      const previous = C.clone(ui.saved(localKey).days);
      await ui.toggleCancelled(checked);
      const saved = ui.saved(localKey).days;
      assert.equal(ui.element('dateInput').value, date);
      assert.equal(saved[date].ceoCancelled, checked);
      assert.equal(ui.element('ceoCancelled').checked, checked);
      delete previous[date];
      assert.deepEqual(Object.fromEntries(Object.entries(saved).filter(([d]) => d !== date)), previous);
      assert.equal(saved[tuesday].overrides.yunchul, 'out');
      assert.equal(saved[tuesday].absenceReasons.yunchul, '병원에 가요');
      assert.equal(saved[tuesday].overrides.juri, 'ceo');
      if (date === tuesday) {
        assertDailyBoard(ui, date, checked ? {
          in: [], ceo: ['juri'], out: ['yunchul'], pending: ['seongeun', 'yunseok', 'jiwoo', 'jingi', 'minjun', 'hyunju', 'hyunsu', 'seongjun']
        } : {
          in: [], ceo: ['jiwoo', 'jingi', 'juri', 'hyunsu', 'seongjun'], out: ['yunchul'], pending: ['seongeun', 'yunseok', 'minjun', 'hyunju']
        });
        await ui.action('dailyMember', 'yunchul', { 'data-date': date });
        assert.match(ui.element('dialogContent').innerHTML, /병원에 가요/);
        await ui.press('closeDialog');
      }
    }
  }
});

test('본인 이름에서 선택일의 불참·참석·기본 복원을 저장하고 타인 상세는 신원을 바꾸지 않는다', async () => {
  const ui = await boot(), target = '2026-10-21';
  await ui.chooseDate(target);
  await ui.action('dailyMember','jingi',{ 'data-date': target });
  assert.match(ui.element('dialogTitle').textContent, /10월 21일/);
  await ui.press('closeDialog');
  await ui.press('choiceOut');
  assert.equal(ui.element('absenceForm').dataset.date, target);
  assert.equal(ui.element('absenceForm').dataset.member, 'jingi');
  ui.element('absenceReason').value = '병원에 가요';
  await ui.dispatch('submit', ui.element('absenceForm'));
  assert.equal(ui.saved(localKey).days[target].overrides.jingi, 'out');
  assert.equal(ui.saved(localKey).days[target].absenceReasons.jingi, '병원에 가요');
  assert.equal(ui.saved(localKey).days[monday], undefined);
  assert.equal(ui.element('dateInput').value, target);
  assert.deepEqual(dailyMembers(ui, 'out'), ['jingi']);
  await ui.action('dailyMember','jingi',{ 'data-date': target });
  await ui.action('setAvailability','auto',{ 'data-date': target });
  assert.equal(ui.saved(localKey).days[target].overrides.jingi, undefined);
  assert.equal(ui.saved(localKey).days[target].absenceReasons.jingi, undefined);
  const wednesday = ui.saved(localKey).days[target];
  await ui.chooseDate('2026-10-20');
  await ui.press('cancelMyCeo');
  assert.equal(ui.saved(localKey).days['2026-10-20'].overrides.jingi, 'pending');
  assert.equal(ui.saved(localKey).days['2026-10-20'].ceoCancelled, false);
  assert.ok(dailyMembers(ui, 'pending').includes('jingi'));
  assert.ok(dailyMembers(ui, 'ceo').includes('jiwoo'));
  assert.deepEqual(dailyMembers(ui, 'in'), []);
  await ui.action('dailyMember','jingi',{ 'data-date': '2026-10-20' });
  await ui.action('setAvailability','in',{ 'data-date': '2026-10-20' });
  assert.equal(ui.saved(localKey).days['2026-10-20'].overrides.jingi, 'in');
  assert.deepEqual(ui.saved(localKey).days[target], wednesday);
  assert.equal(ui.element('dateInput').value, '2026-10-20');
  const before = ui.saved(localKey);
  await ui.action('dailyMember','jiwoo',{ 'data-date': '2026-10-20' });
  assert.match(ui.element('dialogTitle').textContent + ui.element('dialogContent').innerHTML, /서지우/);
  assert.match(ui.element('dialogContent').innerHTML, /10월 20일/);
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.equal(ui.saved('sandsLunch.identity.v1'), 'jingi');
  assert.doesNotMatch(ui.element('dialogContent').innerHTML, /data-action="(?:setAvailability|absence|chooseIdentity)"/);
  assert.deepEqual(ui.saved(localKey), before);
  assert.equal(ui.element('dateInput').value, '2026-10-20');
  await ui.press('closeDialog');
  await ui.action('setAvailability', 'pending', { 'data-date': '2026-10-20' });
  assert.equal(ui.saved(localKey).days['2026-10-20'].overrides.jingi, 'pending');
  assert.ok(dailyMembers(ui, 'pending').includes('jingi'));
  assert.deepEqual(ui.saved(localKey).days[target], wednesday);
  const newcomer = await boot({ identity: null });
  await newcomer.press('choiceIn');
  assert.match(newcomer.element('dialogTitle').textContent, /내 이름/);
  assert.equal(newcomer.saved(localKey), undefined);
  await newcomer.press('closeDialog');
  await newcomer.chooseDate('2026-10-20');
  await newcomer.action('dailyMember','jiwoo',{ 'data-date': '2026-10-20' });
  assert.equal(newcomer.saved('sandsLunch.identity.v1'), undefined);
  assert.doesNotMatch(newcomer.element('dialogContent').innerHTML, /data-action="(?:setAvailability|absence)"/);
  await newcomer.action('chooseIdentity', 'jiwoo');
  assert.equal(newcomer.element('identitySelect').value, 'jiwoo');
  assert.equal(newcomer.saved('sandsLunch.identity.v1'), 'jiwoo');
  assert.equal(newcomer.saved(localKey), undefined);
  await newcomer.action('dailyMember','jiwoo',{ 'data-date': '2026-10-20' });
  assert.match(newcomer.element('dialogContent').innerHTML, /data-action="setAvailability"/);
});

test('상단 이전 날·다음 날·날짜 선택·오늘 이동은 현황판 전체를 선택한 하루로 바꾼다', async () => {
  const ui = await boot();
  assert.equal(ui.element('peopleTitle').textContent, '오늘 점심 현황');
  await ui.press('prevDate');
  assert.equal(ui.element('dateInput').value, '2026-10-18');
  assertDailyBoard(ui, '2026-10-18', { in: [], ceo: [], out: [], pending: orderedMembers });
  assert.match(ui.element('peopleTitle').textContent, /선택한 날의 점심/);
  await ui.press('nextDate');
  assert.equal(ui.element('dateInput').value, monday);
  await ui.press('nextDate');
  assert.equal(ui.element('dateInput').value, '2026-10-20');
  assertDailyBoard(ui, '2026-10-20', {
    in: [], ceo: ['jiwoo', 'jingi', 'juri', 'hyunsu', 'seongjun'], out: [],
    pending: ['yunchul', 'seongeun', 'yunseok', 'minjun', 'hyunju']
  });
  await ui.press('nextDate');
  assert.equal(ui.element('dateInput').value, '2026-10-21');
  assertDailyBoard(ui, '2026-10-21', {
    in: [], ceo: ['yunchul', 'seongeun', 'yunseok'], out: [],
    pending: ['jiwoo', 'jingi', 'minjun', 'hyunju', 'juri', 'hyunsu', 'seongjun']
  });
  await ui.press('todayBtn');
  assert.equal(ui.element('dateInput').value, monday);
  await ui.chooseDate('2026-10-22');
  assert.equal(ui.element('dateInput').value, '2026-10-22');
  assertDailyBoard(ui, '2026-10-22', {
    in: [], ceo: ['minjun'], out: [],
    pending: ['yunchul', 'seongeun', 'yunseok', 'jiwoo', 'jingi', 'hyunju', 'juri', 'hyunsu', 'seongjun']
  });
  await ui.press('todayBtn');
  assert.equal(ui.element('dateInput').value, monday);
  assert.equal(ui.element('peopleTitle').textContent, '오늘 점심 현황');
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 0명');
});

test('아직 조회하지 않은 날짜는 공유 응답 전까지 현황 확인 중으로 표시하고 응답 후 실제 상태를 정렬한다', async () => {
  const target = '2026-10-26';
  const record = C.cleanDay({ ceoCancelled: true, overrides: { minjun: 'ceo', jingi: 'out', seongeun: 'in' }, absenceReasons: { jingi: '병원에 가요' } });
  let releaseResponse;
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  const ui = await boot({ connected: true, server: async request => {
    assert.equal(request.action, 'state');
    if (request.date === target) await responseGate;
    return { ok: true, serverVersion: 3, days: stateDaysFor(request.date, { [target]: record }), settings: C.settings(), configRevision: 0,
      features: sharedFeatures, menuImages: {} };
  } });
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 0명');
  try {
    await ui.chooseDate(target);
    assert.ok(ui.requests.some(request => request.date === target));
    assert.equal(ui.element('dateInput').value, target);
    assert.equal(ui.element('heroCount').textContent, '현황 확인 중…');
    assert.equal(ui.element('ceoCancelled').disabled, true);
    assert.equal(ui.element('membersGrid').getAttribute('aria-busy'), 'true');
    assert.doesNotMatch(ui.element('membersGrid').innerHTML, /data-action="dailyMember"/);
    for (const kind of ['in', 'ceo', 'out', 'pending']) {
      assert.deepEqual(dailyMembers(ui, kind), []);
      assert.match(visibleText(dailyGroup(ui, kind)), /–\s*명/);
      assert.match(visibleText(dailyGroup(ui, kind)), /현황 확인 중/);
    }
  } finally { releaseResponse(); }
  await ui.settle();
  assert.equal(ui.element('heroCount').textContent, '이날 함께 1명');
  assert.equal(ui.element('ceoCancelled').disabled, false);
  assert.equal(ui.element('ceoCancelled').checked, true);
  assert.equal(ui.element('membersGrid').getAttribute('aria-busy'), 'false');
  assertDailyBoard(ui, target, {
    in: ['seongeun'], ceo: ['minjun'], out: ['jingi'],
    pending: ['yunchul', 'yunseok', 'jiwoo', 'hyunju', 'juri', 'hyunsu', 'seongjun']
  });
  assert.match(ui.element('dailyMember-jingi').getAttribute('aria-label'), /병원에 가요/);
  assert.equal(ui.posted.length, 0);
});

test('따로 먹기 초대는 상대 수락 후에만 두 사람 모임이 되고 나가기·거절·개별 식사를 처리한다', async () => {
  const target = '2026-10-20', days = {}, receipts = {}, bodies = [];
  const server = request => {
    assert.equal(request.action, 'state');
    return { ok: true, serverVersion: 3, features: sharedFeatures, days: stateDaysFor(request.date, days),
      settings: C.settings(), configRevision: 0, menuImages: {}, receipt: receipts[request.receipt] };
  };
  const post = async (url, init) => {
    assert.equal(url, connection.url);
    const body = JSON.parse(init.body); bodies.push(body);
    days[body.date] = C.applyOperation(days[body.date], body.date, C.settings(), body.op);
    receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
  };
  const sender = await boot({ connected: true, server, post });
  await sender.chooseDate(target);
  const invite = async () => {
    await sender.press('choiceSeparate');
    assert.equal(sender.element('pairInviteForm').dataset.date, target);
    assert.equal(sender.element('pairInviteForm').dataset.member, 'jingi');
    sender.element('pairPartner').value = 'jiwoo';
    await sender.dispatch('submit', sender.element('pairInviteForm'));
    assert.equal(sender.element('appDialog').open, false);
    return days[target].pairs[0].id;
  };
  const firstPair = await invite();
  assert.match(firstPair, /^pair_[a-f0-9]{24}$/);
  assert.equal(days[target].overrides.jingi, 'separate');
  assert.equal(days[target].overrides.jiwoo, undefined, 'An invitation must preserve the recipient’s choice');
  assert.equal(days[target].pairs[0].status, 'pending');
  assert.equal(sender.element('pairBoard').hidden, false);
  assert.match(sender.element('pairBoard').innerHTML, /lunch-pair is-pending/);
  assert.ok(dailyMembers(sender, 'ceo').includes('jiwoo'));
  assert.doesNotMatch(sender.element('membersGrid').innerHTML, /id="dailyMember-jingi"/);
  await sender.action('pairDetails', 'jingi', { 'data-date': target });
  assert.match(sender.element('dialogContent').innerHTML, /data-action="pairCancel"/);
  assert.doesNotMatch(sender.element('dialogContent').innerHTML, /data-action="pairAccept"/);
  await sender.press('closeDialog');

  const recipient = await boot({ connected: true, server, post, identity: 'jiwoo' });
  await recipient.chooseDate(target);
  assert.match(recipient.element('pairInvitations').innerHTML, /천진기/);
  assert.ok(dailyMembers(recipient, 'ceo').includes('jiwoo'));
  await recipient.action('pairAccept', firstPair, { 'data-date': target, 'data-member': 'jiwoo' });
  assert.equal(days[target].pairs[0].status, 'accepted');
  assert.equal(days[target].overrides.jiwoo, 'separate');
  assert.match(recipient.element('pairBoard').innerHTML, /lunch-pair is-accepted/);
  assert.match(visibleText(recipient.element('pairBoard').innerHTML), /서지우\s*·\s*천진기/);
  assert.doesNotMatch(recipient.element('membersGrid').innerHTML, /id="dailyMember-(?:jingi|jiwoo)"/);
  assert.equal(['in', 'ceo', 'out', 'pending'].flatMap(kind => dailyMembers(recipient, kind)).length, 8);
  assert.equal(recipient.element('heroCount').textContent, '이날 함께 0명');
  assert.equal(recipient.element('pairInvitations').innerHTML, '');
  await sender.chooseDate(target);
  assert.match(sender.element('pairBoard').innerHTML, /lunch-pair is-accepted/);

  await recipient.action('pairDetails', 'jiwoo', { 'data-date': target });
  await recipient.action('pairLeave', firstPair, { 'data-date': target, 'data-member': 'jiwoo' });
  assert.deepEqual(days[target].pairs, []);
  assert.equal(days[target].overrides.jiwoo, 'pending');
  assert.equal(days[target].overrides.jingi, 'separate');
  await sender.chooseDate(target);
  assert.match(sender.element('pairBoard').innerHTML, /lunch-pair is-solo/);
  const secondPair = await invite();
  await recipient.chooseDate(target);
  await recipient.action('pairDecline', secondPair, { 'data-date': target, 'data-member': 'jiwoo' });
  assert.deepEqual(days[target].pairs, []);
  assert.equal(days[target].overrides.jiwoo, 'pending');
  await sender.chooseDate(target);
  await sender.press('choiceSeparate');
  await sender.action('setAvailability', 'separate', { 'data-date': target, 'data-member': 'jingi' });
  assert.match(sender.element('pairBoard').innerHTML, /lunch-pair is-solo/);
  assert.deepEqual(days[target].pairs, []);
  assert.deepEqual(dailyMembers(sender, 'in'), []);
  assert.deepEqual(Object.keys(days), [target]);
  assert.ok(bodies.every(body => body.date === target));
  assert.deepEqual(bodies.map(body => body.op.type), ['pairInvite', 'pairAccept', 'pairLeave', 'pairInvite', 'pairDecline', 'availability']);
  for (const body of bodies) {
    const ui = body.op.actor === 'jingi' ? sender : recipient;
    assert.ok(ui.requests.some(request => request.receipt === body.op.id && request.date === target));
  }
});

test('공유 취소와 본인 일정 수정은 선택일로 POST하고 수신 확인 후 동료 현황에 반영한다', async () => {
  const days = {}, receipts = {}, bodies = [];
  const server = request => {
    assert.equal(request.action, 'state');
    return { ok: true, serverVersion: 3, days: stateDaysFor(request.date, days), settings: C.settings(), configRevision: 0,
      features: sharedFeatures, menuImages: {}, receipt: receipts[request.receipt] };
  };
  const post = async (url, init) => {
    assert.equal(url, connection.url);
    const body = JSON.parse(init.body); bodies.push(body);
    days[body.date] = C.applyOperation(days[body.date], body.date, C.settings(), body.op);
    receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
  };
  const ui = await boot({ connected: true, server, post });
  await ui.chooseDate('2026-10-20');
  await ui.toggleCancelled(true);
  assert.equal(ui.element('heroCount').textContent, '이날 함께 0명');
  assert.deepEqual(dailyMembers(ui, 'pending'), orderedMembers);
  await ui.chooseDate('2026-10-21');
  await ui.action('dailyMember','jingi',{ 'data-date': '2026-10-21' });
  await ui.action('setAvailability','ceo',{ 'data-date': '2026-10-21' });
  await ui.chooseDate('2026-10-20');
  await ui.toggleCancelled(false);
  assert.deepEqual(bodies.map(b => [b.date, b.op.type]), [
    ['2026-10-20','ceo'], ['2026-10-21','availability'], ['2026-10-20','ceo']
  ]);
  assert.ok(bodies.every(body => body.op.actor === 'jingi'));
  for (const body of bodies) assert.ok(ui.requests.some(request => request.receipt === body.op.id && request.date === body.date));
  assert.equal(days['2026-10-20'].ceoCancelled, false);
  assert.equal(days['2026-10-21'].overrides.jingi, 'ceo');
  assert.equal(days[monday], undefined);
  assert.equal(ui.element('dateInput').value, '2026-10-20');
  const peer = await boot({ connected: true, server, identity: 'yunchul' });
  await peer.chooseDate('2026-10-20');
  assert.equal(peer.element('ceoCancelled').checked, false);
  await peer.chooseDate('2026-10-21');
  assert.deepEqual(dailyMembers(peer, 'ceo'), ['yunchul', 'seongeun', 'yunseok', 'jingi']);
});

test('저장 응답을 기다리며 토요일로 이동해도 수정 날짜를 보존하고 토요일 공유 식단을 불러온다', async () => {
  const saturday = '2026-10-24', days = {}, receipts = {}, bodies = [];
  const meta = { id: 'saturday-image', scope: 'day', date: saturday, startDate: saturday, endDate: saturday,
    name: '토요일 식단.png', mimeType: 'image/png', size: 67, uploadedBy: 'jingi', uploadedAt: fixedTime };
  let saturdayReads = 0, releaseReceipt;
  const receiptGate = new Promise(resolve => { releaseReceipt = resolve; });
  const server = async request => {
    if (request.action === 'menuImage') return { ok: true, image: { ...meta, dataUrl: png } };
    assert.equal(request.action, 'state');
    if (request.date === saturday && !request.receipt) saturdayReads++;
    if (request.receipt) await receiptGate;
    return { ok: true, serverVersion: 3, days: stateDaysFor(request.date,days), settings: C.settings(), configRevision: 0,
      features: sharedFeatures, menuImages: request.date === saturday ? { ['day:' + saturday]: meta } : {},
      receipt: receipts[request.receipt] };
  };
  const post = async (url, init) => {
    const body = JSON.parse(init.body); bodies.push(body);
    days[body.date] = C.applyOperation(days[body.date],body.date,C.settings(),body.op);
    receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
  };
  const ui = await boot({ connected: true, server, post });
  await ui.chooseDate('2026-10-20');
  const saving = ui.toggleCancelled(true);
  try {
    await ui.settle();
    assert.equal(bodies[0].date, '2026-10-20');
    assert.ok(ui.requests.some(request => request.receipt === bodies[0].op.id && request.date === '2026-10-20'));
    assert.equal(ui.element('ceoCancelled').checked, false, 'An opaque POST alone must not confirm cancellation');
    assert.equal(dailyMembers(ui, 'ceo').length, 5);
    await ui.chooseDate(saturday);
    assert.equal(ui.element('dateInput').value, saturday);
  } finally { releaseReceipt(); }
  await saving; await ui.settle();
  assert.equal(days['2026-10-20'].ceoCancelled, true);
  assert.equal(days[saturday], undefined);
  assert.equal(ui.element('dateInput').value, saturday);
  assert.ok(saturdayReads >= 1);
  assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
});

test('저장한 맛집 33곳을 종류·검색·더보기로 찾고 지도와 선택일의 점심 후보에 연결한다', async () => {
  const ui = await boot();
  const cardCount = () => (ui.element('guideCards').innerHTML.match(/class="guide-card"/g) || []).length;
  assert.ok(ui.html.indexOf('id="restaurantCards"') < ui.html.indexOf('id="guideSection"'));
  assert.ok(ui.html.indexOf('id="guideSection"') < ui.html.indexOf('id="addPlaceBtn"'));
  assert.match(ui.html, /href="https:\/\/naver\.me\/xSBAzufn"/);
  assert.equal(cardCount(), 6);
  assert.equal(ui.element('guideResultCount').textContent, '전체 · 33곳');
  assert.equal(ui.element('guideMore').hidden, false);
  await ui.press('guideMore');
  assert.equal(cardCount(), 12);
  for (const [category, count] of [['한식', 10], ['중식', 3], ['일식', 7], ['양식', 3], ['분식', 5], ['아시안', 5]]) {
    await ui.action('guideFilter', category);
    assert.equal(ui.element('guideResultCount').textContent, `${category} · ${count}곳`);
    assert.equal(cardCount(), Math.min(6, count));
    assert.deepEqual([...ui.element('guideCards').innerHTML.matchAll(/class="guide-category">([^<]+)</g)].map(match => match[1]), Array(Math.min(6, count)).fill(category));
    assert.equal(ui.element('guideMore').hidden, count <= 6);
  }
  const search = async value => { ui.element('guideSearch').value = value; await ui.dispatch('input', ui.element('guideSearch')); };
  await search('꾸아');
  assert.equal(cardCount(), 1);
  const place = G.restaurants.find(item => item.name === '꾸아 과천디테크점');
  assert.ok(place);
  assert.ok(ui.element('guideCards').innerHTML.includes(`href="${place.url}"`));
  assert.match(ui.element('guideCards').innerHTML, /rel="noopener noreferrer"/);
  await search('없는식당테스트');
  assert.equal(cardCount(), 0);
  assert.equal(ui.element('guideEmpty').hidden, false);
  assert.equal(ui.element('guideMore').hidden, true);
  await search('꾸아');
  assert.equal(ui.element('guideEmpty').hidden, true);
  await ui.action('guideAdd', place.id);
  const choice = ui.saved(localKey).days[monday].extras[0];
  assert.equal(choice.name, place.name);
  assert.equal(choice.url, place.url);
  assert.equal(ui.findControl({ 'data-action': 'guideAdd', 'data-id': place.id }).disabled, true);
  assert.match(ui.element('restaurantCards').innerHTML, /꾸아 과천디테크점/);
  assert.deepEqual(dailyMembers(ui, 'in'), []);
  await ui.press('choiceIn');
  await ui.action('vote', choice.id);
  assert.equal(ui.saved(localKey).days[monday].votes.jingi, choice.id);
  const savedMonday = ui.saved(localKey).days[monday];
  await ui.chooseDate('2026-10-20');
  assert.equal(ui.findControl({ 'data-action': 'guideAdd', 'data-id': place.id }).disabled, false);
  await ui.action('guideAdd', place.id);
  assert.equal(ui.saved(localKey).days['2026-10-20'].extras[0].name, place.name);
  assert.deepEqual(ui.saved(localKey).days[monday], savedMonday);
  assert.equal(ui.requests.length, 0);
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

test('실제 메가존 사진·전체 반찬을 중복 없이 펼치고 확대하며 사진 실패·미등록도 참석 저장을 막지 않는다', async () => {
  const rich = M.parseResponse(richMenuFixture, monday);
  const ui = await boot({ menus: { ...menuData, [monday]: rich } });
  await ui.press('choiceIn');
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 1명');
  const markup = ui.element('restaurantCards').innerHTML;
  assert.equal((markup.match(/data-mega-photo="true"/g) || []).length, 3);
  const lists = [...markup.matchAll(/<ul class="mega-meal-components"[^>]*>([\s\S]*?)<\/ul>/g)].map(match => visibleText(match[1]));
  assert.equal(lists.length, rich.courses.length);
  for (let i = 0; i < rich.courses.length; i++) {
    const course = rich.courses[i];
    assert.ok(markup.includes('src="' + course.imageUrl + '"'));
    assert.equal(lists[i].includes(course.name), false, 'The main belongs in the heading, not again in the side-dish list');
    for (const side of course.components.filter(name => name !== course.name)) assert.ok(lists[i].includes(side), side);
  }
  assert.match(markup, /loading="lazy"/);
  await ui.action('viewMegaMeal', '0', { 'data-date': monday });
  assert.equal(ui.element('dialogTitle').textContent, rich.courses[0].name);
  assert.equal(ui.element('megaMealFull').getAttribute('src'), rich.courses[0].imageUrl);
  assert.match(visibleText(ui.element('dialogContent').innerHTML), /데리야끼고기경단조림.*흑미밥/);
  assert.ok(ui.element('dialogContent').innerHTML.includes(C.menuUrl(monday)));
  await ui.dispatch('error', ui.element('megaMealFull'));
  assert.equal(ui.element('megaMealFull').hidden, true);
  assert.equal(ui.element('megaMealFullError').hidden, false);
  await ui.press('closeDialog');
  await ui.dispatch('error', ui.findControl({ 'data-mega-photo': 'true', src: rich.courses[0].imageUrl }, 'img'));
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /사진을 불러오지 못했어요/);
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /나주곰탕\*당면사리.*데리야끼고기경단조림/);
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 1명');
  await ui.action('menuView', 'week');
  const detail = ui.findControl({ 'data-meal-details-date': monday }, 'details');
  assert.equal(detail.open, false);
  detail.open = true; await ui.dispatch('toggle', detail);
  await ui.press('refreshMenu');
  assert.equal(ui.findControl({ 'data-meal-details-date': monday }, 'details').open, true, 'An expanded day survives a data refresh');
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /사진·반찬 보기/);
  await ui.action('menuDate', '2026-10-20');
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /화요일 제육볶음/);
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /사진 미등록/);
  assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /data-mega-photo="true"/);
  await ui.chooseDate(monday);
  assert.deepEqual(dailyMembers(ui, 'in'), ['jingi']);
  assert.equal(ui.saved(localKey).days[monday].overrides.jingi, 'in');
  assert.equal(ui.posted.length, 0);
});

test('공유 연결 전에는 카카오 자동 조회 연결 안내와 원문 링크·사진 업로드를 제공한다', async () => {
  const ui = await boot();
  assert.match(ui.element('restaurantCards').innerHTML, /href="https:\/\/pf\.kakao\.com\/_xbbMPn"/);
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /자동 조회는 팀 공유 연결 후 사용할 수 있어요/);
  assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
  assert.equal(ui.findControl({ 'data-action': 'refreshKakaoProfile' }).disabled, true);
  assert.equal(ui.kakaoRequests.length, 0);
  await ui.action('menuImageUpload');
  assert.equal(ui.element('appDialog').open, true);
  for (const id of ['menuImageForm','menuImageFile','menuImageScope','menuImagePreview','menuImageStatus']) ui.element(id);
  assert.match(ui.element('dialogContent').innerHTML, /기기/);
  assert.equal(ui.posted.length, 0);
});

test('공유 상태 확인 후 이름 선택 없이도 카카오 최신 사진을 조회하고 마지막 확인 시각을 표시한다', async () => {
  let releaseState;
  const gate = new Promise(resolve => { releaseState = resolve; });
  const ui = await boot({ connected: true, identity: null, server: async request => { await gate; return basicSharedState(request); } });
  try {
    assert.equal(ui.kakaoRequests.length, 0, 'Automatic lookup must wait for the server feature response');
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /공유 연결을 확인하고 있어요/);
    assert.equal(ui.findControl({ 'data-action': 'refreshKakaoProfile' }).disabled, true);
  } finally { releaseState(); }
  await ui.settle();
  assert.equal(ui.kakaoRequests.length, 1);
  const request = ui.kakaoRequests[0];
  assert.equal(request.action, 'kakaoProfile');
  assert.equal(request.force, '1');
  assert.equal(request.key, connection.key);
  assert.equal(request.date, undefined, 'The channel profile must not be requested as a dated menu');
  assert.equal(ui.element('identitySelect').value, '');
  const photo = ui.element('kakaoProfilePhoto');
  assert.equal(photo.getAttribute('src'), kakaoImage);
  assert.equal(photo.getAttribute('referrerpolicy'), 'no-referrer');
  assert.match(photo.getAttribute('alt'), /날짜/);
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /마지막 확인.*확인 시각과 식단 날짜는 달라요/);
  assert.deepEqual(ui.saved(kakaoKey), profileData());
  assert.equal(ui.posted.length, 0);
});

test('페이지를 열면 신선한 카카오 캐시도 새로 확인하고 사진·전체 식단 새로고침은 강제로 조회한다', async () => {
  const cached = profileData('https://k.kakaocdn.net/dn/previous/fixture/img_m.jpg', '2026-10-19T03:25:30.000Z');
  let releaseFirst, reads = 0;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const ui = await boot({ connected: true, server: basicSharedState, storage: { [kakaoKey]: cached },
    kakaoRequest: async () => {
      const n = ++reads;
      if (n === 1) await firstGate;
      return { ok: true, profile: profileData(`https://k.kakaocdn.net/dn/refresh-${n}/fixture/img_m.jpg`) };
    } });
  try {
    assert.equal(ui.kakaoRequests.length, 1, 'Fresh cache must not suppress the page-open request');
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), cached.imageUrl);
    assert.equal(ui.findControl({ 'data-action': 'refreshKakaoProfile' }).disabled, true);
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /최신 사진 확인 중/);
  } finally { releaseFirst(); }
  await ui.settle();
  assert.match(ui.element('kakaoProfilePhoto').getAttribute('src'), /refresh-1/);
  await ui.action('refreshKakaoProfile');
  assert.match(ui.element('kakaoProfilePhoto').getAttribute('src'), /refresh-2/);
  const previousMenuReads = ui.publicRequests.length;
  await ui.press('refreshMenu');
  assert.match(ui.element('kakaoProfilePhoto').getAttribute('src'), /refresh-3/);
  assert.ok(ui.publicRequests.length > previousMenuReads);
  assert.deepEqual(ui.kakaoRequests.map(request => request.force), ['1', '1', '1']);
  assert.match(ui.saved(kakaoKey).imageUrl, /refresh-3/);
});

test('다른 날짜에서는 카카오 현재 사진을 식단으로 붙이지 않고 별도의 최신 사진 보기로 안내한다', async () => {
  const ui = await boot({ connected: true, server: basicSharedState });
  for (const date of ['2026-10-20', '2026-10-18']) {
    await ui.chooseDate(date);
    assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /선택한 날짜의 식단이 아니에요/);
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /카카오 최신 사진 보기/);
    await ui.action('viewKakaoProfile');
    assert.equal(ui.element('appDialog').open, true);
    assert.equal(ui.element('kakaoProfileFull').getAttribute('src'), kakaoImage);
    assert.equal(ui.element('kakaoProfileFull').getAttribute('referrerpolicy'), 'no-referrer');
    assert.match(visibleText(ui.element('dialogContent').innerHTML), /선택한 날짜의 식단이 아니에요/);
    assert.equal(ui.element('dateInput').value, date);
    await ui.press('closeDialog');
  }
  await ui.press('todayBtn');
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
  assert.equal(ui.kakaoRequests.length, 1, 'Date navigation must not refetch or assign the current channel image to each date');
  assert.equal(ui.saved(imageKey), undefined);
});

test('카카오 조회 실패 시 브라우저·서버의 마지막 사진을 유지하고 동료가 올린 식단도 펼쳐 준다', async () => {
  const cached = profileData('https://k.kakaocdn.net/dn/cached-menu/fixture/img_m.jpg', '2026-10-19T03:10:00.000Z');
  const meta = { id: 'fallback-menu', scope: 'day', date: monday, startDate: monday, endDate: monday,
    name: '직접 올린 식단.png', mimeType: 'image/png', size: 67, uploadedBy: 'jingi', uploadedAt: fixedTime };
  for (const fromServer of [false, true]) {
    const ui = await boot({ connected: true, storage: fromServer ? {} : { [kakaoKey]: cached },
      kakaoResponse: fromServer ? { ok: true, profile: { ...cached, error: true } } : { ok: false, error: '채널 조회 실패' },
      server: request => request.action === 'menuImage' ? { ok: true, image: { ...meta, dataUrl: png } }
        : basicSharedState(request, { menuImages: { ['day:' + monday]: meta } }) });
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), cached.imageUrl);
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /다시 확인하지 못했어요.*마지막으로 가져온 사진/);
    assert.equal(ui.element('manualMenuDetails').open, true);
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
    assert.deepEqual(ui.saved(kakaoKey), cached);
    assert.doesNotMatch(ui.element('connectionBanner').className, /error/);
    assert.equal(ui.element('choiceIn').disabled, false);
  }
});

test('카카오 자동 조회 미지원·조회 실패는 연결 안내만 표시하고 기존 참석 저장을 막지 않는다', async () => {
  for (const supported of [false, true]) {
    const days = {}, receipts = {}, features = { ...sharedFeatures, kakaoProfile: supported };
    const ui = await boot({ connected: true, kakaoError: true,
      server: request => basicSharedState(request, { features, days: stateDaysFor(request.date, days), receipt: receipts[request.receipt] }),
      post: async (url, init) => {
        const body = JSON.parse(init.body);
        days[body.date] = C.applyOperation(days[body.date], body.date, C.settings(), body.op);
        receipts[body.op.id] = { ok: true }; return { type: 'opaque', status: 0 };
      } });
    assert.equal(ui.kakaoRequests.length, supported ? 1 : 0);
    if (supported) assert.match(visibleText(ui.element('restaurantCards').innerHTML), /자동으로 가져오지 못했어요/);
    else assert.match(ui.element('restaurantCards').innerHTML, /공유 서버를 한 번 업데이트해 주세요.*setup\.html#update|setup\.html#update.*공유 서버를 한 번 업데이트해 주세요/);
    assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
    assert.equal(ui.findControl({ 'data-action': 'refreshKakaoProfile' }).disabled, !supported);
    assert.doesNotMatch(ui.element('connectionBanner').className, /error/);
    for (const id of ['choiceIn', 'choiceSeparate', 'choiceOut', 'ceoCancelled']) assert.equal(ui.element(id).disabled, false);
    await ui.press('choiceIn');
    assert.equal(ui.posted.length, 1);
    assert.equal(days[monday].overrides.jingi, 'in');
    assert.deepEqual(dailyMembers(ui, 'in'), ['jingi']);
  }
});

test('카카오 자동 조회는 보이는 화면에서 5분 간격으로만 갱신하고 돌아오면 지난 시간을 확인한다', async () => {
  const ui = await boot({ connected: true, server: basicSharedState });
  assert.equal(ui.kakaoRequests.length, 1);
  ui.advanceTime(30000);
  await ui.runIntervals(30000);
  await ui.visibilityChange();
  assert.equal(ui.kakaoRequests.length, 1, 'Routine shared sync and visibility must respect the profile TTL');
  ui.advanceTime(4 * 60000 + 29999);
  await ui.visibilityChange();
  assert.equal(ui.kakaoRequests.length, 1);
  ui.advanceTime(1);
  await ui.visibilityChange();
  assert.equal(ui.kakaoRequests.length, 2);
  assert.equal(ui.kakaoRequests[1].force, '0');
  await ui.visibilityChange(true);
  ui.advanceTime(5 * 60000);
  const sharedReads = ui.requests.length;
  await ui.runIntervals(5 * 60000);
  await ui.runIntervals(30000);
  assert.equal(ui.requests.length, sharedReads, 'Hidden pages must not start background shared or profile requests');
  await ui.visibilityChange(false);
  assert.equal(ui.kakaoRequests.length, 3);
  ui.advanceTime(5 * 60000);
  await ui.runIntervals(5 * 60000);
  assert.equal(ui.kakaoRequests.length, 4);
  assert.deepEqual(ui.kakaoRequests.map(request => request.force), ['1', '0', '0', '0']);
});

test('첫 동시 접속에서 진행 중인 프로필 조회는 오류로 표시하지 않고 다음 동기화 때 다시 확인한다', async () => {
  let reads = 0;
  const ui = await boot({ connected: true, server: basicSharedState,
    kakaoRequest: () => ++reads === 1
      ? { ok: false, pending: true, retryAfter: 2, error: '먼저 시작한 조회가 진행 중입니다.' }
      : { ok: true, profile: profileData() } });
  const text = visibleText(ui.element('restaurantCards').innerHTML);
  assert.match(text, /먼저 시작한 식단 조회가 진행 중/);
  assert.doesNotMatch(text, /자동으로 가져오지 못했어요/);
  assert.equal(ui.element('choiceIn').disabled, false);
  assert.equal(ui.kakaoRequests.length, 1);
  ui.advanceTime(30000);
  await ui.runIntervals(30000);
  assert.equal(ui.kakaoRequests.length, 2);
  assert.equal(ui.kakaoRequests[1].force, '0');
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
  assert.doesNotMatch(visibleText(ui.element('restaurantCards').innerHTML), /먼저 시작한 식단 조회가 진행 중/);
});

test('다른 공유 연결로 바꾼 뒤 도착한 이전 연결의 카카오 응답은 화면과 캐시를 덮지 않는다', async () => {
  const next = { url: 'https://script.google.com/macros/s/second_deployment/exec', key: 'b'.repeat(64) };
  const current = profileData('https://k.kakaocdn.net/dn/current-team/fixture/img_m.jpg');
  const old = profileData('https://k.kakaocdn.net/dn/old-team/fixture/img_m.jpg', '2026-10-19T03:26:30.000Z');
  let releaseOld;
  const oldGate = new Promise(resolve => { releaseOld = resolve; });
  const ui = await boot({ connected: true, server: basicSharedState, kakaoRequest: async request => {
    if (request.key === connection.key) { await oldGate; return { ok: true, profile: old }; }
    assert.equal(request.key, next.key); return { ok: true, profile: current };
  } });
  try {
    assert.equal(ui.kakaoRequests.length, 1);
    await ui.press('settingsBtn');
    const form = ui.element('connectionForm');
    form.querySelector('input[name="url"]').value = next.url;
    form.querySelector('input[name="key"]').value = next.key;
    await ui.dispatch('submit', form);
    assert.equal(ui.element('appDialog').open, false);
    assert.deepEqual(ui.saved('sandsLunch.connection.v1'), next);
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), current.imageUrl);
    assert.deepEqual(ui.saved(kakaoKey), current);
  } finally { releaseOld(); }
  await ui.settle();
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), current.imageUrl);
  assert.deepEqual(ui.saved(kakaoKey), current, 'A later timestamp from the old target must still be ignored');
  assert.deepEqual(ui.kakaoRequests.map(request => request.key), [connection.key, next.key]);
  assert.equal(ui.findControl({ 'data-action': 'refreshKakaoProfile' }).disabled, false);
  assert.equal(ui.element('choiceIn').disabled, false);
});

test('카카오 사진 자체가 표시되지 않으면 원문과 다시 불러오기를 제공하고 오래된 이미지 오류는 무시한다', async () => {
  let reads = 0;
  const ui = await boot({ connected: true, server: basicSharedState, kakaoRequest: () => ({ ok: true,
    profile: profileData(`https://k.kakaocdn.net/dn/photo-${++reads}/fixture/img_m.jpg`) }) });
  await ui.action('viewKakaoProfile');
  const full = ui.element('kakaoProfileFull');
  await ui.dispatch('error', full);
  assert.equal(full.hidden, true);
  assert.equal(ui.element('kakaoFullError').hidden, false);
  assert.match(ui.element('dialogContent').innerHTML, /href="https:\/\/pf\.kakao\.com\/_xbbMPn"/);
  await ui.press('closeDialog');
  const failedPhoto = ui.element('kakaoProfilePhoto');
  await ui.dispatch('error', failedPhoto);
  assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
  assert.match(visibleText(ui.element('restaurantCards').innerHTML), /사진을 표시하지 못했어요/);
  assert.equal(ui.element('choiceIn').disabled, false);
  await ui.action('refreshKakaoProfile');
  const recovered = ui.element('kakaoProfilePhoto').getAttribute('src');
  assert.match(recovered, /photo-2/);
  await ui.dispatch('error', failedPhoto);
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), recovered);
  assert.doesNotMatch(visibleText(ui.element('restaurantCards').innerHTML), /사진을 표시하지 못했어요/);
});

test('잘못된 채널·이미지 주소·미래 시각과 source 파일 누락은 사진 표시만 막고 첫 화면을 유지한다', async () => {
  const cases = [
    { profile: { ...profileData(), sourceUrl: 'https://pf.kakao.com/another_channel' } },
    { profile: profileData('https://example.invalid/untrusted.jpg') },
    { profile: profileData(kakaoImage, '2026-10-19T03:28:00.000Z') },
    { profile: profileData(), omitKakaoSource: true }
  ];
  for (const { profile, omitKakaoSource } of cases) {
    const ui = await boot({ connected: true, server: basicSharedState, omitKakaoSource,
      storage: { [kakaoKey]: profile }, kakaoResponse: { ok: true, profile } });
    assert.equal(ui.kakaoRequests.length, 1);
    assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
    assert.match(visibleText(ui.element('restaurantCards').innerHTML), /자동으로 가져오지 못했어요/);
    assert.equal(ui.element('dateInput').value, monday);
    assert.equal(dailyMembers(ui, 'pending').length, 6);
    assert.equal(ui.element('choiceIn').disabled, false);
    assert.doesNotMatch(ui.element('connectionBanner').className, /error/);
  }
});

test('독립된 두 공유 세션에서 같은 주간 사진을 불러오고 다음 주에 잘못 재사용하지 않는다', async () => {
  const meta = { id: 'img_test_week', scope: 'week', date: monday, startDate: monday, endDate: '2026-10-25',
    name: '런치타임 주간 식단.png', mimeType: 'image/png', size: 67, uploadedBy: 'jingi', uploadedAt: fixedTime };
  const server = request => {
    if (request.action === 'state') return { ok: true, serverVersion: 3, features: sharedFeatures,
      days: stateDaysFor(request.date), settings: {}, configRevision: 0, menuImages: { ['week:' + monday]: meta } };
    if (request.action === 'menuImage') return { ok: true, image: { ...meta, dataUrl: png } };
    throw new Error('Unexpected action ' + request.action);
  };
  const first = await boot({ connected: true, server });
  const second = await boot({ connected: true, server, identity: 'yunchul' });
  for (const ui of [first, second]) {
    assert.match(ui.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
    assert.equal(ui.element('manualMenuDetails').open, false);
    assert.match(ui.element('restaurantCards').innerHTML, /<summary>동료가 올린 식단 · 2026-10-19 – 2026-10-25<\/summary>/);
    assert.match(ui.element('restaurantCards').innerHTML, /천진기/);
    assert.ok(ui.requests.some(r => r.action === 'menuImage' && r.imageId === meta.id));
    assert.equal(ui.saved(imageKey), undefined, 'Shared image bodies should not be copied into local image storage');
  }
  await second.chooseDate('2026-10-20');
  assert.match(second.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
  assert.equal(second.element('manualMenuDetails').open, true);
  assert.doesNotMatch(second.element('restaurantCards').innerHTML, /id="kakaoProfilePhoto"/);
  second.element('dateInput').value = '2026-10-26';
  for (const listener of second.element('dateInput').events.get('change') || []) await listener({ target: second.element('dateInput') });
  await second.settle();
  assert.doesNotMatch(second.element('restaurantCards').innerHTML, /data:image\/png;base64,/);
});

function fixtureMenuImage(scope, date, id, dataUrl = png) {
  const startDate = scope === 'week' ? C.weekDates(date)[0] : date;
  return { id, scope, date: startDate, startDate,
    endDate: scope === 'week' ? C.shiftDate(startDate, 6) : date,
    name: id + (dataUrl === jpeg ? '.jpg' : '.png'), mimeType: dataUrl === jpeg ? 'image/jpeg' : 'image/png',
    size: Buffer.from(dataUrl.split(',')[1], 'base64').length,
    uploadedBy: 'jingi', uploadedAt: fixedTime, dataUrl };
}

function sharedImageServer(receiptGate, options = {}) {
  const images = {}, receipts = {}, bodies = [];
  return {
    images, bodies,
    async read(request) {
      if (request.action === 'state') {
        if (request.receipt && receiptGate) await receiptGate;
        return { ok: true, serverVersion: 3, features: sharedFeatures, days: stateDaysFor(request.date), settings: {}, configRevision: 0,
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
      assert.equal(body.key, connection.key); assert.ok(['menuImageUpload', 'menuImageDelete'].includes(op.type)); assert.equal(op.actor, 'jingi');
      assert.ok(C.validDate(body.date)); assert.ok(['week', 'day'].includes(scope));
      const startDate = scope === 'week' ? C.weekDates(body.date)[0] : body.date, slot = scope + ':' + startDate;
      bodies.push(body);
      if (op.type === 'menuImageDelete') {
        if (options.deleteError) receipts[op.id] = { ok: false, error: options.deleteError };
        else if (!images[slot] || images[slot].id !== expectedImageId) receipts[op.id] = { ok: false, error: '다른 멤버가 식단 이미지를 교체했어요. 현재 이미지를 다시 확인해 주세요.' };
        else { delete images[slot]; receipts[op.id] = { ok: true }; }
        return { type: 'opaque', status: 0 };
      }
      assert.equal(dataUrl, jpeg);
      assert.equal(expectedImageId, images[slot]?.id || '');
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
    await ui.chooseDate('2026-10-20');
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
      await peer.chooseDate('2026-10-20');
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

test('기기 사진 삭제는 확인한 슬롯에만 적용하고 다른 탭의 추가·교체와 카카오 사진을 보존한다', async () => {
  const daySlot = 'day:' + monday, weekSlot = 'week:' + monday;
  const day = fixtureMenuImage('day', monday, 'local-day');
  const week = fixtureMenuImage('week', monday, 'local-week', jpeg);
  const other = fixtureMenuImage('day', '2026-10-20', 'local-other');
  const initial = { [daySlot]: day, [weekSlot]: week, 'day:2026-10-20': other };
  const ui = await boot({ storage: { [imageKey]: initial, [kakaoKey]: profileData() } });
  await ui.press('choiceIn');
  await ui.action('menuImageDelete', day.id, { 'data-date': monday, 'data-scope': 'day' });
  assert.deepEqual(ui.saved(imageKey), initial, 'Opening the confirmation must not delete anything');
  assert.match(visibleText(ui.element('dialogContent').innerHTML), /하루 이미지를 삭제하면.*주간 식단/);
  await ui.action('cancelMenuImageDelete');
  assert.equal(ui.element('appDialog').open, false);
  assert.deepEqual(ui.saved(imageKey), initial);

  await ui.action('menuImageDelete', day.id, { 'data-date': monday, 'data-scope': 'day' });
  const added = fixtureMenuImage('day', '2026-10-21', 'other-tab-addition');
  ui.storeFromOtherTab(imageKey, { ...initial, 'day:2026-10-21': added });
  await ui.dispatch('submit', ui.element('menuImageDeleteForm'));
  const kept = { [weekSlot]: week, 'day:2026-10-20': other, 'day:2026-10-21': added };
  assert.deepEqual(ui.saved(imageKey), kept, 'Only the confirmed day is removed from the latest stored map');
  assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, week.id);
  assert.ok(ui.element('restaurantCards').innerHTML.includes(jpeg), 'Deleting a day reveals the saved week');
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);

  await ui.action('menuImageDelete', week.id, { 'data-date': monday, 'data-scope': 'week' });
  const replaced = fixtureMenuImage('week', monday, 'other-tab-replacement', jpeg);
  ui.storeFromOtherTab(imageKey, { ...kept, [weekSlot]: replaced });
  await ui.dispatch('submit', ui.element('menuImageDeleteForm'));
  assert.equal(ui.element('appDialog').open, false);
  assert.match(ui.element('toast').textContent, /이미지가 바뀌었어요/);
  assert.deepEqual(ui.saved(imageKey), { ...kept, [weekSlot]: replaced });
  assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, replaced.id);
  await ui.action('menuImageDelete', replaced.id, { 'data-date': monday, 'data-scope': 'week' });
  await ui.dispatch('submit', ui.element('menuImageDeleteForm'));
  assert.deepEqual(ui.saved(imageKey), { 'day:2026-10-20': other, 'day:2026-10-21': added });
  assert.doesNotMatch(ui.element('restaurantCards').innerHTML, /data-action="menuImageDelete"/);
  assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
  assert.deepEqual(ui.saved(kakaoKey), profileData());
  assert.deepEqual(dailyMembers(ui, 'in'), ['jingi']);
  assert.equal(ui.posted.length, 0); assert.equal(ui.requests.length, 0);
});

for (const scope of ['day', 'week']) {
  test(`공유 ${scope === 'day' ? '하루' : '주간'} 사진 삭제는 원래 날짜·ID의 수신 확인 뒤 완료하고 동료의 다음 조회에 반영한다`, async () => {
    let releaseReceipt;
    const receiptGate = new Promise(resolve => { releaseReceipt = resolve; });
    const server = sharedImageServer(receiptGate);
    const selectedDate = '2026-10-20', nextDate = '2026-10-21';
    const week = fixtureMenuImage('week', selectedDate, 'shared-week', jpeg);
    const other = fixtureMenuImage('day', nextDate, 'shared-other');
    server.images['week:' + monday] = week;
    server.images['day:' + nextDate] = other;
    const target = scope === 'day' ? fixtureMenuImage('day', selectedDate, 'shared-day') : week;
    const targetSlot = scope + ':' + (scope === 'week' ? monday : selectedDate);
    server.images[targetSlot] = target;
    const ui = await boot({ connected: true, server: server.read, post: server.post });
    const peer = await boot({ connected: true, server: server.read, identity: 'yunchul' });
    await ui.chooseDate(selectedDate); await peer.chooseDate(selectedDate);
    await ui.action('menuImageDelete', target.id, { 'data-date': selectedDate, 'data-scope': scope });
    assert.equal(ui.posted.length, 0);
    assert.ok(server.images[targetSlot]);
    const form = ui.element('menuImageDeleteForm');
    const saving = ui.dispatch('submit', form);
    try {
      await ui.settle();
      assert.equal(ui.posted.length, 1);
      const body = server.bodies[0];
      assert.equal(body.date, selectedDate);
      assert.equal(body.op.type, 'menuImageDelete');
      assert.equal(body.op.actor, 'jingi');
      assert.deepEqual(body.op.payload, { scope, expectedImageId: target.id });
      assert.ok(ui.requests.some(request => request.action === 'state' && request.receipt === body.op.id && request.date === selectedDate));
      assert.equal(server.images[targetSlot], undefined, 'The fixture has applied the opaque POST');
      assert.equal(ui.element('appDialog').open, true, 'The UI must still await the server receipt');
      assert.equal(ui.element('confirmMenuImageDelete').disabled, true);
      assert.equal(ui.element('cancelMenuImageDelete').disabled, true);
      assert.match(ui.element('menuImageDeleteStatus').textContent, /삭제하고 있어요/);
      assert.doesNotMatch(ui.element('toast').textContent, /이미지를 삭제했어요/);
      assert.ok(ui.element('restaurantCards').innerHTML.includes('data-id="' + target.id + '"'));
      await ui.press('closeDialog');
      assert.equal(ui.element('appDialog').open, true);
      await ui.chooseDate(nextDate);
      assert.equal(form.dataset.date, selectedDate, 'A date change must not retarget the pending operation');
    } finally { releaseReceipt(); }
    await saving;
    assert.equal(ui.element('appDialog').open, false);
    assert.equal(ui.element('dateInput').value, nextDate);
    assert.match(ui.element('toast').textContent, /올린 식단 이미지를 삭제했어요/);
    assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, other.id);
    assert.deepEqual(server.images['day:' + nextDate], other);
    assert.equal(peer.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, target.id, 'A second session retains its view until polling');
    await peer.runIntervals(30000);
    if (scope === 'day') {
      assert.deepEqual(server.images['week:' + monday], week);
      assert.equal(peer.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, week.id);
      assert.ok(peer.element('restaurantCards').innerHTML.includes(jpeg));
    } else assert.doesNotMatch(peer.element('restaurantCards').innerHTML, /data-action="menuImageDelete"/);
    await ui.chooseDate(monday);
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
    assert.deepEqual(ui.saved(kakaoKey), profileData());
    assert.equal(ui.saved(imageKey), undefined);
    assert.equal(ui.posted.length, 1); assert.equal(peer.posted.length, 0);
  });
}

test('삭제 미지원 서버는 쓰기를 막고 교체 충돌·저장 실패는 현재 사진과 다른 슬롯을 보존한다', async () => {
  const daySlot = 'day:' + monday, weekSlot = 'week:' + monday;
  const day = fixtureMenuImage('day', monday, 'delete-original');
  const week = fixtureMenuImage('week', monday, 'delete-keep-week', jpeg);
  const legacy = sharedImageServer(); legacy.images[daySlot] = day;
  const old = await boot({ connected: true, server: async request => {
    const result = await legacy.read(request);
    return request.action === 'state' ? { ...result, features: { ...sharedFeatures, menuImageDelete: false } } : result;
  }, post: legacy.post });
  await old.action('menuImageDelete', day.id, { 'data-date': monday, 'data-scope': 'day' });
  assert.match(old.element('dialogTitle').textContent, /업데이트/);
  assert.match(old.element('dialogContent').innerHTML, /setup\.html#update/);
  assert.doesNotMatch(old.element('dialogContent').innerHTML, /id="menuImageDeleteForm"/);
  assert.equal(old.posted.length, 0); assert.deepEqual(legacy.images[daySlot], day);

  for (const kind of ['conflict', 'failure']) {
    const server = sharedImageServer(undefined, kind === 'failure' ? { deleteError: '삭제 작업을 저장하지 못했어요.' } : {});
    server.images[daySlot] = day; server.images[weekSlot] = week;
    const replacement = fixtureMenuImage('day', monday, 'delete-replacement', jpeg);
    const ui = await boot({ connected: true, server: server.read, post: async (url, init) => {
      if (kind === 'conflict') server.images[daySlot] = replacement;
      return server.post(url, init);
    } });
    await ui.action('menuImageDelete', day.id, { 'data-date': monday, 'data-scope': 'day' });
    const form = ui.element('menuImageDeleteForm');
    await ui.dispatch('submit', form);
    assert.equal(ui.element('appDialog').open, true);
    assert.match(ui.element('menuImageDeleteStatus').textContent, kind === 'conflict' ? /교체했어요/ : /저장하지 못했어요/);
    assert.equal(ui.element('confirmMenuImageDelete').disabled, false);
    assert.equal(ui.element('cancelMenuImageDelete').disabled, false);
    assert.doesNotMatch(ui.element('toast').textContent, /이미지를 삭제했어요/);
    const kept = kind === 'conflict' ? replacement : day;
    assert.deepEqual(server.images, { [daySlot]: kept, [weekSlot]: week });
    assert.equal(ui.posted.length, 1);
    if (kind === 'conflict') {
      await ui.dispatch('submit', form);
      assert.equal(ui.posted.length, 1, 'The stale confirmation must not delete the replacement in a second request');
      assert.equal(ui.element('appDialog').open, false);
      assert.match(ui.element('toast').textContent, /이미지가 바뀌었어요/);
    } else await ui.action('cancelMenuImageDelete');
    assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, kept.id);
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
    assert.deepEqual(ui.saved(kakaoKey), profileData());
  }
});

test('삭제 전에 시작한 현황 조회와 늦은 이미지 응답은 삭제 완료 후 사진을 되살리지 않는다', async () => {
  let releasePoll, releaseImage, stateReads = 0;
  const pollGate = new Promise(resolve => { releasePoll = resolve; });
  const imageGate = new Promise(resolve => { releaseImage = resolve; });
  const server = sharedImageServer();
  const day = fixtureMenuImage('day', monday, 'late-day');
  const week = fixtureMenuImage('week', monday, 'late-keep-week', jpeg);
  server.images['day:' + monday] = day; server.images['week:' + monday] = week;
  const ui = await boot({ connected: true, post: server.post, server: async request => {
    const response = C.clone(await server.read(request));
    if (request.action === 'state' && !request.receipt && ++stateReads === 2) await pollGate;
    if (request.action === 'menuImage' && request.imageId === day.id) await imageGate;
    return response;
  } });
  assert.ok(ui.requests.some(request => request.action === 'menuImage' && request.imageId === day.id));
  const polling = ui.runIntervals(30000);
  try {
    await ui.settle();
    assert.equal(stateReads, 2, 'The old poll must be in flight before deletion');
    await ui.action('menuImageDelete', day.id, { 'data-date': monday, 'data-scope': 'day' });
    await ui.dispatch('submit', ui.element('menuImageDeleteForm'));
    assert.equal(ui.element('appDialog').open, false);
    assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, week.id);
    assert.ok(ui.element('restaurantCards').innerHTML.includes(jpeg));
    releasePoll(); await polling;
    assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, week.id, 'A pre-delete snapshot cannot restore old metadata');
    releaseImage(); await ui.settle();
    assert.equal(ui.findControl({ 'data-action': 'menuImageDelete' }).dataset.id, week.id, 'A late body cannot restore a removed image ID');
    assert.ok(ui.element('restaurantCards').innerHTML.includes(jpeg));
    assert.equal(ui.element('restaurantCards').innerHTML.includes(png), false);
    assert.equal(ui.element('kakaoProfilePhoto').getAttribute('src'), kakaoImage);
    assert.deepEqual(server.images, { ['week:' + monday]: week });
    assert.equal(ui.posted.length, 1);
  } finally { releasePoll(); releaseImage(); }
  await polling; await ui.settle();
});

test('설정 폼을 연 뒤 동료가 설정을 바꾸면 오래된 폼 제출을 막고 최신 설정으로 다시 보여준다', async () => {
  let configRevision = 1, settings = C.settings();
  const ui = await boot({ connected: true, server: request => {
    assert.equal(request.action, 'state');
    return { ok: true, serverVersion: 3, features: sharedFeatures, days: stateDaysFor(request.date),
      settings: C.clone(settings), configRevision, menuImages: {} };
  } });
  await ui.press('settingsBtn');
  const staleForm = ui.element('scheduleForm');
  assert.equal(staleForm.dataset.configRevision, '1');
  staleForm.querySelector('input[name="meetingTime"]').value = '12:10';
  settings = C.settings({ ...settings, scheduleEnd: '2026-11-30', meetingTime: '12:30', ceoDays: { ...settings.ceoDays, jingi: [] } });
  configRevision = 2;
  await ui.visibilityChange();
  assert.equal(ui.element('scheduleForm'), staleForm);
  assert.equal(staleForm.querySelector('input[name="meetingTime"]').value, '12:10');
  await ui.dispatch('submit', staleForm);
  assert.equal(ui.posted.length, 0, 'An old form must not overwrite the newer shared settings');
  assert.equal(ui.element('appDialog').open, true);
  const freshForm = ui.element('scheduleForm');
  assert.notEqual(freshForm, staleForm);
  assert.equal(freshForm.dataset.configRevision, '2');
  assert.equal(freshForm.querySelector('input[name="meetingTime"]').value, '12:30');
  assert.equal(freshForm.querySelector('input[name="scheduleEnd"]').value, '2026-11-30');
  assert.ok(freshForm.children.filter(element => element.attributes.name === 'jingi').every(element => !element.checked));
});

test('구버전 공유 서버는 새 참석 기능 업데이트를 안내하고 지원하지 않는 쓰기를 막는다', async () => {
  for (const features of [{}, { menuImages: true }]) {
    const ui = await boot({ connected: true, server: request => {
      assert.equal(request.action, 'state');
      return { ok: true, serverVersion: 2, days: stateDaysFor(request.date), settings: {}, configRevision: 0, features };
    } });
    assert.match(ui.element('myResponseContent').innerHTML, /setup\.html#update/);
    for (const id of ['choiceIn', 'choiceSeparate', 'choiceOut', 'ceoCancelled']) assert.equal(ui.element(id).disabled, true);
    await ui.action('dailyMember', 'jingi', { 'data-date': monday });
    await ui.action('setAvailability', 'in', { 'data-date': monday });
    assert.match(ui.element('toast').textContent, /업데이트/);
    assert.deepEqual(dailyMembers(ui, 'in'), []);
    await ui.press('closeDialog');
    if (!features.menuImages) {
      await ui.action('menuImageUpload');
      assert.match(ui.element('dialogTitle').textContent, /업데이트/);
      assert.match(ui.element('dialogContent').innerHTML, /setup\.html#update/);
      assert.doesNotMatch(ui.element('dialogContent').innerHTML, /id="menuImageForm"/);
    }
    assert.equal(ui.posted.length, 0);
  }
});
