export const UUID = Object.fromEntries(['service','echo','identity','command','status','data'].map((key,i)=>[key,`4dc00000-0000-0000-0000-${String(i+1).padStart(12,'0')}`]));
export const API = 1;
export const LINK_UUID='4dc00000-0000-0000-0000-000000000007';
// v0.4.0 accidentally omitted one initializer byte. C zero-padded the
// 128-bit status UUID. Keep an explicit alias so deployed boards need not
// be erased merely to recover access to the same validated API-1 mailbox.
export const LEGACY_STATUS_UUID = '004dc000-0000-0000-0000-000000000005';
export const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
export function nonce(bytes=12) {
  return [...crypto.getRandomValues(new Uint8Array(bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
}
const decoder = () => new TextDecoder('utf-8',{fatal:true});
function decodeJSON(value) { return JSON.parse(decoder().decode(value)); }
function validIdentity(v) {
  return v && /^[a-f0-9]{2}(:[a-f0-9]{2}){5}$/i.test(v.mac) && /^[a-f0-9]{16}$/.test(v.boot) &&
    /^[a-f0-9]{64}$/.test(v.elf_sha256) && typeof v.fw === 'string';
}
function validStatus(v) {
  return v?.api === API && /^[a-f0-9]{16}$/.test(v.boot) && Number.isInteger(v.id) &&
    Number.isInteger(v.state) && v.state>=0 && v.state<=3 && Number.isInteger(v.bytes) &&
    v.bytes>=0 && v.bytes<=49152 && typeof v.overflow==='boolean';
}
// Chromium reports removed native GATT objects as InvalidStateError even when
// the adapter still considers the device connected. Do not retry unrelated
// state errors or a data packet that was already sent.
function staleGatt(error) {
  return error?.name==='InvalidStateError' &&
    /GATT (?:Service|Characteristic|Descriptor) no longer exists/i.test(error.message);
}
export class BleBoard extends EventTarget {
  constructor(bluetooth=globalThis.navigator?.bluetooth,options={}) {
    super(); this.bluetooth=bluetooth; this.device=null; this.identity=null;
    this.counter=crypto.getRandomValues(new Uint32Array(1))[0] % 1000000000 + 1;
    this.chain=Promise.resolve(); this.connected=false;this.wait=options.wait||pause;this.expectedDisconnect=null;
    this.chars={};this.disconnecting=null;this.boundDevices=new WeakSet();
  }
  exclusive(fn) {
    const work=this.chain.then(fn); this.chain=work.catch(()=>{}); return work;
  }
  connect(select=false,expectedMac=null,expectedName=null,excludedIds=[]) {
    return this.exclusive(()=>this.openConnection(select,expectedMac,expectedName,excludedIds));
  }
  async openConnection(select=false,expectedMac=null,expectedName=null,excludedIds=[]) {
    if(!this.bluetooth)throw new Error('Bu tarayıcıda Bluetooth erişimi yok. Web Bluetooth destekleyen bir masaüstü tarayıcısı kullanın.');
    if(this.disconnecting)await this.disconnecting;
    if(select || !this.device){
      const filters=expectedName?[{name:expectedName},...(expectedMac?[{name:'MC-'+expectedMac.split(':').slice(3).join('').toUpperCase()}]:[{namePrefix:'MC-'}])]:expectedMac?[{name:'MC-'+expectedMac.split(':').slice(3).join('').toUpperCase()}]:[{services:[UUID.service]},{namePrefix:'MC-'}];
      let candidate;
      try{candidate=await this.bluetooth.requestDevice({filters,optionalServices:[UUID.service]});}
      catch(error){if(error.name==='NotFoundError'){const e=new Error('Cihaz seçimi iptal edildi veya seçilen kart henüz yayın yapmıyor.');e.cancelled=true;throw e;}throw error;}
      if(excludedIds.includes(candidate.id)){const e=new Error('Bu kart zaten diğer kart alanında seçilmiş. İkinci fiziksel kartı seçin.');e.testState='BLOCKED';throw e;}
      if(candidate!==this.device && this.device?.gatt.connected)await this.disconnect('kart seçimi');
      this.device=candidate;
      if(!this.boundDevices.has(candidate)){
       this.boundDevices.add(candidate);
       candidate.addEventListener('gattserverdisconnected',()=>{
        if(candidate!==this.device || candidate.gatt.connected)return;
        const reason=this.expectedDisconnect;this.expectedDisconnect=null;this.connected=false;
        this.chars={};
        this.diagnostics={...this.diagnostics,disconnected_at:new Date().toISOString(),expected_disconnect:reason||false};
        this.dispatchEvent(new CustomEvent('disconnected',{detail:{expected:!!reason,reason}}));
       });
      }
    }
    if(this.device.gatt.connected)await this.disconnect('servis yenileme');
    this.connected=false;this.chars={};
    const previous=this.identity,started=Date.now();
    const recoveries=[];
    for(let attempt=0;attempt<3;attempt++){
      if(attempt)await this.wait([0,700,1500][attempt]);
      let stage='bağlantı',info=null;
      this.diagnostics={stage,attempt:attempt+1,device_name:this.device.name||null,recoveries:[...recoveries]};
      try{
        const server=await this.device.gatt.connect();stage='ana servis';
        const service=await server.getPrimaryService(UUID.service),chars={};
        stage='kart kimliği';chars.identity=await service.getCharacteristic(UUID.identity);
        info=decodeJSON(await chars.identity.readValue());
        if(!validIdentity(info))throw new Error('Kart kimliği eksik veya bozuk; bağlantı doğrulanamadı.');
        if(expectedMac && info.mac.toLowerCase()!==expectedMac.toLowerCase())throw new Error('Seçilen kartın MAC adresi bu kart alanıyla eşleşmiyor.');
        if(expectedName && info.named===true && info.name!==expectedName)throw new Error('Cihazın kayıtlı Bluetooth adı beklenen kart adıyla eşleşmiyor.');
        if(previous && (info.mac!==previous.mac || info.elf_sha256!==previous.elf_sha256))throw new Error('Kart veya yazılım kimliği değişti. Bu kart için yeni bir test oturumu başlatın.');
        this.diagnostics={...this.diagnostics,fw:info.fw,mac:info.mac,boot:info.boot};
        for(const key of ['echo','command','data']){stage=`${key} karakteristiği`;chars[key]=await service.getCharacteristic(UUID[key]);}
        stage='durum karakteristiği';let statusUUID=UUID.status;
        try{chars.status=await service.getCharacteristic(statusUUID);}
        catch(error){if(error.name!=='NotFoundError')throw error;statusUUID=LEGACY_STATUS_UUID;chars.status=await service.getCharacteristic(statusUUID);}
        this.diagnostics={...this.diagnostics,status_uuid:statusUUID,legacy_status_uuid:statusUUID===LEGACY_STATUS_UUID};
        stage='durum protokolünü okuma';const status=decodeJSON(await chars.status.readValue());
        if(!validStatus(status)||status.boot!==info.boot||status.fw!==info.fw)throw new Error('Kartın protokolü veya açılış kaydı eşleşmiyor; sonuçlar kabul edilmedi.');
        try{chars.link=await service.getCharacteristic(LINK_UUID);}catch(error){if(error.name!=='NotFoundError')throw error;}
        this.chars=chars;this.identity=info;this.connected=true;this.expectedDisconnect=null;this.diagnostics.stage='hazır';
        this.dispatchEvent(new Event('connected'));return info;
      }catch(error){
        await this.disconnect('bağlantı hazırlığı');
        this.diagnostics={...this.diagnostics,stage,error_name:error.name,error_message:error.message};
        if((error.name==='NetworkError'||staleGatt(error)) && attempt<2 && Date.now()-started<10000){
          recoveries.push({stage,error_name:error.name,error_message:error.message,attempt:attempt+1});continue;
        }
        if(staleGatt(error)){
          const e=new Error('Tarayıcının Bluetooth servis kaydı yenilenemedi. Kartı uyanık tutup Yeniden bağlan düğmesini kullanın; gerekirse sayfayı yenileyip aynı kartı Bluetooth listesinden seçin.');
          e.name='BleConnectionError';e.testState='BLOCKED';e.cause=error;e.diagnostics=this.diagnostics;throw e;
        }
        if(error.name==='NetworkError'){
          const e=new Error(`Bluetooth bağlantısı ${stage} adımında kurulamadı. Bu bağlantı hatası tek başına anten arızası anlamına gelmez. Kartın gücünü/uykusunu ve başka bir uygulamaya bağlı olup olmadığını kontrol edin.`);
          e.name='BleConnectionError';e.testState='BLOCKED';e.cause=error;e.diagnostics=this.diagnostics;throw e;
        }
        if(error.name==='NotFoundError'||error.name==='NotSupportedError'){
          const e=new Error(`Bluetooth ${stage} adımı tamamlanamadı.${info?.fw?' Karttaki firmware: '+info.fw+'.':''} ${error.name}: ${error.message}`);
          e.cause=error;e.diagnostics=this.diagnostics;throw e;
        }
        throw error;
      }
    }
  }
  disconnect(reason='operatör') {
    this.connected=false;this.chars={};
    if(this.disconnecting)return this.disconnecting;
    const device=this.device;if(!device?.gatt.connected)return Promise.resolve();
    this.expectedDisconnect=reason;
    // gatt.connected becomes false before the asynchronous disconnect event.
    // Reconnecting before that event can reuse native objects being removed.
    let finish;
    const done=new Promise((resolve,reject)=>{
      const ended=()=>finish();
      const timer=setTimeout(()=>finish(Object.assign(new Error('Bluetooth bağlantısının kapanması doğrulanamadı. Kartı yeniden seçmeden önce sayfayı yenileyin.'),{testState:'BLOCKED'})),3000);
      finish=error=>{clearTimeout(timer);device.removeEventListener('gattserverdisconnected',ended);this.disconnecting=null;error?reject(error):resolve();};
      device.addEventListener('gattserverdisconnected',ended,{once:true});
    });
    this.disconnecting=done;done.catch(()=>{});
    try{device.gatt.disconnect();}catch(error){finish(error);}
    return done;
  }
  expectDisconnect(reason){this.expectedDisconnect=reason;}
  link() {
    return this.exclusive(async()=>{
      this.assertConnected();if(!this.chars.link)return {supported:false};
      const value=decodeJSON(await this.chars.link.readValue());
      if(value.api!==API || value.boot!==this.identity.boot || typeof value.connected!=='boolean')throw new Error('Bağlantı ölçümünün açılış kimliği doğrulanamadı.');
      return {...value,supported:true,measured_at:new Date().toISOString()};
    });
  }
  async identityNow() {
    return this.exclusive(async()=>{
      this.assertConnected(); const info=decodeJSON(await this.chars.identity.readValue());
      if (!validIdentity(info) || info.mac!==this.identity.mac || info.boot!==this.identity.boot || info.elf_sha256!==this.identity.elf_sha256) throw new Error('Test sırasında kart veya açılış kimliği değişti.');
      this.identity=info; return info;
    });
  }
  assertConnected() {
    if (!this.connected || !this.device?.gatt?.connected) throw new Error('Kart bağlı değil. Kartı uyandırıp Yeniden bağlan düğmesini kullanın.');
  }
  rpc(cmd,{onRecord=()=>{},timeout=150000}={}) {
    return this.exclusive(async()=>{
      this.assertConnected();
      const id=++this.counter; const boot=this.identity.boot;
      const encoder=new TextEncoder(); const packet=encoder.encode(`RPC ${id} ${cmd}`);
      if (packet.length>=224 || /[^\x20-\x7e]/.test(cmd)) throw new Error('Komut uzun veya desteklenmeyen karakter içeriyor.');
      await this.chars.command.writeValueWithResponse(packet);
      const start=Date.now(); const decode=decoder(); const records=[];
      let offset=0, partial='', previousSeq=0, session=null;
      while (Date.now()-start<timeout) {
        this.assertConnected();
        const status=decodeJSON(await this.chars.status.readValue());
        if (!validStatus(status) || status.boot!==boot || status.fw!==this.identity.fw || status.id!==id) throw new Error('Komut kimliği veya açılış kaydı eşleşmiyor; sonuç kabul edilmedi.');
        if (status.overflow) throw new Error('Karttaki sonuç tamponu doldu. Bu test eksik kayıtla başarılı sayılamaz.');
        if (status.bytes<offset) throw new Error('Sonuç kaydı geriye gitti.');
        while (offset<status.bytes) {
          await this.chars.command.writeValueWithResponse(encoder.encode(`FETCH ${id} ${offset}`));
          const page=await this.chars.data.readValue();
          const take=Math.min(page.byteLength,status.bytes-offset);
          if (!take || page.byteLength>128) throw new Error('Eksik veya geçersiz sonuç sayfası.');
          const bytes=new Uint8Array(page.buffer,page.byteOffset,take);
          partial+=decode.decode(bytes,{stream:true}); offset+=take;
          let end;
          while ((end=partial.indexOf('\n'))>=0) {
            const line=partial.slice(0,end); partial=partial.slice(end+1);
            const row=JSON.parse(line);
            if (row.schema!==2 || row.fw!==this.identity.fw || row.elf_sha256!==this.identity.elf_sha256 ||
                !row.session?.startsWith(`${boot}-`) || !Number.isSafeInteger(row.seq) || row.seq<=previousSeq ||
                !['PASS','FAIL','SKIP','BLOCKED'].includes(row.result) || typeof row.test!=='string') throw new Error('Sonuç kaydının kaynağı veya sırası doğrulanamadı.');
            if (session && session!==row.session) throw new Error('Komut sırasında oturum değişti.');
            session=row.session; previousSeq=row.seq;
            const bound={...row,device_mac:this.identity.mac,received_at:new Date().toISOString(),rpc_id:id};
            records.push(bound); onRecord(bound);
          }
        }
        if (status.state===3) {
          partial+=decode.decode();
          const done=records.at(-1);
          if (partial || records.length!==status.rows || done?.test!=='COMMAND' || done.data?.request_id!==id || done.data?.command!==cmd) throw new Error('Komutun bitiş kaydı veya satır sayısı eksik.');
          return records;
        }
        await pause(60);
      }
      throw new Error('Komut zaman aşımına uğradı; yeniden göndermeden önce kartın durumunu kontrol edin.');
    });
  }
  echo(count=60,{durationMs=0,onProgress=()=>{},now=()=>performance.now(),wait=pause}={}) {
    return this.exclusive(async()=>{
      this.assertConnected();
      if(!Number.isFinite(durationMs)||durationMs<0||durationMs>20000 ||
          (!durationMs && (!Number.isSafeInteger(count)||count<1)))throw new Error('Geçersiz BLE test süresi veya paket sayısı.');
      const original=this.identity,start=now();let packets=0,sent=false,stage='başlangıç kimliği',preflightReconnected=false;
      let before,beforeStatus;
      try {
        for(let preparation=0;preparation<2;preparation++){
          try {
            stage='başlangıç kimliği';before=decodeJSON(await this.chars.identity.readValue());
            stage='başlangıç durumu';beforeStatus=decodeJSON(await this.chars.status.readValue());
            break;
          }catch(error){
            // Only read-only prerequisites can be repeated. Once an echo write
            // begins, loss or mismatch fails this run without packet replay.
            if(preparation || !staleGatt(error))throw error;
            preflightReconnected=true;
            await this.openConnection(false,original.mac,original.name);
          }
        }
        if(!validIdentity(before) || before.boot!==original.boot || before.mac!==original.mac ||
            before.elf_sha256!==original.elf_sha256 || before.fw!==original.fw)throw new Error('BLE başlangıç kimliği eşleşmiyor.');
        if(!validStatus(beforeStatus) || beforeStatus.boot!==before.boot || beforeStatus.fw!==before.fw)throw new Error('BLE başlangıç durumunun açılış kaydı eşleşmiyor.');
        for(let i=0;i<(durationMs?1000000:count) && (!durationMs || i===0 || now()-start<durationMs);i++){
          const payload=crypto.getRandomValues(new Uint8Array(20));
          payload[0]=i>>8;payload[1]=i&255;
          stage='paket yazma';sent=true;await this.chars.echo.writeValueWithResponse(payload);
          stage='paket okuma';const data=await this.chars.echo.readValue();
          const received=new Uint8Array(data.buffer,data.byteOffset,data.byteLength);
          if(received.length!==payload.length || received.some((v,j)=>v!==payload[j]))throw new Error(`BLE veri karşılaştırması başarısız: paket ${i+1}.`);
          packets++;onProgress({packets,elapsed_ms:now()-start});
          if(durationMs)await wait(Math.min(20,Math.max(0,durationMs-(now()-start))));
        }
        stage='bitiş kimliği';const after=decodeJSON(await this.chars.identity.readValue());
        stage='bitiş durumu';const afterStatus=decodeJSON(await this.chars.status.readValue());
        if(!validIdentity(after) || after.boot!==before.boot || after.mac!==before.mac || after.elf_sha256!==before.elf_sha256 ||
            after.fw!==before.fw || after.ble_host_resets!==before.ble_host_resets)throw new Error('BLE testi sırasında açılış, yazılım kimliği veya Bluetooth yığını değişti.');
        if(!validStatus(afterStatus) || afterStatus.boot!==after.boot || afterStatus.fw!==after.fw)throw new Error('BLE bitiş durumunun açılış kaydı eşleşmiyor.');
        const usbAbsent=beforeStatus.usb_monitor===true && afterStatus.usb_monitor===true &&
          Number.isSafeInteger(beforeStatus.usb_samples) && beforeStatus.usb_samples===afterStatus.usb_samples &&
          before.usb_data_connected===false && after.usb_data_connected===false;
        return {packets,bytes_per_packet:20,all_bytes_equal:true,elapsed_ms:Math.round(now()-start),requested_duration_ms:durationMs,before,after,
          preflight_reconnected:preflightReconnected,connection_diagnostics:this.diagnostics,
          usb_absent_observed:usbAbsent,usb_samples_before:beforeStatus.usb_samples,usb_samples_after:afterStatus.usb_samples};
      }catch(error){
        const diagnostics={...this.diagnostics,operation:stage,completed_packets:packets,packet_write_started:sent,
          preflight_reconnected:preflightReconnected,elapsed_ms:Math.round(now()-start),error_name:error.name,error_message:error.message};
        if(staleGatt(error)){
          const e=new Error(`Bluetooth servis kaydı ${stage} sırasında geçersiz oldu. ${packets} paket doğrulandı; bu deneme tamamlanmadı. Kartı yeniden bağlayıp testi yeniden başlatın.`);
          e.name='BleTransportError';e.testState=sent?'FAIL':'BLOCKED';e.cause=error;e.diagnostics=diagnostics;
          await this.disconnect('geçersiz Bluetooth servisi').catch(()=>{});throw e;
        }
        error.diagnostics=diagnostics;throw error;
      }
    });
  }
}
