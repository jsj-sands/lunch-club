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
 let seq=0;
 const post=(type,payload,actor='seongjun')=>{
  const id=(++seq).toString(16).padStart(24,'0');
  const op={type,payload,actor,id};
  const body={key:KEY,date:DATE,op};
  const result=JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text);
  const receipt=get({action:'state',receipt:id}).receipt;
  return {result,receipt,body};
 };
 const state=()=>get({action:'state'});
 return {store,requests,cached,raw,get,state,post,
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
 assert.equal(v.version,'20261125-gangnam-review');
 assert.equal(v.confidence,'caption');
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

function post({title='',date=NOW,kind='video',id='promoa',image=PHOTO}={}){
 const link='https://www.threads.com/@gangnambab/post/'+id;
 const video='https://video.cdninstagram.com/streams/'+id+'.mp4';
 const html=kind==='video'?'<video><source src="'+video+'"></video>':'<img src="'+image+'">';
 return '<item><title>'+title+'</title><link>'+link+'</link><pubDate>'+new Date(date).toUTCString()+'</pubDate>'+
  '<description><![CDATA['+html+']]></description></item>';
}
const feed=items=>'<rss version="2.0"><channel>'+items.join('')+'</channel></rss>';
test('5초짜리 오픈 2주년 행사·식권 증정 영상은 단독 게시물이어도 식단으로 선택하지 않는다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([post({title:'오픈 2주년 행사! 식권 10+1',id:'Anniversary1'})])));
 const v=s.get();
 assert.equal(v.ok,false);assert.equal(v.reason,'promotion_only');
 assert.equal(v.diagnostics.promotionPosts,1);
 assert.equal(v.diagnostics.identifiedMenuPosts,0);
 assert.equal(v.alternatives,undefined);
});
test('메뉴라는 단어가 들어간 식권 할인 홍보도 메뉴라고 판단하지 않는다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([post({title:'오늘 메뉴 기념 행사, 식권 할인 이벤트!',id:'PromoMenu'})])));
 assert.equal(s.get().reason,'promotion_only');
});
test('홍보 영상이 더 최신이어도 메뉴표가 명시된 게시물만 선택한다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([
  post({title:'11월 24일 오늘의 메뉴표입니다',id:'RealMenu1',date:'2026-11-24T00:01:00.000Z'}),
  post({title:'오픈 2주년 식권 구매 10+1 이벤트',id:'NewPromo',date:'2026-11-24T03:30:00.000Z'})
 ])));
 const v=s.get();
 assert.equal(v.ok,true);assert.equal(v.confidence,'caption');
 assert.equal(v.postUrl,'https://www.threads.com/@gangnambab/post/RealMenu1');
 assert.equal(v.diagnostics.promotionPosts,1);
 assert.equal(v.diagnostics.identifiedMenuPosts,1);
});
test('설명 없는 5초 영상 하나는 조회돼도 메뉴 여부가 불명확하다고 표시한다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([post({title:'',id:'ShortClip1'})])));
 const v=s.get();
 assert.equal(v.ok,false);assert.equal(v.reason,'unverified_menu');
 assert.equal(v.alternatives.length,1);assert.equal(v.alternatives[0].postUrl,'https://www.threads.com/@gangnambab/post/ShortClip1');
});
test('설명 없는 영상 여러 개는 임의의 짧은 영상을 선택하지 않고 원문 확인을 안내한다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([post({id:'ClipA'}),post({id:'ClipB'})])));
 const v=s.get();
 assert.equal(v.ok,false);assert.equal(v.reason,'unverified_menu');
 assert.equal(v.alternatives.length,2);
 assert.equal(v.alternatives.some(x=>x.menuHint),false);
});
test('메뉴 공지가 여러 건이면 영상 길이로 하나를 선택하지 않는다',()=>{
 const s=harness();
 s.setHandler(()=>response(feed([post({id:'MenuA',title:'오늘 점심 메뉴'}),post({id:'MenuB',title:'오늘의 식단'})])));
 const v=s.get();
 assert.equal(v.ok,false);assert.equal(v.reason,'ambiguous');
 assert.equal(v.alternatives.length,2);
});

test('RSSHub 제목이 계정 이름이어도 설명에 실제 오늘 메뉴표가 있으면 자동 판별한다',()=>{
 const S=require('../threads-menu-source.js');
 const feed='<rss version="2.0"><channel><item><title>@gangnambab</title>'+
  '<link>'+POST+'</link><pubDate>'+new Date(NOW).toUTCString()+'</pubDate>'+
  '<description><![CDATA[<p>11월 24일 오늘 점심 메뉴표</p><video><source src="https://video.cdninstagram.com/clip/menu.mp4"></video>]]></description>'+
  '</item></channel></rss>';
 const parsed=S.parseRss(feed);
 assert.match(parsed.data[0].text,/오늘 점심 메뉴표/);
 assert.equal(S.chooseMenu(parsed,DATE).ok,true);
});
test('팀원이 직접 메뉴 영상으로 선택하면 다른 사용자의 조회에도 고정되고 취소하면 후보로 돌아온다',()=>{
 const s=harness();
 const video='https://video.cdninstagram.com/clip/menu.mp4';
 const unverified='<rss version="2.0"><channel><item><title>@gangnambab</title>'+
  '<link>'+POST+'</link><pubDate>'+new Date(NOW).toUTCString()+'</pubDate>'+
  '<description><![CDATA[<video><source src="'+video+'"></video>]]></description></item></channel></rss>';
 s.setHandler(()=>response(unverified));
 assert.equal(s.state().features.gangnamManualPick,true);
 const before=s.get();assert.equal(before.reason,'unverified_menu');
 assert.equal(before.alternatives.length,1);
 const picked=s.post('gangnamPick',{kind:'video',postUrl:POST,videoUrl:video,publishedAt:NOW});
 assert.equal(picked.receipt.ok,true);
 const requestsBefore=s.requests.length;
 const chosen=s.get();assert.equal(chosen.ok,true);
 assert.equal(chosen.confidence,'manual');
 assert.equal(chosen.selectedBy,'seongjun');assert.equal(chosen.postUrl,POST);
 assert.equal(chosen.videoUrl,video);
 assert.equal(s.requests.length,requestsBefore,'Saved pick must be returned without fetching RSS again');
 const cleared=s.post('gangnamClear',{});
 assert.equal(cleared.receipt.ok,true);
 assert.equal(s.get().reason,'unverified_menu');
});
test('팀 공유 메뉴 지정 시 날짜, 게시물 도메인, 미디어 URL을 검증한다',()=>{
 const invalid=[
  {kind:'video',postUrl:'https://evil.test/clip',videoUrl:'https://video.cdninstagram.com/clip/ok.mp4',publishedAt:NOW},
  {kind:'video',postUrl:POST,videoUrl:'https://evil.test/promo.mp4',publishedAt:NOW},
  {kind:'video',postUrl:POST,videoUrl:'https://video.cdninstagram.com/clip/ok.mp4',publishedAt:'2026-11-23T04:00:00.000Z'},
  {kind:'other',postUrl:POST,videoUrl:'https://video.cdninstagram.com/clip/ok.mp4',publishedAt:NOW}
 ];
 for(const p of invalid){
  const s=harness(),r=s.post('gangnamPick',p);
  assert.equal(r.receipt.ok,false);
  assert.equal(s.store['LUNCH_GANGNAM_PICK_'+DATE],undefined);
 }
});
