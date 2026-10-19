const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const K = require('../lunchtime-source.js');
// Whitelisted fields from the live, unauthenticated channel response on 2026-10-19.
// No business owner/profile data, images, or page scripts are copied into these fixtures.
const fixture = require('./fixtures/kakao-profile-20261019.json');
const corsBlocked = fs.readFileSync(path.join(__dirname, 'fixtures/kakao-profile-cors-blocked-20261019.html'), 'utf8');
const clone = value => JSON.parse(JSON.stringify(value));
const code = wanted => error => error.code === wanted;
const image = fixture.profile.profile_image;
const head = content => '<!doctype html><html><head>' + content + '</head><body></body></html>';
const sourceMeta = '<meta property="og:url" content="http://pf.kakao.com/_xbbMPn">';

test('실제 공개 JSON의 큰 이미지 필드를 그대로 반환하며 식단 날짜나 확인시각을 만들지 않는다', () => {
  const result = K.normalizeProfile(JSON.stringify(fixture));
  assert.deepEqual(result, { ok: true, sourceUrl: 'https://pf.kakao.com/_xbbMPn', imageUrl: image.xlarge_url });
  assert.deepEqual(K.normalizeProfile(fixture), result);
  assert.deepEqual(Object.keys(result).sort(), ['imageUrl', 'ok', 'sourceUrl']);
  assert.equal(K.HOME_ENDPOINT, 'https://pf.kakao.com/rocket-web/web/profiles/_xbbMPn/home');
  assert.equal(K.PROFILE_ID, '_xbbMPn');
  assert.equal(K.MAX_RESPONSE_BYTES, 262144);
  assert.deepEqual(K.REQUEST_HEADERS, { Accept: 'application/json' });
});

test('큰 이미지가 없으면 응답에 실제 있는 URL만 쓰며 크기 접미사를 추측하지 않는다', () => {
  const withoutLarge = clone(fixture);
  delete withoutLarge.profile.profile_image.xlarge_url;
  withoutLarge.profile.profile_image.url = image.medium_url;
  assert.equal(K.normalizeProfile(withoutLarge).imageUrl, image.medium_url);
  delete withoutLarge.profile.profile_image.url;
  assert.equal(K.normalizeProfile(withoutLarge).imageUrl, image.medium_url);
  delete withoutLarge.profile.profile_image.medium_url;
  assert.throws(() => K.normalizeProfile(withoutLarge), code('INVALID_RESPONSE'));
});

test('최상위·중첩 채널 ID와 원문 주소를 모두 검증한다', () => {
  for (const change of [
    value => { value.profile_id = '_other'; },
    value => { value.profile.profile_id = '_other'; },
    value => { value.profile.permalink = 'https://pf.kakao.com/_other'; },
    value => { value.profile.permalink = 'https://pf.kakao.com.evil.example/_xbbMPn'; }
  ]) {
    const wrong = clone(fixture);
    change(wrong);
    assert.throws(() => K.normalizeProfile(wrong), code('CHANNEL_MISMATCH'));
  }
  for (const change of [
    value => { delete value.profile_id; },
    value => { delete value.profile.profile_id; },
    value => { value.profile = null; }
  ]) {
    const wrong = clone(fixture);
    change(wrong);
    assert.throws(() => K.normalizeProfile(wrong), code('INVALID_RESPONSE'));
  }
});

test('깨진 JSON과 로그인·오류·다른 스키마를 성공 프로필로 변환하지 않는다', () => {
  for (const raw of ['', ' ', '{broken', '<html>login</html>', 'null', '[]', '"profile"', {}, null,
    { error: 'login_required' }, { profile_id: '_xbbMPn', profile: [] }]) {
    assert.throws(() => K.normalizeProfile(raw), code('INVALID_RESPONSE'));
  }
  const circular = {}; circular.self = circular;
  assert.throws(() => K.normalizeProfile(circular), code('INVALID_RESPONSE'));
  for (const change of [
    value => { value.profile.profile_image = null; },
    value => { value.profile.profile_image.type = 'video'; },
    value => { value.profile.profile_image.mimetype = 'text/html'; }
  ]) {
    const wrong = clone(fixture); change(wrong);
    assert.throws(() => K.normalizeProfile(wrong), code('INVALID_RESPONSE'));
  }
});

test('HTTPS 카카오 CDN 이미지 외의 호스트·인증정보·스크립트·경로 주입을 거부한다', () => {
  assert.equal(K.validImageURL(image.xlarge_url), true);
  assert.equal(K.validImageURL(image.medium_url + '?key=a%2Bb&size=400'), true);
  for (const url of [
    'http://k.kakaocdn.net/dn/a/b/img.jpg', '//k.kakaocdn.net/dn/a/b/img.jpg',
    'https://k.kakaocdn.net.evil.example/dn/a/b/img.jpg',
    'https://k.kakaocdn.net@evil.example/dn/a/b/img.jpg',
    'https://user@k.kakaocdn.net/dn/a/b/img.jpg',
    'https://k.kakaocdn.net:443/dn/a/b/img.jpg',
    'https://k.kakaocdn.net/dn/a/../img.jpg',
    'https://k.kakaocdn.net/dn/a/%2e%2e/img.jpg',
    'https://k.kakaocdn.net/redirect?to=https://evil.example/image.jpg',
    'https://k.kakaocdn.net/dn/a/b/img.svg',
    'javascript:alert(1)', 'data:image/png;base64,abc', image.url + '#fragment',
    image.url + '\n', image.url + '" onerror="alert(1)', null, 1
  ]) assert.equal(K.validImageURL(url), false, String(url));
});

test('존재하는 우선 이미지 필드가 깨졌으면 정상인 다른 필드로 숨기지 않고 실패한다', () => {
  for (const url of ['', null, 1, 'https://evil.example/image.jpg']) {
    const wrong = clone(fixture);
    wrong.profile.profile_image.xlarge_url = url;
    assert.throws(() => K.normalizeProfile(wrong), code('INVALID_IMAGE_URL'));
  }
});

test('문자 수 대신 UTF-8 바이트로 JSON·객체·HTML 상한을 적용한다', () => {
  const large = clone(fixture);
  large.unused = '가'.repeat(90000);
  assert.ok(JSON.stringify(large).length < K.MAX_RESPONSE_BYTES);
  assert.throws(() => K.normalizeProfile(large), code('RESPONSE_TOO_LARGE'));
  assert.throws(() => K.normalizeProfile(JSON.stringify(large)), code('RESPONSE_TOO_LARGE'));
  assert.throws(() => K.parseHTML(' '.repeat(K.MAX_RESPONSE_BYTES) + '<head></head>'), code('RESPONSE_TOO_LARGE'));
  const supplementary = clone(fixture);
  supplementary.unused = '😀'.repeat(66000);
  assert.throws(() => K.normalizeProfile(supplementary), code('RESPONSE_TOO_LARGE'));
});

test('HTML 대체 파서는 OG 원문 URL과 실제 중간 이미지 URL만 읽고 스크립트는 실행하지 않는다', () => {
  global.__kakaoScriptRan = false;
  const script = '<script>globalThis.__kakaoScriptRan=true; const s=\'<meta property="og:image" content="https://evil.example/fake.jpg">\';</script>';
  const html = head(script + '<!-- <meta property="og:image" content="https://evil.example/comment.jpg"> -->' +
    sourceMeta + '<META content=\'' + image.medium_url + '?a=1&amp;b=2\' PROPERTY=\'og:image\'>');
  assert.deepEqual(K.parseHTML(html), {
    ok: true, sourceUrl: K.SOURCE_URL, imageUrl: image.medium_url + '?a=1&b=2'
  });
  assert.equal(global.__kakaoScriptRan, false);
  delete global.__kakaoScriptRan;
});

test('HTML에서 누락·중복·본문 위장 메타와 다른 채널의 메타를 거부한다', () => {
  const imageMeta = '<meta property="og:image" content="' + image.medium_url + '">';
  for (const html of [
    head(sourceMeta), head(imageMeta), head(sourceMeta + imageMeta + imageMeta),
    head(sourceMeta) + imageMeta,
    head(sourceMeta + '<template>' + imageMeta + '</template>'),
    head(sourceMeta + '<meta property="og:image" content="' + image.medium_url + '" content="x">')
  ]) assert.throws(() => K.parseHTML(html), code('INVALID_RESPONSE'));
  assert.throws(() => K.parseHTML(head(sourceMeta.replace('_xbbMPn', '_other') + imageMeta)), code('CHANNEL_MISMATCH'));
  assert.throws(() => K.parseHTML(head(sourceMeta + imageMeta.replace(image.medium_url, 'javascript:alert(1)'))), code('INVALID_IMAGE_URL'));
});

test('실제 Origin 차단 응답은 200이어도 조회 성공이나 빈 이미지가 되지 않는다', () => {
  assert.throws(() => K.parseHTML(corsBlocked), code('CORS_BLOCKED'));
});

test('브라우저 전용 API나 네트워크 없이 Apps Script와 같은 V8 전역에 UMD를 노출한다', () => {
  const context = {};
  vm.createContext(context);
  assert.equal(context.fetch, undefined);
  assert.equal(context.URL, undefined);
  assert.equal(context.TextEncoder, undefined);
  assert.equal(context.DOMParser, undefined);
  vm.runInContext(fs.readFileSync(path.join(__dirname, '../lunchtime-source.js'), 'utf8'), context);
  const result = context.LunchKakaoSource.normalizeProfile(JSON.stringify(fixture));
  assert.equal(result.imageUrl, image.xlarge_url);
  assert.equal(result.sourceUrl, K.SOURCE_URL);
  assert.equal(Object.isFrozen(context.LunchKakaoSource), true);
});
