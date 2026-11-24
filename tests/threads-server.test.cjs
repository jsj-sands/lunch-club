const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');

const KEY='a'.repeat(48), DATE='2026-11-24', NOW='2026-11-24T04:00:00.000Z';
const PHOTO='https://img.cdninstagram.com/menus/gangnambab-1124.jpg';
const POST='https://www.threads.com/@gangnambab/post/ABC123x';
function rss(date=NOW, title='오늘의 메뉴표', image=PHOTO) {
 return '<rss version="2.0"><channel><title>강남밥상</title><item>'+
   '<title>'+title+'</title><link>'+POST+'</link><pubDate>'+new Date(date).toUTCString()+'</pubDate>'+
   '<description><![CDATA[<p>메뉴 공지</p><img src="'+image+'">]]></description></item></channel></rss>';
}
const response=(body, status=200)=>({getResponseCode:()=>status,getContentText:()=>body});
function harness() {
 const store={},cached=new Map(),requests=[];
 let now=Date.parse(NOW),handler=()=>response(rss()),locked=false;
 class Clock extends Date{constructor(...a){super(...(a.length?a:[now]));}static now(){return now;}}
 const props={getProperties:()=>({...store}),setProperty(k,v){store[k]=v;return this;},
  setProperties(v){Object.assign(store,v);return this;},deleteProperty(k){delete store[k];return this;}};
 const context=vm.createContext({console,Date:Clock,Intl,
  Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(String(s))}),getUuid:()=>crypto.randomUUID(),
    formatDate:()=>DATE},
  PropertiesService:{getScriptProperties:()=>props},
  CacheService:{getScriptCache:()=>({get(k){const x=cached.get(k);return x&&x.expires>now?x.value:null;},
    put(k,value,seconds){cached.set(k,{value,expires:now+seconds*1000});}})},
  LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},
    releaseLock(){locked=false;},hasLock:()=>locked})},
  ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:content=>({
    text:content,setMimeType(type){this.mime=type;return this;}})},
  UrlFetchApp:{fetch(url,opts){assert.equal(locked,false);requests.push({url,opts});return handler(url,opts);}}
 });
 const source=['core.js','lunchtime-source.js','threads-menu-source.js','backend/server.js']
  .map(f=>fs.readFileSync(path.join(__dirname,'..',f),'utf8')).join('\n')
  .replace("'__TEAM_KEY__'", "'"+KEY+"'");
 vm.runInContext(source,context);
 const raw=(p={})=>context.doGet({parameter:{action:'gangnamMenu',key:KEY,date:DATE,...p}});
 const get=p=>JSON.parse(raw(p).text);
 const state=()=>get({action:'state'});
 return {store,requests,cached,raw,get,state,
  advance:ms=>{now+=ms;},setHandler:fn=>{handler=fn;},locked:()=>locked};
}
test('강남밥상 조회를 팀 공유에서 지원하고 공개 RSS 이미지 1장만 유효 날짜에 표시한다',()=>{
 const s=harness();
 assert.equal(s.state().features.gangnamMenu,true);
 const v=s.get();
 assert.equal(v.ok,true);
 assert.equal(v.date,DATE);
 assert.equal(v.kind,'image');
 assert.equal(v.imageUrl,PHOTO);
 assert.equal(v.postUrl,POST);
 assert.equal(v.version,'20261124-threads-rss-restored');
 assert.equal(v.diagnostics.validMediaPosts,1);
 assert.equal(s.requests.length,1);
 assert.equal(s.requests[0].url,'https://rsshub.gneko.io/threads/gangnambab');
 assert.equal(s.requests[0].opts.followRedirects,false);
 assert.equal(s.requests[0].opts.timeoutSeconds,10);
 assert.equal(s.locked(),false);
 assert.ok(!JSON.stringify(s.requests).includes(KEY));
});
test('캐시 3분, 강제 새로고침 최소 1분 유지, 토큰·본문을 속성에 저장하지 않는다',()=>{
 const s=harness();s.get();
 s.advance(20000);s.get({force:'1'});
 assert.equal(s.requests.length,1);
 s.advance(41000);s.get({force:'1'});
 assert.equal(s.requests.length,2);
 s.get();assert.equal(s.requests.length,2);
 assert.deepEqual(Object.keys(s.store),[]);
 assert.equal(JSON.stringify([...s.cached.values()]).includes('<rss'),false);
});
test('첫 피드 HTTP 403이면 두 번째 피드를 시도하고, 실패 세부 정보만 표시한다',()=>{
 const s=harness();
 s.setHandler((url)=>url.includes('gneko.io')?response('forbidden',403):response(rss()));
 const success=s.get();
 assert.equal(success.ok,true);
 assert.equal(s.requests.length,2);
 assert.equal(success.diagnostics.attempts[0].code,'http_403');
 assert.equal(success.diagnostics.attempts[1].code,'parsed');
 const f=harness();
 f.setHandler(()=>response('<html><body>blocked</body></html>'));
 const result=f.get();
 assert.equal(result.ok,false);assert.equal(result.reason,'feed_unavailable');
 assert.equal(result.diagnostics.attempts.length,2);
 assert.equal(result.diagnostics.attempts[0].code,'fetch_or_parse_error');
 assert.ok(!JSON.stringify(result).includes('<html'));
});
test('정상 RSS지만 해당 날짜에 메뉴가 없다면 원문 조회 실패와 구분한다',()=>{
 const s=harness();
 s.setHandler(()=>response(rss('2026-11-23T01:00:00Z')));
 const result=s.get();
 assert.equal(result.ok,false);assert.equal(result.reason,'not_found');
 assert.equal(result.diagnostics.latestPostDate,'2026-11-23');
 assert.equal(result.diagnostics.matchingDatePosts,0);
});
test('잘못된 피드 호스트·미래 날짜·지난 조회 범위·잘못된 팀 키는 외부 호출하지 않는다',()=>{
 const s=harness();s.store.LUNCH_THREADS_RSS_FEED_URL='https://localhost/private';
 const v=s.get();assert.equal(v.ok,false);assert.equal(v.reason,'feed_unavailable');
 assert.equal(v.diagnostics.attempts[0].code,'invalid_feed_url');
 assert.equal(s.requests.length,0);
 assert.equal(s.get({date:'2026-11-25'}).reason,'future_date');
 assert.equal(s.get({date:'2026-11-15'}).reason,'outside_range');
 assert.equal(s.get({key:'wrong'}).ok,false);
 assert.equal(s.get({callback:'alert(1)//'}).ok,false);
 assert.equal(s.requests.length,0);
});
test('스크립트 속성에 등록한 승인된 RSSHub 주소만 사용한다',()=>{
 const s=harness();
 s.store.LUNCH_THREADS_RSS_FEED_URL='https://rsshub.uocat.com/threads/gangnambab';
 assert.equal(s.get().ok,true);
 assert.equal(s.requests[0].url,'https://rsshub.uocat.com/threads/gangnambab');
});
