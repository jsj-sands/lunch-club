const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const KEY='a'.repeat(48),DATE='2026-10-19';
function server(){
 const store={},cache=new Map();let locked=false,fetches=0;
 const properties={getProperties:()=>({...store}),setProperty(k,v){if(Buffer.byteLength(v)>9000)throw Error('property quota');store[k]=v;return this;},setProperties(v){Object.entries(v).forEach(([k,x])=>this.setProperty(k,x));return this;},deleteProperty(k){delete store[k];return this;}};
 const context={console,Date,Intl,URL,Utilities:{newBlob:s=>({getBytes:()=>Buffer.from(s)}),getUuid:()=>crypto.randomUUID(),formatDate:()=>DATE},PropertiesService:{getScriptProperties:()=>properties},CacheService:{getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v)})},LockService:{getScriptLock:()=>({waitLock(){assert.equal(locked,false);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}})},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:s=>({text:s,setMimeType(t){this.mime=t;return this;}})},UrlFetchApp:{fetch(){fetches++;return {getResponseCode:()=>200,getContentText:()=>'- Vendor: 삼성웰스토리\n- Date: 2026년 10월 19일 (월)\n# 메가존산학연센터\n## 점심\n- 나주곰탕\n- 김치볶음밥\n## Discovery\n- RSS: test'};}}};
 vm.createContext(context);
 vm.runInContext((fs.readFileSync(path.join(__dirname,'../core.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8')).replace("'__TEAM_KEY__'",`'${KEY}'`),context);
 let seq=0;
 const post=(type,actor,payload,extra={})=>{const id=(++seq).toString(16).padStart(24,'0');const body={key:KEY,date:DATE,op:{type,actor,payload,id},...extra};return {body,response:JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text)};};
 const get=(extra={})=>JSON.parse(context.doGet({parameter:{key:KEY,date:DATE,action:'state',...extra}}).text);
 return {context,store,post,get,fetches:()=>fetches,locked:()=>locked};
}
test('서버가 각 멤버의 변경을 최신 상태에 병합하고 중복 요청을 한 번만 적용한다',()=>{
 const s=server();const a=s.post('vote','seongjun',{placeId:'megazone'});s.post('vote','yunchul',{placeId:'lunchtime'});
 let d=s.get().days[DATE];assert.equal(d.votes.seongjun,'megazone');assert.equal(d.votes.yunchul,'lunchtime');assert.equal(d.revision,2);
 s.context.doPost({postData:{contents:JSON.stringify(a.body)}});assert.equal(s.get().days[DATE].revision,2);assert.equal(s.get({receipt:a.body.op.id}).receipt.ok,true);assert.equal(s.locked(),false);
});
test('개인 불참 사유가 서버에 보관되고 오류 요청은 성공으로 확인하지 않는다',()=>{
 const s=server();const a=s.post('availability','seongjun',{value:'out',reason:'속이 안 좋아요'});
 assert.equal(s.get().days[DATE].absenceReasons.seongjun,'속이 안 좋아요');
 const failed=s.post('vote','seongjun',{placeId:'megazone'});const r=s.get({receipt:failed.body.op.id});assert.equal(r.receipt.ok,false);assert.match(r.receipt.error,/함께 먹는 상태/);assert.equal(r.days[DATE].revision,1);
 assert.equal(s.get({receipt:a.body.op.id}).receipt.ok,true);
});
test('잘못된 키와 콜백의 실행을 차단한다',()=>{
 const s=server();assert.equal(s.get({key:'incorrect'}).ok,false);
 const result=s.context.doGet({parameter:{key:KEY,date:DATE,action:'state',callback:'alert(1)//'}});assert.equal(result.mime,'json');assert.equal(JSON.parse(result.text).ok,false);
 const result2=s.context.doGet({parameter:{key:KEY,date:DATE,action:'state',callback:'lunchReply_'+'c'.repeat(24)}});assert.equal(result2.mime,'js');assert.ok(result2.text.startsWith('lunchReply_'));
});
test('기본 일정 동시 수정은 버전 충돌을 안내하고 이전 설정으로 덮지 않는다',()=>{
 const s=server(),cfg=s.get().settings;cfg.scheduleEnd='2027-12-31';
 s.post('settings','seongjun',cfg,{configRevision:0});
 const newer=s.get();assert.equal(newer.configRevision,1);
 cfg.scheduleEnd='2026-11-30';const result=s.post('settings','juri',cfg,{configRevision:0});
 const current=s.get({receipt:result.body.op.id});assert.equal(current.receipt.ok,false);assert.equal(current.settings.scheduleEnd,'2027-12-31');
});
test('메뉴 날짜와 본문을 검증하고 10분 캐시를 사용한다',()=>{
 const s=server();const result=s.get({action:'menu'});assert.equal(result.ok,true);assert.deepEqual(result.menu.dishes,['나주곰탕','김치볶음밥']);
 s.get({action:'menu'});assert.equal(s.fetches(),1);
 const wrong=s.get({action:'menu',date:'2026-10-20'});assert.equal(wrong.ok,false);assert.match(wrong.error,/날짜/);
});
test('긴 한국어 메뉴와 다수 식당을 저장해도 9KB 속성 한도를 넘지 않는다',()=>{
 const s=server();
 for(let i=0;i<8;i++){s.post('addPlace','seongjun',{id:'extra_'+i,name:'새로운식당'+i,subtitle:'설명'.repeat(30),url:'https://example.com/'+('a'.repeat(500))});s.post('note','seongjun',{placeId:'extra_'+i,text:'맛있는메뉴 '.repeat(60)});}
 const state=s.get();assert.equal(state.days[DATE].extras.length,8);assert.ok(state.days[DATE].notes.extra_7.length>200);
 for(const value of Object.values(s.store))assert.ok(Buffer.byteLength(value)<=9000);
});
