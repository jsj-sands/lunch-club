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
 const s=server();s.post('availability','seongjun',{value:'in'});s.post('availability','yunchul',{value:'in'});
 const a=s.post('vote','seongjun',{placeId:'megazone'});s.post('vote','yunchul',{placeId:'lunchtime'});
 let d=s.get().days[DATE];assert.equal(d.votes.seongjun,'megazone');assert.equal(d.votes.yunchul,'lunchtime');assert.equal(d.revision,4);
 s.context.doPost({postData:{contents:JSON.stringify(a.body)}});assert.equal(s.get().days[DATE].revision,4);assert.equal(s.get({receipt:a.body.op.id}).receipt.ok,true);assert.equal(s.locked(),false);
});
test('버전 5 서버는 미선택 기본값과 페어링을 알리고 명시적 참석만 투표·확정하도록 검증한다',()=>{
 const s=server(),state=s.get(),C=s.context.LunchCore;
 assert.equal(state.serverVersion,6);assert.deepEqual(state.features,{menuImages:true,menuImageDelete:true,explicitAttendance:true,lunchPairs:true,kakaoProfile:true,ceoVenue:true,separateGroups:true,separateVenues:true,joinRequests:true});
 assert.equal(C.memberStatus('seongjun',DATE,state.days[DATE],state.settings).kind,'pending');
 assert.equal(C.memberStatus('juri',DATE,state.days[DATE],state.settings).kind,'ceo');
 assert.equal(C.participants(DATE,state.days[DATE],state.settings).length,0);assert.deepEqual(state.days[DATE].pairs,[]);
 s.post('availability','yunchul',{value:'in'});
 for(const [type,payload] of [['vote',{placeId:'megazone'}],['decision',{placeId:'megazone',time:'12:00'}]]){
  const failed=s.post(type,'seongjun',payload),received=s.get({receipt:failed.body.op.id});
  assert.equal(received.receipt.ok,false);assert.match(received.receipt.error,/함께 먹는 상태/);assert.equal(received.days[DATE].revision,1);
 }
 s.post('availability','seongjun',{value:'in'});const confirmed=s.post('decision','seongjun',{placeId:'megazone',time:'12:00'});
 assert.equal(s.get({receipt:confirmed.body.op.id}).receipt.ok,true);assert.equal(s.get().days[DATE].decision.actor,'seongjun');
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
test('두 사람의 동시 초대는 먼저 저장된 예약을 지키며 수락과 중복 전송은 한 번만 적용된다',()=>{
 const s=server(),id='pair_'+'b'.repeat(24);
 s.post('availability','jingi',{value:'in'});s.post('vote','jingi',{placeId:'lunchtime'});
 const invited=s.post('pairInvite','seongjun',{id,to:'jingi'});
 const pending=s.get({receipt:invited.body.op.id});assert.equal(pending.receipt.ok,true);assert.equal(pending.days[DATE].revision,3);
 assert.equal(pending.days[DATE].overrides.seongjun,'separate');assert.equal(pending.days[DATE].overrides.jingi,'in');
 const duplicate=JSON.parse(s.context.doPost({postData:{contents:JSON.stringify(invited.body)}}).text);
 assert.equal(duplicate.duplicate,true);assert.equal(s.get().days[DATE].revision,3);
 const overlap=s.post('pairInvite','yunchul',{id:'pair_'+'c'.repeat(24),to:'jingi'}),rejected=s.get({receipt:overlap.body.op.id});
 assert.equal(rejected.receipt.ok,false);assert.match(rejected.receipt.error,/진행 중/);assert.deepEqual(rejected.days[DATE],pending.days[DATE]);
 const accepted=s.post('pairAccept','jingi',{pairId:id});
 const final=s.get({receipt:accepted.body.op.id});assert.equal(final.receipt.ok,true);assert.equal(final.days[DATE].revision,4);
 assert.deepEqual(final.days[DATE].pairs,[{id,from:'seongjun',to:'jingi',status:'accepted'}]);
 assert.equal(final.days[DATE].overrides.jingi,'separate');assert.equal(final.days[DATE].votes.jingi,'lunchtime');
 s.context.doPost({postData:{contents:JSON.stringify(accepted.body)}});assert.equal(s.get().days[DATE].revision,4);assert.equal(s.locked(),false);
});
test('초대 권한과 취소 후 뒤늦게 도착한 수락을 영수증 오류로 돌려주며 다른 선택을 덮지 않는다',()=>{
 const s=server(),id='pair_'+'b'.repeat(24);
 s.post('availability','jingi',{value:'in'});s.post('pairInvite','seongjun',{id,to:'jingi'});
 const pending=s.get().days[DATE];
 for(const [type,actor] of [['pairAccept','seongjun'],['pairDecline','yunchul'],['pairCancel','jingi'],['pairLeave','seongjun']]){
  const attempted=s.post(type,actor,{pairId:id});assert.equal(s.get({receipt:attempted.body.op.id}).receipt.ok,false);assert.deepEqual(s.get().days[DATE],pending);
 }
 s.post('pairCancel','seongjun',{pairId:id});const cancelled=s.get().days[DATE];
 assert.equal(cancelled.overrides.seongjun,'separate');assert.equal(cancelled.overrides.jingi,'in');assert.deepEqual(cancelled.pairs,[]);
 const stale=s.post('pairAccept','jingi',{pairId:id}),current=s.get({receipt:stale.body.op.id});
 assert.equal(current.receipt.ok,false);assert.match(current.receipt.error,/이미 변경/);assert.deepEqual(current.days[DATE],cancelled);
 assert.equal(s.locked(),false);
});
test('짝 탈퇴와 개인 상태 변경은 해당 날짜에만 적용되고 다른 날짜의 초대는 유지된다',()=>{
 const s=server(),id='pair_'+'b'.repeat(24),tuesday='2026-10-20';
 s.post('pairInvite','seongjun',{id,to:'jingi'});s.post('pairAccept','jingi',{pairId:id});
 s.post('pairInvite','seongjun',{id,to:'yunchul'},{date:tuesday});
 const other=s.get({date:tuesday}).days[tuesday];assert.equal(other.pairs[0].status,'pending');
 const leave=s.post('pairLeave','jingi',{pairId:id}),left=s.get({receipt:leave.body.op.id});
 assert.equal(left.receipt.ok,true);assert.deepEqual(left.days[DATE].pairs,[]);assert.equal(left.days[DATE].overrides.jingi,'pending');assert.equal(left.days[DATE].overrides.seongjun,'separate');
 assert.deepEqual(left.days[tuesday],other);assert.equal(s.get({date:tuesday,receipt:leave.body.op.id}).receipt,null);
 s.post('availability','seongjun',{value:'in'},{date:tuesday});const changed=s.get({date:tuesday});
 assert.deepEqual(changed.days[tuesday].pairs,[]);assert.equal(changed.days[tuesday].overrides.yunchul,undefined);
 assert.deepEqual(changed.days[DATE],left.days[DATE]);
 const stale=s.post('pairAccept','yunchul',{pairId:id},{date:tuesday});
 assert.equal(s.get({date:tuesday,receipt:stale.body.op.id}).receipt.ok,false);
 const nextWeek=s.get({date:'2026-10-26'});assert.equal(nextWeek.days[DATE],undefined);assert.equal(nextWeek.days[tuesday],undefined);
 assert.deepEqual(s.get().days[DATE],left.days[DATE]);
});
test('기존 버전의 저장된 일일 기록·영수증·사용자 일정은 새로운 상태와 함께 유지된다',()=>{
 const s=server(),oldReceipt='f'.repeat(24);
 const data={ceoCancelled:true,overrides:{seongjun:'in',jingi:'out'},absenceReasons:{jingi:'외부 일정'},votes:{seongjun:'megazone',yunchul:'lunchtime'},extras:[],notes:{megazone:'기존 메뉴 메모'},decision:{placeId:'megazone',time:'12:10',actor:'yunchul',at:'2026-10-19T01:00:00Z'},revision:27,updatedAt:'2026-10-19T01:00:00Z'};
 const cfg={scheduleEnd:'2027-06-30',meetingTime:'12:10',ceoDays:{seongjun:[1],juri:[2],hyunsu:[],yunchul:[4],jingi:[1,5],minjun:[3]}};
 s.store.LUNCH_CONFIG=JSON.stringify({settings:cfg,revision:9});
 s.store['LUNCH_DAY_'+DATE]=JSON.stringify({parts:1,generation:'legacy'});
 s.store['LUNCH_DAY_'+DATE+'_legacy_0']=JSON.stringify({data,receipts:{[oldReceipt]:{ok:true,at:data.updatedAt}}});
 const restored=s.get({receipt:oldReceipt});
 assert.deepEqual(restored.days[DATE],{...data,ceoDecision:null,separateVenues:{},pairs:[],joinRequests:[]});assert.equal(restored.receipt.ok,true);assert.equal(restored.configRevision,9);
 for(const [id,days] of Object.entries(cfg.ceoDays))assert.deepEqual(restored.settings.ceoDays[id],days);
 assert.equal(restored.settings.scheduleEnd,cfg.scheduleEnd);assert.equal(restored.settings.meetingTime,cfg.meetingTime);
 s.post('pairInvite','yunchul',{id:'pair_'+'b'.repeat(24),to:'jiwoo'});const latest=s.get({receipt:oldReceipt});
 assert.deepEqual(latest.days[DATE].votes,data.votes);assert.deepEqual(latest.days[DATE].decision,data.decision);assert.deepEqual(latest.days[DATE].notes,data.notes);
 assert.equal(latest.days[DATE].overrides.seongjun,'in');assert.equal(latest.days[DATE].absenceReasons.jingi,'외부 일정');assert.deepEqual(latest.settings,restored.settings);assert.equal(latest.receipt.ok,true);
});

test('대표님 점심 식당 확정은 기존 서버 저장·수신 확인을 통과해 다른 기기에도 날짜별로 공유된다',()=>{
 const s=server(),tuesday='2026-10-20';
 const venue={placeId:'guide_1764937561',name:'만보성',url:'https://m.place.naver.com/place/1764937561/home',time:'12:00',category:'중식'};
 const bad=s.post('ceoDecision','yunchul',venue,{date:tuesday});
 assert.equal(s.get({date:tuesday,receipt:bad.body.op.id}).receipt.ok,false);
 const saved=s.post('ceoDecision','jingi',venue,{date:tuesday});
 const receipt=s.get({date:tuesday,receipt:saved.body.op.id});
 assert.equal(receipt.receipt.ok,true);
 assert.equal(receipt.days[tuesday].ceoDecision.name,'만보성');
 assert.equal(receipt.days[tuesday].ceoDecision.actor,'jingi');
 assert.equal(s.get({date:DATE}).days[DATE].ceoDecision,null);
 const otherClient=s.get({date:tuesday});
 assert.equal(otherClient.days[tuesday].ceoDecision.placeId,venue.placeId);
 const unconfirmed=s.post('ceoUnconfirm','jiwoo',{}, {date:tuesday});
 const after=s.get({date:tuesday,receipt:unconfirmed.body.op.id});
 assert.equal(after.receipt.ok,true);assert.equal(after.days[tuesday].ceoDecision,null);
 assert.equal(s.locked(),false);
});

test('Google 공유 서버는 3명 이상 모임과 모임별 맛집 장소를 다른 접속자에게 복원하고 기존 데이터는 보존한다',()=>{
 const s=server(),id1='pair_'+'a'.repeat(24),id2='pair_'+'b'.repeat(24);
 const venue={placeId:'guide_123456789',name:'테스트 식당',url:'https://m.place.naver.com/place/123456789/home',category:'한식'};
 s.post('availability','seongjun',{value:'in'});s.post('vote','seongjun',{placeId:'megazone'});
 const sent=s.post('groupInvite','seongjun',{invites:[{id:id1,to:'jingi'},{id:id2,to:'jiwoo'}]});
 assert.equal(s.get({receipt:sent.body.op.id}).receipt.ok,true);
 const waiting=s.get().days[DATE];
 assert.equal(waiting.pairs.length,2);
 assert.equal(waiting.overrides.jingi,undefined);
 const accepted=s.post('pairAccept','jingi',{pairId:id1});
 assert.equal(s.get({receipt:accepted.body.op.id}).receipt.ok,true);
 const placeSaved=s.post('separateVenue','jingi',venue);
 const shared=s.get({receipt:placeSaved.body.op.id});
 assert.equal(shared.receipt.ok,true);
 assert.equal(shared.days[DATE].separateVenues.seongjun.placeId,venue.placeId);
 assert.equal(shared.days[DATE].votes.seongjun,'megazone');
 assert.equal(shared.days[DATE].ceoDecision,null);
 s.post('pairAccept','jiwoo',{pairId:id2});
 const other=s.get().days[DATE];
 assert.equal(other.pairs.filter(x=>x.status==='accepted').length,2);
 assert.equal(other.separateVenues.seongjun.name,'테스트 식당');
 const bad=s.post('separateVenue','yunchul',venue);
 assert.equal(s.get({receipt:bad.body.op.id}).receipt.ok,false);
 s.post('availability','jiwoo',{value:'pending'});
 assert.equal(s.get().days[DATE].separateVenues.seongjun.name,'테스트 식당');
 assert.equal(s.locked(),false);
});

test('여러 직원이 만든 합류 요청과 승인 상태를 공유 서버가 날짜별로 전달한다',()=>{
 const s=server(),join='join_'+'d'.repeat(24),tuesday='2026-10-20';
 s.post('availability','seongjun',{value:'separate'},{date:tuesday});
 s.post('availability','juri',{value:'in'},{date:tuesday});
 s.post('vote','juri',{placeId:'megazone'},{date:tuesday});
 const requested=s.post('joinRequest','juri',{id:join,to:'seongjun'},{date:tuesday});
 assert.equal(s.get({date:tuesday,receipt:requested.body.op.id}).receipt.ok,true);
 assert.deepEqual(s.get({date:tuesday}).days[tuesday].joinRequests.map(x=>x.from),['juri']);
 assert.equal(s.context.LunchCore.tally(tuesday,s.get({date:tuesday}).days[tuesday],s.get().settings).megazone.join(','),'juri');
 const approved=s.post('joinApprove','seongjun',{requestId:join},{date:tuesday});
 assert.equal(s.get({date:tuesday,receipt:approved.body.op.id}).receipt.ok,true);
 assert.deepEqual(s.get({date:tuesday}).days[tuesday].joinRequests,[]);
 assert.equal(s.get({date:tuesday}).days[tuesday].overrides.juri,'separate');
 assert.equal(s.context.LunchCore.tally(tuesday,s.get({date:tuesday}).days[tuesday],s.get().settings).megazone.length,0);
 assert.equal(s.get({date:DATE}).days[DATE].pairs.length,0);
});

test('Slack 설정 전에는 외부 발송 없이 초대 및 참여 요청이 저장된다',()=>{
 const s=server();
 s.post('availability','seongjun',{value:'separate'});
 const invited=s.post('pairInvite','seongjun',{id:'pair_'+'a'.repeat(24),to:'juri'});
 assert.equal(s.get({receipt:invited.body.op.id}).receipt.ok,true);
 const requested=s.post('joinRequest','yunchul',{id:'join_'+'b'.repeat(24),to:'seongjun'});
 assert.equal(s.get({receipt:requested.body.op.id}).receipt.ok,true);
 assert.equal(s.fetches(),0);
 assert.equal(s.locked(),false);
});

test('Slack 봇 설정 시 초대자는 수락 DM, 초대받은 사람은 초대 DM, 모임 생성자는 참여 요청 DM을 받는다',()=>{
 const s=server(),events=[];
 s.store.LUNCH_SLACK_BOT_TOKEN='xoxb-example-test-token-123456789';
 s.store.LUNCH_SLACK_MEMBER_IDS=JSON.stringify({seongjun:'U1234567890',juri:'U2234567890',yunchul:'U3234567890'});
 s.context.UrlFetchApp.fetch=(url,opts)=>{
  events.push({url,payload:JSON.parse(opts.payload),token:opts.headers.Authorization});
  return {getResponseCode:()=>200,getContentText:()=>JSON.stringify(url.endsWith('/conversations.open')?{ok:true,channel:{id:'D1234567890'}}:{ok:true})};
 };
 s.post('availability','seongjun',{value:'separate'});
 const invited=s.post('pairInvite','seongjun',{id:'pair_'+'b'.repeat(24),to:'juri'});
 assert.equal(events.length,2);
 assert.equal(events[0].payload.users,'U2234567890');
 assert.match(events[1].payload.text,/초대했어요/);
 assert.match(events[1].payload.text,/2026-10-19/);
 assert.ok(!JSON.stringify(s.get()).includes('xoxb-example'));
 s.context.doPost({postData:{contents:JSON.stringify(invited.body)}});
 assert.equal(events.length,2,'중복 저장/재시도는 새 DM을 발송하면 안 된다');
 s.post('pairAccept','juri',{pairId:'pair_'+'b'.repeat(24)});
 assert.equal(events[2].payload.users,'U1234567890');
 assert.match(events[3].payload.text,/수락/);
 s.post('joinRequest','yunchul',{id:'join_'+'a'.repeat(24),to:'seongjun'});
 assert.equal(events[4].payload.users,'U1234567890');
 assert.match(events[5].payload.text,/참여하고 싶어/);
 s.post('joinApprove','seongjun',{requestId:'join_'+'a'.repeat(24)});
 assert.equal(events[6].payload.users,'U3234567890');
 assert.match(events[7].payload.text,/승인/);
 assert.equal(s.locked(),false);
});

test('Slack 발송 실패는 점심 상태 저장을 취소하지 않고 봇 토큰을 응답에 포함하지 않는다',()=>{
 const s=server();
 s.store.LUNCH_SLACK_BOT_TOKEN='xoxb-example-test-token-123456789';
 s.store.LUNCH_SLACK_MEMBER_IDS=JSON.stringify({juri:'U2234567890'});
 s.context.UrlFetchApp.fetch=(url,opts)=>{throw new Error('Slack denied');};
 const invite=s.post('pairInvite','seongjun',{id:'pair_'+'b'.repeat(24),to:'juri'});
 assert.equal(s.get({receipt:invite.body.op.id}).receipt.ok,true);
 assert.equal(s.get().days[DATE].pairs.length,1);
 assert.equal(s.locked(),false);
 assert.ok(!JSON.stringify(s.get()).includes('xoxb-'));
});
