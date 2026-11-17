import {BleBoard,nonce,pause} from './protocol.js?v=0.8.0';
import {validateBoardName} from './provisioning.js?v=0.8.0';
import {slotForCard,cardAction,advertisedName,canAdoptCurrentIdentity,activeCardIndices,uploadNamesAreDistinct,flashGuards} from './setup-state.js?v=0.8.0';
import {validateManifest,WRITE_PLAN,PROTECTED_REGIONS} from './production.js?v=0.8.0';
import {TESTS,resultFor,summary,countResults,reportObject,csv,escapeHTML as esc,addRow,validatePower,adjustResult} from './evidence.js?v=0.8.0';

const $=id=>document.getElementById(id);
const KEY='milmesh.web.runs.v1';
const labels={PASS:'Geçti',FAIL:'Kaldı',BLOCKED:'Eksik koşul',SKIP:'Atlandı',PENDING:'Bekliyor'};
const symbols={PASS:'✓',FAIL:'✕',BLOCKED:'!',SKIP:'–',PENDING:'·'};
const titles={setup:['Kartların, kendi isimleriyle.','Tek bir yerden yükle, bağlan ve test et.'],components:['Her kart için, kayıtlı bir test.','Bluetooth ile bağlanın. Bileşenleri doğrulayın. Sonuçları birlikte görün.'],
  power:['Güç durumlarını görünür kılın.','Uyku, uyanma ve yeniden açılış için ayrı ayrı kanıt toplayın.'],
  radio:['Haberleşmeyi iki uçtan doğrulayın.','Paketler, güç komutları ve karşı cihazın aldığı gerçek veri.'],
  report:['Kontrol edilen her şey, bir raporda.','Kart kimliği, ölçümler ve eksik kalan testler birlikte saklanır.'],
  update:['MilMesh yazılımını USB ile güncelleyin.','Sahadaki kartı bilgisayara takın. Üretim yazılımı yazılır; kart adı, ayarlar ve mesajlar korunur. Bilgisayarda Chrome, Edge veya Opera gerekir.']};
// Two top-level sections: "Yazılım güncelleme" (#guncelle, default) and "Kart testi" (#test, #test/<view>).
const TEST_VIEWS=['setup','components','power','radio','report'];
const SECTIONS={update:{eyebrow:'YAZILIM GÜNCELLEME',badge:'Web Serial',title:'MilMesh · Yazılım Güncelleme'},test:{eyebrow:'TEZGAHTAN RAPORA',badge:'Web Bluetooth',title:'MilMesh · Kart Test Merkezi'}};
const SECTION_LOCKED='İşlem sürüyor. Bölüm, işlem bitince değiştirilebilir; USB kablosunu çıkarmayın.';
let saved=[];
try { const v=JSON.parse(localStorage.getItem(KEY)||'[]'); if (Array.isArray(v)) saved=v.filter(r=>r?.id && Array.isArray(r.records) && r.mac); } catch {}
const slots=[];
const flashSlots=[{port:null,receipt:null},{port:null,receipt:null}];
let receipts=[];try{receipts=JSON.parse(localStorage.getItem('milmesh.web.uploads.v1')||'[]');}catch{}
if(!Array.isArray(receipts))receipts=[];
let active=-1, view='update',section='update',testView='setup',filter='all',busy=false,started=0,toastTimer,storageError=false;
let archived=saved;
let setupSaved=null;try{setupSaved=JSON.parse(localStorage.getItem('milmesh.web.setup.v2')||'null');}catch{}
let deviceCount=setupSaved?.count===2?2:1;
function cardSlot(i){return slotForCard(slots,i,flashSlots[i].receipt);}
function keepSetup(){try{localStorage.setItem('milmesh.web.setup.v2',JSON.stringify({count:deviceCount,names:[$('setupNameA').value,$('setupNameB').value],uploads:flashSlots.map(v=>v.receipt?.upload_id||null)}));}catch{}}
function manageBoards(index=null){showView('setup');if(index!==null){if(index===1)deviceCount=2;render();$(`setupName${index?'B':'A'}`).focus();}}

function blocked(message){return Object.assign(new Error(message),{testState:'BLOCKED'});}
function current() { return slots[active]; }
function run() { return current()?.run; }
function save() {
  try{localStorage.setItem('milmesh.web.uploads.v1',JSON.stringify(receipts));}catch{}
  keepSetup();
  const live=slots.map(s=>s.run); const ids=new Set(live.map(r=>r.id));
  const runs=[...live,...archived.filter(r=>!ids.has(r.id))].slice(0,12);
  try { localStorage.setItem(KEY,JSON.stringify(runs)); } catch {
    if (!storageError) {storageError=true;toast('Tarayıcı depolama alanı dolu. JSON raporunu şimdi indirin.',true);}
  }
}
function toast(text,error=false) {
  clearTimeout(toastTimer); $('toast').textContent=text; $('toast').classList.toggle('error',error); $('toast').hidden=false;
  toastTimer=setTimeout(()=>$('toast').hidden=true,error?12000:6500);
}
function localRow(slot,id,result,code,data={},source='browser') {
  const row={test:id,result,code,data,source,device_mac:slot.run.mac,fw:slot.board.identity?.fw,
    elf_sha256:slot.board.identity?.elf_sha256,boot:slot.board.identity?.boot,received_at:new Date().toISOString()};
  addRow(slot.run,row); save(); render(); return row;
}
function append(slot,row) { const value={...row,source:'firmware'};addRow(slot.run,value);save();render();return value; }
async function cmd(slot,text,options={}) {
  const staged=[];
  const rows=await slot.board.rpc(text,{...options,onRecord:r=>{staged.push(append(slot,{...r,transport_verified:false,power_context:slot.run.battery_test_active?'battery-only':'normal'}));options.onRecord?.(r);}});
  for(const row of staged)row.transport_verified=true;
  save();render();
  if(slot.run.battery_test_active){
    const done=rows.at(-1)?.data;
    if(!done?.usb_monitor_available || done.usb_data_before || done.usb_data_after || done.usb_data_seen_during_command)throw new Error('Batarya testi koşulu kayboldu: USB veri bağlantısı görüldü veya izleme kanıtı eksik.');
    if(slot.board.identity.boot!==slot.run.battery_suite_boot)throw new Error('Batarya testinde açılış kimliği değişti.');
  }
  const block=rows.find(r=>r.test==='WEB-RPC' && r.result!=='PASS');
  const invalid=rows.find(r=>r.test==='CLI' && r.result==='FAIL');
  if(block)throw blocked(block.code);if(invalid)throw new Error(invalid.code);
  return rows;
}
function makeRun(name,identity) {
  const value={id:nonce(),name,mac:identity.mac,started_at:new Date().toISOString(),identities:[{...identity,seen_at:new Date().toISOString()}],
    records:[],notes:'',pending:null,session_boot:null};
  return value;
}
async function session(slot) {
  if (slot.run.session_boot===slot.board.identity.boot) return;
  await cmd(slot,`WEB SESSION ${slot.run.name} web ${slot.run.id}`);
  await cmd(slot,'CONTEXT LORA_PAIR CONFIRM');
  slot.run.session_boot=slot.board.identity.boot; save();
}
function needConnected() {
  const slot=current();
  if (!slot?.board.connected) throw blocked('Önce bir kart bağlayın.');
  if (slot.run.pending) throw blocked('Önce bekleyen güç testini doğrulayın veya iptal edin.');
  return slot;
}
function progress(title,text='Kartın yanıtı bekleniyor.') {
  $('operationTitle').textContent=title; $('operationText').textContent=text;
}
async function work(title,fn,id='WEB-LINK',errorSlot=current()) {
  if (busy) return;
  busy=true;started=Date.now();$('operation').hidden=false;progress(title);render();
  try { await fn(); }
  catch (error) {
    if (errorSlot && !error.cancelled && error.recordedTest!==id) localRow(errorSlot,id,error.testState||'FAIL',error.message,{error_name:error.name,diagnostics:error.diagnostics||null,original_error:error.cause?.message||null},'browser');
    toast(error.message,!error.cancelled);
  } finally { busy=false;$('operation').hidden=true;render(); }
}
function ask({title,text,fields=[],buttons=[['start','Başlat','primary'],['skip','Atla','secondary']],eyebrow='TEST ADIMI',facts=[],notes=[]}) {
  return new Promise(resolve=>{
    const dialog=$('promptDialog'),form=$('promptForm');
    $('dialogTitle').textContent=title;$('dialogText').textContent=text;$('dialogEyebrow').textContent=eyebrow;$('dialogError').textContent='';
    $('dialogFields').replaceChildren();$('dialogButtons').replaceChildren();
    $('dialogFacts').replaceChildren(...facts.flatMap(([k,v])=>{const dt=document.createElement('dt'),dd=document.createElement('dd');dt.textContent=k;dd.textContent=v;return [dt,dd];}));$('dialogFacts').hidden=!facts.length;
    $('dialogNotes').replaceChildren(...notes.map(([kind,t])=>{const p=document.createElement('p');p.className='dialog-note '+kind;p.textContent=t;return p;}));
    for (const f of fields) {
      const label=document.createElement('label');label.textContent=f.label;
      const input=document.createElement(f.options?'select':'input');input.name=f.id;input.id='field-'+f.id;
      if (f.options) for (const [value,text] of f.options) {const option=document.createElement('option');option.value=value;option.textContent=text;input.append(option);}
      else input.type=f.type||'text';
      for (const key of ['required','pattern','min','max','step','maxLength','placeholder']) if (f[key]!==undefined) input[key]=f[key];
      if (f.value!==undefined) input.value=f.value;
      if (f.type==='checkbox') {label.className='check-line';label.prepend(input);} else label.append(input);
      $('dialogFields').append(label);
    }
    let settled=false;
    const finish=value=>{if(settled)return;settled=true;dialog.close();resolve(value);};
    form.onsubmit=event=>event.preventDefault();
    dialog.oncancel=event=>{event.preventDefault();finish({choice:'skip',values:{}});};
    for (const [choice,text,kind] of buttons) {
      const button=document.createElement('button');button.type='button';button.className=kind;button.textContent=text;
      button.onclick=()=>{
        if (!['skip','cancel','no'].includes(choice) && !form.reportValidity()) return;
        const values={};for (const f of fields) {const input=form.elements.namedItem(f.id);values[f.id]=f.type==='checkbox'?input.checked:input.value;}
        finish({choice,values});
      };
      $('dialogButtons').append(button);
    }
    dialog.showModal();form.querySelector('input,select,button')?.focus();
  });
}
async function connectCard(index){
 if(busy)return;
 const item=flashSlots[index],existing=cardSlot(index),letter=index?'B':'A';
 if(existing?.board.connected){active=slots.indexOf(existing);showView(existing.run.pending?'power':'components');return;}
 let name;
 try{name=validateBoardName(item.receipt?.name||$(`setupName${letter}`).value);}catch(error){toast(error.message,true);return;}
 await work(`${name} · Bluetooth bağlantısı`,async()=>{
   if(existing){active=slots.indexOf(existing);await reconnectSlot(existing);return;}
   const board=new BleBoard();let attached=false;
   try{
     const info=await board.connect(true,item.receipt?.mac,item.receipt?.name_written?advertisedName(item.receipt):name,slots.map(v=>v.board.device?.id).filter(Boolean));
     if(slots.some(s=>s.run.mac===info.mac))throw blocked('Bu fiziksel kart zaten diğer kart alanında bağlı.');
     let receipt=item.receipt;
     if(receipt?.flash_verified && (receipt.elf_sha256!==info.elf_sha256 || receipt.version!==info.fw)){
       const {fetchRelease}=await import('./vendor/flasher.js?v=0.8.0');const {release}=await fetchRelease();
       if(canAdoptCurrentIdentity(receipt,info,release,name)){
         receipt={name,board_name:info.name,ble_name:info.name,name_written:true,name_verified:true,mac:info.mac,version:info.fw,
           elf_sha256:info.elf_sha256,application_verified:true,flash_verified:false,external_release_verified:true,
           replaced_upload_id:receipt.upload_id,role:letter,upload_id:nonce()};
         item.receipt=receipt;receipts.push(receipt);
       }
     }
     if(receipt?.flash_verified && (receipt.elf_sha256!==info.elf_sha256 || receipt.version!==info.fw))throw new Error('Yüklenen yazılımın canlı kimliği eşleşmiyor.');
     if(receipt?.name_written && (info.named!==true || info.name!==receipt.ble_name))throw new Error('Karta yazılan ad ile yayınlanan Bluetooth adı eşleşmiyor.');
     const previous=archived.find(r=>!r.closed_at && r.mac===info.mac && r.name===name &&
       r.identities?.at(-1)?.elf_sha256===info.elf_sha256 && (r.upload?.upload_id||null)===(receipt?.flash_verified?receipt.upload_id:null));
     const record=previous||makeRun(name,info);record.board_role=letter;record.session_boot=null;
     if(previous)record.identities.push({...info,seen_at:new Date().toISOString()});
     const slot={board,run:record,roleIndex:index,linkSamples:[]};slots.push(slot);active=slots.length-1;attached=true;
     if(receipt?.flash_verified){receipt.application_verified=true;receipt.name_verified=!!receipt.name_written && info.named===true && info.name===receipt.ble_name;record.upload={...receipt};
       if(!record.records.some(r=>r.test==='WEB-FLASH'))localRow(slot,'WEB-FLASH','PASS','Yazım hash ve canlı MAC / yazılım kimliği doğrulandı.',receipt);}
     if(receipt?.external_release_verified && !record.records.some(r=>r.test==='WEB-FLASH'))localRow(slot,'WEB-FLASH','SKIP','Karttaki güncel yazılım kimliği doğrulandı; bu tarayıcı oturumunda USB yüklemesi yapılmadı.',receipt);
     if(!receipt){
       item.receipt={name,board_name:info.named?info.name:null,ble_name:info.name,name_written:info.named===true,name_verified:info.named===true,
         mac:info.mac,version:info.fw,elf_sha256:info.elf_sha256,application_verified:true,flash_verified:false,role:letter,upload_id:nonce()};
       receipts.push(item.receipt);
     }
     item.receipt.ble_device_id=board.device.id;
     board.addEventListener('disconnected',event=>{
       record.session_boot=null;if(record.pending){record.pending.saw_disconnect=true;save();}
       render();
       if(!record.pending && !busy && !event.detail?.expected)toast(`${record.name} bağlantısı kesildi. Kart alanından Yeniden bağlan düğmesini kullanın. Bu durum tek başına anten arızası göstermez.`,true);
     });
     if(record.pending)await checkPower(slot);else{await session(slot);await cmd(slot,'STATUS');}
     await refreshLink(slot).catch(()=>{});save();showView('setup');toast(`${name} hazır. Kart alanındaki Testleri aç düğmesiyle başlayın.`);
   }catch(error){if(!attached && board.device)board.disconnect('başarısız bağlantı');throw error;}
 },'WEB-LINK',existing||null);
}
async function reconnectSlot(slot,{select=false}={}){
 let info;
 try{info=await slot.board.connect(select,slot.run.mac,slot.board.identity?.name,slots.filter(s=>s!==slot).map(s=>s.board.device?.id).filter(Boolean));}
 catch(error){if(slot.run.pending){const e=blocked('Uyku testindeki karta bağlanılamadı. LED 1/2 yanıyor ve LED 3 yanıp sönüyorsa kart uyanık; Bluetooth listesinden yeniden seçin. Üçü sönükse kart uyuyor veya besleme yok. USB ile açılması doğru uyandığını tek başına kanıtlamaz.');e.diagnostics=error.diagnostics;e.cause=error;throw e;}throw error;}
 slot.run.identities.push({...info,seen_at:new Date().toISOString()});
 if(slot.run.pending)await checkPower(slot);else{await session(slot);await cmd(slot,'STATUS');}
 await refreshLink(slot).catch(()=>{});save();render();toast(`${slot.run.name} yeniden bağlandı.`);
}
async function reconnect(){const s=current();if(!s||busy)return;await work(`${s.run.name} yeniden bağlanıyor`,()=>reconnectSlot(s),'WEB-LINK',s);}
async function manualResult(id,record=run()){
 if(!record||busy)return;
 const item=summary(record).find(t=>t.id===id);if(!item)return;
 const answer=await ask({title:`${record.name} · ${item.name}`,eyebrow:'SONUCU ELLE DÜZELT',
  text:'Bu işlem rapordaki işareti değiştirir. Ham ölçüm ve önceki düzeltmeler saklanır; PDF/JSON sonucu elle düzeltildi olarak gösterir. Kartın fiziksel durumunu veya bekleyen uyku testini değiştirmez.',
  fields:[{id:'manual-result',label:'Yeni sonuç',options:[['PASS','✓ Geçti — operatör değerlendirmesi'],['FAIL','✕ Kaldı'],['BLOCKED','! Eksik koşul'],['SKIP','– Atlandı'],['RESTORE','Özgün ölçüm sonucuna dön']],value:['PASS','FAIL','BLOCKED','SKIP'].includes(item.result)?item.result:'PASS'},
   {id:'manual-note',label:'Açıklama (isteğe bağlı)',maxLength:500,placeholder:'Örn. testi gözledim; tekrar çalıştırmadan düzeltiyorum.'}],
  buttons:[['save','Düzeltmeyi kaydet','primary'],['skip','Vazgeç','secondary']]});
 if(answer.choice!=='save')return;
 adjustResult(record,id,answer.values['manual-result']==='RESTORE'?null:answer.values['manual-result'],answer.values['manual-note']);save();render();toast('Elle düzeltme kaydedildi; ham test kayıtları korundu.');
}
async function refreshLink(slot){
 const value=await slot.board.link();slot.link=value;
 if(value.supported){slot.linkSamples.push(value);slot.linkSamples=slot.linkSamples.slice(-12);}
 render();return value;
}
async function connectionDiagnostic(){
 const slot=current();if(!slot?.board.connected||busy)return;
 await work(`${slot.run.name} · bağlantı değerlendirmesi`,async()=>{
   const samples=[];
   for(let i=0;i<5;i++){progress('Bluetooth sinyali ölçülüyor',`${i+1} / 5 · kartı bilgisayarın yakınında sabit tutun.`);samples.push(await refreshLink(slot));if(i<4)await pause(1000);}
   const exchange=await slot.board.echo(20);
   localRow(slot,'BLE-DIAGNOSTIC','PASS','Tek bağlantıda 20 paketin tüm baytları eşleşti. Bu sonuç anten arızası tanısı değildir.',{samples,exchange,antenna_fault_proven:false});
   toast('20 paket eşleşti. Anlık sinyal ve bağlantı bilgisi kart alanında görünüyor; anten arızası bu testle kesinleştirilemez.');
 },'BLE-DIAGNOSTIC',slot);
}
function archiveSlot(slot){
 slot.board.disconnect('kart değiştiriliyor');slot.run.closed_at=new Date().toISOString();
 archived=[slot.run,...archived.filter(r=>r.id!==slot.run.id)];const i=slots.indexOf(slot);if(i>=0)slots.splice(i,1);
 active=slots.length?Math.min(active,slots.length-1):-1;
}
function replaceCard(index){if(busy)return;const s=cardSlot(index);if(s)archiveSlot(s);flashSlots[index]={port:null,receipt:null};save();render();}
function setDeviceCount(count){if(busy)return;if(count===1){for(const second of [...slots].filter(s=>s.roleIndex===1))archiveSlot(second);flashSlots[1]={port:null,receipt:null};}deviceCount=count;save();render();}
const testActions={
  'FT-01':s=>cmd(s,'STATUS'), 'FT-02.RW':s=>cmd(s,'FLASH SCRATCH CONFIRM'),
  'I2C-0':s=>cmd(s,'I2C SCAN'),'I2C-1':s=>cmd(s,'I2C SCAN'),
  'FT-05.SIGNAL':s=>cmd(s,'POWER READ'),'FT-06':s=>cmd(s,'GAUGE READ'),
  'FT-08.ID':s=>cmd(s,'IMU READ'), 'FT-09':async s=>{await cmd(s,'GNSS AUTO');await cmd(s,'GNSS STATUS 3');},
  'FT-09.TX':s=>cmd(s,'GNSS LINK 5'),
  'FT-04':buttonStep,'FT-08.MOTION':imuStep,'FT-03.1':ledStep,'FT-03.2':ledStep,'FT-03.3':ledStep,
  'FT-12':digitalStep,'WEB-BLE':bleStep,'FT-14':async s=>{if(!(await s.board.identityNow()).usb_data_connected)throw new Error('Bu adım USB ile kararlılık içindir; batarya akışını kullanın.');progress('10 saniye USB ile kararlılık','Sensörler ve veri yolu sayaçları izleniyor.');await cmd(s,'SOAK 10');},
};
async function ledStep(s,{manual=false}={}) {
  const identity=await s.board.identityNow();
  if(!identity.usb_data_connected && !manual){for(let i=1;i<=3;i++)localRow(s,`FT-03.${i}`,'SKIP','Otomatik batarya akışında LED gözlemi kapsam dışı. LED satırından ayrıca elle başlatılabilir.',{},'scope');return;}
  const ready=await ask({title:'LED testine hazır mısınız?',text:`${s.run.name} kartına bakın. Hazırım dediğinizde LED 1 → LED 2 → LED 3 sırayla yanıp sönecek. Her LED yaklaşık 0,6 saniye yanar. ${identity.usb_data_connected?'USB veri bağlantısı var.':'USB veri bağlantısı yok; seçtiğiniz LED testi batarya ile çalışacak.'} Sonraki pencereden tekrar gösterebilirsiniz.`,
    buttons:[['start','Hazırım, LED’leri yak','primary'],['skip','Testi atla','secondary']]});
  if(ready.choice!=='start'){for(let i=1;i<=3;i++)localRow(s,`FT-03.${i}`,'SKIP','Operatör LED testini başlamadan atladı.',{},'operator');return;}
  let answer;
  do {
    progress('LED testi çalışıyor','ŞİMDİ kartı izleyin: LED 1 → LED 2 → LED 3.');
    const rows=await cmd(s,'LED TEST');
    const events=rows.filter(r=>r.test==='LED-EVENT');
    const complete=[1,2,3].every(i=>events.some(r=>r.result==='PASS'&&r.code==='LED_ON'&&r.data?.led===i))&&rows.some(r=>r.test==='FT-03'&&r.result==='BLOCKED'&&r.code==='VISUAL_CONFIRM_REQUIRED');
    const problem=rows.find(r=>r.result==='FAIL'||r.test==='FT-03'&&(r.result!=='BLOCKED'||r.code!=='VISUAL_CONFIRM_REQUIRED'));
    if(!complete||problem){
      const state=problem?.result==='FAIL'?'FAIL':'BLOCKED';
      for(let i=1;i<=3;i++)localRow(s,`FT-03.${i}`,state,'LED sırası kart tarafından tamamlanmadı; görsel sonuç kabul edilmedi.',{firmware_code:problem?.code||null,led_events:events},'browser');
      toast('Karttan üç LED için açma kaydı alınamadı. Test günlüğündeki engeli kontrol edin.',true);return;
    }
    answer=await ask({title:'Üç LED’i gördünüz mü?',text:'Her LED için ayrı sonuç seçin. Gözlenmeyen LED başarılı sayılmaz. Sırayı kaçırdıysanız Tekrar göster düğmesine basıp kartı izleyin.',
      fields:[1,2,3].map(i=>({id:`led${i}`,label:`LED ${i}`,options:[['unseen','Gözleyemedim'],['pass','Yandı, sorun yok'],['fail','Yanmadı / sorun var']]})),buttons:[['save','Gözlemleri kaydet','primary'],['repeat','Tekrar göster','secondary'],['skip','Gözleyemedim','secondary']]});
  }while(answer.choice==='repeat');
  for (let i=1;i<=3;i++) {
    const value=answer.values[`led${i}`];
    if (answer.choice==='save' && ['pass','fail'].includes(value)) await cmd(s,`LED RESULT ${i} ${value.toUpperCase()}`);
    else localRow(s,`FT-03.${i}`,'BLOCKED','LED gözlemi yapılmadı.',{},'operator');
  }
}
async function buttonStep(s) {
  const answer=await ask({title:'SW3’e basıp bırakın.',text:'Başlat’a bastıktan sonra 15 saniye içinde karttaki SW3 butonuna birkaç kez basıp bırakın.'});
  if (answer.choice!=='start') return localRow(s,'FT-04','SKIP','Operatör buton testini atladı.',{},'operator');
  progress('SW3 testi · 15 saniye','ŞİMDİ karttaki SW3’e basıp bırakın.');await cmd(s,'BTN MONITOR 15');
}
async function imuStep(s) {
  const answer=await ask({title:'Kartı hareket ettirmeye hazır olun.',text:'Başlat’a bastıktan sonra kartı 10 saniye boyunca yavaşça farklı yüzleri yukarı gelecek şekilde üç eksende çevirin.'});
  if (answer.choice!=='start') return localRow(s,'FT-08.MOTION','SKIP','Operatör hareket testini atladı.',{},'operator');
  const enabled=await cmd(s,'IMU ENABLE CONFIRM');
  if (!enabled.some(r=>r.test==='IMU-CONFIG' && r.result==='PASS')) {localRow(s,'FT-08.MOTION','BLOCKED','IMU etkinleştirilemedi.');return;}
  progress('IMU hareket testi · 10 saniye','ŞİMDİ kartı üç eksende yavaşça çevirin.');await cmd(s,'IMU MOTION 10');await cmd(s,'IMU READ');
}
async function radioApprovals(s) {
  await cmd(s,'ACCEPT POWER5 CONFIRM');await cmd(s,'ACCEPT LORA_GROUND CONFIRM');await cmd(s,'ACCEPT RF CONFIRM');
}
async function confirmRadio(single=false) {
  if ($('radioReady').checked) return true;
  const answer=await ask({title:single?'LoRa bağlantısını kontrol edin.':'İki LoRa kartını hazırlayın.',
    text:single?'LoRa modülü takılı mı; 5 V beslemesi ve pin11 dahil tüm GND bağlantıları kontrol edildi mi? Bu adım RF yayını yapmaz.':'İki LoRa modülünde uygun anten, 5 V besleme ve pin11 dahil tüm GND bağlantıları tamam mı?',
    buttons:[['yes','Evet, kontrol ettim','primary'],['skip','Atla','secondary']]});
  return answer.choice==='yes';
}
async function digitalStep(s) {
  if (!await confirmRadio(true)) return localRow(s,'FT-12','BLOCKED','LoRa montaj / besleme / GND koşulları doğrulanmadı.',{},'operator');
  await radioApprovals(s);await cmd(s,'LORA DIGITAL');
}
async function bleStep(s) {
  progress('Bluetooth veri bütünlüğü · 20 saniye','Üç bağlantıda süreye göre paket yazılıp okunuyor; her bayt karşılaştırılıyor.');
  const exchanges=[];const boot=s.board.identity.boot,start=performance.now(),deadline=start+20000;
  try {
    for(let round=0;round<3;round++){
      const budget=Math.floor((deadline-performance.now()-(2-round)*1500)/(3-round));
      if(budget<100)throw blocked('20 saniyelik BLE penceresinde üç bağlantı tamamlanamadı.');
      const data=await s.board.echo(0,{durationMs:budget,onProgress:p=>progress(`Bluetooth ${round+1} / 3 · ${Math.min(20,Math.floor((performance.now()-start)/1000))} / 20 sn`,`${p.packets} paket · 20 bayt · birebir karşılaştırma`)});exchanges.push(data);
      if(data.before.ble_host_resets!==exchanges[0].before.ble_host_resets)throw new Error('Bağlantı turları arasında Bluetooth yığını reset oldu.');
      if(s.run.battery_test_active && (!data.usb_absent_observed || data.usb_samples_before!==exchanges[0].usb_samples_before))throw new Error('BLE batarya koşulu doğrulanamadı; USB veri bağlantısı görüldü veya izleme eksik.');
      if(round<2){await s.board.disconnect('BLE testinde bağlantı turu');await pause(1500);await s.board.connect(false,s.run.mac,s.board.identity.name);if(s.board.identity.boot!==boot)throw new Error('BLE yeniden bağlantıları arasında kart reset oldu.');}
    }
    if(exchanges.at(-1).after.ble_connections < exchanges[0].before.ble_connections+2)throw new Error('Üç ayrı BLE bağlantısı kart sayacında doğrulanamadı.');
    localRow(s,'WEB-BLE','PASS','20 saniye hedefli üç bağlantıda bütün paket baytları eşleşti; açılış ve BLE reset sayacı değişmedi.',{target_ms:20000,elapsed_ms:Math.round(performance.now()-start),exchanges});
  } catch(error){localRow(s,'WEB-BLE',error.testState||'FAIL',error.message,{completed_rounds:exchanges.length,diagnostics:error.diagnostics||null,original_error:error.cause?.message||null});error.recordedTest='WEB-BLE';throw error;}
}
async function runTest(id) {
  await work(TESTS.find(t=>t.id===id)?.name||'Test çalışıyor',async()=>{
    const slot=needConnected();await session(slot);if(/^FT-03\.[123]$/.test(id))await ledStep(slot,{manual:true});else await testActions[id](slot);
  },id);
}
async function runAll() {
  await work('Yönlendirmeli komponent testi',async()=>{
    const slot=needConnected();await session(slot);
    const power=await ask({title:'Besleme koşulunu belirtin.',text:'Batarya takılı değilse batarya ölçüm ve profil kontrolleri atlanır.',buttons:[['battery','Batarya takılı','primary'],['usb','Yalnız USB','secondary'],['cancel','Vazgeç','secondary']]});
    if (power.choice==='cancel' || power.choice==='skip') return;
    slot.run.supply_attestation={battery_connected:power.choice==='battery',at:new Date().toISOString()};save();
    if (power.choice==='usb') await cmd(slot,'CONTEXT USB_ONLY');
    else await cmd(slot,'CONTEXT BATTERY CONFIRM');
    const steps=['FT-01','FT-02.RW','I2C-0','FT-05.SIGNAL','FT-06','FT-08.ID','FT-03.1','FT-04','FT-08.MOTION','FT-09','FT-09.TX','FT-12','WEB-BLE'];
    for (const id of steps) {
      if (!slot.board.connected) throw new Error('Bağlantı kesildi. Kalan testler çalıştırılmadı; yeniden bağlandıktan sonra devam edebilirsiniz.');
      progress(TESTS.find(t=>t.id===id).name);
      try { await testActions[id](slot); }
      catch (error) {if(error.recordedTest!==id)localRow(slot,id,error.testState||'FAIL',error.message);if(!slot.board.connected)throw error;}
    }
    const stability=await ask({title:'10 saniye USB kararlılık testi',text:'GPS için konum fix beklenmez. USB bağlıysa sensör ve veri yolu kararlılık testi de yapılabilir.',buttons:[['start','Kararlılığı test et','primary'],['skip','Atla','secondary']]});
    if(stability.choice==='start')await testActions['FT-14'](slot);
    toast('Komponent adımları tamamlandı. Güç ve uyku, iki kartlı LoRa ve batarya testleri kendi ekranlarında hazır.');
  });
}
const modes={LIGHT_TIMER:1,LIGHT_SW3:2,DEEP_TIMER:3,DEEP_SW3:4,SOFT_OFF:5,RESTART:6,CYCLE:7};
function schedulePowerReconnect(slot,pending,delay=3000){
 clearTimeout(slot.powerReconnectTimer);
 slot.powerReconnectTimer=setTimeout(async()=>{
  if(!slots.includes(slot)||slot.run.pending!==pending)return;
  if(busy||$('promptDialog').open){schedulePowerReconnect(slot,pending,2000);return;}
  pending.auto_attempts=(pending.auto_attempts||0)+1;save();
  await work(`${slot.run.name} · uyanma aranıyor`,()=>slot.board.connected?checkPower(slot):reconnectSlot(slot),'PWR-LINK',null);
  if(slot.run.pending===pending && pending.auto_attempts<5)schedulePowerReconnect(slot,pending,3000);
 },delay);
}
async function startPower(kind) {
  const slot=current();if (!slot || busy) return;
  const sleep=modes[kind]<=5;
  if (sleep && !$('batteryOnly').checked) return toast('Batarya, USB ve SW3 koşullarını kontrol edip kutuyu işaretleyin.',true);
  await work('Güç testi hazırlanıyor',async()=>{
    needConnected();await session(slot);
    if (sleep) {
      const info=await slot.board.identityNow();
      if(info.fw!=='0.6.0')throw blocked('Uyku göstergeleri ve uyanma düzeltmesi için önce 0.6.0 firmware yükleyin.');
      if (info.usb_data_connected) throw blocked('Uyku için USB kablosunu çıkarın. Bağlantı Bluetooth üzerinden açık kalır.');
    }
    const pending={kind,mode:modes[kind],token:nonce(),before_boot:slot.board.identity.boot,
      seconds:Number($('sleepSeconds').value),armed_at:new Date().toISOString(),saw_disconnect:false};
    slot.run.pending=pending;slot.board.expectDisconnect(kind);save();render();
    const text=sleep?`POWER SLEEP ${kind} ${pending.seconds} ${pending.token}`:`POWER ${kind} ${pending.token}`;
    let rows;
    try {rows=await cmd(slot,text);}
    catch(error){
      // A write may have reached the board before the transport failed.
      // Never resend or discard this nonce until its persisted result is read.
      pending.ack_uncertain=true;pending.ack_error=error.message;save();render();
      if(kind!=='CYCLE')schedulePowerReconnect(slot,pending,kind==='RESTART'?6500:(pending.seconds+7)*1000);
      toast('Komutun onayı alınamadı. Komutu tekrar göndermeyin; kart uyanınca bekleyen testin sonucunu kontrol edin.',true);return;
    }
    const power=rows.find(r=>r.test==='POWER-TEST');
    if(!power?.data || power.data.token!==pending.token || power.data.phase!==1){
      slot.run.pending=null;save();
      if(power?.result==='BLOCKED')throw blocked(power.code);
      throw new Error(power?.code||'Kart güç testini hazırlamadı.');
    }
    pending.entry_delay_ms=power.data.entry_delay_ms||3500;
    pending.expected_wake_at=Date.parse(pending.armed_at)+pending.entry_delay_ms+(sleep&&kind!=='SOFT_OFF'?pending.seconds*1000:0)+3000;
    if(kind!=='CYCLE')schedulePowerReconnect(slot,pending,kind.includes('SW3')||kind==='SOFT_OFF'?6500:Math.max(0,pending.expected_wake_at-Date.now()));
    render();toast(kind==='CYCLE'?'Şimdi USB ve bataryayı çıkarın; en az 5 saniye bekleyip bataryayı takın.':'LED’ler sönünce kart uykuya geçmiştir veya besleme yoktur. SW3 testinde ışıklar söndükten sonra SW3’e basıp bırakın. Uyanınca bağlantı otomatik aranacak.');
  },`PWR-${kind}`);
}
async function checkPower(slot) {
  const pending=slot.run.pending;if (!pending) return;
  const rows=await cmd(slot,'POWER RESULT');const row=rows.find(r=>r.test==='POWER-TEST');
  if (row?.data?.token===pending.token && row.data.phase!==3 && row.result==='BLOCKED') {
    pending.last_stage=row.data.stage||'Hazırlanıyor';save();
    toast('Güç testi henüz tamamlanmamış. Kartın uyuyup uyanmasını veya güç çevrimini bekleyin.');render();return;
  }
  clearTimeout(slot.powerReconnectTimer);
  if (pending.mode===7) {
    const answer=await ask({title:'Güç kesme adımını doğrulayın.',text:'Hem USB’yi hem bataryayı tamamen çıkarıp en az 5 saniye bekledikten sonra tekrar açtınız mı? Yeni POWERON kaydı tek başına bütün rayların 0 V olduğunu kanıtlamaz.',fields:[{id:'onlyBattery',type:'checkbox',label:'Yeniden açarken yalnız batarya taktım; USB hâlâ çıkarılmış durumda.'}],buttons:[['yes','Evet, iki kaynağı da çıkardım','primary'],['no','Hayır / emin değilim','secondary']]});
    pending.operator_power_cut=answer.choice==='yes';pending.operator_battery_only=answer.values.onlyBattery===true;
  }
  const proof=validatePower(pending,row,slot.board.identity);
  const result=pending.mode===7 && !pending.operator_power_cut && row?.result==='PASS'?'BLOCKED':proof.ok?'PASS':'FAIL';
  localRow(slot,`PWR-${pending.kind}`,result,proof.reason,{request:pending,response:row,identity:slot.board.identity,
    board_power_cut_electrically_measured:false},pending.mode===7?'firmware+operator':'browser+firmware');
  if(pending.mode===7 && proof.ok){const battery=!!pending.operator_battery_only && row.data.usb_data_after===false;localRow(slot,'BAT-COLD',battery?'PASS':'BLOCKED',battery?'Yeni POWERON açılışı, USB veri yokluğu ve yalnız batarya operatör beyanı eşleşti.':'Güç çevrimi tamamlandı; yalnız batarya koşulu doğrulanmadı.',{request:pending,response:row,boot:slot.board.identity.boot},'firmware+operator');}
  slot.run.pending=null;slot.run.session_boot=null;save();render();
  toast(proof.ok?'Güç testi doğrulandı.':'Güç testi doğrulanamadı. Rapor ve ham uyanma kaydını kontrol edin.',!proof.ok);
}
async function cancelPower() {
  const slot=current();if(!slot?.run.pending || busy)return;
  await work('Güç testi iptal ediliyor',async()=>{
    slot.board.assertConnected();await cmd(slot,'POWER CANCEL');
    localRow(slot,`PWR-${slot.run.pending.kind}`,'SKIP','Operatör bekleyen güç testini iptal etti.',{request:slot.run.pending},'operator');
    slot.run.pending=null;save();render();
  });
}
async function direction(tx,rx,txPower,rxPower,label) {
  progress(`LoRa ${label}`,`${tx.run.name} → ${rx.run.name} · karşı kartın gerçek alımı bekleniyor.`);
  await cmd(tx,`LORA POWER ${txPower}`);await cmd(rx,`LORA POWER ${rxPower}`);
  let readyResolve,readyReject;
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const receive=cmd(rx,'LORA RF RX 8',{onRecord:r=>{if(r.test==='RF-READY' && r.result==='PASS')readyResolve();}});
  receive.then(()=>readyReject(new Error('Alıcı hazır bildirimi gelmeden pencere kapandı.')),readyReject);
  // Catch immediately so a link failure never becomes an unhandled rejection.
  receive.catch(()=>{});
  const text=`MW:${nonce(8)}:${txPower}:${rxPower}`;
  let transmitted;
  try {
    await Promise.race([ready,pause(10000).then(()=>{throw new Error('LoRa alıcısı hazır duruma gelmedi.');})]);
    transmitted=await cmd(tx,`LORA RF TX CONFIRM ${text}`);
  } catch(error) {await receive.catch(()=>{});throw error;}
  const received=await receive;
  const expected=[...new TextEncoder().encode(text)].map(v=>v.toString(16).padStart(2,'0')).join('');
  const packet=received.find(r=>r.test==='RF-PACKET' && r.result==='PASS' && r.data?.payload_hex===expected);
  const txOk=transmitted.some(r=>r.test==='FT-13.TX' && r.result==='PASS');
  const rxOk=received.some(r=>r.test==='FT-13.RX' && r.result==='PASS');
  const ok=!!packet && txOk && rxOk;
  return {ok,rssi:packet?.data.rssi_dbm,tx_mac:tx.run.mac,rx_mac:rx.run.mac,tx_chip_dbm:txPower,rx_chip_dbm:rxPower,
    payload:text,matched_packet:packet,tx_result:transmitted.find(r=>r.test==='FT-13.TX'),rx_result:received.find(r=>r.test==='FT-13.RX')};
}
async function runPair() {
  await work('İki kartlı LoRa testi',async()=>{
    needConnected();
    if(slots.length!==2 || slots.some(s=>!s.board.connected || s.run.pending))throw blocked('İki farklı karta aynı firmware’i yükleyip Bluetooth ile bağlayın.');
    if(slots[0].board.identity.elf_sha256!==slots[1].board.identity.elf_sha256)throw blocked('İki kartta aynı firmware imajı olmalı. Port ve yükleme ekranından iki karta da yazılımı yükleyin.');
    if(!$('radioReady').checked)throw blocked('İki kartın anten, besleme ve GND koşullarını doğrulayın.');
    for(const s of slots){await session(s);await radioApprovals(s);}
    const [a,b]=slots;const packets=[];
    try {
      for(let sequence=1;sequence<=5;sequence++){
        packets.push(await direction(a,b,-9,-9,`A → B ${sequence} / 5`));
        packets.push(await direction(b,a,-9,-9,`B → A ${sequence} / 5`));
      }
      const ok=packets.length===10 && packets.every(r=>r.ok);
      for(const s of slots)localRow(s,'WEB-LORA-PAIR',ok?'PASS':'FAIL',ok?'Her yönde 5 eşsiz paket: TX_DONE, CRC ve tüm yük baytları eşleşti.':'Karşı kartta bir veya daha fazla paket doğrulanamadı.',{packets});
      if(!ok)return;
      for(const p of [6,15,21]){
        const results=[await direction(a,b,-9,p,`${p} dBm profil komutu B`),await direction(b,a,-9,p,`${p} dBm profil komutu A`)];
        for(const s of slots)localRow(s,`WEB-LORA-CONFIG-${p}`,results.every(r=>r.ok)?'PASS':'FAIL','Profil komutu RX sırasında uygulandı; karşı kart −9 dBm komutuyla gönderdi. Gerçek watt ölçülmedi.',{results,actual_watts_measured:false,high_power_tx_tested:false});
        if(results.some(r=>!r.ok))break;
      }
      toast('İki yönlü haberleşme ve profil komutları iki kartın raporuna kaydedildi.');
    } catch(error){for(const s of slots)localRow(s,'WEB-LORA-PAIR','FAIL',error.message,{completed_packets:packets});throw error;}
    finally {
      for(const s of slots)if(s.board.connected){await cmd(s,'LORA POWER -9').catch(error=>localRow(s,'WEB-LORA-CLEANUP','FAIL',error.message));await cmd(s,'LORA OFF').catch(error=>localRow(s,'WEB-LORA-CLEANUP','FAIL',error.message));}
    }
  },'WEB-LORA-PAIR');
}
function renderSetup(){
 $('setupCardB').hidden=deviceCount!==2;
 $('setupCards').classList.toggle('single-card',deviceCount===1);
 for(const b of document.querySelectorAll('[data-device-count]')){b.classList.toggle('active',Number(b.dataset.deviceCount)===deviceCount);b.disabled=busy;}
 for(let i=0;i<2;i++){
  const letter=i?'B':'A',item=flashSlots[i],slot=cardSlot(i),action=cardAction({slot,receipt:item.receipt,busy});
  const nameInput=$(`setupName${letter}`);nameInput.disabled=busy;nameInput.maxLength=24;
  const planned=nameInput.value.trim(),registered=item.receipt?.ble_name;
  $(`bleName${letter}`).textContent=registered&&registered!==planned?`Kayıtlı ad: ${registered} · yeni ad için yükleyin`:`Bluetooth adı: ${registered||planned||'kart adı'}`;
  $(`setupState${letter}`).textContent=slot?.board.connected?'Bağlı':slot?'Bağlantı kesildi':item.receipt?'Yazılım hazır':'Hazırlanacak';
  $(`setupState${letter}`).classList.toggle('connected',!!slot?.board.connected);
  $(`selectPort${letter}`).disabled=busy;$(`flash${letter}`).disabled=busy||!item.port;
  $(`flash${letter}`).textContent=item.receipt?'Adı ve yazılımı güncelle':'Adı kaydet ve yükle';
  const button=$(`connectUploaded${letter}`);button.hidden=false;button.disabled=action.disabled;button.textContent=action.label;
  $(`replaceCard${letter}`).hidden=!slot&&!item.receipt;$(`replaceCard${letter}`).disabled=busy;
  const source=item.receipt;
  $(`portStatus${letter}`).textContent=deviceCount===1&&item.port?'USB portu seçildi. Bu porttaki kartın kimliği yüklemede okunacak.':source?`Kart kimliği · …${source.mac.slice(-8)}${source.name_written?' · ad kaydı hazır':' · isim için yeni yazılım gerekli'}`:item.port?'USB portu seçildi. Adı kaydedip yazılımı yükleyin.':'1. Kart adını girin; ardından USB portunu seçin.';
  $(`setupHint${letter}`).textContent=slot?.board.connected?'Bu kart hazır. Testleri açabilir veya diğer kartı hazırlayabilirsiniz.':slot?'Kart açık ve uyanıkken yeniden bağlanın.':source?'Bluetooth listesinde yalnız bu karta ait isimler gösterilir.':'Yazılım zaten yüklüyse doğrudan bağlanabilirsiniz.';
 }
 $('flashBoth').hidden=deviceCount!==2;$('flashBoth').disabled=busy||flashSlots.some(s=>!s.port);
 const s=current();$('connectionDiagnostic').disabled=busy||!s?.board.connected;
 const v=s?.link;
 $('signalValue').textContent=v?.supported && Number.isFinite(v.rssi_dbm)?`${v.rssi_dbm} dBm${v.rssi_age_ms>5000?' · eski örnek':''}`:v?.supported?'Ölçüm bekleniyor':'Ölçüm için 0.5.0 yazılım';
 $('connectionHint').textContent=s?`${s.run.name} · ${s.board.connected?'bağlı':'bağlantı yok'}${v?.supported?' · kart sayacı: '+v.connections+' bağlantı / '+v.host_resets+' BLE reset':''}`:'Bağlantı bilgisi için bir kart seçin.';
}
async function selectPort(index){
 if(busy)return;if(!navigator.serial)return toast('Bu tarayıcıda USB port erişimi yok.',true);
 try{if(!activeCardIndices(deviceCount).includes(index))throw blocked('Önce iki kart modunu seçin.');const port=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a}]});
  if(activeCardIndices(deviceCount).some(i=>i!==index&&flashSlots[i].port===port))throw blocked('Bu USB portu diğer karta atanmış.');
  flashSlots[index].port=port;save();render();
 }catch(error){if(error.name!=='NotFoundError')toast(error.message,true);}
}
async function flashSelection(indices){
 await work(indices.length===2?'İki kart hazırlanıyor':'Kart hazırlanıyor',async()=>{
  const names=indices.map(i=>validateBoardName($(`setupName${i?'B':'A'}`).value));
  if(indices.some(i=>!activeCardIndices(deviceCount).includes(i)))throw blocked('Önce iki kart modunu seçin.');
  if(!uploadNamesAreDistinct({deviceCount,indices,names:Object.fromEntries(indices.map((i,n)=>[i,names[n]])),flashSlots}))throw blocked('İki karta farklı isimler verin.');
  if(indices.some(i=>!flashSlots[i].port))throw blocked('Önce USB portunu seçin.');
  const {flashPort,fetchRelease}=await import('./vendor/flasher.js?v=0.8.0');const loaded=await fetchRelease();
  $('flashProgress').hidden=false;$('flashLog').textContent='';
  for(let n=0;n<indices.length;n++){
   const i=indices[n],letter=i?'B':'A',item=flashSlots[i],oldSlot=cardSlot(i),guards=flashGuards({deviceCount,index:i,flashSlots,slots});
   if(oldSlot)archiveSlot(oldSlot);
   const log=line=>{const lines=$('flashLog').textContent.split('\n');lines.push(`[${names[n]}] ${String(line)}`);$('flashLog').textContent=lines.slice(-100).join('\n');$('flashLog').scrollTop=$('flashLog').scrollHeight;};
   progress(`${names[n]} · ad ve yazılım kaydediliyor`,'USB kablosunu çıkarmayın.');
   const receipt=await flashPort(item.port,{boardName:names[n],...guards,loaded,log,
    progress:p=>{$('flashProgressBar').value=p.percent;$('flashProgressLabel').textContent=`${names[n]} · %${p.percent}`;}});
   Object.assign(receipt,{name:names[n],role:letter,upload_id:nonce()});item.receipt=receipt;receipts=receipts.filter(v=>v.mac!==receipt.mac);receipts.push(receipt);save();render();
   log(`Hazır. Bluetooth listesinde ${receipt.ble_name} adını seçin.`);
  }
  toast('Kart isimleri kaydedildi. Her kartın Bluetooth ile bağlan düğmesini kullanın.');
 },'WEB-FLASH',null);
}
// ------------------------------------------------ MilMesh production firmware ----
const PROD_KEY='milmesh.web.production.v1';
const prod={port:null,manifest:null,error:null,board:null,history:[]};
try{const v=JSON.parse(localStorage.getItem(PROD_KEY)||'[]');if(Array.isArray(v))prod.history=v.filter(r=>r?.time);}catch{}
const hexAddr=v=>'0x'+Number(v).toString(16).toUpperCase();
const buildText=f=>f?`${f.build_id??f.build}${f.dirty?'-dirty':''}`:'—';
const fwText=f=>f?`${f.name||'MilMesh'} ${f.version} · build ${buildText(f)} · sv ${f.security_version}`:'—';
const REGION_TEXT={'bootloader.bin':'önyükleyici','partitions.bin':'bölüm tablosu','otadata_blank.bin':'otadata (boş, ota_0 açılır)','firmware.bin':'uygulama (ota_0)'};
function keepProduction(){try{localStorage.setItem(PROD_KEY,JSON.stringify(prod.history.slice(0,10)));}catch{}}
async function loadProductionManifest(){
 try{const r=await fetch('firmware/production/manifest.json',{cache:'no-store'});if(!r.ok)throw new Error('Bu web sürümünde üretim firmware paketi yok.');prod.manifest=validateManifest(await r.json());prod.error=null;}
 catch(error){prod.manifest=null;prod.error=error.message;}
 renderUpdate();
}
function renderUpdate(){
 const m=prod.manifest,f=m?.firmware,last=prod.history[0];
 $('prodTag').textContent=f?`MilMesh ${f.version}`:'Paket yok';
 $('prodVersion').textContent=f?`MilMesh ${f.version}`:'Paket yok';
 $('prodBuild').textContent=f?`build ${buildText(f)} · sv ${f.security_version} · ${f.board_id}${f.dirty?' · geliştirme derlemesi':''}`:(prod.error||'Paket okunuyor…');
 const b=prod.board;
 $('prodBoard').textContent=b?(b.name||'Adsız kart'):'—';
 $('prodBoardDetail').textContent=b?`${b.mac} · ${b.firmware?fwText(b.firmware):'mevcut sürüm okunamadı'}`:prod.port?'Port seçildi; kimlik güncellemede okunur.':'USB portu seçin.';
 $('prodResult').textContent=last?(last.ok?(last.application_verified?'Çalışıyor ✓':'Yazıldı · açılış görülmedi'):last.cancelled?'İptal edildi':'Başarısız ✕'):'—';
 $('prodResultDetail').textContent=last?`${last.board_name||last.mac||'kart'} · ${new Date(last.time).toLocaleString('tr-TR')}${last.firmware?' · '+last.firmware.version+' '+last.firmware.build:''}`:'Bu tarayıcıda kayıt yok.';
 $('prodSelectPort').disabled=busy||!navigator.serial;$('prodStart').disabled=busy||!prod.port||!m;
 $('prodPortStatus').textContent=prod.port?'USB portu seçildi. Kart adı ve mevcut sürüm güncellemeden önce salt okunur okunur.':'USB portu seçilmedi';
 $('prodPlan').innerHTML=m?m.images.map(i=>`<div class="prod-row"><code>${hexAddr(i.address)}</code><b>${esc(i.name)}</b><span>${esc(REGION_TEXT[i.name]||'')} · ${i.bytes.toLocaleString('tr-TR')} B</span><small>SHA-256 ${esc(i.sha256.slice(0,16))}…</small></div>`).join('')+
  `<div class="prod-row keep"><code>—</code><b>Yazılmaz</b><span>${PROTECTED_REGIONS.map(r=>`${r.label} ${hexAddr(r.start)}`).join(' · ')} · 0xE000 boot_app0 yok · tam silme yok</span></div>`:`<p class="muted">${esc(prod.error||'Paket okunuyor…')}</p>`;
 $('prodHistory').innerHTML=prod.history.length?'<div class="divider"></div><h3 class="prod-h3">Bu tarayıcıdaki güncellemeler</h3>'+prod.history.map(h=>`<div class="history-row"><div><b>${esc(h.board_name||'Adsız kart')} · ${h.ok?(h.application_verified?'✓ çalışıyor':'! yazıldı, açılış doğrulanmadı'):h.cancelled?'– iptal':'✕ başarısız'}</b><small>${esc(h.mac||'—')} · ${esc(new Date(h.time).toLocaleString('tr-TR'))} · ${esc(h.previous?h.previous.version+' '+h.previous.build:'önceki sürüm bilinmiyor')} → ${esc(h.firmware?h.firmware.version+' '+h.firmware.build:'—')}${h.error?' · '+esc(h.error):''}${h.application_problems?.length&&h.ok?' · '+esc(h.application_problems.join('; ')):''}</small></div></div>`).join(''):'';
}
async function selectProdPort(){
 if(busy)return;if(!navigator.serial)return toast('Bu tarayıcıda USB port erişimi yok.',true);
 try{prod.port=await navigator.serial.requestPort({filters:[{usbVendorId:0x303a}]});prod.board=null;render();}
 catch(error){if(error.name!=='NotFoundError')toast(error.message,true);}
}
async function reacquireProdPort(){
 if(!navigator.serial?.getPorts)return null;
 const ports=(await navigator.serial.getPorts()).filter(p=>p.getInfo?.().usbVendorId===0x303a);
 return ports.length===1?ports[0]:null;
}
function confirmProduction(info){
 const {mac,current,firmware:f,assessment}=info,id=current.identity;
 prod.board={name:id?.valid?id.name:null,mac,firmware:current.firmware};renderUpdate();
 const notes=[...assessment.warnings.map(w=>['warning',w.text]),...assessment.info.map(t=>['info',t])];
 if(id?.valid && id.mac_matches===false)notes.unshift(['warning',`Kimlik sektörü başka bir MAC’e (${id.mac}) ait; firmware bu adı kullanmayabilir. Sektör değiştirilmez.`]);
 return ask({eyebrow:'MILMESH FIRMWARE GÜNCELLE',title:id?.valid?`${id.name} kartı güncellensin mi?`:'Adsız kart güncellensin mi?',
  text:'Onaylamadan flash’a hiçbir şey yazılmaz. Vazgeçerseniz kart mevcut yazılımla yeniden başlar.',
  facts:[['Kart adı (0x340000)',id?.valid?id.name:`— ${id?.reason||''}`],['eFuse MAC',mac],
   ['Karttaki yazılım',current.firmware?fwText(current.firmware):current.firmware_error||'okunamadı'],['Açılan yuva',current.slot?.slot||'—'],
   ['Kartın min_sv',current.min_sv??'okunamadı'],['Yüklenecek',fwText(f)],
   ['Yazılacak',WRITE_PLAN.map(p=>`${hexAddr(p.address)} ${REGION_TEXT[p.name]}`).join(', ')],
   ['Korunur','NVS (ad, PIN, eşleşmeler, kanallar, radyo), phy_init, scratch, autolog, kimlik 0x340000, ota_1']],
  notes,fields:assessment.warnings.map(w=>({id:'ack-'+w.id,label:w.confirm,type:'checkbox',required:true})),
  buttons:[['start','Güncellemeyi başlat','primary'],['cancel','Vazgeç','secondary']]})
  .then(answer=>({ok:answer.choice==='start',acknowledged:answer.choice==='start'?assessment.warnings.filter(w=>answer.values['ack-'+w.id]).map(w=>w.id):[]}));
}
async function startProductionUpdate(){
 await work('MilMesh firmware güncelleniyor',async()=>{
  if(!prod.port)throw blocked('Önce USB portunu seçin.');
  const {updateProductionPort,fetchProduction}=await import('./vendor/flasher.js?v=0.8.0');
  const loaded=await fetchProduction();
  $('prodProgress').hidden=false;$('prodProgressBar').value=0;$('prodProgressLabel').textContent='Kart okunuyor';$('prodLog').textContent='';$('prodDetails').open=true;
  const log=line=>{const lines=$('prodLog').textContent.split('\n').filter(Boolean);lines.push(String(line));$('prodLog').textContent=lines.slice(-150).join('\n');$('prodLog').scrollTop=$('prodLog').scrollHeight;};
  progress('Kart okunuyor','Kart adı, mevcut sürüm ve min_sv salt okunur okunuyor. USB kablosunu çıkarmayın.');
  let receipt;
  try{
   receipt=await updateProductionPort(prod.port,{loaded,log,reacquire:reacquireProdPort,confirm:confirmProduction,
    progress:p=>{$('prodProgressBar').value=p.percent;$('prodProgressLabel').textContent=`${p.name||''} · %${p.percent}`;progress('Firmware yazılıyor',`${p.name||''} · %${p.percent} · USB kablosunu çıkarmayın.`);}});
  }catch(error){
   prod.history.unshift({ok:false,mac:prod.board?.mac||null,board_name:prod.board?.name||null,error:error.message,time:new Date().toISOString(),
    firmware:{version:loaded.firmware.version,build:buildText(loaded.firmware)}});keepProduction();renderUpdate();throw error;
  }
  if(receipt.cancelled){prod.history.unshift({ok:false,cancelled:true,mac:receipt.mac,board_name:prod.board?.name||null,time:new Date().toISOString()});keepProduction();$('prodProgressLabel').textContent='İptal edildi';toast('Güncelleme iptal edildi; flash’a hiçbir şey yazılmadı.');return;}
  const {port,...stored}=receipt;if(port)prod.port=port;
  prod.history.unshift({...stored,ok:true,boot_lines:stored.boot_lines});keepProduction();
  $('prodProgressBar').value=100;
  if(stored.application_verified){$('prodProgressLabel').textContent='Tamamlandı · yeni yazılım çalışıyor';log(`Doğrulandı: ${stored.running.line}`);toast(`${stored.board_name||'Kart'} güncellendi: MilMesh ${stored.firmware.version} build ${stored.firmware.build} çalışıyor.`);}
  else{
   const why=stored.running?`Açılış satırı beklenenle eşleşmiyor: ${stored.application_problems.join('; ')}.`:'Yazım MD5 ile doğrulandı ancak 30 saniye içinde USB’den “[fw] MilMesh …” açılış satırı görülmedi. Kartı çıkarıp takın veya RESET’e basın; LED/BLE ile kontrol edin, gerekirse güncellemeyi tekrarlayın.';
   $('prodProgressLabel').textContent='Yazıldı · açılış doğrulanmadı';log(why);toast(why,true);
  }
 },'WEB-PROD',null);
}
async function runBattery() {
  await work('Yalnız bataryada test',async()=>{
    const s=needConnected();
    const answer=await ask({title:'USB’yi çıkarın; batarya takılı kalsın.',text:'Bluetooth bağlantısı açık kalır. Bu akışta LED gözlemi yapılmaz. SW3 ve IMU adımlarından sonra 20 saniye BLE ve 20 saniye kararlılık çalışır. Gerçek soğuk açılış ayrıca güç çevrimiyle doğrulanır.',buttons:[['start','USB çıkarıldı, başlat','primary'],['skip','Atla','secondary']]});
    if(answer.choice!=='start')return;
    const identity=await s.board.identityNow();if(identity.usb_data_connected)throw blocked('Kartın USB veri bağlantısı hâlâ var. USB’yi fiziksel olarak çıkarın.');
    await session(s);await cmd(s,'CONTEXT BATTERY CONFIRM');
    s.run.battery_attestation={usb_physically_removed:true,battery_only:true,time:new Date().toISOString()};
    s.run.battery_test_active=true;s.run.battery_suite_boot=identity.boot;save();
    if(resultFor(s.run,'BAT-COLD').result==='PENDING')localRow(s,'BAT-COLD','BLOCKED','Bataryada soğuk açılış için Güç ve uyku → Gerçek güç kesme / açma adımını tamamlayın.');
    async function step(id,fn,expected){
      const start=s.run.records.length;
      try {
        await fn();
        const records=s.run.records.slice(start);const found=expected.map(key=>records.filter(r=>r.test===key));
        const fail=found.some(rows=>rows.some(r=>r.result==='FAIL'));
        const complete=found.every(rows=>rows.some(r=>r.result==='PASS'));
        localRow(s,id,fail?'FAIL':complete?'PASS':'BLOCKED',complete&&!fail?'Batarya koşulunda komponent kaydı ve USB veri yokluğu doğrulandı.':'Gerekli komponent sonucu alınamadı veya başarısız.',{boot:identity.boot,attestation:s.run.battery_attestation,evidence:records.map(r=>({test:r.test,result:r.result,seq:r.seq,rpc_id:r.rpc_id}))});
      }catch(error){localRow(s,id,'FAIL',error.message);throw error;}
    }
    try {
      await step('BAT-FLASH',()=>cmd(s,'FLASH SCRATCH CONFIRM'),['FT-02.RW']);
      await step('BAT-GAUGE',()=>cmd(s,'GAUGE READ'),['FT-06']);
      await step('BAT-SW3',()=>buttonStep(s),['FT-04']);
      await step('BAT-IMU',async()=>{await cmd(s,'IMU READ');await imuStep(s);},['FT-08.ID','FT-08.MOTION']);
      await step('BAT-GPS',async()=>{await cmd(s,'GNSS LINK 5');await cmd(s,'GNSS STATUS 3');},['FT-09.TX','FT-09']);
      await step('BAT-BLE',()=>bleStep(s),['WEB-BLE']);
      progress('Bataryada 20 saniye kararlılık','Kartı bataryada bırakın. Sensör ve veri yolu kontrolleri sürüyor; USB takmayın.');
      await step('BAT-SOAK',()=>cmd(s,'SOAK 20',{timeout:65000}),['FT-14']);
      toast('Batarya testleri tamamlandı. Sonuçları PDF olarak indirebilirsiniz.');
    } finally {s.run.battery_test_active=false;save();render();}
  },'BAT-SOAK');
}
async function downloadPDF(pair=false) {
  if(!run())return;
  try{const {createPDF}=await import('./vendor/pdf.js?v=0.8.0');await createPDF(pair?slots.map(s=>s.run):[run()]);toast('PDF raporu indirildi.');}
  catch(error){toast('PDF oluşturulamadı: '+error.message,true);}
}
function rowsHTML(items,{actions=false}={}) {
  return items.map(t=>`<div class="test-row" data-test-id="${esc(t.id)}" data-result="${t.result}"><div class="test-icon" aria-hidden="true">${symbols[t.result]}</div><div class="test-copy"><b>${esc(t.name)}</b><small>${esc(t.result==='PENDING'?t.detail:t.code)}</small></div><div class="test-end"><span class="result-label ${t.result}">${symbols[t.result]} ${labels[t.result]}${t.manual_override?' · Elle':''}</span><div class="row-actions">${actions && testActions[t.id]?`<button class="row-run" data-test="${t.id}" ${busy||!current()?.board.connected||run()?.pending?'disabled':''}>Çalıştır</button>`:''}${run()?`<button class="row-adjust" data-adjust="${esc(t.id)}" ${busy?'disabled':''}>Düzelt</button>`:''}</div></div></div>`).join('');
}
function powerClock(p){
 if(p.kind==='CYCLE')return 'Fiziksel güç çevrimi ve tekrar bağlantı bekleniyor.';
 if(p.kind==='SOFT_OFF')return 'Zamanlayıcı yok. Üç LED söndükten sonra SW3’e basın.';
 if(p.kind.includes('SW3'))return 'Üç LED söndükten sonra SW3’e basıp bırakın; bağlantı otomatik aranır.';
 const left=Math.ceil(((p.expected_wake_at||Date.parse(p.armed_at)+p.seconds*1000+6500)-Date.now())/1000);
 return left>0?`Planlanan uyanma ve Bluetooth dönüşü yaklaşık ${left} saniye sonra.`:'Zamanlayıcı süresi doldu; uyanma kaydı aranıyor. LED’leri kontrol edin.';
}
function render() {
  const slot=current(),r=slot?.run,info=slot?.board.identity;
  const fallback={records:[]};const values=countResults(r||fallback);
  $('statTotal').textContent=summary(r||fallback).length;$('statPass').textContent=values.PASS;$('statFail').textContent=values.FAIL;
  $('statPending').textContent=values.PENDING+values.BLOCKED+values.SKIP;$('navCount').textContent=values.PASS;
  $('boardName').textContent=r?.name||'Henüz kart bağlı değil';
  $('boardSubtitle').textContent=r?`${info?.name||'MilMesh'} · ${new Date(r.started_at).toLocaleString('tr-TR')} test oturumu`:'İlk kartınızı bağlayarak bir test oturumu başlatın.';
  $('macValue').textContent=info?.mac||'—';$('fwValue').textContent=info?.fw||'—';$('bootValue').textContent=info?.boot.slice(0,8)||'—';
  $('supplyValue').textContent=info?(info.usb_data_connected?'USB veri bağlı':'USB veri yok'):'—';
  $('connectionStatus').textContent=slot?.board.connected?'Bluetooth bağlı':r?.pending?'Uyanma / açılış bekleniyor':'Bağlantı bekleniyor';
  $('connectionStatus').classList.toggle('connected',!!slot?.board.connected);
  $('disconnect').hidden=!slot?.board.connected;$('disconnect').disabled=busy;
  $('reconnect').hidden=!slot || slot.board.connected && !r?.pending;$('reconnect').disabled=busy;
  $('connectTop').disabled=busy;$('connectTop').textContent='Kartları yönet';$('addSecond').hidden=deviceCount===2;$('addSecond').disabled=busy;
  $('boardTabs').innerHTML=slots.length?slots.map((s,i)=>`<button class="board-tab ${i===active?'active':''}" data-slot="${i}" ${busy?'disabled':''}><i class="dot ${s.board.connected?'pass':''}"></i>${esc(s.run.name)}<span>${s.roleIndex===1?'B':'A'}</span></button>`).join(''):'<span class="board-tab active">Yeni test oturumu</span>';
  for(const button of document.querySelectorAll('[data-needs-board]'))button.disabled=busy||!slot?.board.connected||!!r?.pending;
  $('radioPair').disabled=busy||slots.length!==2||slots.some(s=>!s.board.connected||s.run.pending);
  const table=summary(r||fallback);
  const component=table.filter(t=>t.group==='components').filter(t=>filter==='all'||filter==='attention'&&['FAIL','BLOCKED'].includes(t.result)||t.result===filter);
  $('testList').innerHTML=component.length?rowsHTML(component,{actions:true}):'<div class="empty-filter">Bu filtreye uyan test yok.</div>';
  $('batteryResults').innerHTML=rowsHTML(table.filter(t=>t.group==='battery'));
  $('powerResults').innerHTML=rowsHTML(table.filter(t=>t.group==='power'));
  $('radioResults').innerHTML=rowsHTML(table.filter(t=>t.group==='radio'));
  $('reportResults').innerHTML=rowsHTML(table);
  $('radioA').textContent=slots[0]?.run.name||'Kart A';$('radioB').textContent=slots[1]?.run.name||'Kart B';
  $('powerPending').hidden=!r?.pending;
  if(r?.pending){
    const p=r.pending;
    const hint=p.kind==='CYCLE'?'Hem USB hem bataryayı çıkarın. En az 5 saniye sonra bataryayı takın.':p.kind==='SOFT_OFF'?'Kartı uyandırmak için SW3’e basıp bırakın. Bu modda zamanlayıcı yok.':p.kind.includes('SW3')?'Kart uyuduktan sonra SW3’e basıp bırakın. Zaman aşımıyla uyanma, SW3 testini geçirmez.':'Zamanlayıcı / yeniden açılış sonrasında tekrar bağlanın.';
    $('powerPending').innerHTML=`<b>${esc(p.kind)} · uyanma doğrulanıyor</b><p id="powerCountdown">${esc(powerClock(p))}</p><p>Uyanık: LED 1/2 yanar, LED 3 yanıp söner. Uykuya girişte üçü söner; söndükten sonra SW3’e basın.</p><p>${hint}</p><p>${slot.board.connected?'Bluetooth bağlantısı var.':'Bluetooth bağlantısı yok; uyku, besleme ve radyo dönüşü henüz ayrıştırılmadı.'}${p.last_stage?' Son okunan aşama: '+esc(p.last_stage):''}</p><button class="secondary" id="verifyPower" ${busy?'disabled':''}>${slot.board.connected?'Sonucu kontrol et':'Yeniden bağlan ve kontrol et'}</button><button class="secondary" id="pickPowerDevice" ${busy?'disabled':''}>Bluetooth listesinden yeniden seç</button><button class="text-button" id="cancelPower" ${busy||!slot.board.connected?'disabled':''}>Bekleyen testi iptal et</button>`;
    $('verifyPower').onclick=()=>slot.board.connected?work('Uyanma sonucu doğrulanıyor',()=>checkPower(slot)):reconnect();$('cancelPower').onclick=cancelPower;
    $('pickPowerDevice').onclick=()=>work('Kart yeniden seçiliyor',()=>reconnectSlot(slot,{select:true}),'PWR-LINK',slot);
  }
  $('reportIdentity').innerHTML=r?`<b>${esc(r.name)} · ${esc(r.mac)}</b>Oturum: ${esc(r.id)}<br>Başlangıç: ${esc(new Date(r.started_at).toLocaleString('tr-TR'))}<br>Firmware: ${esc(info?.fw)} · ${values.PASS} geçti / ${values.FAIL} kaldı<code>ELF SHA-256: ${esc(info?.elf_sha256)}</code>${r.notes?`<br>Operatör notu: ${esc(r.notes)}`:''}`:'Henüz kart bağlı değil. Bir kart bağladığınızda rapor burada hazırlanır.';
  if(document.activeElement!==$('reportNotes'))$('reportNotes').value=r?.notes||'';
  for(const id of ['downloadPdf','downloadJson','downloadCsv','printReport'])$(id).disabled=!r;
  $('downloadPairPdf').disabled=slots.length!==2;
  $('clearPower').disabled=busy||!slot?.board.connected;
  $('newSession').disabled=busy||!slots.length;
  const liveIds=new Set(slots.map(s=>s.run.id));
  const history=archived.filter(v=>!liveIds.has(v.id)).slice(0,12);
  $('reportHistory').innerHTML=history.length?'<div class="divider"></div><h3>Bu tarayıcıdaki önceki raporlar</h3>'+history.map(v=>`<div class="history-row"><div><b>${esc(v.name)}</b><small>${esc(v.mac)} · ${esc(new Date(v.started_at).toLocaleString('tr-TR'))}</small></div><button class="secondary" data-history="${esc(v.id)}" data-kind="pdf">PDF ↓</button><button class="text-button" data-history="${esc(v.id)}" data-kind="json">JSON ↓</button></div>`).join(''):'';
  renderSetup();renderUpdate();renderSectionLock();
  const logs=r?.records.filter(v=>!['coverage'].includes(v.source))||[];$('logCount').textContent=`${logs.length} kayıt`;
  if(logs.length)$('activityLog').innerHTML=logs.slice(-15).reverse().map(v=>`<div class="log-entry ${v.result==='FAIL'?'fail':''}"><time>${esc(new Date(v.received_at).toLocaleTimeString('tr-TR'))}</time><b>${esc(v.test)} · ${labels[v.result]}</b><p>${esc(v.code)}</p></div>`).join('');
  else $('activityLog').innerHTML='<div class="empty-log"><span>⌁</span><p>İlk bağlantıdan sonra<br>kart kayıtları burada görünür.</p></div>';
}
function parseHash(hash){
  let h=String(hash||'').replace(/^#\/?/,'');try{h=decodeURIComponent(h);}catch{}
  const [head,sub]=h.toLocaleLowerCase('tr-TR').split('/');
  if(head==='test')return {section:'test',view:TEST_VIEWS.includes(sub)?sub:null};
  if(TEST_VIEWS.includes(head))return {section:'test',view:head}; // 0.7.x links (#setup, #power, ...)
  return {section:'update'}; // #guncelle, legacy #update, empty or unknown
}
function sectionHash(){return section==='update'?'#guncelle':testView==='setup'?'#test':`#test/${testView}`;}
function syncHash(){const h=sectionHash();if(location.hash!==h)history.replaceState(history.state,'',location.pathname+location.search+h);}
function showView(name) {
  if(name==='update')section='update';else{if(!TEST_VIEWS.includes(name))name='setup';section='test';testView=name;}
  name=section==='update'?'update':testView;view=name;document.body.dataset.view=name;document.body.dataset.section=section;syncHash();
  for(const el of document.querySelectorAll('.view'))el.hidden=el.id!==`view-${name}`;
  for(const el of document.querySelectorAll('button[data-view]'))el.classList.toggle('active',el.dataset.view===name);
  for(const el of document.querySelectorAll('.section-tab')){const on=el.dataset.section===section;el.classList.toggle('active',on);el.setAttribute('aria-selected',String(on));el.tabIndex=on?0:-1;}
  const meta=SECTIONS[section];$('viewEyebrow').textContent=meta.eyebrow;document.title=meta.title;
  if(!$('supportBadge').dataset.unsupported)$('supportBadge').textContent=meta.badge;
  $('viewTitle').textContent=titles[name][0];$('viewDescription').textContent=titles[name][1];render();
}
// Switching sections only changes what is visible; nothing running is cancelled. While a USB
// write or any other operation is in progress the switch is refused so the operator stays on it.
function showSection(next,{view:sub=null,focus=false}={}){
  if(next!==section&&busy){toast(SECTION_LOCKED,true);syncHash();return false;}
  showView(next==='update'?'update':sub||testView);if(focus)document.querySelector(`.section-tab[data-section="${section}"]`)?.focus();return true;
}
function applyHash(){const target=parseHash(location.hash);showSection(target.section,{view:target.view});}
function renderSectionLock(){
  for(const el of document.querySelectorAll('button[data-section]')){const locked=busy&&el.dataset.section!==section;el.classList.toggle('locked',locked);el.setAttribute('aria-disabled',String(locked));el.title=locked?SECTION_LOCKED:'';}
}
async function copyPageLink(){
  const url=location.href;let ok=false;
  try{await navigator.clipboard.writeText(url);ok=true;}
  catch{const field=document.createElement('textarea');field.value=url;field.setAttribute('readonly','');field.style.cssText='position:fixed;top:0;left:0;opacity:0';document.body.append(field);field.select();try{ok=document.execCommand('copy');}catch{}field.remove();}
  toast(ok?'Bağlantı kopyalandı. Bilgisayarda Chrome, Edge veya Opera ile açın.':`Bağlantıyı elle kopyalayın: ${url}`,!ok);
}
function download(content,type,ext) {
  const r=run();if(!r)return;
  const url=URL.createObjectURL(new Blob([content],{type}));const link=document.createElement('a');
  link.href=url;link.download=`${r.name}_${r.started_at.replace(/[:.]/g,'-')}_test.${ext}`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('connectTop').onclick=()=>manageBoards();$('addSecond').onclick=()=>{setDeviceCount(2);manageBoards(1);};$('reconnect').onclick=reconnect;
$('disconnect').onclick=()=>current()?.board.disconnect();$('runAll').onclick=runAll;$('runBattery').onclick=runBattery;
for(const id of ['testList','batteryResults','powerResults','radioResults','reportResults'])$(id).onclick=event=>{
 const edit=event.target.closest('[data-adjust]');if(edit){manualResult(edit.dataset.adjust);return;}
 const b=event.target.closest('[data-test]');if(b)runTest(b.dataset.test);
};
$('boardTabs').onclick=event=>{const b=event.target.closest('[data-slot]');if(b&&!busy){active=Number(b.dataset.slot);render();}};
for(const button of document.querySelectorAll('button[data-view]'))button.onclick=()=>showView(button.dataset.view);
for(const button of document.querySelectorAll('button[data-section]'))button.onclick=()=>showSection(button.dataset.section);
document.querySelector('.section-tabs').onkeydown=event=>{if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){event.preventDefault();showSection(section==='update'?'test':'update',{focus:true});}};
$('copyLink').onclick=copyPageLink;
for(const button of document.querySelectorAll('[data-filter]'))button.onclick=()=>{filter=button.dataset.filter;for(const b of document.querySelectorAll('[data-filter]'))b.classList.toggle('active',b===button);render();};
$('sleepStart').onclick=()=>startPower($('sleepMode').value);$('restartStart').onclick=()=>startPower('RESTART');$('cycleStart').onclick=()=>startPower('CYCLE');
$('sleepMode').onchange=()=>{
  const k=$('sleepMode').value;$('sleepSeconds').disabled=k==='SOFT_OFF';
  $('sleepHelp').textContent=k==='SOFT_OFF'?'Zamanlayıcı kurulmaz. MCU yalnız SW3 ile uyanır; diğer komponentlerin beslemesi devam edebilir.':k.includes('SW3')?'Kart uyuduktan sonra SW3’e basıp bırakın. Seçilen süre, butona basılmazsa zamanlayıcıyla geri dönüş sağlar; bu geri dönüş SW3 testinde başarısız sayılır.':k.startsWith('DEEP')?'Derin uykudan sonra kart yeni bir açılış kimliğiyle gelir. DEEPSLEEP ve TIMER kayıtları birlikte doğrulanır.':'Hafif uyku sonrasında aynı açılış kimliği korunur; zamanlayıcının uyanma nedeni kontrol edilir.';
};
$('clearPower').onclick=()=>work('Bekleyen güç testi temizleniyor',async()=>{const s=current();s.board.assertConnected();await cmd(s,'POWER CANCEL');if(s.run.pending)localRow(s,`PWR-${s.run.pending.kind}`,'SKIP','Operatör bekleyen testi temizledi.',{},'operator');s.run.pending=null;save();render();});
$('newSession').onclick=()=>{if(busy)return;const records=slots.map(s=>s.run);for(const s of slots){s.board.disconnect();s.run.closed_at=new Date().toISOString();}archived=[...records,...archived.filter(r=>!records.some(v=>v.id===r.id))];slots.length=0;active=-1;save();showView('setup');toast('Oturum kapandı. Önceki raporlar Test raporu ekranında saklanıyor.');};
$('reportHistory').onclick=async event=>{const b=event.target.closest('[data-history]');if(!b)return;const record=archived.find(v=>v.id===b.dataset.history);if(!record)return;try{if(b.dataset.kind==='pdf'){const {createPDF}=await import('./vendor/pdf.js?v=0.8.0');await createPDF([record]);}else{const url=URL.createObjectURL(new Blob([JSON.stringify(reportObject(record),null,2)],{type:'application/json'}));const a=document.createElement('a');a.href=url;a.download=record.name+'_test.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}}catch(error){toast(error.message,true);}};
$('radioPair').onclick=runPair;$('radioDigital').onclick=()=>runTest('FT-12');
$('reportNotes').oninput=()=>{if(run()){run().notes=$('reportNotes').value;save();render();}};
$('downloadPdf').onclick=()=>downloadPDF();$('downloadPairPdf').onclick=()=>downloadPDF(true);
$('downloadJson').onclick=()=>download(JSON.stringify(reportObject(run()),null,2),'application/json','json');
$('downloadCsv').onclick=()=>download(csv(run()),'text/csv;charset=utf-8','csv');
$('printReport').onclick=()=>{showView('report');const previous=document.title;document.title=`${run().name} · MilMesh Test Raporu`;window.print();document.title=previous;};
window.addEventListener('hashchange',applyHash);
for(let i=0;i<2;i++){
 const letter=i===0?'A':'B';
 flashSlots[i].receipt=activeCardIndices(deviceCount).includes(i)?(setupSaved?.uploads?receipts.find(v=>v.upload_id===setupSaved.uploads[i])||null:receipts.filter(v=>v.role===letter).at(-1)||null):null;
 if(setupSaved?.names?.[i])$(`setupName${letter}`).value=setupSaved.names[i];else if(flashSlots[i].receipt)$(`setupName${letter}`).value=flashSlots[i].receipt.name;
 $(`selectPort${letter}`).onclick=()=>selectPort(i);$(`flash${letter}`).onclick=()=>flashSelection([i]);
 $(`connectUploaded${letter}`).onclick=()=>connectCard(i);
 $(`replaceCard${letter}`).onclick=()=>replaceCard(i);
 $(`setupName${letter}`).oninput=()=>{keepSetup();renderSetup();};
}
for(const b of document.querySelectorAll('[data-device-count]'))b.onclick=()=>setDeviceCount(Number(b.dataset.deviceCount));
keepSetup();
$('connectionDiagnostic').onclick=connectionDiagnostic;
$('flashBoth').onclick=()=>flashSelection([0,1]);
$('prodSelectPort').onclick=selectProdPort;$('prodStart').onclick=startProductionUpdate;loadProductionManifest();
$('dateLabel').textContent=new Date().toLocaleDateString('tr-TR',{day:'numeric',month:'long',year:'numeric'});
if(!globalThis.isSecureContext || !navigator.bluetooth){$('compatibilityNotice').hidden=false;$('compatibilityNotice').textContent='Kart testi Web Bluetooth gerektirir. Bilgisayarda Chrome veya Edge ile HTTPS adresini ya da yerel localhost uygulamasını açın. Safari / Firefox ve iPhone’da bağlantı desteklenmez.';$('supportBadge').textContent='Uyumlu tarayıcı gerekli';$('supportBadge').dataset.unsupported='yes';}
$('serialNotice').hidden=!!(globalThis.isSecureContext&&navigator.serial);
setInterval(()=>{if(busy)$('operationTime').textContent=`${Math.floor((Date.now()-started)/1000)} sn`;if(run()?.pending&&$('powerCountdown'))$('powerCountdown').textContent=powerClock(run().pending);},1000);
applyHash();
