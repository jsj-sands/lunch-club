const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const fixture = require('./fixtures/welstory-meal-20261019.json');

const KEY = 'b'.repeat(48), PAST = '2026-10-19', FUTURE = '2030-01-07';
const PASSWORD = 'pa ss&word=1';
const b64url = value => Buffer.from(JSON.stringify(value)).toString('base64url');
const jwt = (n, seconds = 3600) => b64url({ alg: 'none' }) + '.' + b64url({ sub: 'member', n, exp: Math.floor(Date.now() / 1000) + seconds }) + '.sig';

// A fake Welstory+ server: issues JWTs on /login, renews on /session, serves meal times and meals.
function welstory(options = {}) {
  const log = [], valid = new Set(); let issued = 0, emptyLeft = options.emptyReplies || 0;
  const reply = (status, body = '', headers = {}) => ({ getResponseCode: () => status, getContentText: () => body, getAllHeaders: () => headers });
  function fetch(url, opts = {}) {
    const u = new URL(url);
    log.push({ path: u.pathname, query: Object.fromEntries(u.searchParams), opts });
    assert.equal(u.origin, 'https://welplus.welstory.com');
    assert.equal(opts.muteHttpExceptions, true);
    if (u.pathname === '/login') {
      const body = new URLSearchParams(opts.payload);
      if (body.get('username') !== 'member' || body.get('password') !== (options.password || PASSWORD)) return reply(options.loginStatus || 401, '{"code":401}');
      const token = jwt(++issued);
      if (!options.rejectAll) valid.add(token);
      return reply(200, '', { authorization: token });
    }
    const auth = opts.headers && opts.headers.Authorization;
    if (!valid.has(auth)) return options.html ? reply(200, '<!doctype html><html>login</html>', { 'Content-Type': 'text/html' }) : reply(401, '');
    if (u.pathname === '/session') {
      const token = jwt(++issued); valid.add(token);
      return reply(200, JSON.stringify({ code: 200, data: token }));
    }
    if (u.pathname === '/api/menu/getMealTimeList') {
      assert.equal(opts.headers.Cookie, 'cafeteriaActiveId=REST007327');
      return reply(200, JSON.stringify({ code: 200, data: [{ code: '1', codeNm: '조식' }, { code: '2', codeNm: '중식' }, { code: '3', codeNm: '석식' }] }));
    }
    if (u.pathname === '/api/meal') {
      if (emptyLeft > 0) { emptyLeft--; return reply(200, ''); }
      const rows = fixture.data.mealList.map(row => ({ ...row, menuDt: u.searchParams.get('menuDt') }));
      return reply(200, JSON.stringify({ code: 200, message: null, data: { mealList: rows } }));
    }
    return reply(404, '');
  }
  return { fetch, log, valid, count: p => log.filter(entry => entry.path === p).length };
}

function server(api, store = {}) {
  const cache = new Map(), ttls = new Map(), logs = [], sleeps = [];
  let scriptLocked = false;
  const properties = {
    getProperties: () => ({ ...store }),
    getProperty: k => (Object.prototype.hasOwnProperty.call(store, k) ? store[k] : null),
    setProperty(k, v) { store[k] = String(v); return this; },
    deleteProperty(k) { delete store[k]; return this; }
  };
  const context = {
    console: { log: message => logs.push(String(message)) }, Date, Intl, URL,
    Utilities: {
      getUuid: () => crypto.randomUUID(),
      newBlob: value => ({ getBytes: () => Buffer.from(value), getDataAsString: () => Buffer.from(value).toString('utf8') }),
      base64DecodeWebSafe: value => Buffer.from(value, 'base64url'),
      sleep: ms => sleeps.push(ms),
      formatDate: date => date.toISOString()
    },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: { getScriptCache: () => ({ get: k => cache.get(k) || null, put: (k, v, ttl) => { cache.set(k, v); ttls.set(k, ttl); }, remove: k => cache.delete(k) }) },
    LockService: {
      getScriptLock: () => ({ waitLock() { scriptLocked = true; }, hasLock: () => scriptLocked, releaseLock() { scriptLocked = false; } }),
      getUserLock: () => ({ tryLock: () => true, releaseLock() {} })
    },
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: s => ({ text: s, setMimeType(t) { this.mime = t; return this; } }) },
    UrlFetchApp: { fetch(url, opts) { assert.equal(scriptLocked, false, 'Welstory requests must not hold the attendance lock'); return api.fetch(url, opts); } }
  };
  vm.createContext(context);
  const source = ['core.js', 'menu-source.js', 'backend/welstory.js', 'backend/server.js']
    .map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n').replace("'__TEAM_KEY__'", `'${KEY}'`);
  vm.runInContext(source, context);
  const menu = date => JSON.parse(context.doGet({ parameter: { key: KEY, date, action: 'menu' } }).text);
  return { context, store, cache, ttls, logs, sleeps, menu };
}
const account = (extra = {}) => ({ LUNCH_WELSTORY_USERNAME: 'member', LUNCH_WELSTORY_PASSWORD: PASSWORD, ...extra });

test('계정으로 한 번만 로그인해 세션을 재사용하고 날짜별 식단을 캐시한다', () => {
  const api = welstory(), s = server(api, account());
  const first = s.menu(PAST);
  assert.equal(first.ok, true);
  assert.deepEqual(first.menu.dishes, ['나주곰탕*당면사리', '눈꽃치즈김치볶음밥', '[오늘의데일리팩] 치킨텐더포케']);
  assert.equal(first.menu.courses[1].imageUrl, 'https://img-welmenu.welstory.com/data/manager/recipe/E5Z5/20261019/s20261019104145.jpg');
  assert.equal(api.count('/login'), 1);
  const login = api.log.find(entry => entry.path === '/login');
  assert.equal(login.opts.method, 'post');
  assert.equal(new URLSearchParams(login.opts.payload).get('password'), PASSWORD);
  assert.equal(login.opts.headers['X-Autologin'], 'N');
  const meal = api.log.find(entry => entry.path === '/api/meal');
  assert.deepEqual(meal.query, { menuDt: '20261019', menuMealType: '2', restaurantCode: 'REST007327' });
  assert.equal(meal.opts.headers['X-Device-Id'], s.store.LUNCH_WELSTORY_DEVICE_ID);
  assert.match(s.store.LUNCH_WELSTORY_DEVICE_ID, /^[a-f0-9-]{36}$/);
  assert.equal(s.ttls.get('lunch_welstory_menu_v1_' + PAST), 6 * 60 * 60);

  assert.deepEqual(s.menu(PAST), first);
  assert.equal(api.count('/api/meal'), 1, 'same date comes from the cache');
  assert.equal(s.menu(FUTURE).ok, true);
  assert.equal(s.ttls.get('lunch_welstory_menu_v1_' + FUTURE), 30 * 60);
  assert.equal(api.count('/login'), 1, 'a valid session is reused');
  assert.equal(api.count('/api/menu/getMealTimeList'), 1, 'the lunch code is remembered');
  assert.ok(!JSON.stringify(first).includes(PASSWORD));
});

test('저장된 세션이 거부되면 한 번만 다시 로그인하고, HTML 로그인 화면도 거부로 본다', () => {
  for (const html of [false, true]) {
    const api = welstory({ html });
    const stale = { token: jwt(99), exp: Date.now() + 3600000, via: 'login', at: new Date().toISOString() };
    const s = server(api, account({ LUNCH_WELSTORY_SESSION: JSON.stringify(stale), LUNCH_WELSTORY_MEAL_TYPE: JSON.stringify({ code: '2', checkedAt: new Date().toISOString() }) }));
    const result = s.menu(PAST);
    assert.equal(result.ok, true, String(html));
    assert.equal(api.count('/login'), 1);
    assert.notEqual(JSON.parse(s.store.LUNCH_WELSTORY_SESSION).token, stale.token);
  }
});

test('새로 받은 세션까지 거부되면 로그인을 멈추고 반복 로그인하지 않는다', () => {
  const api = welstory({ rejectAll: true }), s = server(api, account());
  const result = s.menu(PAST);
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'provider');
  assert.match(result.error, /새 로그인 세션/);
  assert.equal(api.count('/login'), 1);
  const pause = JSON.parse(s.store.LUNCH_WELSTORY_LOGIN_PAUSE);
  assert.equal(pause.reason, 'credentials');
  assert.ok(pause.until > Date.now() + 25 * 60000);
  const later = s.menu(FUTURE);
  assert.match(later.error, /다시 시도하지 않아요/);
  assert.equal(api.count('/login'), 1);
});

test('비밀번호가 틀리면 한 번만 시도하고, 진단 함수로 다시 확인할 수 있다', () => {
  const api = welstory({ password: 'changed' }), s = server(api, account());
  const wrong = s.menu(PAST);
  assert.equal(wrong.ok, false);
  assert.match(wrong.error, /로그인에 실패했어요 \(401\)/);
  assert.equal(s.ttls.get('lunch_welstory_menu_v1_' + PAST), 120);
  assert.match(s.menu(FUTURE).error, /다시 시도하지 않아요/);
  assert.equal(api.count('/login'), 1);

  s.store.LUNCH_WELSTORY_PASSWORD = 'changed';
  s.context.testWelstoryConnection();
  assert.equal(api.count('/login'), 2);
  assert.equal(s.store.LUNCH_WELSTORY_LOGIN_PAUSE, undefined);
  const output = s.logs.join('\n');
  assert.match(output, /새로 로그인/);
  assert.match(output, /점심 식사 코드: 2/);
  assert.match(output, /나주곰탕\*당면사리 \(사진 있음\)/);
  assert.ok(!output.includes('changed') && !output.includes(JSON.parse(s.store.LUNCH_WELSTORY_SESSION).token));
});

test('서버 오류(5xx)로 로그인하지 못하면 5분만 쉬고 비밀번호 오류와 구분한다', () => {
  const api = welstory({ password: 'other', loginStatus: 503 }), s = server(api, account());
  const result = s.menu(PAST);
  assert.match(result.error, /응답하지 않았어요 \(503\)/);
  assert.equal(api.count('/login'), 1);
  const pause = JSON.parse(s.store.LUNCH_WELSTORY_LOGIN_PAUSE);
  assert.equal(pause.reason, 'server');
  assert.ok(pause.until > Date.now() + 4 * 60000 && pause.until <= Date.now() + 5 * 60000);
  const later = s.menu(FUTURE);
  assert.match(later.error, /응답하지 않아 .* 이후에 다시 시도해요/);
  assert.doesNotMatch(later.error, /비밀번호/);
  assert.equal(api.count('/login'), 1);
});

test('만료가 가까운 세션은 /session으로 연장하고 새로 로그인하지 않는다', () => {
  const api = welstory(), token = jwt(1, 120);
  api.valid.add(token);
  const s = server(api, account({ LUNCH_WELSTORY_SESSION: JSON.stringify({ token, exp: Date.now() + 120000, via: 'login', at: '' }) }));
  assert.equal(s.menu(PAST).ok, true);
  assert.equal(api.count('/session'), 1);
  assert.equal(api.count('/login'), 0);
  const renewed = JSON.parse(s.store.LUNCH_WELSTORY_SESSION);
  assert.equal(renewed.via, 'refresh');
  assert.ok(renewed.exp > Date.now() + 50 * 60000);
});

test('웰스토리가 빈 응답을 주면 잠시 기다렸다 다시 요청한다', () => {
  const api = welstory({ emptyReplies: 2 }), s = server(api, account());
  assert.equal(s.menu(PAST).ok, true);
  assert.equal(api.count('/api/meal'), 3);
  assert.deepEqual(s.sleeps, [300, 600]);
});
