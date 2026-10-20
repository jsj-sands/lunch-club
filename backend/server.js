/* Append this file after core.js and lunchtime-source.js to create the copy/paste Code.gs. */
const TEAM_KEY = '__TEAM_KEY__';
const DATA_PREFIX = 'LUNCH_DAY_';
const KEEP_DAYS = 90;
const MENU_IMAGE_PREFIX = 'LUNCH_MENU_IMAGE_';
const MENU_IMAGE_FOLDER_KEY = 'LUNCH_MENU_IMAGE_FOLDER';
const MENU_IMAGE_FOLDER_MARKER = 'SANDS_LUNCH_MENU_IMAGES_V1';
const MENU_IMAGE_FILE_MARKER = 'SANDS_LUNCH_MENU_IMAGE_V1:';
const MENU_IMAGE_MAX_BYTES = 1024 * 1024;
const MENU_IMAGE_MAX_REQUEST = 1572864;
const MENU_IMAGE_UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/;
const KAKAO_PROFILE_KEY = 'LUNCH_KAKAO_PROFILE';
const KAKAO_PROFILE_CACHE_KEY = 'lunch_kakao_profile_v1';
const KAKAO_PROFILE_TTL = 5 * 60000;
const KAKAO_PROFILE_MIN_INTERVAL = 60000;
const KAKAO_PROFILE_ERROR = '카카오 채널의 최신 프로필 사진을 가져오지 못했어요. 잠시 후 다시 확인하거나 카카오 원문을 열어 주세요.';

function initializeLunchClub() {
  if (!/^[a-f0-9]{48,64}$/.test(TEAM_KEY)) throw new Error('setup.html의 코드 복사 버튼으로 만든 코드를 붙여넣어 주세요.');
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    // Run again after upgrading: Apps Script must authorize Drive before deployment.
    menuImageFolder_(properties, properties.getProperties(), true);
    properties.setProperty('LUNCH_INSTALLED', new Date().toISOString());
  } finally { lock.releaseLock(); }
  UrlFetchApp.fetch('https://welplan.pmh.codes/api/health', { muteHttpExceptions: true });
  console.log('점심판 준비 완료. 배포 > 새 배포 > 웹 앱에서 실행 사용자: 나 / 액세스: 모든 사용자로 배포하세요.');
}

function output_(body, callback) {
  const text = JSON.stringify(body).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
  if (callback && /^lunchReply_[a-f0-9]{24}$/.test(callback)) return ContentService.createTextOutput(callback + '(' + text + ');').setMimeType(ContentService.MimeType.JAVASCRIPT);
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function authorized_(key) { return /^[a-f0-9]{48,64}$/.test(TEAM_KEY) && typeof key === 'string' && key === TEAM_KEY; }
function kakaoProfileRecord_(text) {
  let value = {}; try { value = JSON.parse(text || '{}') || {}; } catch (_) {}
  let profile = null;
  const p = value.profile, checked = p && typeof p.checkedAt === 'string' ? Date.parse(p.checkedAt) : NaN;
  if (typeof LunchKakaoSource !== 'undefined' && p && p.sourceUrl === LunchKakaoSource.SOURCE_URL && LunchKakaoSource.validImageURL(p.imageUrl) && Number.isFinite(checked) && checked <= Date.now() + 60000) {
    profile = { ok: true, sourceUrl: LunchKakaoSource.SOURCE_URL, imageUrl: p.imageUrl, checkedAt: new Date(checked).toISOString() };
  }
  const attempted = typeof value.attemptedAt === 'string' ? Date.parse(value.attemptedAt) : NaN;
  return { profile: profile, attemptedAt: Number.isFinite(attempted) && attempted <= Date.now() + 60000 ? new Date(attempted).toISOString() : null, requestId: typeof value.requestId === 'string' && MENU_IMAGE_UUID.test(value.requestId) ? value.requestId : '', pending: value.pending === true, error: typeof value.error === 'string' ? value.error.slice(0, 160) : '' };
}
function kakaoProfileReusable_(record, force) {
  const now = Date.now(), attempted = Date.parse(record.attemptedAt), checked = record.profile && Date.parse(record.profile.checkedAt);
  if (Number.isFinite(attempted) && now - attempted < KAKAO_PROFILE_MIN_INTERVAL) return true;
  return !force && !record.pending && !record.error && record.profile && now - checked < KAKAO_PROFILE_TTL;
}
function kakaoProfileResult_(record) {
  if (!record.profile && record.pending) return { ok: false, pending: true, retryAfter: 2, error: '카카오 프로필 사진을 확인하고 있어요. 잠시 후 다시 불러와 주세요.' };
  if (!record.profile) return { ok: false, error: record.error || KAKAO_PROFILE_ERROR };
  const profile = { ok: true, sourceUrl: record.profile.sourceUrl, imageUrl: record.profile.imageUrl, checkedAt: record.profile.checkedAt };
  if (record.error) profile.error = true;
  return { ok: true, profile: profile };
}
function cacheKakaoProfile_(record) {
  try { CacheService.getScriptCache().put(KAKAO_PROFILE_CACHE_KEY, JSON.stringify(record), record.error || record.pending ? 60 : 300); } catch (_) {}
}
function kakaoProfileResponse_(force) {
  if (typeof LunchKakaoSource === 'undefined') return { ok: false, error: '카카오 자동 식단 기능을 사용하려면 공유 서버 코드를 최신 버전으로 업데이트해 주세요.' };
  if (!force) {
    try {
      const cached = kakaoProfileRecord_(CacheService.getScriptCache().get(KAKAO_PROFILE_CACHE_KEY));
      if (kakaoProfileReusable_(cached, false)) return kakaoProfileResult_(cached);
    } catch (_) {}
  }
  const properties = PropertiesService.getScriptProperties(), lock = LockService.getScriptLock();
  let record = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]), requestId;
  if (kakaoProfileReusable_(record, force)) return kakaoProfileResult_(record);
  try {
    // Reserve a request briefly; external network I/O must not hold up attendance writes.
    lock.waitLock(1000);
    try {
      record = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]);
      if (kakaoProfileReusable_(record, force)) return kakaoProfileResult_(record);
      requestId = Utilities.getUuid();
      record.attemptedAt = new Date().toISOString(); record.requestId = requestId; record.pending = true;
      properties.setProperty(KAKAO_PROFILE_KEY, JSON.stringify(record));
    } finally { lock.releaseLock(); }
    let profile = null, error = '';
    try {
      const response = UrlFetchApp.fetch(LunchKakaoSource.HOME_ENDPOINT, { headers: LunchKakaoSource.REQUEST_HEADERS, muteHttpExceptions: true, followRedirects: false, timeoutSeconds: 12 });
      if (response.getResponseCode() !== 200) throw new Error('source status');
      const headers = response.getAllHeaders(), header = name => {
        const key = Object.keys(headers).find(k => k.toLowerCase() === name);
        const value = key ? headers[key] : ''; return String(Array.isArray(value) ? value[0] : value);
      };
      if (header('content-type').split(';')[0].trim().toLowerCase() !== 'application/json') throw new Error('source content type');
      const maxBytes = Math.min(LunchKakaoSource.MAX_RESPONSE_BYTES, 512 * 1024), length = Number(header('content-length'));
      if (Number.isFinite(length) && length > maxBytes) throw new Error('source size');
      const raw = response.getContentText();
      if (typeof raw !== 'string' || raw.length > maxBytes || Utilities.newBlob(raw).getBytes().length > maxBytes) throw new Error('source size');
      const normalized = LunchKakaoSource.normalizeProfile(raw);
      profile = { ok: true, sourceUrl: normalized.sourceUrl, imageUrl: normalized.imageUrl, checkedAt: new Date().toISOString() };
    } catch (_) { error = KAKAO_PROFILE_ERROR; }
    lock.waitLock(1000);
    try {
      const latest = kakaoProfileRecord_(properties.getProperties()[KAKAO_PROFILE_KEY]);
      // If an execution outlives the minimum interval, its late result cannot replace a newer request.
      if (latest.requestId !== requestId) return kakaoProfileResult_(latest);
      record = latest;
      if (profile) record.profile = profile;
      record.pending = false; record.error = error;
      properties.setProperty(KAKAO_PROFILE_KEY, JSON.stringify(record));
      cacheKakaoProfile_(record);
      return kakaoProfileResult_(record);
    } finally { lock.releaseLock(); }
  } catch (_) {
    return kakaoProfileResult_({ profile: record.profile, pending: false, error: KAKAO_PROFILE_ERROR });
  }
}
function menuImageSlot_(date, scope) {
  if (!LunchCore.validDate(date) || !['day', 'week'].includes(scope)) throw new Error('식단 이미지 날짜와 적용 범위를 확인해 주세요.');
  const start = scope === 'week' ? LunchCore.weekDates(date)[0] : date;
  return { key: scope + ':' + start, property: MENU_IMAGE_PREFIX + scope + '_' + start, scope: scope, date: start, startDate: start, endDate: scope === 'week' ? LunchCore.shiftDate(start, 6) : start };
}
function menuImageEntry_(all, slot) {
  if (!all[slot.property]) return null;
  let entry; try { entry = JSON.parse(all[slot.property]); } catch (_) { throw new Error('저장된 식단 이미지 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.'); }
  if (!entry || !MENU_IMAGE_UUID.test(entry.id || '') || entry.scope !== slot.scope || entry.date !== slot.date || entry.startDate !== slot.startDate || entry.endDate !== slot.endDate || typeof entry.fileId !== 'string' || !entry.fileId || typeof entry.folderId !== 'string' || !entry.folderId || !['image/jpeg', 'image/png', 'image/webp'].includes(entry.mimeType) || !Number.isInteger(entry.size) || entry.size < 1 || entry.size > MENU_IMAGE_MAX_BYTES) throw new Error('저장된 식단 이미지 정보를 확인하지 못했어요. 운영자에게 문의해 주세요.');
  return entry;
}
function publicMenuImage_(entry) {
  if (!entry) return null;
  const value = {};
  ['id', 'scope', 'date', 'startDate', 'endDate', 'name', 'mimeType', 'size', 'uploadedBy', 'uploadedAt'].forEach(k => { value[k] = entry[k]; });
  return value;
}
function menuImageState_(all, date, dates) {
  const slots = [menuImageSlot_(date, 'week')].concat(dates.map(d => menuImageSlot_(d, 'day'))), images = {};
  slots.forEach(slot => { const entry = menuImageEntry_(all, slot); if (entry) images[slot.key] = publicMenuImage_(entry); });
  return images;
}
function imageStorageError_() {
  return new Error('식단 이미지 저장소에 접근하지 못했어요. 운영자가 Apps Script에서 initializeLunchClub을 다시 실행해 Drive 권한을 허용한 뒤 새 버전으로 배포해 주세요.');
}
function menuImageFolder_(properties, all, create) {
  try {
    let folder;
    if (all[MENU_IMAGE_FOLDER_KEY]) {
      folder = DriveApp.getFolderById(all[MENU_IMAGE_FOLDER_KEY]);
      if (folder.isTrashed() || folder.getDescription() !== MENU_IMAGE_FOLDER_MARKER || folder.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('unavailable dedicated folder');
      return folder;
    }
    if (!create) throw new Error('folder not initialized');
    folder = DriveApp.createFolder('SANDS Lunch Club · 런치타임 식단');
    folder.setDescription(MENU_IMAGE_FOLDER_MARKER);
    // PRIVATE + VIEW is valid; PRIVATE + NONE is not supported by DriveApp.
    folder.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    properties.setProperty(MENU_IMAGE_FOLDER_KEY, folder.getId());
    all[MENU_IMAGE_FOLDER_KEY] = folder.getId();
    return folder;
  } catch (_) { throw imageStorageError_(); }
}
function menuImageSignature_(bytes, mime) {
  const b = i => (bytes[i] + 256) % 256;
  const is = (at, values) => values.every((n, i) => b(at + i) === n);
  if (mime === 'image/png') return bytes.length >= 24 && is(0, [137, 80, 78, 71, 13, 10, 26, 10]) && is(8, [0, 0, 0, 13, 73, 72, 68, 82]);
  if (mime === 'image/jpeg') return bytes.length >= 12 && is(0, [255, 216, 255]) && is(bytes.length - 2, [255, 217]);
  if (mime === 'image/webp') {
    const size = b(4) + b(5) * 256 + b(6) * 65536 + b(7) * 16777216;
    return bytes.length >= 20 && is(0, [82, 73, 70, 70]) && is(8, [87, 69, 66, 80]) && size === bytes.length - 8 && (is(12, [86, 80, 56, 32]) || is(12, [86, 80, 56, 76]) || is(12, [86, 80, 56, 88]));
  }
  return false;
}
function decodeMenuImage_(dataUrl) {
  if (typeof dataUrl !== 'string' || dataUrl.length > 4 * Math.ceil(MENU_IMAGE_MAX_BYTES / 3) + 32) throw new Error('식단 이미지는 압축 후 1MB 이하로 올려 주세요.');
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(dataUrl);
  if (!match || match[2].length % 4 !== 0) throw new Error('JPG·PNG·WEBP 형식의 식단 사진을 선택해 주세요.');
  const base64 = match[2], padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if (base64.length / 4 * 3 - padding > MENU_IMAGE_MAX_BYTES) throw new Error('식단 이미지는 압축 후 1MB 이하로 올려 주세요.');
  let bytes;
  try { bytes = Utilities.base64Decode(base64); } catch (_) { throw new Error('이미지 파일을 읽지 못했어요. 사진을 다시 선택해 주세요.'); }
  if (!bytes.length || Utilities.base64Encode(bytes) !== base64 || !menuImageSignature_(bytes, match[1])) throw new Error('이미지 형식과 파일 내용이 맞지 않아요. JPG·PNG·WEBP 사진을 다시 선택해 주세요.');
  return { bytes: bytes, mimeType: match[1] };
}
function menuImageTag_(entry) {
  return MENU_IMAGE_FILE_MARKER + JSON.stringify({ id: entry.id, slot: entry.scope + ':' + entry.date, endDate: entry.endDate, folderId: entry.folderId });
}
function ownsMenuImageFile_(file, entry, folderId) {
  if (entry.folderId !== folderId || file.getDescription() !== menuImageTag_(entry)) return false;
  const parents = file.getParents();
  while (parents.hasNext()) if (parents.next().getId() === folderId) return true;
  return false;
}
function retireMenuImage_(entry, all) {
  try {
    const file = DriveApp.getFileById(entry.fileId);
    if (ownsMenuImageFile_(file, entry, all[MENU_IMAGE_FOLDER_KEY]) && !file.isTrashed()) file.setTrashed(true);
    return true;
  } catch (_) { return false; } // Leave inaccessible files for a later retention sweep.
}
function uploadMenuImage_(properties, all, date, op) {
  const p = op.payload || {}, slot = menuImageSlot_(date, p.scope), previous = menuImageEntry_(all, slot);
  // This also recovers a request whose metadata was saved before its receipt write failed.
  if (previous && previous.operationId === op.id && previous.operationDate === date && previous.uploadedBy === op.actor) return;
  if (typeof p.expectedImageId !== 'string' || (p.expectedImageId !== '' && !MENU_IMAGE_UUID.test(p.expectedImageId))) throw new Error('식단 이미지를 새로고침한 뒤 다시 올려 주세요.');
  if (p.expectedImageId !== (previous ? previous.id : '')) throw new Error('다른 멤버가 식단 이미지를 먼저 바꿨어요. 새로고침 후 새 이미지를 확인하고 다시 올려 주세요.');
  const decoded = decodeMenuImage_(p.dataUrl), folder = menuImageFolder_(properties, all, true);
  const name = typeof p.name === 'string' ? p.name.replace(/[\u0000-\u001f\u007f/\\]/g, '').trim().slice(0, 100) : '';
  const entry = { id: Utilities.getUuid(), scope: slot.scope, date: slot.date, startDate: slot.startDate, endDate: slot.endDate, name: name || '런치타임 식단', mimeType: decoded.mimeType, size: decoded.bytes.length, uploadedBy: op.actor, uploadedAt: new Date().toISOString(), operationId: op.id, operationDate: date, folderId: folder.getId() };
  const extension = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }[entry.mimeType];
  let file;
  try {
    file = folder.createFile(Utilities.newBlob(decoded.bytes, entry.mimeType, 'LunchMenu_' + entry.scope + '_' + entry.date + '_' + entry.id + '.' + extension));
    file.setDescription(menuImageTag_(entry));
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW);
    entry.fileId = file.getId();
    properties.setProperty(slot.property, JSON.stringify(entry));
    all[slot.property] = JSON.stringify(entry);
  } catch (_) {
    if (file) { try { file.setTrashed(true); } catch (_) {} }
    throw imageStorageError_();
  }
  // Old binary data is retired only after the new slot has been published successfully.
  if (previous) retireMenuImage_(previous, all);
}
function deleteMenuImage_(properties, all, date, op) {
  const p = op.payload || {}, slot = menuImageSlot_(date, p.scope);
  if (typeof p.expectedImageId !== 'string' || !MENU_IMAGE_UUID.test(p.expectedImageId)) throw new Error('삭제할 식단 이미지를 새로고침한 뒤 다시 확인해 주세요.');
  const entry = menuImageEntry_(all, slot);
  // An empty slot is already in the requested state, including a retry after receipt saving failed.
  if (!entry) return;
  if (entry.id !== p.expectedImageId) throw new Error('다른 멤버가 식단 이미지를 먼저 바꿨어요. 새로고침 후 현재 이미지를 확인하고 다시 삭제해 주세요.');
  let file, wasTrashed;
  try {
    const folder = menuImageFolder_(properties, all, false);
    file = DriveApp.getFileById(entry.fileId);
    if (!ownsMenuImageFile_(file, entry, folder.getId())) throw new Error('not an owned menu image');
    wasTrashed = file.isTrashed();
    if (!wasTrashed) file.setTrashed(true);
  } catch (_) { throw imageStorageError_(); }
  try {
    properties.deleteProperty(slot.property);
    delete all[slot.property];
  } catch (_) {
    // Keep the original visible image when metadata removal fails. If restoration also
    // fails, a new delete request can finish removing this same, already-trashed image.
    if (!wasTrashed) { try { file.setTrashed(false); } catch (_) {} }
    throw new Error('식단 이미지 삭제를 완료하지 못했어요. 새로고침한 뒤 다시 삭제해 주세요. 계속 실패하면 운영자에게 문의해 주세요.');
  }
}
function menuImageResponse_(date, scope, imageId) {
  if (!MENU_IMAGE_UUID.test(imageId || '')) throw new Error('식단 이미지를 새로고침한 뒤 다시 열어 주세요.');
  const slot = menuImageSlot_(date, scope), lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), entry = menuImageEntry_(all, slot);
    if (!entry || entry.id !== imageId) throw new Error('식단 이미지가 바뀌었어요. 새로고침한 후 다시 열어 주세요.');
    let bytes;
    try {
      const folder = menuImageFolder_(properties, all, false), file = DriveApp.getFileById(entry.fileId);
      if (file.isTrashed() || !ownsMenuImageFile_(file, entry, folder.getId()) || file.getSize() !== entry.size || file.getMimeType() !== entry.mimeType || file.getSharingAccess() !== DriveApp.Access.PRIVATE) throw new Error('unavailable image');
      bytes = file.getBlob().getBytes();
      if (bytes.length !== entry.size || !menuImageSignature_(bytes, entry.mimeType)) throw new Error('invalid image');
    } catch (_) { throw imageStorageError_(); }
    return { ok: true, image: Object.assign(publicMenuImage_(entry), { dataUrl: 'data:' + entry.mimeType + ';base64,' + Utilities.base64Encode(bytes) }) };
  } finally { lock.releaseLock(); }
}
function pruneMenuImages_(properties, all, keepDate) {
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd'), cutoff = LunchCore.shiftDate(today, -KEEP_DAYS);
  const keep = [menuImageSlot_(keepDate, 'day').key, menuImageSlot_(keepDate, 'week').key];
  Object.keys(all).forEach(key => {
    const match = /^LUNCH_MENU_IMAGE_(day|week)_(20\d{2}-\d{2}-\d{2})$/.exec(key);
    if (!match || !LunchCore.validDate(match[2])) return;
    const slot = menuImageSlot_(match[2], match[1]);
    if (key !== slot.property || keep.includes(slot.key) || slot.endDate >= cutoff) return;
    let entry; try { entry = menuImageEntry_(all, slot); } catch (_) { return; }
    if (!entry || retireMenuImage_(entry, all)) { properties.deleteProperty(key); delete all[key]; }
  });
  // At most once per day, retire old owned leftovers from interrupted requests.
  if (!all[MENU_IMAGE_FOLDER_KEY] || all.LUNCH_MENU_IMAGE_LAST_PRUNE === today) return;
  try {
    const folder = menuImageFolder_(properties, all, false), files = folder.getFiles();
    while (files.hasNext()) {
      const file = files.next(), description = file.getDescription();
      if (!description.startsWith(MENU_IMAGE_FILE_MARKER)) continue;
      let tag; try { tag = JSON.parse(description.slice(MENU_IMAGE_FILE_MARKER.length)); } catch (_) { continue; }
      const match = /^(day|week):(20\d{2}-\d{2}-\d{2})$/.exec(tag.slot || '');
      if (!match || !MENU_IMAGE_UUID.test(tag.id || '') || !LunchCore.validDate(match[2]) || tag.folderId !== folder.getId()) continue;
      const slot = menuImageSlot_(match[2], match[1]);
      if (slot.key !== tag.slot || tag.endDate !== slot.endDate || slot.endDate >= cutoff || keep.includes(slot.key)) continue;
      // Only files created by this feature in this dedicated folder have this exact tag.
      if (file.getDateCreated().getTime() < Date.parse(cutoff + 'T00:00:00+09:00')) file.setTrashed(true);
    }
    properties.setProperty('LUNCH_MENU_IMAGE_LAST_PRUNE', today);
  } catch (_) { /* Image housekeeping must not block votes when Drive is unavailable. */ }
}
function getConfig_(all) {
  let value = {}; try { value = JSON.parse(all.LUNCH_CONFIG || '{}'); } catch (_) {}
  return { settings: LunchCore.settings(value.settings), revision: Number.isInteger(value.revision) ? value.revision : 0 };
}
function getRecord_(all, date) {
  const prefix = DATA_PREFIX + date;
  if (!all[prefix]) return { data: LunchCore.emptyDay(), receipts: {} };
  const meta = JSON.parse(all[prefix]);
  let json = ''; for (let i = 0; i < meta.parts; i++) {
    const part = all[prefix + '_' + meta.generation + '_' + i];
    if (typeof part !== 'string') throw new Error('저장 기록을 읽는 중입니다. 잠시 후 다시 시도해 주세요.');
    json += part;
  }
  const result = JSON.parse(json); result.data = LunchCore.cleanDay(result.data); result.receipts = result.receipts || {}; return result;
}
function saveRecord_(properties, all, date, record) {
  const json = JSON.stringify(record);
  if (Utilities.newBlob(json).getBytes().length > 42000) throw new Error('하루 기록이 너무 큽니다. 긴 지도 링크나 메뉴 메모를 줄여 주세요.');
  const chars = Array.from(json), prefix = DATA_PREFIX + date, generation = Utilities.getUuid().replace(/-/g, '').slice(0, 12), values = {};
  const parts = Math.ceil(chars.length / 1500);
  values[prefix] = JSON.stringify({ parts: parts, generation: generation });
  for (let i = 0; i < parts; i++) values[prefix + '_' + generation + '_' + i] = chars.slice(i * 1500, (i + 1) * 1500).join('');
  properties.setProperties(values, false);
  // Readers use one getProperties snapshot; old generations are removed after publishing metadata.
  Object.keys(all).filter(k => k.startsWith(prefix + '_')).forEach(k => properties.deleteProperty(k));
}
function prune_(properties, all, keepDate) {
  const today = Utilities.formatDate(new Date(), 'Asia/Seoul', 'yyyy-MM-dd');
  const cutoff = LunchCore.shiftDate(today, -KEEP_DAYS);
  const dates = Object.keys(all).filter(k => /^LUNCH_DAY_20\d{2}-\d{2}-\d{2}$/.test(k)).map(k => k.slice(DATA_PREFIX.length)).sort();
  dates.filter((date, i) => date !== keepDate && (date < cutoff || i < dates.length - 89)).forEach(date => {
    const prefix = DATA_PREFIX + date;
    Object.keys(all).filter(k => k === prefix || k.startsWith(prefix + '_')).forEach(k => properties.deleteProperty(k));
  });
  pruneMenuImages_(properties, all, keepDate);
}
function stateResponse_(date, receiptId) {
  const all = PropertiesService.getScriptProperties().getProperties(), cfg = getConfig_(all), dates = LunchCore.weekDates(date);
  if (!dates.includes(date)) dates.push(date);
  const days = {}; dates.forEach(d => { days[d] = getRecord_(all, d).data; });
  const receipt = receiptId ? getRecord_(all, date).receipts[receiptId] || null : null;
  return { ok: true, serverVersion: 4, features: { menuImages: true, menuImageDelete: true, explicitAttendance: true, lunchPairs: true, kakaoProfile: true, ceoVenue: true }, days: days, menuImages: menuImageState_(all, date, dates), settings: cfg.settings, configRevision: cfg.revision, receipt: receipt, serverTime: new Date().toISOString() };
}
function menuResponse_(date) {
  const cache = CacheService.getScriptCache(), cacheKey = 'menu_' + date;
  const previous = cache.get(cacheKey); if (previous) return { ok: true, menu: JSON.parse(previous) };
  const url = LunchCore.menuUrl(date);
  const response = UrlFetchApp.fetch(url, { headers: { Accept: 'text/markdown' }, muteHttpExceptions: true, followRedirects: true });
  if (response.getResponseCode() !== 200) throw new Error('식단 원본에 연결하지 못했어요. 원문 식단에서 확인해 주세요.');
  const text = response.getContentText();
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  if (!text.includes(y + '년 ' + m + '월 ' + d + '일') || !text.includes('메가존산학연센터') || !text.includes('- Vendor:')) throw new Error('선택한 날짜의 식단 원문을 확인하지 못했어요.');
  const menu = { date: date, dishes: LunchCore.parseMenuMarkdown(text), fetchedAt: new Date().toISOString(), source: url };
  cache.put(cacheKey, JSON.stringify(menu), 600);
  return { ok: true, menu: menu };
}
function doGet(e) {
  const p = (e || {}).parameter || {}, callback = p.callback || '';
  try {
    if (callback && !/^lunchReply_[a-f0-9]{24}$/.test(callback)) return output_({ ok: false, error: '콜백 형식이 올바르지 않습니다.' });
    if (!authorized_(p.key)) return output_({ ok: false, error: '팀 키가 맞지 않아요. 초대 링크 또는 연결 설정을 확인해 주세요.' }, callback);
    if (p.action === 'kakaoProfile') return output_(kakaoProfileResponse_(p.force === '1'), callback);
    if (!LunchCore.validDate(p.date)) return output_({ ok: false, error: '날짜 형식이 올바르지 않습니다.' }, callback);
    if (p.action === 'menu') return output_(menuResponse_(p.date), callback);
    if (p.action === 'menuImage') return output_(menuImageResponse_(p.date, p.scope, p.imageId), callback);
    if (p.action === 'state') return output_(stateResponse_(p.date, p.receipt), callback);
    return output_({ ok: false, error: '지원하지 않는 조회입니다.' }, callback);
  } catch (error) { return output_({ ok: false, error: error.message || '조회에 실패했어요. 다시 시도해 주세요.' }, callback); }
}
function doPost(e) {
  let lock;
  try {
    const raw = e && e.postData && e.postData.contents;
    if (typeof raw !== 'string' || !raw || raw.length > MENU_IMAGE_MAX_REQUEST) throw new Error('요청 크기가 올바르지 않습니다.');
    const body = JSON.parse(raw);
    if ((!body.op || body.op.type !== 'menuImageUpload') && raw.length > 10000) throw new Error('요청 크기가 올바르지 않습니다.');
    if (body.op && body.op.type === 'menuImageUpload' && Utilities.newBlob(raw).getBytes().length > MENU_IMAGE_MAX_REQUEST) throw new Error('요청 크기가 올바르지 않습니다.');
    if (!authorized_(body.key)) throw new Error('팀 키가 맞지 않습니다.');
    if (!LunchCore.validDate(body.date) || !body.op || !/^[a-f0-9]{24}$/.test(body.op.id || '')) throw new Error('요청 형식이 올바르지 않습니다.');
    if (!LunchCore.MEMBERS.some(m => m.id === body.op.actor)) throw new Error('멤버가 올바르지 않습니다.');
    lock = LockService.getScriptLock(); lock.waitLock(20000);
    const properties = PropertiesService.getScriptProperties(), all = properties.getProperties(), cfg = getConfig_(all), record = getRecord_(all, body.date);
    if (record.receipts[body.op.id]) return output_({ ok: true, duplicate: true });
    let receipt;
    try {
      if (body.op.type === 'menuImageUpload') uploadMenuImage_(properties, all, body.date, body.op);
      else if (body.op.type === 'menuImageDelete') deleteMenuImage_(properties, all, body.date, body.op);
      else if (body.op.type === 'settings') {
        const p = body.op.payload || {};
        if (body.configRevision !== cfg.revision) throw new Error('다른 멤버가 기본 일정을 먼저 바꿨어요. 설정을 다시 열어 저장해 주세요.');
        if (!LunchCore.validDate(p.scheduleEnd) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.meetingTime || '') || !p.ceoDays) throw new Error('기본 일정 정보를 확인해 주세요.');
        const newConfig = { settings: LunchCore.settings(p), revision: cfg.revision + 1 };
        properties.setProperty('LUNCH_CONFIG', JSON.stringify(newConfig));
      } else record.data = LunchCore.applyOperation(record.data, body.date, cfg.settings, body.op, new Date().toISOString());
      receipt = { ok: true, at: new Date().toISOString() };
    } catch (error) { receipt = { ok: false, error: String(error.message).slice(0, 160), at: new Date().toISOString() }; }
    const ids = Object.keys(record.receipts); while (ids.length >= 16) delete record.receipts[ids.shift()];
    record.receipts[body.op.id] = receipt;
    // A confirmed image deletion must affect only that image, even if other slots are old.
    if (body.op.type !== 'menuImageDelete') prune_(properties, all, body.date);
    saveRecord_(properties, all, body.date, record);
    return output_({ ok: true, accepted: true });
  } catch (error) { return output_({ ok: false, error: error.message || '저장하지 못했어요. 다시 시도해 주세요.' }); }
  finally { if (lock && lock.hasLock()) lock.releaseLock(); }
}
