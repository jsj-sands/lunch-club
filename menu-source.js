/* 메가존산학연센터(삼성웰스토리) 점심 식단.
 * Welstory+ API는 회원 로그인이 필요하므로 팀 공유 서버(Apps Script, backend/welstory.js)만 호출합니다.
 * 이 파일은 브라우저와 Apps Script V8이 함께 사용합니다.
 * - Apps Script: parseMealList / lunchMealType으로 웰스토리 응답을 점심판 형식으로 정리합니다.
 * - 브라우저: fetchDay가 팀 키로 공유 서버에 요청하고, 돌아온 식단을 다시 검증합니다.
 * 사진은 공개 HTTPS 웰스토리 레시피 이미지 주소만 사용합니다.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LunchMenuSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const RESTAURANT_ID = 'REST007327';
  const RESTAURANT_NAME = '메가존산학연센터';
  // Welstory+ 식사 시간 코드: 1 아침, 2 점심, 3 저녁 (getMealTimeList로 다시 확인합니다).
  const LUNCH_MEAL_TYPE = '2';
  const IMAGE_HOST = 'img-welmenu.welstory.com';
  const MAX_DISHES = 120;
  const MAX_COURSES = 20;
  const MAX_COMPONENTS = 30;

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
  }

  function invalid() {
    return failure('INVALID_RESPONSE', '식단 응답 형식이 바뀌어 확인하지 못했어요. 웰스토리플러스 앱에서 확인해 주세요.');
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function text(value) {
    return typeof value === 'string' ? value.trim().replace(/\s+/g, ' ') : '';
  }

  function dateKey(value) {
    if (typeof value !== 'string' || !/^(?:\d{8}|\d{4}-\d{2}-\d{2})$/.test(value)) {
      throw failure('INVALID_DATE', '식단 날짜를 확인해 주세요.');
    }
    const compact = value.replace(/-/g, '');
    const iso = compact.slice(0, 4) + '-' + compact.slice(4, 6) + '-' + compact.slice(6, 8);
    const parsed = new Date(iso + 'T00:00:00.000Z');
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== iso) {
      throw failure('INVALID_DATE', '식단 날짜를 확인해 주세요.');
    }
    return iso;
  }

  function validImageURL(value) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\<>"']/.test(value)) return false;
    const match = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?([^#]*))?$/i.exec(value);
    if (!match || match[1].toLowerCase() !== IMAGE_HOST) return false;
    // Verified Welstory recipe-photo host and path; no credentials, ports or traversal.
    if (!/^\/data\/manager\/recipe\/(?:[a-z0-9_-]+\/)+[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(match[2])) return false;
    return match[3] === undefined || /^[a-z0-9._~!$&()*+,;=:@%/?-]*$/i.test(match[3]);
  }

  // Welstory gives a folder (photoUrl) and a file name (photoCd). Older responses use
  // http://samsungwelstory.com/...; the same recipe path is served over HTTPS by IMAGE_HOST.
  function imageURL(folder, file) {
    const base = text(folder), name = text(file);
    if (!base || !name) return '';
    const match = /^(?:https?:)?\/\/(?:www\.)?(?:samsungwelstory\.com|img-welmenu\.welstory\.com)(\/data\/manager\/recipe\/[^?#]*)$/i.exec(base);
    if (!match) return '';
    const url = 'https://' + IMAGE_HOST + match[1].replace(/\/?$/, '/') + name;
    return validImageURL(url) ? url : '';
  }

  // GET /api/menu/getMealTimeList -> { data: [{ code: '2', codeNm: '점심' }, ...] }
  function lunchMealType(raw) {
    const list = object(raw) && Array.isArray(raw.data) ? raw.data : raw;
    if (!Array.isArray(list)) return LUNCH_MEAL_TYPE;
    const lunch = list.find(function (item) {
      return object(item) && /^\d{1,2}$/.test(String(item.code)) && /점심|중식|lunch/i.test(text(item.codeNm));
    });
    return lunch ? String(lunch.code) : LUNCH_MEAL_TYPE;
  }

  function mealList(raw) {
    let payload = raw;
    if (typeof payload === 'string') {
      try { payload = JSON.parse(payload); } catch (_) { throw invalid(); }
    }
    if (!object(payload)) throw invalid();
    // Welstory wraps responses as { code, message, data: { mealList: [...] } }.
    const data = Object.prototype.hasOwnProperty.call(payload, 'data') ? payload.data : payload;
    if (!object(data) || !Array.isArray(data.mealList) || data.mealList.length > MAX_DISHES) throw invalid();
    return data.mealList;
  }

  function unique(values) {
    const seen = Object.create(null);
    return values.filter(function (value) {
      if (!value || seen[value]) return false;
      seen[value] = true;
      return true;
    });
  }

  // GET /api/meal?menuDt=YYYYMMDD&menuMealType=2&restaurantCode=REST007327
  // Each row is one dish; rows sharing hallNo + menuCourseType form one course.
  // An empty mealList for the requested date means no lunch is published yet.
  function parseMealList(raw, requestedDate, mealType) {
    const date = dateKey(requestedDate), compact = date.replace(/-/g, '');
    const wantedType = String(mealType || LUNCH_MEAL_TYPE);
    const groups = [], byKey = Object.create(null);
    mealList(raw).forEach(function (dish) {
      if (!object(dish) || !text(dish.menuName)) throw invalid();
      if (dish.restaurantCode !== undefined && dish.restaurantCode !== null &&
          String(dish.restaurantCode).toUpperCase() !== RESTAURANT_ID) {
        throw failure('LOCATION_MISMATCH', '다른 식당의 응답이어서 식단을 표시하지 않았어요.');
      }
      if (dish.menuDt !== undefined && dish.menuDt !== null && String(dish.menuDt).replace(/-/g, '') !== compact) {
        throw failure('DATE_MISMATCH', '요청한 날짜와 응답 날짜가 달라 식단을 표시하지 않았어요.');
      }
      if (dish.menuMealType !== undefined && dish.menuMealType !== null && String(dish.menuMealType) !== wantedType) return;
      const key = String(dish.hallNo || '') + '|' + String(dish.menuCourseType || '');
      if (!byKey[key]) { byKey[key] = []; groups.push(byKey[key]); }
      byKey[key].push(dish);
    });
    const courses = groups.slice(0, MAX_COURSES).map(function (dishes) {
      const main = dishes.find(function (dish) { return dish.typicalMenu === 'Y'; }) || dishes[0];
      const photo = [main].concat(dishes).map(function (dish) { return imageURL(dish.photoUrl, dish.photoCd); })
        .find(Boolean);
      const course = {
        name: text(main.menuName),
        components: unique([main].concat(dishes).map(function (dish) { return text(dish.menuName); })).slice(0, MAX_COMPONENTS)
      };
      if (photo) course.imageUrl = photo;
      if (dishes.some(function (dish) { return /^T/i.test(text(dish.salesType)); })) course.takeout = true;
      return course;
    });
    return {
      ok: true,
      date: date,
      dishes: unique(courses.map(function (course) { return course.name; })),
      courses: courses,
      fetchedAt: new Date().toISOString()
    };
  }

  // Re-validates a menu that came back from the team server before the page renders it.
  function cleanMenu(value, requestedDate) {
    const date = dateKey(requestedDate);
    if (!object(value) || value.date !== date || !Array.isArray(value.courses)) throw invalid();
    const courses = value.courses.slice(0, MAX_COURSES).map(function (course) {
      if (!object(course) || !text(course.name)) throw invalid();
      const result = {
        name: text(course.name),
        components: Array.isArray(course.components) ? unique(course.components.map(text)).slice(0, MAX_COMPONENTS) : []
      };
      if (validImageURL(course.imageUrl)) result.imageUrl = course.imageUrl;
      if (course.takeout === true) result.takeout = true;
      return result;
    });
    const fetched = Date.parse(value.fetchedAt);
    return {
      ok: true,
      date: date,
      dishes: unique(courses.map(function (course) { return course.name; })),
      courses: courses,
      fetchedAt: Number.isFinite(fetched) ? new Date(fetched).toISOString() : new Date().toISOString()
    };
  }

  // options.request(params) sends { action: 'menu', date } to the team server (JSONP in the page).
  async function fetchDay(requestedDate, options) {
    const date = dateKey(requestedDate);
    const request = (options || {}).request;
    if (typeof request !== 'function') {
      throw failure('NOT_CONNECTED', '메가존 식단은 팀 공유 연결 후 볼 수 있어요.');
    }
    let response;
    try {
      response = await request({ action: 'menu', date: date });
    } catch (error) {
      throw failure('NETWORK_ERROR', (error && error.message) || '공유 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요.');
    }
    if (!object(response)) throw invalid();
    if (response.ok !== true) {
      const message = typeof response.error === 'string' && response.error.trim()
        ? response.error.trim().slice(0, 240) : '메가존 식단을 불러오지 못했어요.';
      throw failure(response.reason === 'setup' ? 'SETUP_REQUIRED' : 'PROVIDER_ERROR', message);
    }
    return cleanMenu(response.menu, date);
  }

  return Object.freeze({
    RESTAURANT_ID: RESTAURANT_ID,
    RESTAURANT_NAME: RESTAURANT_NAME,
    LUNCH_MEAL_TYPE: LUNCH_MEAL_TYPE,
    dateKey: dateKey,
    validImageURL: validImageURL,
    imageURL: imageURL,
    lunchMealType: lunchMealType,
    parseMealList: parseMealList,
    cleanMenu: cleanMenu,
    fetchDay: fetchDay
  });
});
