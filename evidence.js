export const EXCLUDED_TESTS = [
  'USB bağlantı kararlılığı', 'Kart teslim / anakart revizyon kaydı', 'BQ27441 batarya profili',
  'GNSS konum fix bekleme', '3,3 V ve 5 V raylarının elektriksel ölçümü', 'Gerçek şarj fonksiyonu',
  'Batarya koruma eşikleri', 'ESD koruması', 'Pasifler / kristal / SAW / RF ağı / konnektörler',
  'LoRa düşük güç / ayrım kontrolü', 'Otomatik batarya akışında üç LED gözlemi', 'BLE + LoRa eşzamanlılık stresi'
];
export const TESTS = [
  {id:'WEB-FLASH',name:'Test firmware ve kart adı yükleme',detail:'ESP32-S3 / 16 MB · 3 imaj + isim sektörü hash / canlı kimlik',group:'components'},
  {id:'FT-01',name:'İşlemci ve kart kimliği',detail:'ESP32-S3 · açılış / bellek',group:'components'},
  {id:'FT-02.RW',name:'Flash yazma / okuma',detail:'GD25Q128E · ayrılmış test alanı',group:'components'},
  {id:'I2C-0',name:'Batarya I²C hattı',detail:'BQ27441 · adres ve veri yolu',group:'components'},
  {id:'I2C-1',name:'IMU I²C hattı',detail:'BNO055 · adres ve veri yolu',group:'components'},
  ...[1,2,3].map(i=>({id:`FT-03.${i}`,name:`LED ${i}`,detail:'Hazırlık penceresi ve gözle doğrulama · USB veya elle batarya testi',group:'components'})),
  {id:'FT-04',name:'SW3 butonu',detail:'Basılma ve bırakılma kenarları',group:'components'},
  {id:'FT-05.SIGNAL',name:'Şarj durum pini',detail:'BQ24075 · yalnız sinyal; gerçek şarj doğrulaması değil',group:'components'},
  {id:'FT-06',name:'Batarya ölçüm entegresi',detail:'BQ27441 · kimlik / gerilim / SOC ham verisi; profil onayı içermez',group:'components'},
  {id:'FT-08.ID',name:'IMU kimlik ve öz test',detail:'BNO055 · ID / POST',group:'components'},
  {id:'FT-08.MOTION',name:'IMU hareket tepkisi',detail:'Üç eksende operatör hareketi',group:'components'},
  {id:'FT-09',name:'GPS veri akışı',detail:'MAX-M10S · geçerli UART verisi; fix beklenmez',group:'components'},
  {id:'FT-09.TX',name:'GPS komut / yanıt',detail:'Çift yönlü UART bağlantısı',group:'components'},
  {id:'FT-12',name:'LoRa dijital arayüz',detail:'Reset / BUSY / SPI / TCXO',group:'radio'},
  {id:'WEB-LORA-PAIR',name:'LoRa iki yönlü haberleşme',detail:'İki kart / her yönde 5 eşsiz paket / CRC ve tam yük karşılaştırması',group:'radio'},
  ...[6,15,21].map((p,i)=>({id:`WEB-LORA-CONFIG-${p}`,name:`LoRa ${['0,2','1','2'][i]} W profil komutu`,detail:`Çip ${p} dBm · RX sırasında komut kabulü; gerçek watt ölçümü değil`,group:'radio'})),
  {id:'WEB-BLE',name:'Bluetooth veri bütünlüğü',detail:'Yaklaşık 20 saniye · 3 bağlantı · bütün paket baytları karşılaştırılır',group:'components'},
  {id:'BLE-DIAGNOSTIC',name:'Bluetooth bağlantı tanısı',detail:'Kartlar ekranından · RSSI ve 20 paket; anten sağlık onayı değildir',group:'components'},
  {id:'FT-14',name:'USB ile kararlılık',detail:'10 saniye sensör ve veri yolu izlemi; USB link stres testi değil',group:'components'},
  {id:'BAT-COLD',name:'Bataryada soğuk açılış',detail:'Operatör beyanı + yeni POWERON + USB veri yokluğu',group:'battery'},
  {id:'BAT-FLASH',name:'Bataryada flash yazma / okuma',detail:'Ayrılmış test alanı',group:'battery'},
  {id:'BAT-SW3',name:'Bataryada SW3',detail:'Bas / bırak kenarları',group:'battery'},
  {id:'BAT-IMU',name:'Bataryada IMU',detail:'Kimlik / POST + hareket',group:'battery'},
  {id:'BAT-GPS',name:'Bataryada GPS',detail:'UART komut / yanıt ve veri; fix beklenmez',group:'battery'},
  {id:'BAT-GAUGE',name:'Bataryada ölçüm entegresi',detail:'Kimlik / gerilim / ham SOC; profil onayı içermez',group:'battery'},
  {id:'BAT-BLE',name:'Bataryada Bluetooth',detail:'20 saniye · 3 bağlantı',group:'battery'},
  {id:'BAT-SOAK',name:'Bataryada 20 saniye kararlılık',detail:'20 saniye sensör / veri yolu; USB veri yokluğu izlenir',group:'battery'},
  {id:'PWR-LIGHT_TIMER',name:'Hafif uyku / zamanlayıcı',detail:'Aynı açılış · TIMER uyanma kaydı',group:'power'},
  {id:'PWR-LIGHT_SW3',name:'Hafif uyku / SW3',detail:'Aynı açılış · GPIO21 dijital uyanma kaydı',group:'power'},
  {id:'PWR-DEEP_TIMER',name:'Derin uyku / zamanlayıcı',detail:'Yeni açılış · DEEPSLEEP + TIMER',group:'power'},
  {id:'PWR-DEEP_SW3',name:'Derin uyku / SW3',detail:'Yeni açılış · DEEPSLEEP + RTC GPIO21',group:'power'},
  {id:'PWR-SOFT_OFF',name:'Yazılımsal bekleme / SW3',detail:'MCU derin uyku; kartın tüm beslemesi kesilmez',group:'power'},
  {id:'PWR-RESTART',name:'Yazılımsal yeniden başlatma',detail:'Yeni açılış · SW reset nedeni',group:'power'},
  {id:'PWR-CYCLE',name:'Gerçek güç kesme / açma',detail:'Operatör güç kesme beyanı + yeni POWERON kaydı',group:'power'},
];
const known = new Set(TESTS.map(t=>t.id));
const excludedIds = new Set(['FT-00','FT-07','FT-09.FIX','FT-10','DMM-3V3','DMM-5V','EXT-CURRENT','EXT-RF','EXT-POWER','HW-01','USB_LINK','WEB-LORA-LOW']);
function measuredResultFor(run,id,since=0) {
  const rows=run.records.slice(since).filter(r=>r.test===id && (r.result==='FAIL' || r.transport_verified!==false) &&
    !(id==='FT-14' && r.power_context==='battery-only'));
  if (!rows.length) return {result:'PENDING',code:'Henüz çalıştırılmadı'};
  return rows.find(r=>r.result==='FAIL') || rows.at(-1);
}
export function resultFor(run,id) {
  const measured=measuredResultFor(run,id);
  const manual=run.manual_adjustments?.findLast(r=>r.test===id);
  if(!manual?.result)return measured;
  const newer=measuredResultFor(run,id,manual.record_count??run.records.length);
  if(newer.result!=='PENDING')return {...newer,earlier_manual_adjustment:true};
  return {...measured,result:manual.result,source:'operator_override',manual_override:true,original_result:measured.result,
    code:`Elle düzeltildi: ${manual.reason||'Operatör değerlendirmesi'}. Özgün sonuç: ${measured.result}.`,adjusted_at:manual.at};
}
export function adjustResult(run,id,result,reason='') {
  if(!known.has(id) && (excludedIds.has(id)||!run.records.some(r=>r.test===id)))throw new Error('Bu test rapor kapsamında değil.');
  if(result!==null && !['PASS','FAIL','BLOCKED','SKIP'].includes(result))throw new Error('Geçersiz elle düzeltme sonucu.');
  const change={test:id,result,record_count:run.records.length,reason:String(reason).trim().slice(0,500),at:new Date().toISOString(),
    previous_result:resultFor(run,id).result,original_result:measuredResultFor(run,id).result,source:'operator'};
  (run.manual_adjustments??=[]).push(change);return change;
}
export function summary(run) {
  const extra=[...new Set(run.records.filter(r=>r.result==='FAIL' && !known.has(r.test) && !excludedIds.has(r.test)).map(r=>r.test))];
  return [...TESTS.map(t=>({...t,...resultFor(run,t.id)})),...extra.map(id=>({id,name:id,group:'additional',detail:'Ek hata kaydı',...resultFor(run,id)}))];
}
export function countResults(run) {
  const counts={PASS:0,FAIL:0,BLOCKED:0,SKIP:0,PENDING:0};
  for (const row of summary(run)) counts[row.result]++;
  return counts;
}
export function reportObject(run) {
  return {schema:1,application:'MilMesh Web Test',version:'0.8.0',excluded_tests:EXCLUDED_TESTS,exported_at:new Date().toISOString(),
    scope:'Komponent haberleşmesi, flash, elle LED gözlemi, SW3, IMU hareketi, fix beklemeden GPS, 20 saniye BLE, iki kartlı LoRa paketleri / profil komutları, bataryada 20 saniye kararlılık ve uyku / uyanma kayıtları. Gerçek RF watt ve bütün kartın enerjisinin kesilmesi yazılımla ölçülmez.',
    ...run,manual_adjustments:run.manual_adjustments||[],summary:summary(run),counts:countResults(run)};
}
export function csvCell(value) {
  let s=String(value??'');
  if (/^[=+\-@\t\r]/.test(s)) s="'"+s;
  return '"'+s.replaceAll('"','""')+'"';
}
export function csv(run) {
  return '\ufeff'+[['Kart','MAC','Test','Bileşen','Sonuç','Açıklama','Kaynak'],...summary(run).map(r=>[
    run.name,run.mac,r.id,r.name,r.result,r.code,r.source||'firmware'
  ])].map(row=>row.map(csvCell).join(',')).join('\r\n');
}
export function escapeHTML(s) { return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
export function addRow(run,row) {
  if (!['PASS','FAIL','SKIP','BLOCKED'].includes(row.result)) throw new Error('Geçersiz rapor sonucu');
  if (row.device_mac && row.device_mac!==run.mac) throw new Error('Sonuç başka karta ait');
  run.records.push(row);
  return known.has(row.test);
}
export function validatePower(pending,row,identity) {
  const d=row?.data;
  if (row?.test!=='POWER-TEST' || !d || d.token!==pending.token || d.mode!==pending.mode ||
      d.before_boot!==pending.before_boot || d.phase!==3)
    return {ok:false,reason:'Uyanma kaydı, istek belirteci veya açılış kimliği doğrulanamadı.'};
  if(row.result!=='PASS'){
    const reasons={UNEXPECTED_RESET_OR_WAKE_SOURCE:'Beklenen uyandırma yerine farklı bir reset/uyanma kaydı alındı. USB ile yeniden açılış, uyku başarısı sayılmadı.',BLE_RESUME_FAILED:'İşlemci uyandı fakat Bluetooth geri başlatılamadı.',BLE_SHUTDOWN_TIMEOUT_RESTARTED:'Bluetooth kapanışı zaman aşımına uğradı; kart yeniden başlatıldı.',BLE_SHUTDOWN_FAILED:'Bluetooth kapanışı başarısız oldu.',USB_CONNECTED_OR_SW3_HELD_AT_ENTRY:'Uykuya giriş anında USB bağlıydı veya SW3 basılıydı.',POWER_NVS_WRITE_ERROR:'Uyku kaydı kalıcı belleğe yazılamadı.',WAKE_SOURCE_CONFIG_ERROR:'Uyandırma kaynağı kurulamadı.',SLEEP_API_ERROR:'İşlemci uykuya girişi tamamlayamadı.'};
    return {ok:false,reason:reasons[d.error]||`Kart uyku sonucunu başarısız bildirdi: ${d.error||row.code||'bilinmiyor'}.`};
  }
  if(d.after_boot!==identity.boot)return {ok:false,reason:'Uyanma kaydının açılış kimliği doğrulanamadı.'};
  const fresh=identity.boot!==pending.before_boot;
  const button=d.wake_cause===3 && d.wake_gpio_mask===2**21;
  const modern=identity.fw==='0.6.0';
  let ok=false;
  if (pending.mode===1) ok=!fresh && d.wake_cause===4 && d.elapsed_ms>=pending.seconds*1000-100;
  if (pending.mode===2) ok=!fresh && (modern?d.wake_cause===7 && d.configured_wake_gpio_mask===2**21:button);
  if (pending.mode===3) ok=fresh && d.reset_reason===8 && d.wake_cause===4;
  if (pending.mode===4 || pending.mode===5) ok=fresh && d.reset_reason===8 && button;
  if (pending.mode===6) ok=fresh && d.reset_reason===3;
  if (pending.mode===7) ok=fresh && d.reset_reason===1 && pending.operator_power_cut===true;
  if (pending.mode<=5 && (d.usb_data_before || d.usb_data_after)) ok=false;
  if(modern && (d.ble_ready!==true||d.stage!=='READY'))ok=false;
  return {ok,reason:ok?'İstek, açılış, uyanma nedeni ve Bluetooth dönüşü eşleşti.':`Beklenen uyanma/güç çevrimi koşulları sağlanmadı.${d.error&&d.error!=='NONE'?' '+d.error:''}`};
}
