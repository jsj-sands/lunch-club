/* Welplan's documented, unauthenticated MCP API. Photos use provider URLs only.
 * API: https://welplan.pmh.codes/docs/api
 * Empty dishes mean a matching date/location explicitly returned no lunch menus.
 * Transport failures and an unexpected provider response always reject.
 */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.LunchMenuSource = api;
})(typeof globalThis !== 'undefined' ? globalThis : window, function (root) {
  'use strict';

  const ENDPOINT = 'https://welplan.pmh.codes/mcp';
  const RESTAURANT_ID = 'REST007327';
  const RESTAURANT_NAME = '메가존산학연센터';
  const TIMEOUT_MS = 15000;
  let requestSequence = 0;

  function failure(code, message) {
    const error = new Error(message);
    error.code = code;
    if (code === 'ABORTED') error.name = 'AbortError';
    return error;
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

  function sourceUrl(date) {
    return 'https://welplan.pmh.codes/restaurants/welstory/' + RESTAURANT_ID + '/' +
      encodeURIComponent(RESTAURANT_NAME) + '/' + dateKey(date).replace(/-/g, '');
  }

  function object(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function invalid() {
    return failure('INVALID_RESPONSE', '식단 응답 형식이 바뀌어 확인하지 못했어요. 원문을 확인해 주세요.');
  }

  function menuName(value) {
    if (typeof value !== 'string' || !value.trim()) throw invalid();
    return value.trim();
  }

  function validImageURL(value) {
    if (typeof value !== 'string' || !value || value.length > 2048 || /[\s\\<>"']/.test(value)) return false;
    const match = /^https:\/\/([^/?#]+)(\/[^?#]*)(?:\?([^#]*))?$/i.exec(value);
    if (!match || match[1].toLowerCase() !== 'img-welmenu.welstory.com') return false;
    // Verified Welstory recipe-photo host and path; no credentials, ports or traversal.
    if (!/^\/data\/manager\/recipe\/(?:[a-z0-9_-]+\/)+[a-z0-9_-]+\.(?:jpe?g|png|webp|gif)$/i.test(match[2])) return false;
    return match[3] === undefined || /^[a-z0-9._~!$&()*+,;=:@%/?-]*$/i.test(match[3]);
  }

  function parseResponse(envelope, requestedDate, expectedId) {
    const date = dateKey(requestedDate);
    if (!object(envelope) || envelope.jsonrpc !== '2.0') throw invalid();
    if (expectedId !== undefined && envelope.id !== expectedId) throw invalid();
    if (envelope.error) throw failure('PROVIDER_ERROR', '식단 제공처에서 조회 요청을 처리하지 못했어요.');
    const result = envelope.result;
    if (!object(result)) throw invalid();
    if (result.isError === true) throw failure('PROVIDER_ERROR', '식단 제공처에서 조회 요청을 처리하지 못했어요.');

    let payload = result.structuredContent;
    if (payload === undefined) {
      // MCP permits the same structured result encoded in a text content block.
      if (!Array.isArray(result.content)) throw invalid();
      const block = result.content.find(function (item) {
        return object(item) && item.type === 'text' && typeof item.text === 'string';
      });
      if (!block) throw invalid();
      try { payload = JSON.parse(block.text); } catch (_) { throw invalid(); }
    }
    if (!object(payload) || !object(payload.restaurant)) throw invalid();
    const restaurant = payload.restaurant;
    if (restaurant.id !== RESTAURANT_ID || restaurant.vendor !== 'welstory' ||
        restaurant.name !== RESTAURANT_NAME) {
      throw failure('LOCATION_MISMATCH', '다른 식당의 응답이어서 식단을 표시하지 않았어요.');
    }
    let receivedDate;
    try { receivedDate = dateKey(payload.date); } catch (_) { throw invalid(); }
    if (receivedDate !== date) {
      throw failure('DATE_MISMATCH', '요청한 날짜와 응답 날짜가 달라 식단을 표시하지 않았어요.');
    }
    if (!Array.isArray(payload.meals)) throw invalid();
    // An absent or malformed lunch block is not evidence of an unpublished menu.
    const lunches = payload.meals.filter(function (meal) { return object(meal) && meal.type === 'lunch'; });
    if (lunches.length !== 1 || !Array.isArray(lunches[0].menus)) throw invalid();
    const courses = lunches[0].menus.map(function (menu) {
      if (!object(menu)) throw invalid();
      const name = menuName(menu.name);
      // Composition and photos are optional details: a broken detail must not hide
      // an otherwise verified course. Keep all valid source names, including its main.
      const components = Array.isArray(menu.components) ? menu.components.filter(function (component) {
        return object(component) && typeof component.name === 'string' && component.name.trim();
      }).map(function (component) { return component.name.trim(); }) : [];
      const course = { name: name, components: components };
      if (validImageURL(menu.imageUrl)) course.imageUrl = menu.imageUrl;
      return course;
    });
    return {
      ok: true,
      date: date,
      dishes: Array.from(new Set(courses.map(function (course) { return course.name; }))),
      courses: courses,
      fetchedAt: new Date().toISOString(),
      source: sourceUrl(date)
    };
  }

  async function fetchDay(requestedDate, options) {
    const date = dateKey(requestedDate);
    const signal = (options || {}).signal;
    if (signal && signal.aborted) throw failure('ABORTED', '식단 조회를 취소했어요.');
    if (typeof root.fetch !== 'function' || typeof root.AbortController !== 'function') {
      throw failure('UNAVAILABLE', '현재 브라우저에서 식단을 불러올 수 없어요. 원문을 확인해 주세요.');
    }
    const controller = new root.AbortController();
    let timedOut = false;
    const cancel = function () { controller.abort(); };
    if (signal) signal.addEventListener('abort', cancel, { once: true });
    const timer = root.setTimeout(function () { timedOut = true; controller.abort(); }, TIMEOUT_MS);
    const id = ++requestSequence;
    try {
      const response = await root.fetch(ENDPOINT, {
        method: 'POST',
        mode: 'cors',
        credentials: 'omit',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json, text/event-stream'
        },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: id,
          method: 'tools/call',
          params: {
            name: 'get_restaurant_menu',
            arguments: { vendor: 'welstory', restaurantId: RESTAURANT_ID, date: date.replace(/-/g, '') }
          }
        }),
        signal: controller.signal
      });
      if (!response.ok) {
        const error = failure('HTTP_ERROR', '식단을 불러오지 못했어요. 잠시 후 다시 확인해 주세요.');
        error.status = response.status;
        error.retryAfter = response.headers && response.headers.get('Retry-After');
        throw error;
      }
      let envelope;
      try { envelope = await response.json(); } catch (error) {
        if (controller.signal.aborted) throw error;
        throw invalid();
      }
      if (controller.signal.aborted) throw failure('ABORTED', '식단 조회를 취소했어요.');
      return parseResponse(envelope, date, id);
    } catch (error) {
      if (signal && signal.aborted) throw failure('ABORTED', '식단 조회를 취소했어요.');
      if (timedOut) throw failure('TIMEOUT', '식단 응답이 늦어지고 있어요. 원문을 확인해 주세요.');
      if (error && error.code) throw error;
      throw failure('NETWORK_ERROR', '식단에 연결하지 못했어요. 네트워크나 원문을 확인해 주세요.');
    } finally {
      root.clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', cancel);
    }
  }

  return Object.freeze({ fetchDay: fetchDay, parseResponse: parseResponse, sourceUrl: sourceUrl, validImageURL: validImageURL });
});
