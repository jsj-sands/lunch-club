const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const Source = require('../lunchtime-source.js');

const KEY = 'a'.repeat(48), DATE = '2026-10-19';
const START = '2026-10-19T00:10:00.000Z';
const IMAGE = 'https://k.kakaocdn.net/dn/test/channel/first/img_xl.jpg';
const NEW_IMAGE = 'https://k.kakaocdn.net/dn/test/channel/second/img_xl.jpg';
const PROPERTY = 'LUNCH_KAKAO_PROFILE', CACHE = 'lunch_kakao_profile_v1';
function sourceBody(imageUrl = IMAGE) {
  return JSON.stringify({ profile_id: Source.PROFILE_ID, profile: { profile_id: Source.PROFILE_ID,
    permalink: Source.SOURCE_URL, profile_image: { type: 'image', mimetype: 'image/jpeg',
      xlarge_url: imageUrl, medium_url: 'https://k.kakaocdn.net/dn/test/channel/first/img_m.jpg' },
    unused_metadata: 'not part of the published result' }, unrelated: ['raw source is not retained'] });
}
function response(body = sourceBody(), status = 200, headers = { 'Content-Type': 'application/json; charset=utf-8' }) {
  return { getResponseCode: () => status, getAllHeaders: () => headers, getContentText: () => body };
}
function server() {
  const store = {}, cache = new Map(), requests = [], writes = [];
  let now = Date.parse(START), locked = false, handler = () => response(), sequence = 0, cacheBroken = false;
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const properties = {
    getProperties: () => ({ ...store }),
    setProperty(key, value) { assert.ok(Buffer.byteLength(value) <= 9000); store[key] = value; writes.push(key); return this; },
    setProperties(values) { for (const [key, value] of Object.entries(values)) this.setProperty(key, value); return this; },
    deleteProperty(key) { delete store[key]; return this; }
  };
  const context = vm.createContext({ console, Date: Clock, Intl, URL,
    Utilities: { newBlob: text => ({ getBytes: () => Buffer.from(text) }), getUuid: () => crypto.randomUUID(), formatDate: () => DATE },
    PropertiesService: { getScriptProperties: () => properties },
    CacheService: { getScriptCache: () => ({
      get(key) { if (cacheBroken) throw new Error('Cache unavailable'); const value = cache.get(key); return value && value.until > now ? value.text : null; },
      put(key, text, seconds) { if (cacheBroken) throw new Error('Cache unavailable'); cache.set(key, { text, until: now + seconds * 1000 }); }
    }) },
    LockService: { getScriptLock: () => ({ waitLock() { assert.equal(locked, false); locked = true; }, hasLock: () => locked, releaseLock() { assert.equal(locked, true); locked = false; } }) },
    ContentService: { MimeType: { JSON: 'json', JAVASCRIPT: 'js' }, createTextOutput: text => ({ text, setMimeType(type) { this.mime = type; return this; } }) },
    UrlFetchApp: { fetch(url, options) { assert.equal(locked, false, 'Network reads must not hold the attendance lock'); requests.push({ url, options }); return handler(url, options); } }
  });
  const files = ['core.js', 'lunchtime-source.js', 'backend/server.js'];
  const source = files.map(file => fs.readFileSync(path.join(__dirname, '..', file), 'utf8')).join('\n');
  vm.runInContext(source.replace("'__TEAM_KEY__'", `'${KEY}'`), context);
  const rawGet = params => context.doGet({ parameter: { key: KEY, action: 'kakaoProfile', ...params } });
  const get = params => JSON.parse(rawGet(params).text);
  const state = params => get({ action: 'state', date: DATE, ...params });
  const post = (type, actor, payload) => {
    const body = { key: KEY, date: DATE, op: { type, actor, payload, id: (++sequence).toString(16).padStart(24, '0') } };
    return { body, response: JSON.parse(context.doPost({ postData: { contents: JSON.stringify(body) } }).text) };
  };
  return { store, cache, writes, requests, get, rawGet, state, post, context,
    advance: ms => { now += ms; }, setHandler: fn => { handler = fn; }, breakCache: () => { cacheBroken = true; }, locked: () => locked };
}

test('카카오 조회는 팀 키와 JSONP 콜백을 검증하고 날짜·본인 선택 없이 사용할 수 있다', () => {
  const s = server();
  assert.equal(s.get({ key: 'incorrect' }).ok, false);
  assert.equal(s.get({ callback: 'alert(1)//' }).ok, false);
  assert.equal(s.requests.length, 0); assert.deepEqual(s.writes, []);
  const callback = 'lunchReply_' + 'b'.repeat(24), reply = s.rawGet({ callback });
  assert.equal(reply.mime, 'js');
  assert.ok(reply.text.startsWith(callback + '('));
  const payload = JSON.parse(reply.text.slice(callback.length + 1, -2));
  assert.equal(payload.profile.imageUrl, IMAGE);
  assert.equal(s.state().serverVersion, 6); assert.equal(s.state().features.kakaoProfile, true);
  assert.equal(s.get({ action: 'state' }).ok, false);
});

test('공개 JSON에서 큰 사진 URL만 돌려주고 12초 제한·인증 없는 정상 GET을 사용한다', () => {
  const s = server(), result = s.get();
  assert.deepEqual(result, { ok: true, profile: { ok: true, sourceUrl: Source.SOURCE_URL, imageUrl: IMAGE, checkedAt: START } });
  const request = s.requests[0];
  assert.equal(request.url, Source.HOME_ENDPOINT);
  assert.deepEqual(JSON.parse(JSON.stringify(request.options.headers)), { Accept: 'application/json' });
  assert.equal(request.options.timeoutSeconds, 12); assert.equal(request.options.followRedirects, false);
  assert.equal(request.options.muteHttpExceptions, true);
  assert.ok(!JSON.stringify(request).includes(KEY));
  assert.deepEqual(Object.keys(s.store), [PROPERTY]);
  assert.ok(!JSON.stringify(s.store).includes('not part of the published result'));
  assert.ok(!JSON.stringify(s.store).includes('data:image'));
  assert.deepEqual(Object.keys(result.profile).sort(), ['checkedAt','imageUrl','ok','sourceUrl']);
});

test('일반 조회는 5분 캐시를 쓰고 강제 조회도 시도 사이 최소 1분을 지킨다', () => {
  const s = server(); s.get();
  s.advance(30000); s.get({ force: '1' }); assert.equal(s.requests.length, 1);
  s.advance(31000); s.setHandler(() => response(sourceBody(NEW_IMAGE)));
  s.get(); assert.equal(s.requests.length, 1);
  const updated = s.get({ force: '1' }); assert.equal(s.requests.length, 2); assert.equal(updated.profile.imageUrl, NEW_IMAGE);
  assert.notEqual(updated.profile.checkedAt, START);
  s.advance(299999); s.get(); assert.equal(s.requests.length, 2);
  s.advance(2); s.get(); assert.equal(s.requests.length, 3);
  assert.equal(s.locked(), false);
});

test('HTTP 오류·HTML·다른 채널·잘못된 JSON·과대 응답은 저장하지 않고 재시도 폭주를 막는다', () => {
  const different = JSON.parse(sourceBody()); different.profile_id = '_other';
  const invalidImage = sourceBody('https://untrusted.example/photo.jpg');
  const utf8Large = JSON.stringify({ value: '한'.repeat(90000) });
  const cases = [
    () => response('', 403),
    () => response('', 302, { Location: 'https://other.example/' }),
    () => response('<html>Sign in</html>', 200, { 'content-type': 'text/html' }),
    () => response('Invalid CORS request'),
    () => response('{}'),
    () => response(JSON.stringify(different)),
    () => response(invalidImage),
    () => response('x'.repeat(Source.MAX_RESPONSE_BYTES + 1)),
    () => response(utf8Large),
    () => response(sourceBody(), 200, { 'Content-Type': 'application/json', 'Content-Length': String(Source.MAX_RESPONSE_BYTES + 1) }),
    () => { throw new Error('request timeout'); }
  ];
  for (const next of cases) {
    const s = server(); s.setHandler(next);
    const failed = s.get(); assert.equal(failed.ok, false); assert.match(failed.error, /카카오.*다시 확인/);
    assert.equal(JSON.parse(s.store[PROPERTY]).profile, null);
    s.get({ force: '1' }); assert.equal(s.requests.length, 1);
    assert.equal(s.locked(), false);
  }
});

test('조회 실패 때 마지막 성공 사진과 checkedAt을 보존하고 이후 정상 응답에서 오류를 해제한다', () => {
  const s = server(), first = s.get();
  s.advance(20 * 24 * 60 * 60000); s.cache.clear();
  s.setHandler(() => { throw new Error('source offline'); });
  const fallback = s.get({ force: '1' });
  assert.deepEqual(fallback, { ok: true, profile: { ...first.profile, error: true } });
  assert.equal(JSON.parse(s.store[PROPERTY]).profile.checkedAt, START);
  const count = s.requests.length; assert.deepEqual(s.get({ force: '1' }), fallback); assert.equal(s.requests.length, count);
  s.advance(61000); s.setHandler(() => response(sourceBody(NEW_IMAGE)));
  const recovered = s.get({ force: '1' });
  assert.equal(recovered.profile.imageUrl, NEW_IMAGE); assert.equal(recovered.profile.error, undefined);
  assert.notEqual(recovered.profile.checkedAt, START);
});

test('외부 조회 도중 다른 요청은 중복 다운로드하지 않고 참석 저장은 계속 처리한다', () => {
  const s = server(); let peer, saved;
  s.setHandler(() => {
    peer = s.get({ force: '1' });
    saved = s.post('availability', 'jingi', { value: 'in' });
    assert.equal(saved.response.accepted, true);
    assert.equal(s.state({ receipt: saved.body.op.id }).receipt.ok, true);
    return response();
  });
  const first = s.get({ force: '1' });
  assert.equal(first.ok, true); assert.equal(peer.ok, false); assert.match(peer.error, /확인하고/);
  assert.equal(peer.pending, true); assert.equal(peer.retryAfter, 2);
  assert.equal(s.requests.length, 1); assert.equal(s.state().days[DATE].overrides.jingi, 'in');
  assert.equal(s.locked(), false);
});

test('느린 이전 실행이 나중에 도착해도 새로운 요청의 사진을 덮지 않는다', () => {
  const s = server(); let newer;
  s.setHandler(() => {
    if (s.requests.length === 1) {
      s.advance(61000); newer = s.get({ force: '1' });
      return response(sourceBody(IMAGE));
    }
    return response(sourceBody(NEW_IMAGE));
  });
  const late = s.get({ force: '1' });
  assert.deepEqual(late, newer); assert.equal(late.profile.imageUrl, NEW_IMAGE);
  assert.equal(s.requests.length, 2); assert.equal(s.get().profile.imageUrl, NEW_IMAGE);
  assert.equal(JSON.parse(s.store[PROPERTY]).profile.imageUrl, NEW_IMAGE);
});

test('캐시 장애·손상에도 일일 기록·설정·공유 이미지 메타데이터를 건드리지 않는다', () => {
  const s = server();
  s.post('availability', 'seongjun', { value: 'in' }); s.post('vote', 'seongjun', { placeId: 'megazone' });
  s.store.LUNCH_CONFIG = JSON.stringify({ revision: 7, settings: { meetingTime: '12:20', scheduleEnd: '2027-01-31', ceoDays: { jingi: [4] } } });
  s.store.LUNCH_MENU_IMAGE_week_2026 = 'unrelated image metadata remains untouched';
  const before = { ...s.store };
  s.store[PROPERTY] = '{broken'; s.cache.set(CACHE, { text: '{broken', until: Infinity });
  assert.equal(s.get().ok, true);
  s.breakCache(); s.advance(1000); assert.equal(s.get().ok, true); assert.equal(s.requests.length, 1);
  s.advance(300001); s.setHandler(() => { throw new Error('offline'); });
  assert.equal(s.get().profile.error, true);
  assert.deepEqual(Object.fromEntries(Object.entries(s.store).filter(([key]) => key !== PROPERTY)), before);
  assert.equal(s.state().days[DATE].votes.seongjun, 'megazone');
  assert.equal(s.state().settings.meetingTime, '12:20'); assert.equal(s.state().configRevision, 7);
});
