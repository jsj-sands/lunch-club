const { test } = require('node:test');
const assert = require('node:assert/strict');
const M = require('../menu-source.js');
// Welstory+ GET /api/meal response shape (field names from the welplan2 client's verified types).
// The dishes are the 2026-10-19 메가존산학연센터 lunch, rearranged by hand into raw Welstory rows;
// this is not a live capture. Course CC keeps the legacy http://samsungwelstory.com photo folder.
const today = require('./fixtures/welstory-meal-20261019.json');
const clone = value => JSON.parse(JSON.stringify(value));
const code = wanted => error => error.code === wanted;
const PHOTO = 'https://img-welmenu.welstory.com/data/manager/recipe/E5Z5/20261019/';

test('같은 홀·코스의 요리를 한 코스로 묶고 대표 메뉴·반찬·사진을 보존한다', () => {
  const result = M.parseMealList(today, '2026-10-19', '2');
  assert.equal(result.ok, true);
  assert.equal(result.date, '2026-10-19');
  assert.deepEqual(result.dishes, ['나주곰탕*당면사리', '눈꽃치즈김치볶음밥', '[오늘의데일리팩] 치킨텐더포케']);
  assert.deepEqual(result.courses.map(course => course.components.length), [6, 5, 2]);
  assert.deepEqual(result.courses[0].components, ['나주곰탕*당면사리', '데리야끼고기경단조림', '건파래볶음', '오복지무침', '깍두기', '흑미밥']);
  assert.equal(result.courses[0].imageUrl, PHOTO + 's20261019103924.jpg');
  // Legacy http samsungwelstory.com folders become the public HTTPS image host.
  assert.equal(result.courses[1].imageUrl, PHOTO + 's20261019104145.jpg');
  for (const course of result.courses) assert.equal(M.validImageURL(course.imageUrl), true);
  assert.ok(result.courses.every(course => course.takeout === undefined));
  assert.ok(Number.isFinite(Date.parse(result.fetchedAt)));
});

test('대표 메뉴(typicalMenu=Y)가 첫 줄이 아니어도 코스 이름이 되고 중복 반찬은 한 번만 남긴다', () => {
  const raw = clone(today);
  const rows = raw.data.mealList;
  rows[0].typicalMenu = 'N'; rows[2].typicalMenu = 'Y';
  rows.splice(3, 0, { ...rows[3] });
  const course = M.parseMealList(raw, '20261019').courses[0];
  assert.equal(course.name, '건파래볶음');
  assert.equal(course.components[0], '건파래볶음');
  assert.equal(course.components.filter(name => name === '오복지무침').length, 1);
});

test('테이크아웃 판매 코스는 표시하되 takeout으로 구분하고, 점심 이외 식사는 제외한다', () => {
  const raw = clone(today);
  raw.data.mealList.filter(row => row.menuCourseType === 'DD').forEach(row => { row.salesType = 'T1'; });
  raw.data.mealList.push({ ...raw.data.mealList[0], menuName: '저녁 카레', menuMealType: '3', menuCourseType: 'EE' });
  const result = M.parseMealList(raw, '2026-10-19', '2');
  assert.equal(result.courses.length, 3);
  assert.equal(result.courses[2].takeout, true);
  assert.equal(result.dishes.includes('저녁 카레'), false);
});

test('사진은 웰스토리 레시피 폴더만 HTTPS 주소로 만들고 다른 호스트나 경로는 버린다', () => {
  assert.equal(M.imageURL(PHOTO, 's1.jpg'), PHOTO + 's1.jpg');
  assert.equal(M.imageURL(PHOTO.slice(0, -1), 's1.jpg'), PHOTO + 's1.jpg');
  assert.equal(M.imageURL('http://www.samsungwelstory.com/data/manager/recipe/E5Z5/20261019/', 's1.png'), PHOTO + 's1.png');
  for (const [folder, file] of [
    ['https://evil.example/data/manager/recipe/E5Z5/20261019/', 's1.jpg'],
    ['https://samsungwelstory.com.evil.example/data/manager/recipe/E5Z5/', 's1.jpg'],
    ['https://img-welmenu.welstory.com/data/other/E5Z5/', 's1.jpg'],
    ['https://img-welmenu.welstory.com/data/manager/recipe/../', 's1.jpg'],
    [PHOTO, 's1.svg'], [PHOTO, '../s1.jpg'], [PHOTO, 's1.jpg" onerror="x'], [PHOTO, ''], ['', 's1.jpg'], [null, null]
  ]) assert.equal(M.imageURL(folder, file), '', String(folder) + ' + ' + String(file));
  const raw = clone(today);
  raw.data.mealList[0].photoUrl = 'https://evil.example/data/manager/recipe/E5Z5/';
  const course = M.parseMealList(raw, '2026-10-19').courses[0];
  assert.equal(Object.prototype.hasOwnProperty.call(course, 'imageUrl'), false);
  assert.equal(course.components.length, 6);
});

test('사진 주소 검증은 HTTPS 웰스토리 레시피 경로만 허용한다', () => {
  const actual = PHOTO + 's20261019103924.jpg';
  assert.equal(M.validImageURL(actual), true);
  assert.equal(M.validImageURL(actual + '?width=688&format=jpeg'), true);
  for (const url of [
    actual.replace('https:', 'http:'), actual.replace('https:', ''),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com.evil.example'),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com@evil.example'),
    actual.replace('img-welmenu.welstory.com', 'user@img-welmenu.welstory.com'),
    actual.replace('img-welmenu.welstory.com', 'img-welmenu.welstory.com:443'),
    actual.replace('/recipe/E5Z5/', '/recipe/../'), actual.replace('/recipe/E5Z5/', '/recipe/%2e%2e/'),
    actual.replace('.jpg', '.svg'), actual + '#fragment', actual + '\n',
    actual + '" onerror="alert(1)', 'javascript:alert(1)', 'data:image/png;base64,abc', '', null, 1
  ]) assert.equal(M.validImageURL(url), false, String(url));
});

test('빈 mealList만 미등록이고, 다른 날짜·다른 식당 응답은 오류로 막는다', () => {
  const empty = { code: 200, message: null, data: { mealList: [] } };
  assert.deepEqual(M.parseMealList(empty, '2026-10-25').dishes, []);
  assert.throws(() => M.parseMealList(today, '2026-10-20'), code('DATE_MISMATCH'));
  const other = clone(today); other.data.mealList[4].restaurantCode = 'REST000001';
  assert.throws(() => M.parseMealList(other, '2026-10-19'), code('LOCATION_MISMATCH'));
});

test('로그인 화면·깨진 JSON·알 수 없는 구조를 빈 식단으로 바꾸지 않는다', () => {
  for (const raw of ['<html>login</html>', '{', null, [], {}, { data: null }, { data: { mealList: {} } }, { data: { mealList: [null] } }, { data: { mealList: [{ menuName: ' ' }] } }]) {
    assert.throws(() => M.parseMealList(raw, '2026-10-19'), code('INVALID_RESPONSE'), JSON.stringify(raw));
  }
  assert.equal(M.parseMealList(JSON.stringify(today), '2026-10-19').courses.length, 3);
  for (const date of ['2026-02-29', '2026-13-01', '2026-10-32', '2026-10-19T00:00Z', '']) {
    assert.throws(() => M.parseMealList(today, date), code('INVALID_DATE'));
  }
});

test('점심 식사 코드는 목록의 점심 항목을 쓰고 없으면 기본값 2를 쓴다', () => {
  assert.equal(M.lunchMealType({ data: [{ code: '1', codeNm: '조식' }, { code: '7', codeNm: '점심' }] }), '7');
  assert.equal(M.lunchMealType([{ code: '2', codeNm: '중식' }]), '2');
  assert.equal(M.lunchMealType({ data: [{ code: 'x', codeNm: '점심' }] }), '2');
  assert.equal(M.lunchMealType(null), '2');
});

test('브라우저는 팀 공유 서버로만 요청하고 돌아온 식단을 다시 검증한다', async () => {
  await assert.rejects(M.fetchDay('2026-10-19'), code('NOT_CONNECTED'));
  const parsed = M.parseMealList(today, '2026-10-19');
  const calls = [];
  const menu = await M.fetchDay('2026-10-19', { request: async params => {
    calls.push(params);
    const tampered = clone(parsed);
    tampered.courses[0].imageUrl = 'https://evil.example/x.jpg';
    tampered.courses[1].components.push(' ', 3);
    return { ok: true, menu: tampered };
  } });
  assert.deepEqual(calls, [{ action: 'menu', date: '2026-10-19' }]);
  assert.deepEqual(menu.dishes, parsed.dishes);
  assert.equal(Object.prototype.hasOwnProperty.call(menu.courses[0], 'imageUrl'), false);
  assert.deepEqual(menu.courses[1].components, parsed.courses[1].components);
  await assert.rejects(M.fetchDay('2026-10-19', { request: async () => ({ ok: true, menu: { ...parsed, date: '2026-10-20' } }) }), code('INVALID_RESPONSE'));
});

test('공유 서버의 설정 안내·조회 실패·연결 오류를 구분해 전달한다', async () => {
  await assert.rejects(M.fetchDay('2026-10-19', { request: async () => ({ ok: false, reason: 'setup', error: '계정을 등록해 주세요.' }) }),
    error => error.code === 'SETUP_REQUIRED' && error.message === '계정을 등록해 주세요.');
  await assert.rejects(M.fetchDay('2026-10-19', { request: async () => ({ ok: false, error: '웰스토리 로그인에 실패했어요 (401).' }) }),
    error => error.code === 'PROVIDER_ERROR' && /401/.test(error.message));
  await assert.rejects(M.fetchDay('2026-10-19', { request: async () => { throw new Error('공유 서버 응답이 늦어요.'); } }),
    error => error.code === 'NETWORK_ERROR' && error.message === '공유 서버 응답이 늦어요.');
  await assert.rejects(M.fetchDay('2026-10-19', { request: async () => 'oops' }), code('INVALID_RESPONSE'));
});
