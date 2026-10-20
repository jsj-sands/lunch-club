const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const KEY='a'.repeat(48),DATE='2026-10-19';
const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aS/8AAAAASUVORK5CYII=','base64');
const DATA='data:image/png;base64,'+PNG.toString('base64');
function iterator(values){let i=0;return {hasNext:()=>i<values.length,next:()=>values[i++]};}
function sharedStorage(){
 const store={},files=new Map(),folders=new Map();let seq=0,locked=false,driveDisabled=false,propertyFailure=null,propertyDeleteFailure=null,events=[];
 const properties={getProperties:()=>({...store}),setProperty(k,v){if(propertyFailure&&propertyFailure(k,v))throw Error('property write failure');assert.ok(Buffer.byteLength(v)<=9000);store[k]=v;events.push(['property',k]);return this;},setProperties(v){Object.entries(v).forEach(([k,x])=>this.setProperty(k,x));return this;},deleteProperty(k){if(propertyDeleteFailure&&propertyDeleteFailure(k))throw Error('property delete failure');delete store[k];events.push(['deleteProperty',k]);return this;}};
 const blob=(data,mimeType,name)=>({getBytes:()=>Array.from(Buffer.from(data)),getContentType:()=>mimeType,getName:()=>name});
 function checkDrive(){if(driveDisabled)throw Error('Authorization is required to perform that action.');}
 const DriveApp={Access:{PRIVATE:'PRIVATE',ANYONE:'ANYONE'},Permission:{VIEW:'VIEW'},createFolder(name){checkDrive();const id='folder-'+(++seq),folder={id,name,description:'',access:'PRIVATE',trashed:false,getId:()=>id,getDescription(){return this.description;},setDescription(v){this.description=v;return this;},setSharing(access,permission){assert.equal(access,'PRIVATE');assert.equal(permission,'VIEW');this.access=access;return this;},getSharingAccess(){return this.access;},isTrashed(){return this.trashed;},getFiles(){checkDrive();return iterator([...files.values()].filter(f=>f.folderId===id&&!f.trashed));},createFile(b){checkDrive();const fileId='file-'+(++seq),file={id:fileId,folderId:id,bytes:Buffer.from(b.getBytes()),mimeType:b.getContentType(),name:b.getName(),description:'',access:'PRIVATE',trashed:false,createdAt:new Date(DATE+'T12:00:00Z'),getId:()=>fileId,getDescription(){return this.description;},setDescription(v){this.description=v;return this;},setSharing(access,permission){assert.equal(access,'PRIVATE');assert.equal(permission,'VIEW');this.access=access;return this;},getSharingAccess(){return this.access;},getParents(){return iterator([folder]);},getSize(){return this.bytes.length;},getMimeType(){return this.mimeType;},getBlob(){checkDrive();return blob(this.bytes,this.mimeType,this.name);},getDateCreated(){return this.createdAt;},isTrashed(){return this.trashed;},setTrashed(v){checkDrive();this.trashed=v;events.push(['trash',fileId]);return this;}};files.set(fileId,file);events.push(['create',fileId]);return file;}};folders.set(id,folder);return folder;},getFolderById(id){checkDrive();if(!folders.has(id))throw Error('missing folder');return folders.get(id);},getFileById(id){checkDrive();if(!files.has(id))throw Error('missing file');return files.get(id);}};
 return {store,files,folders,properties,blob,DriveApp,events,disableDrive(v){driveDisabled=v;},failProperty(fn){propertyFailure=fn;},failDelete(fn){propertyDeleteFailure=fn;},lock:{waitLock(){assert.equal(locked,false);locked=true;},hasLock:()=>locked,releaseLock(){locked=false;}},locked:()=>locked};
}
function client(shared=sharedStorage()){
 const context={console,Date,Intl,URL,Utilities:{newBlob:shared.blob,base64Decode:s=>Array.from(Buffer.from(s,'base64'),v=>v>127?v-256:v),base64Encode:b=>Buffer.from(b).toString('base64'),getUuid:()=>crypto.randomUUID(),formatDate:()=>DATE},PropertiesService:{getScriptProperties:()=>shared.properties},DriveApp:shared.DriveApp,CacheService:{getScriptCache:()=>({get:()=>null,put(){}})},LockService:{getScriptLock:()=>shared.lock},ContentService:{MimeType:{JSON:'json',JAVASCRIPT:'js'},createTextOutput:s=>({text:s,setMimeType(t){this.mime=t;return this;}})},UrlFetchApp:{fetch:()=>({getResponseCode:()=>200,getContentText:()=>''})}};
 vm.createContext(context);
 const source=fs.readFileSync(path.join(__dirname,'../core.js'),'utf8')+'\n'+fs.readFileSync(path.join(__dirname,'../backend/server.js'),'utf8');
 vm.runInContext(source.replace("'__TEAM_KEY__'",`'${KEY}'`),context);
 function post(payload={},extra={}){const id=crypto.randomBytes(12).toString('hex');const body={key:KEY,date:DATE,op:{type:'menuImageUpload',actor:'seongjun',id,payload:{scope:'week',dataUrl:DATA,name:'이번주 식단.png',expectedImageId:'',...payload}},...extra};return {body,response:submit(body)};}
 function submit(body){return JSON.parse(context.doPost({postData:{contents:JSON.stringify(body)}}).text);}
 function get(extra={}){return JSON.parse(context.doGet({parameter:{key:KEY,date:DATE,action:'state',...extra}}).text);}
 return {context,shared,post,submit,get};
}
function receipt(c,posted){return c.get({date:posted.body.date,receipt:posted.body.op.id}).receipt;}
function removeImage(c,meta,extra={},payload={}){
 const body={key:KEY,date:DATE,op:{type:'menuImageDelete',actor:'jingi',id:crypto.randomBytes(12).toString('hex'),payload:{scope:meta.scope,expectedImageId:meta.id,...payload}},...extra};
 return {body,response:c.submit(body)};
}

test('초기화는 비공개 식단 폴더 한 개를 만들고 새 서버 기능을 알린다',()=>{
 const c=client();assert.deepEqual(c.get().menuImages,{});assert.equal(c.get().serverVersion,6);assert.deepEqual(c.get().features,{menuImages:true,menuImageDelete:true,explicitAttendance:true,lunchPairs:true,kakaoProfile:true,ceoVenue:true,separateGroups:true,separateVenues:true,joinRequests:true});
 c.context.initializeLunchClub();c.context.initializeLunchClub();assert.equal(c.shared.folders.size,1);
 const folder=[...c.shared.folders.values()][0];assert.equal(folder.name,'SANDS Lunch Club · 런치타임 식단');assert.equal(folder.access,'PRIVATE');assert.equal(c.shared.locked(),false);
});
test('다른 기기에서 주간 사진을 확인하고 원본은 팀 키가 있는 이미지 조회에만 전송한다',()=>{
 const a=client(),b=client(a.shared),uploaded=a.post({}, {date:'2026-10-21'});
 assert.equal(uploaded.response.accepted,true);assert.equal(receipt(a,uploaded).ok,true);
 const state=b.get(),meta=state.menuImages['week:2026-10-19'];assert.equal(meta.date,'2026-10-19');assert.equal(meta.endDate,'2026-10-25');assert.equal(meta.uploadedBy,'seongjun');assert.equal(meta.size,PNG.length);
 assert.equal(meta.dataUrl,undefined);assert.equal(meta.fileId,undefined);assert.equal(meta.operationId,undefined);assert.match(meta.id,/^[a-f0-9-]{36}$/);
 const image=b.get({action:'menuImage',scope:'week',imageId:meta.id});assert.equal(image.ok,true);assert.equal(image.image.dataUrl,DATA);
 assert.equal(b.get({action:'menuImage',scope:'week',imageId:meta.id,key:'wrong'}).ok,false);
 assert.equal(b.get({action:'menuImage',scope:'day',imageId:meta.id}).ok,false);
 assert.equal(b.get({action:'menuImage',scope:'week',imageId:meta.id,date:'2026-10-26'}).ok,false);
 assert.ok(!JSON.stringify(a.shared.store).includes(PNG.toString('base64')));assert.equal([...a.shared.files.values()][0].access,'PRIVATE');
});
test('주간 범위와 날짜 범위를 구분하며 선택한 주말의 하루 사진도 포함한다',()=>{
 const c=client();c.post();c.post({scope:'day'},{date:'2026-10-20'});c.post({scope:'day'},{date:'2026-10-24'});
 assert.deepEqual(Object.keys(c.get().menuImages).sort(),['day:2026-10-20','week:2026-10-19']);
 assert.deepEqual(Object.keys(c.get({date:'2026-10-24'}).menuImages).sort(),['day:2026-10-20','day:2026-10-24','week:2026-10-19']);
 assert.deepEqual(c.get({date:'2026-10-26'}).menuImages,{});
});
test('일반 멤버 모두 업로드할 수 있고 없는 멤버는 차단한다',()=>{
 const c=client();const members=c.context.LunchCore.MEMBERS;
 assert.ok(members.some(m=>m.id==='jingi'),'core.js must include the new member jingi');
 assert.equal(members.length,10);
 for(const id of ['minjun','seongeun','yunseok','jiwoo','hyunju'])assert.ok(members.some(m=>m.id===id),'missing new member '+id);
 for(const [i,member] of members.entries()){
   const op={type:'menuImageUpload',actor:member.id,id:crypto.randomBytes(12).toString('hex'),payload:{scope:'day',dataUrl:DATA,expectedImageId:'',name:member.name+'.png'}};
   const p=c.post({}, {date:'2026-10-'+String(19+i),op});assert.equal(receipt(c,p).ok,true);
 }
 const bad=c.post({}, {op:{type:'menuImageUpload',actor:'unknown',id:'b'.repeat(24),payload:{}}});assert.equal(bad.response.ok,false);assert.equal(c.shared.files.size,members.length);
});
test('이미지 교체는 충돌을 감지하고 저장 완료 뒤에만 이전 파일을 정리한다',()=>{
 const a=client(),b=client(a.shared);const first=a.post(),before=b.get().menuImages['week:2026-10-19'];
 const oldFile=[...a.shared.files.values()][0];const replacement=b.post({expectedImageId:before.id,name:'수정 식단.png'});
 assert.equal(receipt(b,replacement).ok,true);const updated=a.get().menuImages['week:2026-10-19'];assert.notEqual(updated.id,before.id);assert.equal(updated.name,'수정 식단.png');assert.equal(oldFile.trashed,true);
 const latestPublish=a.shared.events.map(e=>e.join(':')).lastIndexOf('property:LUNCH_MENU_IMAGE_week_2026-10-19');
 const retired=a.shared.events.findIndex(e=>e[0]==='trash'&&e[1]===oldFile.id);assert.ok(retired>latestPublish);
 const stale=a.post({expectedImageId:before.id});assert.equal(receipt(a,stale).ok,false);assert.match(receipt(a,stale).error,/먼저 바꿨어요/);assert.equal(a.shared.files.size,2);
 assert.equal(a.get({action:'menuImage',scope:'week',imageId:before.id}).ok,false);assert.equal(a.get().menuImages['week:2026-10-19'].id,updated.id);
 assert.equal(b.submit(replacement.body).duplicate,true);assert.equal(a.shared.files.size,2);assert.equal(receipt(a,first).ok,true);
});
test('서명·MIME·base64·용량 검증에서 잘못된 파일을 저장하지 않는다',()=>{
 const cases=[
  ['지원 형식',DATA.replace('image/png','image/svg+xml')],
  ['다른 MIME',DATA.replace('image/png','image/jpeg')],
  ['가짜 이미지','data:image/png;base64,'+Buffer.from('<script>alert(1)</script>').toString('base64')],
  ['공백',DATA+'\n'],
  ['잘못된 패딩',DATA+'='],
  ['비정규 base64',DATA.slice(0,-2)+'J='],
  ['1MB 초과','data:image/png;base64,'+Buffer.alloc(1024*1024+1).toString('base64')]
 ];
 for(const [label,dataUrl] of cases){const c=client(),p=c.post({dataUrl});assert.equal(receipt(c,p).ok,false,label);assert.equal(c.shared.files.size,0,label);assert.ok(!JSON.stringify(c.shared.store).includes('data:image'),label);}
 const c=client(),large=c.post({dataUrl:'x'.repeat(1572864)});assert.equal(large.response.ok,false);assert.equal(c.shared.files.size,0);
 const ordinary=c.post({}, {op:{type:'note',actor:'seongjun',id:'c'.repeat(24),payload:{text:'a'.repeat(10001),placeId:'lunchtime'}}});assert.equal(ordinary.response.ok,false);
});
test('JPEG와 WEBP의 실제 형식 서명을 구분하고 1MB 경계 파일을 읽는다',()=>{
 const jpg=Buffer.from([255,216,255,224,0,4,74,70,73,70,255,217]);
 const webp=Buffer.from('5249464612000000574542505650384c050000002f0000000000','hex');
 const oneMiB=Buffer.alloc(1024*1024);PNG.copy(oneMiB);
 for(const [mime,bytes] of [['image/jpeg',jpg],['image/webp',webp],['image/png',oneMiB]]){
  const c=client(),dataUrl='data:'+mime+';base64,'+bytes.toString('base64'),posted=c.post({dataUrl});
  assert.equal(receipt(c,posted).ok,true,mime);const meta=c.get().menuImages['week:2026-10-19'];assert.equal(meta.size,bytes.length);
  assert.equal(c.get({action:'menuImage',scope:'week',imageId:meta.id}).image.dataUrl,dataUrl);
 }
});
test('업로드 도중 속성 저장에 실패하면 이전 식단은 유지하고 새 파일만 취소한다',()=>{
 const c=client();c.post();const previous=c.get().menuImages['week:2026-10-19'],old=[...c.shared.files.values()][0];
 c.shared.failProperty(k=>k==='LUNCH_MENU_IMAGE_week_2026-10-19');const failed=c.post({expectedImageId:previous.id});c.shared.failProperty(null);
 assert.equal(receipt(c,failed).ok,false);assert.equal(c.get().menuImages['week:2026-10-19'].id,previous.id);assert.equal(old.trashed,false);assert.equal([...c.shared.files.values()][1].trashed,true);
});
test('이미지 저장 뒤 영수증 저장이 실패해도 같은 요청 재전송은 파일을 중복 생성하지 않는다',()=>{
 const c=client();c.shared.failProperty(k=>/^LUNCH_DAY_2026-10-19$/.test(k));const p=c.post();assert.equal(p.response.ok,false);assert.equal(c.shared.files.size,1);
 c.shared.failProperty(null);assert.equal(c.submit(p.body).accepted,true);assert.equal(receipt(c,p).ok,true);assert.equal(c.shared.files.size,1);
});
test('Drive 권한 오류는 재승인 안내를 남기며 기존 투표는 계속 저장할 수 있다',()=>{
 const c=client();c.shared.disableDrive(true);const p=c.post();assert.equal(receipt(c,p).ok,false);assert.match(receipt(c,p).error,/initializeLunchClub.*Drive 권한.*새 버전/);
 const attending=c.post({}, {op:{type:'availability',actor:'seongjun',id:'d'.repeat(24),payload:{value:'in'}}});assert.equal(receipt(c,attending).ok,true);
 const vote=c.post({}, {op:{type:'vote',actor:'seongjun',id:'c'.repeat(24),payload:{placeId:'megazone'}}});assert.equal(receipt(c,vote).ok,true);assert.equal(c.shared.locked(),false);
});
test('90일 지난 전용 식단 파일과 슬롯을 정리하고 같은 폴더의 무관한 파일은 보존한다',()=>{
 const c=client();c.post({}, {date:'2026-06-01'});const old=[...c.shared.files.values()][0];old.createdAt=new Date('2026-06-01T12:00:00Z');
 const folder=[...c.shared.folders.values()][0],unrelated=folder.createFile(c.shared.blob(PNG,'image/png','개인사진.png'));unrelated.createdAt=new Date('2026-01-01T00:00:00Z');
 const orphan=folder.createFile(c.shared.blob(PNG,'image/png','old-orphan.png'));orphan.description='SANDS_LUNCH_MENU_IMAGE_V1:'+JSON.stringify({id:crypto.randomUUID(),slot:'day:2026-06-02',endDate:'2026-06-02',folderId:folder.id});orphan.createdAt=new Date('2026-06-02T12:00:00Z');
 const foreign=folder.createFile(c.shared.blob(PNG,'image/png','moved-from-another-app.png'));foreign.description='SANDS_LUNCH_MENU_IMAGE_V1:'+JSON.stringify({id:crypto.randomUUID(),slot:'day:2026-06-02',endDate:'2026-06-02',folderId:'another-folder'});foreign.createdAt=new Date('2026-06-02T12:00:00Z');
 delete c.shared.store.LUNCH_MENU_IMAGE_LAST_PRUNE;
 c.post({scope:'day'});assert.equal(old.trashed,true);assert.equal(orphan.trashed,true);assert.equal(unrelated.trashed,false);assert.equal(foreign.trashed,false);assert.equal(c.shared.store['LUNCH_MENU_IMAGE_week_2026-06-01'],undefined);
});
test('다른 멤버가 확인한 주간 이미지 하나만 삭제하고 다른 날짜·하루 사진·출석 기록은 보존한다',()=>{
 const a=client(),b=client(a.shared);
 a.post();a.post({scope:'day'});a.post({scope:'day'},{date:'2026-10-20'});a.post({}, {date:'2026-10-26'});
 a.post({}, {op:{type:'availability',actor:'seongjun',id:'e'.repeat(24),payload:{value:'in'}}});
 a.post({}, {op:{type:'vote',actor:'seongjun',id:'f'.repeat(24),payload:{placeId:'lunchtime'}}});
 // Keep an old slot until the delete call, which must not run general retention cleanup.
 a.post({scope:'day'}, {date:'2026-06-01'});
 const folder=[...a.shared.folders.values()][0],unrelated=folder.createFile(a.shared.blob(PNG,'image/png','개인사진.png'));
 const before=a.get(),meta=before.menuImages['week:2026-10-19'];
 const slots=Object.fromEntries(Object.entries(a.shared.store).filter(([k])=>/^LUNCH_MENU_IMAGE_(day|week)_/.test(k)));
 const file=a.shared.files.get(JSON.parse(slots['LUNCH_MENU_IMAGE_week_2026-10-19']).fileId);
 const deleted=removeImage(b,meta,{date:'2026-10-21'});
 assert.equal(deleted.response.accepted,true);assert.equal(receipt(b,deleted).ok,true);
 assert.equal(a.get().menuImages['week:2026-10-19'],undefined);assert.equal(file.trashed,true);
 assert.equal(a.get({action:'menuImage',scope:'week',imageId:meta.id}).ok,false);
 for(const [key,value] of Object.entries(slots))if(key!=='LUNCH_MENU_IMAGE_week_2026-10-19')assert.equal(a.shared.store[key],value,key);
 assert.equal(unrelated.trashed,false);assert.equal([...a.shared.files.values()].filter(f=>f.trashed).length,1);
 assert.equal(a.shared.files.size,6,'only trash the target; no permanent file deletion');
 assert.deepEqual(a.get().days,before.days);assert.deepEqual(a.get().settings,before.settings);assert.equal(a.get().configRevision,before.configRevision);
 const trashedAt=a.shared.events.findIndex(e=>e[0]==='trash'&&e[1]===file.id);
 const unlinkedAt=a.shared.events.findIndex(e=>e[0]==='deleteProperty'&&e[1]==='LUNCH_MENU_IMAGE_week_2026-10-19');assert.ok(unlinkedAt>trashedAt);
 assert.equal(a.shared.locked(),false);
});
test('하루 이미지 삭제 재전송과 이미 비어 있는 슬롯은 성공하며 새로 올라온 이미지를 건드리지 않는다',()=>{
 const c=client();c.post({scope:'day'});const meta=c.get().menuImages['day:'+DATE],file=[...c.shared.files.values()][0];
 const removed=removeImage(c,meta);assert.equal(receipt(c,removed).ok,true);assert.equal(file.trashed,true);
 const absent=removeImage(c,meta);assert.equal(receipt(c,absent).ok,true);assert.equal(c.get().menuImages['day:'+DATE],undefined);
 c.post({scope:'day'});const next=c.get().menuImages['day:'+DATE],nextFile=[...c.shared.files.values()][1];
 assert.notEqual(next.id,meta.id);assert.equal(c.submit(removed.body).duplicate,true);assert.equal(receipt(c,removed).ok,true);
 assert.equal(c.get().menuImages['day:'+DATE].id,next.id);assert.equal(nextFile.trashed,false);assert.equal(c.shared.files.size,2);
});
test('삭제 대상 UUID의 동시 교체·잘못된 날짜·잘못된 범위를 검증하고 새 이미지를 보호한다',()=>{
 const a=client(),b=client(a.shared);a.post();a.post({scope:'day'});a.post({scope:'day'},{date:'2026-10-20'});
 const old=b.get().menuImages['week:'+DATE],day=b.get().menuImages['day:'+DATE];
 a.post({expectedImageId:old.id});const current=a.get().menuImages['week:'+DATE],filesBefore=[...a.shared.files.values()].map(f=>[f.id,f.trashed]);
 for(const [meta,extra,payload] of [[old,{},{}],[current,{},{scope:'day'}],[day,{date:'2026-10-20'},{}]]){
  const deleted=removeImage(b,meta,extra,payload);assert.equal(receipt(b,deleted).ok,false);assert.match(receipt(b,deleted).error,/먼저 바꿨어요/);
 }
 const emptyOtherDay=removeImage(b,day,{date:'2026-10-22'});assert.equal(receipt(b,emptyOtherDay).ok,true);
 assert.equal(a.get().menuImages['week:'+DATE].id,current.id);assert.equal(a.get().menuImages['day:'+DATE].id,day.id);
 assert.deepEqual([...a.shared.files.values()].map(f=>[f.id,f.trashed]),filesBefore);
});
test('이미지 삭제는 팀 키·기존 멤버·UUID·범위·일반 요청 크기 제한을 지킨다',()=>{
 const c=client();c.post();const meta=c.get().menuImages['week:'+DATE],file=[...c.shared.files.values()][0];
 for(const extra of [{key:'wrong'},{op:{type:'menuImageDelete',actor:'unknown',id:'a'.repeat(24),payload:{scope:'week',expectedImageId:meta.id}}},{date:'2026-99-99'}]){
  assert.equal(removeImage(c,meta,extra).response.ok,false);
 }
 for(const payload of [{expectedImageId:''},{expectedImageId:null},{expectedImageId:'not-a-uuid'},{scope:'month'}]){
  const deleted=removeImage(c,meta,{},payload);assert.equal(receipt(c,deleted).ok,false);
 }
 assert.equal(removeImage(c,meta,{}, {extra:'x'.repeat(10000)}).response.ok,false);
 assert.equal(c.get().menuImages['week:'+DATE].id,meta.id);assert.equal(file.trashed,false);assert.equal(c.shared.locked(),false);
});
test('전용 폴더·파일 태그·실제 부모가 맞지 않는 파일은 삭제하지 않는다',()=>{
 const tamper=[
  (c,file)=>{file.description='personal image';},
  (c,file)=>{file.getParents=()=>iterator([{getId:()=> 'unrelated-folder'}]);},
  (c,file,folder)=>{folder.description='unrelated folder';},
  (c,file,folder)=>{
   const foreign=folder.createFile(c.shared.blob(PNG,'image/png','개인사진.png'));
   const key='LUNCH_MENU_IMAGE_week_'+DATE,entry=JSON.parse(c.shared.store[key]);entry.fileId=foreign.id;c.shared.store[key]=JSON.stringify(entry);
  }
 ];
 for(const mutate of tamper){
  const c=client();c.post();const meta=c.get().menuImages['week:'+DATE],file=[...c.shared.files.values()][0],folder=[...c.shared.folders.values()][0];mutate(c,file,folder);
  const before=c.shared.store['LUNCH_MENU_IMAGE_week_'+DATE],deleted=removeImage(c,meta);
  assert.equal(receipt(c,deleted).ok,false);assert.equal(c.shared.store['LUNCH_MENU_IMAGE_week_'+DATE],before);
  assert.ok([...c.shared.files.values()].every(f=>!f.trashed));assert.equal(c.shared.locked(),false);
 }
});
test('Drive 접근·휴지통 이동·원본 찾기 실패는 삭제 메타데이터를 보존한다',()=>{
 for(const fault of ['access','trash','missing']){
  const c=client();c.post();const meta=c.get().menuImages['week:'+DATE],file=[...c.shared.files.values()][0];
  if(fault==='access')c.shared.disableDrive(true);
  if(fault==='trash')file.setTrashed=()=>{throw Error('cannot trash');};
  if(fault==='missing')c.shared.files.delete(file.id);
  const deleted=removeImage(c,meta);assert.equal(receipt(c,deleted).ok,false,fault);assert.match(receipt(c,deleted).error,/initializeLunchClub.*Drive 권한/);
  assert.equal(c.get().menuImages['week:'+DATE].id,meta.id);assert.equal(file.trashed,false);assert.equal(c.shared.locked(),false);
 }
});
test('삭제 메타데이터 저장 실패는 파일을 복원하고 복원 실패도 다음 삭제로 마무리할 수 있다',()=>{
 for(const restoreFails of [false,true]){
  const c=client();c.post();const meta=c.get().menuImages['week:'+DATE],file=[...c.shared.files.values()][0],calls=[],setTrashed=file.setTrashed.bind(file);
  file.setTrashed=v=>{calls.push(v);if(!v&&restoreFails)throw Error('restore failed');return setTrashed(v);};
  c.shared.failDelete(k=>k==='LUNCH_MENU_IMAGE_week_'+DATE);const deleted=removeImage(c,meta);c.shared.failDelete(null);
  assert.equal(receipt(c,deleted).ok,false);assert.match(receipt(c,deleted).error,/다시 삭제/);assert.equal(c.get().menuImages['week:'+DATE].id,meta.id);
  assert.deepEqual(calls,[true,false]);assert.equal(file.trashed,restoreFails);
  if(!restoreFails)assert.equal(c.get({action:'menuImage',scope:'week',imageId:meta.id}).image.dataUrl,DATA);
  const retried=removeImage(c,meta);assert.equal(receipt(c,retried).ok,true);assert.equal(c.get().menuImages['week:'+DATE],undefined);assert.equal(file.trashed,true);
  assert.equal(c.shared.locked(),false);
 }
});
test('이미지 삭제 후 영수증 저장 실패를 재시도해도 새 이미지 삭제나 중복 작업이 발생하지 않는다',()=>{
 for(const replaced of [false,true]){
  const c=client();c.post();const meta=c.get().menuImages['week:'+DATE],file=[...c.shared.files.values()][0];
  c.shared.failProperty(k=>k==='LUNCH_DAY_'+DATE);const removed=removeImage(c,meta);c.shared.failProperty(null);
  assert.equal(removed.response.ok,false);assert.equal(file.trashed,true);assert.equal(c.get().menuImages['week:'+DATE],undefined);
  if(replaced)c.post();
  const next=c.get().menuImages['week:'+DATE],trashCount=c.shared.events.filter(e=>e[0]==='trash').length;
  assert.equal(c.submit(removed.body).accepted,true);assert.equal(receipt(c,removed).ok,!replaced);
  if(replaced){assert.match(receipt(c,removed).error,/먼저 바꿨어요/);assert.equal(c.get().menuImages['week:'+DATE].id,next.id);assert.equal([...c.shared.files.values()][1].trashed,false);}
  else assert.equal(c.get().menuImages['week:'+DATE],undefined);
  assert.equal(c.shared.events.filter(e=>e[0]==='trash').length,trashCount);assert.equal(c.submit(removed.body).duplicate,true);
 }
});
