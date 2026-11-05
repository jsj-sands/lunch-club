/* 메가존 점심 식단: Welstory+ 회원 API를 Apps Script 서버에서만 호출합니다.
 * menu-source.js(LunchMenuSource) 다음, backend/server.js 앞에 붙여 Code.gs를 만듭니다.
 * 웰스토리 계정은 Apps Script > 프로젝트 설정 > 스크립트 속성에만 저장하고 GitHub 파일에는 넣지 않습니다.
 *   LUNCH_WELSTORY_USERNAME  웰스토리플러스 앱 로그인 아이디
 *   LUNCH_WELSTORY_PASSWORD  웰스토리플러스 앱 비밀번호
 * 나머지 LUNCH_WELSTORY_* 속성(기기 ID, 세션, 점심 코드, 로그인 일시 중지)은 서버가 자동으로 관리합니다.
 * 로그인은 세션이 없거나 만료될 때만 하고, 식단은 날짜별로 캐시해 웰스토리 요청을 최소화합니다.
 */
const WELSTORY_BASE = 'https://welplus.welstory.com';
const WELSTORY_USERNAME_PROPERTY = 'LUNCH_WELSTORY_USERNAME';
const WELSTORY_PASSWORD_PROPERTY = 'LUNCH_WELSTORY_PASSWORD';
const WELSTORY_DEVICE_PROPERTY = 'LUNCH_WELSTORY_DEVICE_ID';
const WELSTORY_SESSION_PROPERTY = 'LUNCH_WELSTORY_SESSION';
const WELSTORY_MEAL_TYPE_PROPERTY = 'LUNCH_WELSTORY_MEAL_TYPE';
const WELSTORY_PAUSE_PROPERTY = 'LUNCH_WELSTORY_LOGIN_PAUSE';
const WELSTORY_MENU_CACHE_PREFIX = 'lunch_welstory_menu_v1_';
const WELSTORY_MENU_TTL_SECONDS = 30 * 60;
const WELSTORY_PAST_MENU_TTL_SECONDS = 6 * 60 * 60;
const WELSTORY_ERROR_TTL_SECONDS = 2 * 60;
const WELSTORY_SESSION_MARGIN_MS = 5 * 60000;
const WELSTORY_DEFAULT_SESSION_MS = 50 * 60000;
// A rejected login is not retried for a while so a wrong password cannot lock the account.
const WELSTORY_LOGIN_PAUSE_MS = 30 * 60000;
const WELSTORY_SERVER_PAUSE_MS = 5 * 60000;
const WELSTORY_DEVICE_ID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const WELSTORY_SETUP_ERROR = '메가존 식단을 보려면 Apps Script 스크립트 속성에 LUNCH_WELSTORY_USERNAME과 LUNCH_WELSTORY_PASSWORD를 등록해 주세요.';
const WELSTORY_NETWORK_ERROR = '웰스토리 식단 서버에 연결하지 못했어요. 잠시 후 다시 확인해 주세요.';

function welstoryError_(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
function welstoryHeader_(response, name) {
  const headers = response.getAllHeaders ? response.getAllHeaders() : {};
  const key = Object.keys(headers || {}).find(k => k.toLowerCase() === name);
  const value = key ? headers[key] : '';
  return String(Array.isArray(value) ? value[0] : value || '');
}
function welstoryCredentials_(properties) {
  const username = String(properties.getProperty(WELSTORY_USERNAME_PROPERTY) || '').trim();
  const password = String(properties.getProperty(WELSTORY_PASSWORD_PROPERTY) || '');
  if (!username || !password) throw welstoryError_('SETUP', WELSTORY_SETUP_ERROR);
  return { username: username, password: password };
}
function welstoryDeviceId_(properties) {
  let id = String(properties.getProperty(WELSTORY_DEVICE_PROPERTY) || '');
  if (!WELSTORY_DEVICE_ID.test(id)) {
    id = String(Utilities.getUuid()).toLowerCase();
    properties.setProperty(WELSTORY_DEVICE_PROPERTY, id);
  }
  return id;
}
function welstoryHeaders_(deviceId, token, extra) {
  const headers = { 'User-Agent': 'Welplus', 'X-Device-Id': deviceId, Accept: 'application/json' };
  if (token) headers.Authorization = token;
  Object.keys(extra || {}).forEach(k => { headers[k] = extra[k]; });
  return headers;
}
function welstoryTokenExpiry_(token) {
  try {
    const part = String(token).replace(/^Bearer\s+/i, '').split('.')[1] || '';
    const padded = part + '='.repeat((4 - part.length % 4) % 4);
    const exp = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(padded)).getDataAsString()).exp;
    return Number.isFinite(exp) && exp > 0 ? exp * 1000 : 0;
  } catch (_) { return 0; }
}
function welstorySessionRecord_(token, via) {
  const exp = welstoryTokenExpiry_(token);
  return { token: token, exp: exp > Date.now() ? exp : Date.now() + WELSTORY_DEFAULT_SESSION_MS, via: via, at: new Date().toISOString() };
}
function welstorySession_(properties) {
  let value = null;
  try { value = JSON.parse(properties.getProperty(WELSTORY_SESSION_PROPERTY) || 'null'); } catch (_) {}
  return value && typeof value.token === 'string' && value.token && Number.isFinite(value.exp) ? value : null;
}
// { until, reason: 'credentials' | 'server' }
function welstoryPauseState_(properties) {
  let value = null;
  try { value = JSON.parse(properties.getProperty(WELSTORY_PAUSE_PROPERTY) || 'null'); } catch (_) {}
  return value && Number.isFinite(value.until) && value.until > Date.now() ? value : null;
}
function welstoryPause_(properties, ms, reason) {
  properties.setProperty(WELSTORY_PAUSE_PROPERTY, JSON.stringify({ until: Date.now() + ms, reason: reason }));
}
function welstoryPausedError_(pause) {
  const time = Utilities.formatDate(new Date(pause.until), 'Asia/Seoul', 'HH:mm');
  if (pause.reason === 'server') return welstoryError_('LOGIN_PAUSED', '웰스토리 로그인 서버가 응답하지 않아 ' + time + ' 이후에 다시 시도해요.');
  return welstoryError_('LOGIN_PAUSED', '웰스토리 로그인이 거부되어 ' + time + '까지 다시 시도하지 않아요. 스크립트 속성의 아이디·비밀번호를 확인한 뒤 Apps Script에서 testWelstoryConnection을 실행해 주세요.');
}
function welstoryLogin_(properties, deviceId) {
  const pause = welstoryPauseState_(properties);
  if (pause) throw welstoryPausedError_(pause);
  const account = welstoryCredentials_(properties);
  let response;
  try {
    response = UrlFetchApp.fetch(WELSTORY_BASE + '/login', {
      method: 'post',
      contentType: 'application/x-www-form-urlencoded',
      payload: 'username=' + encodeURIComponent(account.username) + '&password=' + encodeURIComponent(account.password) + '&remember-me=false',
      headers: welstoryHeaders_(deviceId, '', { 'X-Autologin': 'N' }),
      muteHttpExceptions: true,
      followRedirects: false
    });
  } catch (_) { throw welstoryError_('NETWORK', WELSTORY_NETWORK_ERROR); }
  const status = response.getResponseCode(), token = welstoryHeader_(response, 'authorization').trim();
  if (status >= 200 && status < 300 && token) return welstorySessionRecord_(token, 'login');
  if (status >= 500 || status === 429) {
    welstoryPause_(properties, WELSTORY_SERVER_PAUSE_MS, 'server');
    throw welstoryError_('LOGIN_UNAVAILABLE', '웰스토리 로그인 서버가 응답하지 않았어요 (' + status + '). 5분 뒤 다시 시도해요.');
  }
  welstoryPause_(properties, WELSTORY_LOGIN_PAUSE_MS, 'credentials');
  throw welstoryError_('LOGIN_REJECTED', '웰스토리 로그인에 실패했어요 (' + status + '). 스크립트 속성의 아이디·비밀번호를 확인한 뒤 testWelstoryConnection을 실행해 주세요.');
}
function welstoryRefresh_(session, deviceId) {
  try {
    const response = UrlFetchApp.fetch(WELSTORY_BASE + '/session', { headers: welstoryHeaders_(deviceId, session.token), muteHttpExceptions: true, followRedirects: false });
    if (response.getResponseCode() !== 200) return null;
    const body = JSON.parse(response.getContentText() || 'null');
    return body && typeof body.data === 'string' && body.data.trim() ? welstorySessionRecord_(body.data.trim(), 'refresh') : null;
  } catch (_) { return null; }
}
// Returns a usable token. Logging in again can sign the same account out of the phone app,
// so an unexpired session is reused and renewed through /session before a full login.
function welstoryToken_(properties, deviceId, rejectedToken) {
  const usable = s => s && s.token !== rejectedToken && s.exp - Date.now() > WELSTORY_SESSION_MARGIN_MS;
  const current = welstorySession_(properties);
  if (usable(current)) return { token: current.token, fresh: false };
  // A user lock serializes logins (the web app always runs as its owner) without holding
  // the script lock that attendance writes wait on.
  const lock = LockService.getUserLock();
  if (!lock.tryLock(15000)) throw welstoryError_('BUSY', '다른 요청이 웰스토리에 로그인하는 중이에요. 잠시 후 다시 확인해 주세요.');
  try {
    const latest = welstorySession_(properties);
    if (usable(latest)) return { token: latest.token, fresh: false };
    let next = latest && latest.token !== rejectedToken && latest.exp > Date.now() ? welstoryRefresh_(latest, deviceId) : null;
    if (!next || next.token === rejectedToken) next = welstoryLogin_(properties, deviceId);
    properties.setProperty(WELSTORY_SESSION_PROPERTY, JSON.stringify(next));
    return { token: next.token, fresh: next.via === 'login' };
  } finally { lock.releaseLock(); }
}
function welstoryGet_(properties, deviceId, path, extraHeaders) {
  let rejected = '', emptyReplies = 0;
  for (let attempt = 0; attempt < 4; attempt++) {
    const session = welstoryToken_(properties, deviceId, rejected);
    let response;
    try {
      response = UrlFetchApp.fetch(WELSTORY_BASE + path, { headers: welstoryHeaders_(deviceId, session.token, extraHeaders), muteHttpExceptions: true, followRedirects: false });
    } catch (_) { throw welstoryError_('NETWORK', WELSTORY_NETWORK_ERROR); }
    const status = response.getResponseCode(), body = response.getContentText() || '';
    const html = /text\/html/i.test(welstoryHeader_(response, 'content-type')) || /^\s*<(?:!doctype html|html[\s>])/i.test(body);
    if (status === 401 || status === 403 || (status >= 300 && status < 400) || (status === 200 && html)) {
      properties.deleteProperty(WELSTORY_SESSION_PROPERTY);
      if (session.fresh) {
        // A token from a brand-new login was refused: stop instead of logging in again and again.
        welstoryPause_(properties, WELSTORY_LOGIN_PAUSE_MS, 'credentials');
        throw welstoryError_('AUTH_REJECTED', '웰스토리가 새 로그인 세션을 받지 않았어요. Apps Script에서 testWelstoryConnection을 실행해 원인을 확인해 주세요.');
      }
      rejected = session.token;
      continue;
    }
    if (status !== 200) throw welstoryError_('HTTP_' + status, '웰스토리 식단 서버가 요청을 처리하지 못했어요 (' + status + '). 잠시 후 다시 확인해 주세요.');
    if (!body.trim()) {
      // Welstory sometimes answers concurrent requests with an empty body.
      if (++emptyReplies >= 3) break;
      Utilities.sleep(300 * emptyReplies);
      continue;
    }
    try { return JSON.parse(body); } catch (_) { throw welstoryError_('INVALID_RESPONSE', '웰스토리 식단 응답 형식을 확인하지 못했어요.'); }
  }
  throw welstoryError_('EMPTY_RESPONSE', '웰스토리 식단 서버의 응답이 비어 있어요. 잠시 후 다시 확인해 주세요.');
}
function welstoryMealType_(properties, deviceId) {
  let saved = null;
  try { saved = JSON.parse(properties.getProperty(WELSTORY_MEAL_TYPE_PROPERTY) || 'null'); } catch (_) {}
  if (saved && /^\d{1,2}$/.test(saved.code) && Date.now() - Date.parse(saved.checkedAt) < 7 * 86400000) return saved.code;
  let raw;
  try {
    raw = welstoryGet_(properties, deviceId, '/api/menu/getMealTimeList', { Cookie: 'cafeteriaActiveId=' + LunchMenuSource.RESTAURANT_ID });
  } catch (error) {
    // Only a bad meal-time list falls back to the default lunch code; login and network problems surface as-is.
    if (!/^(?:HTTP_\d+|INVALID_RESPONSE|EMPTY_RESPONSE)$/.test(String(error && error.code || ''))) throw error;
    return LunchMenuSource.LUNCH_MEAL_TYPE;
  }
  const code = LunchMenuSource.lunchMealType(raw);
  properties.setProperty(WELSTORY_MEAL_TYPE_PROPERTY, JSON.stringify({ code: code, checkedAt: new Date().toISOString() }));
  return code;
}
function welstoryMenu_(date) {
  if (typeof LunchMenuSource === 'undefined') throw welstoryError_('SETUP', '공유 서버 코드에 menu-source.js가 빠졌어요. setup.html에서 코드를 다시 복사해 주세요.');
  const properties = PropertiesService.getScriptProperties();
  welstoryCredentials_(properties);
  const deviceId = welstoryDeviceId_(properties), mealType = welstoryMealType_(properties, deviceId);
  const raw = welstoryGet_(properties, deviceId, '/api/meal?menuDt=' + date.replace(/-/g, '') + '&menuMealType=' + encodeURIComponent(mealType) + '&restaurantCode=' + LunchMenuSource.RESTAURANT_ID);
  return LunchMenuSource.parseMealList(raw, date, mealType);
}
function welstoryMenuResponse_(date) {
  const cache = CacheService.getScriptCache(), cacheKey = WELSTORY_MENU_CACHE_PREFIX + date;
  try {
    const cached = JSON.parse(cache.get(cacheKey) || 'null');
    if (cached && cached.ok === true && cached.menu && cached.menu.date === date) return cached;
    if (cached && cached.ok === false && typeof cached.error === 'string') return cached;
  } catch (_) {}
  let result;
  try {
    result = { ok: true, menu: welstoryMenu_(date) };
  } catch (error) {
    const known = error && typeof error.code === 'string' && typeof error.message === 'string';
    result = { ok: false, reason: known && error.code === 'SETUP' ? 'setup' : 'provider', error: known ? error.message : WELSTORY_NETWORK_ERROR };
    if (!known) console.log('Lunch Club Welstory menu failed: ' + String(error && error.message || error).slice(0, 120));
  }
  // Setup errors are not cached, so the menu appears as soon as the account is registered.
  const ttl = result.ok ? (date < LunchCore.today() ? WELSTORY_PAST_MENU_TTL_SECONDS : WELSTORY_MENU_TTL_SECONDS) : WELSTORY_ERROR_TTL_SECONDS;
  if (result.ok || result.reason !== 'setup') {
    try { cache.put(cacheKey, JSON.stringify(result), ttl); } catch (_) {}
  }
  return result;
}
// Apps Script 편집기에서 직접 실행하는 연결 진단입니다. 비밀번호와 토큰은 로그에 쓰지 않습니다.
function testWelstoryConnection() {
  const properties = PropertiesService.getScriptProperties();
  properties.deleteProperty(WELSTORY_PAUSE_PROPERTY);
  properties.deleteProperty(WELSTORY_MEAL_TYPE_PROPERTY);
  welstoryCredentials_(properties);
  console.log('1) 웰스토리 계정 스크립트 속성: 확인됨');
  const deviceId = welstoryDeviceId_(properties);
  const before = welstorySession_(properties), session = welstoryToken_(properties, deviceId, '');
  const saved = welstorySession_(properties);
  console.log('2) 로그인 세션: ' + (session.fresh ? '새로 로그인' : before && before.token === session.token ? '기존 세션 재사용' : '세션 연장') +
    ' · 만료 예상 ' + Utilities.formatDate(new Date(saved ? saved.exp : Date.now()), 'Asia/Seoul', 'MM-dd HH:mm'));
  const mealType = welstoryMealType_(properties, deviceId);
  console.log('3) 점심 식사 코드: ' + mealType);
  let date = LunchCore.today();
  while (LunchCore.weekday(date) === 0 || LunchCore.weekday(date) === 6) date = LunchCore.shiftDate(date, 1);
  const menu = welstoryMenu_(date);
  CacheService.getScriptCache().remove(WELSTORY_MENU_CACHE_PREFIX + date);
  console.log('4) ' + date + ' ' + LunchMenuSource.RESTAURANT_NAME + ' 점심: ' + (menu.courses.length
    ? menu.courses.map(c => c.name + (c.takeout ? ' [테이크아웃]' : '') + (c.imageUrl ? ' (사진 있음)' : '')).join(' / ')
    : '아직 등록된 메뉴가 없어요.'));
  console.log('완료. 배포 > 배포 관리 > 새 버전으로 배포한 뒤 점심판을 새로고침하세요.');
}
