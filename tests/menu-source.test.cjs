const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../menu-source.js');
// Live, public MCP responses fetched 2026-10-19. Only unused nutrition was removed.
// Today's fixture was refreshed after course photos were published, retaining imageUrl.
// Endpoint/schema: https://welplan.pmh.codes/docs/api
const today = require('./fixtures/welplan-20261019.json');
const friday = require('./fixtures/welplan-20261023.json');
const unpublished = require('./fixtures/welplan-20261025.json');
const clone = value => JSON.parse(JSON.stringify(value));
const code = wanted => error => error.code === wanted;

test('검증된 오늘의 점심 코스만 표시하고 반찬 정보와 날짜 원문을 보존한다', () => {
  const result = M.parseResponse(today, '2026-10-19');
  assert.equal(result.ok, true);
  assert.equal(result.date, '2026-10-19');
  assert.deepEqual(result.dishes, [
    '나주곰탕*당면사리', '눈꽃치즈김치볶음밥', '[오늘의데일리팩] 치킨텐더포케'
  ]);
  assert.ok(result.courses[0].components.includes('데리야끼고기경단조림'));
  assert.deepEqual(result.courses.map(course => course.components.length), [6, 5, 2]);
  assert.deepEqual(result.courses[0].components, [
    '나주곰탕*당면사리', '데리야끼고기경단조림', '건파래볶음', '오복지무침', '깍두기', '흑미밥'
  ]);
  assert.ok(result.courses[1].components.includes('온육수'));
  assert.ok(result.courses[2].components.includes('[오늘의샐러드] New 차돌유자포테이토샐러드)'));
  assert.equal(result.courses[0].imageUrl, 'https://img-welmenu.welstory.com/data/manager/recipe/E5Z5/20261019/s20261019103924.jpg');
  for (const course of result.courses) assert.equal(M.validImageURL(course.imageUrl), true);
  assert.ok(result.source.endsWith('/20261019'));
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('오늘이 아닌 금요일의 사전 공개 식단을 해당 날짜에 반환한다', () => {
  const result = M.parseResponse(friday, '2026-10-23');
  assert.deepEqual(result.dishes, [
    'New 치즈스팸순두부찌개', '해산물팟타이', '[포케]오늘의데일리팩(우삼겹포케)'
  ]);
  assert.equal(result.date, '2026-10-23');
  assert.ok(result.source.endsWith('/20261023'));
  assert.ok(result.courses.every(course => !Object.prototype.hasOwnProperty.call(course, 'imageUrl')));
});

test('사진은 검증된 HTTPS 웰스토리 레시피 경로만 허용하고 주소를 추측하지 않는다', () => {
  const actual = today.result.structuredContent.meals[1].menus[0].imageUrl;
  assert.equal(M.validImageURL(actual), true);
  assert.equal(M.validImageURL(actual + '?width=688&format=jpeg'), true);
  for (const url of [
    actual.replace('https:', 'http:'), actual.replace('https:', ''),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com.evil.example'),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com@evil.example'),
    actual.replace('img-welmenu.welstory.com', 'user@img-welmenu.welstory.com'),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com:443'),
    actual.replace('/recipe/E5Z5/', '/recipe/../'),
    actual.replace('/recipe/E5Z5/', '/recipe/%2e%2e/'),
    actual.replace('/data/manager/recipe/', '/redirect/'),
    actual.replace('.jpg', '.svg'), actual + '#fragment', actual + '\n',
    actual + '" onerror="alert(1)', 'javascript:alert(1)', 'data:image/png;base64,abc',
    'https://evil.example/menu.jpg', '', null, 1
  ]) assert.equal(M.validImageURL(url), false, String(url));
});

test('누락되거나 잘못된 사진 하나는 검증된 메뉴와 나머지 사진을 가리지 않는다', () => {
  for (const imageUrl of [undefined, null, '', 1, {}, 'https://evil.example/menu.jpg']) {
    const partial = clone(today);
    partial.result.structuredContent.meals[1].menus[0].imageUrl = imageUrl;
    const result = M.parseResponse(partial, '2026-10-19');
    assert.deepEqual(result.dishes, M.parseResponse(today, '2026-10-19').dishes);
    assert.ok(!Object.prototype.hasOwnProperty.call(result.courses[0], 'imageUrl'));
    assert.equal(result.courses[0].components.length, 6);
    assert.equal(result.courses[1].imageUrl, today.result.structuredContent.meals[1].menus[1].imageUrl);
  }
});

test('반찬 상세의 부분 오류는 유효한 구성과 대표 메뉴를 유지한다', () => {
  const partial = clone(today);
  partial.result.structuredContent.meals[1].menus[0].components = [
    { name: '나주곰탕*당면사리' }, null, { name: '' }, { name: 1 }, '잘못된 구조',
    { name: '  흑미밥  ' }, { name: '깍두기', nutrition: { calories: 'invalid' } }
  ];
  const result = M.parseResponse(partial, '2026-10-19');
  assert.deepEqual(result.courses[0].components, ['나주곰탕*당면사리', '흑미밥', '깍두기']);
  assert.equal(result.courses[0].imageUrl, today.result.structuredContent.meals[1].menus[0].imageUrl);
  assert.deepEqual(result.dishes, M.parseResponse(today, '2026-10-19').dishes);
  for (const components of [undefined, null, {}, 'not an array']) {
    partial.result.structuredContent.meals[1].menus[0].components = components;
    assert.deepEqual(M.parseResponse(partial, '2026-10-19').courses[0].components, []);
  }
});

test('동일 식당과 날짜에서 명시적인 빈 점심 메뉴만 미등록 결과가 된다', () => {
  const result = M.parseResponse(unpublished, '2026-10-25');
  assert.deepEqual(result.dishes, []);
  assert.equal(result.ok, true);
  const missing = clone(unpublished);
  missing.result.structuredContent.meals = [];
  assert.throws(() => M.parseResponse(missing, '2026-10-25'), code('INVALID_RESPONSE'));
  missing.result.structuredContent.meals = [{ type: 'lunch' }];
  assert.throws(() => M.parseResponse(missing, '2026-10-25'), code('INVALID_RESPONSE'));
});

test('다른 날짜나 다른 식당 응답을 미등록 또는 요청일 식단으로 표시하지 않는다', () => {
  assert.throws(() => M.parseResponse(today, '2026-10-20'), code('DATE_MISMATCH'));
  for (const [property, value] of [['id', 'REST000000'], ['vendor', 'shinsegae'], ['name', '다른 식당']]) {
    const wrong = clone(today);
    wrong.result.structuredContent.restaurant[property] = value;
    assert.throws(() => M.parseResponse(wrong, '2026-10-19'), code('LOCATION_MISMATCH'));
  }
});

test('오류·깨진 JSON·알 수 없는 스키마를 빈 식단으로 바꾸지 않는다', () => {
  assert.throws(() => M.parseResponse({ jsonrpc: '2.0', error: { code: -32000 } }, '2026-10-19'), code('PROVIDER_ERROR'));
  assert.throws(() => M.parseResponse({ jsonrpc: '2.0', result: { isError: true } }, '2026-10-19'), code('PROVIDER_ERROR'));
  assert.throws(() => M.parseResponse({ jsonrpc: '2.0', result: { content: [{ type: 'text', text: '<html>blocked</html>' }] } }, '2026-10-19'), code('INVALID_RESPONSE'));
  const wrong = clone(today);
  wrong.result.structuredContent.meals[1].menus[0].name = '';
  assert.throws(() => M.parseResponse(wrong, '2026-10-19'), code('INVALID_RESPONSE'));
  assert.throws(() => M.parseResponse(today, '2026-10-19', 999), code('INVALID_RESPONSE'));
});

test('MCP 텍스트 JSON 응답도 같은 검증을 거친다', () => {
  const textOnly = { jsonrpc: '2.0', result: { content: [
    { type: 'text', text: JSON.stringify(friday.result.structuredContent) }
  ] } };
  assert.deepEqual(M.parseResponse(textOnly, '20261023').dishes, M.parseResponse(friday, '2026-10-23').dishes);
});

test('유효하지 않은 달력 날짜와 날짜·식당 이외의 원문 URL 주입을 차단한다', () => {
  for (const date of ['2026-02-29', '2026-13-01', '2026-00-01', '2026-10-32', '2026-10-19T00:00Z', '']) {
    assert.throws(() => M.sourceUrl(date), code('INVALID_DATE'));
  }
  assert.ok(M.sourceUrl('20240229').endsWith('/20240229'));
  const changedUrl = clone(today);
  changedUrl.result.structuredContent.menuUrl = 'javascript:alert(1)';
  assert.equal(new URL(M.parseResponse(changedUrl, '2026-10-19').source).origin, 'https://welplan.pmh.codes');
});

test('브라우저 호출은 공개 MCP에 정확한 식당과 날짜를 보내고 인증정보를 보내지 않는다', async t => {
  let call;
  t.mock.method(global, 'fetch', async (url, options) => {
    call = { url, options };
    const payload = clone(today);
    payload.id = JSON.parse(options.body).id;
    return { ok: true, json: async () => payload };
  });
  const result = await M.fetchDay('2026-10-19');
  assert.equal(call.url, 'https://welplan.pmh.codes/mcp');
  assert.equal(call.options.method, 'POST');
  assert.equal(call.options.mode, 'cors');
  assert.equal(call.options.credentials, 'omit');
  assert.deepEqual(JSON.parse(call.options.body).params, {
    name: 'get_restaurant_menu', arguments: { vendor: 'welstory', restaurantId: 'REST007327', date: '20261019' }
  });
  assert.deepEqual(result.dishes, M.parseResponse(today, '2026-10-19').dishes);
});

test('네트워크와 HTTP 오류는 미등록이 아닌 오류로 전달한다', async t => {
  const mock = t.mock.method(global, 'fetch', async () => { throw new TypeError('Failed to fetch'); });
  await assert.rejects(M.fetchDay('2026-10-19'), code('NETWORK_ERROR'));
  mock.mock.mockImplementation(async () => ({ ok: false, status: 429, headers: new Headers({ 'Retry-After': '60' }) }));
  await assert.rejects(M.fetchDay('2026-10-19'), error => error.code === 'HTTP_ERROR' && error.status === 429 && error.retryAfter === '60');
  mock.mock.mockImplementation(async () => ({ ok: true, json: async () => { throw new SyntaxError('unexpected'); } }));
  await assert.rejects(M.fetchDay('2026-10-19'), code('INVALID_RESPONSE'));
});

test('날짜 이동으로 취소한 요청은 정상 식단이나 빈 식단으로 도착하지 않는다', async t => {
  const controller = new AbortController();
  t.mock.method(global, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  const request = M.fetchDay('2026-10-19', { signal: controller.signal });
  controller.abort();
  await assert.rejects(request, error => error.name === 'AbortError' && error.code === 'ABORTED');
  await assert.rejects(M.fetchDay('2026-10-19', { signal: controller.signal }), code('ABORTED'));
});

test('15초가 지나면 요청을 취소하고 시간초과를 전달한다', async t => {
  const nativeSetTimeout = global.setTimeout;
  let timeout;
  t.mock.method(global, 'setTimeout', (callback, delay) => {
    timeout = delay;
    return nativeSetTimeout(callback, 1);
  });
  t.mock.method(global, 'fetch', (_url, options) => new Promise((_resolve, reject) => {
    options.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true });
  }));
  await assert.rejects(M.fetchDay('2026-10-19'), code('TIMEOUT'));
  assert.equal(timeout, 15000);
});
