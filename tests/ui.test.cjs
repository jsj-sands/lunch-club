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
      return this.children.find(child => child.tagName.toLowerCase() === selector.split('[')[0]) || null;
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
      this.controls = [...elements.values()].filter(el => el.attributes.name && !el.disabled);
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
      if (element.id) elements.set(element.id, element);
      children.push(element);
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
  async function action(actionName, id) {
    const markup = [html, ...[...elements.values()].map(el => el.innerHTML)].join('\n');
    const button = [...markup.matchAll(/<([a-zA-Z][\w:-]*)\b([^>]*)>/g)]
      .map(m => ({ tag: m[1], attrs: attrs(m[2]) }))
      .find(m => m.attrs['data-action'] === actionName && (id === undefined || m.attrs['data-id'] === id));
    assert.ok(button, `Missing rendered action ${actionName}${id ? ':' + id : ''}`);
    await dispatch('click', new Element(button.tag, button.attrs));
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
  return { html, element, action, press, dispatch, settle, selectImage, requests, publicRequests, posted, imageWork,
    saved: key => storage.has(key) ? JSON.parse(storage.get(key)) : undefined };
}

test('기존 저장값을 연 페이지에서 다섯 멤버와 새 문구를 실제 렌더링한다', async () => {
  const ui = await boot({ storage: { [localKey]: { days: {}, settings: {
    scheduleEnd: '2026-12-31', meetingTime: '12:00',
    ceoDays: { seongjun: [2,5], juri: [1,2,5], hyunsu: [1,2,5], yunchul: [3] }
  } } } });
  assert.match(ui.element('identitySelect').innerHTML, /value="jingi">천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /천진기/);
  assert.match(ui.element('membersGrid').innerHTML, /디자인팀/);
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 3명');
  assert.equal((ui.element('membersGrid').innerHTML.match(/class="member-card/g) || []).length, 5);
  assert.match(ui.element('weekBody').innerHTML, /천진기/);
  assert.match(visibleText(ui.element('weekBody').innerHTML), /3명\s+1명\s+4명\s+5명\s+2명/);
  assert.doesNotMatch(visibleText(ui.html + ui.element('membersGrid').innerHTML + ui.element('weekBody').innerHTML), /CEO/);
  await ui.press('settingsBtn');
  assert.match(ui.element('dialogContent').innerHTML, /천진기/);
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
  assert.equal(ui.element('heroCount').textContent, '오늘 함께 1명');
  await ui.action('vote', 'megazone');
  assert.match(ui.element('dialogContent').innerHTML, /대표님과 점심/);
  assert.equal(ui.saved(localKey).days['2026-10-20'], undefined);
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
      days: {}, settings: {}, configRevision: 0, menuImages: { ['week:' + monday]: meta } };
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
        return { ok: true, serverVersion: 2, features: { menuImages: true }, days: {}, settings: {}, configRevision: 0,
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
    return { ok: true, days: {}, settings: {}, configRevision: 0, features: {} };
  } });
  await ui.action('menuImageUpload');
  assert.match(ui.element('dialogTitle').textContent, /업데이트/);
  assert.match(ui.element('dialogContent').innerHTML, /setup\.html#update/);
  assert.doesNotMatch(ui.element('dialogContent').innerHTML, /id="menuImageForm"/);
  assert.equal(ui.posted.length, 0);
});
