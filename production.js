// MilMesh production firmware (oscar, PlatformIO env esp32s3) over USB.
// Pure functions only: used by build.mjs (Node), the browser flasher and node --test.
// The write list is exactly what `pio run -e esp32s3 -t upload` writes with
// scripts/pio_drop_otadata.py: no erase-all, no boot_app0.bin at 0xE000.

export const PRODUCTION_BOARD='mc_meshcom_v1';
export const PRODUCTION_CHIP='ESP32-S3';
export const PRODUCTION_FLASH_BYTES=16*1024*1024;
export const PRODUCTION_KIND='milmesh-production-firmware';
export const PRODUCTION_SCHEMA=1;
export const SECTOR=0x1000;
// boards/mc_meshcom_v1.json: flash_mode dio, f_flash 80 MHz, upload.flash_size 16MB.
// The bundled bootloader header must already carry these values, so the image is
// written byte for byte (esptool-js 'keep') and matches what esptool writes for pio.
export const FLASH_PARAMS={mode:'dio',freq:'80m',size:'16MB',header_mode:0x02,header_size_freq:0x4f};
export const ESP32S3_CHIP_ID=9;
export const DESCRIPTOR_MAGIC='MMFWDSC1';
export const DESCRIPTOR_BYTES=52;

// partitions/mc_16mb.csv. type 0 = app, 1 = data.
export const PARTITIONS=Object.freeze([
 {label:'nvs',type:1,subtype:0x02,offset:0x9000,size:0x6000},
 {label:'phy_init',type:1,subtype:0x01,offset:0xf000,size:0x1000},
 {label:'ota_0',type:0,subtype:0x10,offset:0x10000,size:0x300000},
 {label:'scratch',type:1,subtype:0x40,offset:0x310000,size:0x10000},
 {label:'autolog',type:1,subtype:0x02,offset:0x320000,size:0x20000},
 {label:'identity',type:1,subtype:0x41,offset:0x340000,size:0x1000},
 {label:'otadata',type:1,subtype:0x00,offset:0x341000,size:0x2000},
 {label:'ota_1',type:0,subtype:0x11,offset:0x350000,size:0x300000},
]);
const part=label=>PARTITIONS.find(p=>p.label===label);

// Order and offsets of the pio upload (bootloader, partitions, FLASH_EXTRA_IMAGES with
// otadata appended, then the app). `max` is the region the image may occupy.
export const WRITE_PLAN=Object.freeze([
 {name:'bootloader.bin',address:0x0,max:0x8000,role:'bootloader'},
 {name:'partitions.bin',address:0x8000,max:0x1000,role:'partition-table'},
 {name:'otadata_blank.bin',address:0x341000,max:0x2000,exact:0x2000,role:'otadata'},
 {name:'firmware.bin',address:0x10000,max:0x300000,role:'app ota_0'},
]);

// Never written by this flow. 0xE000 (Arduino boot_app0.bin) is inside nvs.
export const PROTECTED_REGIONS=Object.freeze([
 {label:'nvs',start:0x9000,end:0xf000,why:'cihaz adı, PIN, BLE eşleşmeleri, kanallar, radyo ayarları, min_sv'},
 {label:'phy_init',start:0xf000,end:0x10000,why:'RF kalibrasyonu'},
 {label:'scratch',start:0x310000,end:0x320000,why:'çevrimdışı gelen kutusu, kullanıcı verisi'},
 {label:'autolog',start:0x320000,end:0x340000,why:'otomatik kayıt'},
 {label:'identity',start:0x340000,end:0x341000,why:'fabrika kart adı'},
 {label:'ota_1',start:0x350000,end:0x650000,why:'ikinci uygulama yuvası'},
]);
export const ARDUINO_BOOT_APP0=0xe000;

const hex=v=>'0x'+v.toString(16);
const ascii=bytes=>{let s='';for(const b of bytes){if(b===0)break;s+=String.fromCharCode(b);}return s;};
const u16=(b,o)=>b[o]|b[o+1]<<8;
const u32=(b,o)=>(b[o]|b[o+1]<<8|b[o+2]<<16|b[o+3]<<24)>>>0;

/** Sector-rounded range that flashing `length` bytes at `address` erases. */
export function erasedRange(address,length){return {start:address,end:address+Math.ceil(length/SECTOR)*SECTOR};}

/** Throws unless every write is on the plan, inside its region and clear of protected data. */
export function assertSafeWrites(writes){
 if(!Array.isArray(writes)||writes.length!==WRITE_PLAN.length)throw new Error(`Yazım listesi ${WRITE_PLAN.length} imaj olmalı.`);
 const seen=new Set();
 for(const w of writes){
  const length=w.data?.length??w.bytes;
  if(!Number.isInteger(w.address)||!Number.isInteger(length)||length<=0)throw new Error('Geçersiz yazım girdisi.');
  const plan=WRITE_PLAN.find(p=>p.address===w.address);
  if(!plan)throw new Error(`İzin verilmeyen flash adresi ${hex(w.address)}; yazım yapılmadı.`);
  if(seen.has(w.address))throw new Error(`Aynı adres iki kez: ${hex(w.address)}.`);seen.add(w.address);
  if(w.address%SECTOR)throw new Error(`Sektöre hizalı olmayan adres ${hex(w.address)}.`);
  if(length>plan.max||(plan.exact&&length!==plan.exact))throw new Error(`${plan.name} boyutu ${length} B, izin verilen bölgeye sığmıyor.`);
  const r=erasedRange(w.address,length);
  if(r.end>PRODUCTION_FLASH_BYTES)throw new Error('Yazım 16 MB flash dışına taşıyor.');
  if(r.start<=ARDUINO_BOOT_APP0&&ARDUINO_BOOT_APP0<r.end)throw new Error('0xE000 (Arduino boot_app0, NVS son sayfası) yazılamaz.');
  for(const p of PROTECTED_REGIONS)if(r.start<p.end&&p.start<r.end)throw new Error(`${hex(w.address)} yazımı korunan ${p.label} bölgesine (${hex(p.start)}–${hex(p.end)}) değiyor.`);
 }
 return true;
}

/** Firmware descriptor (include/ota/firmware_descriptor.hpp, scripts/make_mcfw.py). */
export function parseDescriptor(image){
 const bytes=image instanceof Uint8Array?image:new Uint8Array(image);
 const magic=[...DESCRIPTOR_MAGIC].map(c=>c.charCodeAt(0));
 const at=[];
 outer:for(let i=0;i+magic.length<=bytes.length;i++){
  for(let j=0;j<magic.length;j++)if(bytes[i+j]!==magic[j])continue outer;
  at.push(i);if(at.length>1)break;
 }
 if(!at.length)throw new Error('Firmware tanımlayıcısı (MMFWDSC1) bulunamadı: MilMesh üretim yazılımı değil.');
 if(at.length>1)throw new Error('Firmware tanımlayıcısı birden fazla kez bulundu.');
 const o=at[0];if(o+DESCRIPTOR_BYTES>bytes.length)throw new Error('Firmware tanımlayıcısı eksik.');
 const d=bytes.subarray(o,o+DESCRIPTOR_BYTES);
 const flags=d[11],build=u32(d,12);
 return {offset:o,major:d[8],minor:d[9],patch:d[10],flags,dirty:(flags&1)===1,build_id:build.toString(16).padStart(8,'0'),
  security_version:u16(d,16),name:ascii(d.subarray(20,36)),board_id:ascii(d.subarray(36,52)),version:`${d[8]}.${d[9]}.${d[10]}`};
}
export function buildLabel(fw){return fw?`${fw.build_id}${fw.dirty?'-dirty':''}`:'—';}

/** ESP image layout: header, segments, checksum padded to 16, appended SHA-256.
 *  Returns the hashed range; the file must end exactly after the digest (catches
 *  truncated / half-written build outputs). */
export function imageLayout(image,label='imaj'){
 if(image.length<24||image[0]!==0xe9)throw new Error(`${label} bir ESP imajı değil.`);
 let o=24;
 for(let i=0;i<image[1];i++){if(o+8>image.length)throw new Error(`${label} kesik (segment başlığı).`);o+=8+u32(image,o+4);if(o>image.length)throw new Error(`${label} kesik (segment verisi).`);}
 const end=(o&~15)+16,hashed=image[23]===1,total=end+(hashed?32:0);
 if(!hashed)throw new Error(`${label} SHA-256 eklenmiş imaj değil.`);
 if(total!==image.length)throw new Error(`${label} boyutu imaj yapısıyla tutmuyor (${image.length} B, beklenen ${total} B).`);
 return {end,digest:image.subarray(end,end+32)};
}
/** Verifies the appended SHA-256 with a caller supplied digest (Node crypto or WebCrypto). */
export async function verifyImageDigest(image,label,sha256hex){
 const {end,digest}=imageLayout(image,label);
 const want=[...digest].map(v=>v.toString(16).padStart(2,'0')).join('');
 if(await sha256hex(image.subarray(0,end))!==want)throw new Error(`${label} içindeki SHA-256 tutmuyor (bozuk veya yarım derleme).`);
 return true;
}
/** ESP-IDF app image (firmware.bin) sanity: magic, chip id, slot size, unique MilMesh descriptor. */
export function checkAppImage(image){
 if(image.length<64||image[0]!==0xe9)throw new Error('firmware.bin bir ESP uygulama imajı değil (0xE9 yok).');
 if(u16(image,12)!==ESP32S3_CHIP_ID)throw new Error('firmware.bin ESP32-S3 için derlenmemiş.');
 if(image.length>part('ota_0').size)throw new Error('firmware.bin ota_0 yuvasından büyük.');
 const fw=parseDescriptor(image);
 if(fw.name!=='MilMesh')throw new Error(`Beklenmeyen firmware adı: ${fw.name}.`);
 if(fw.board_id!==PRODUCTION_BOARD)throw new Error(`Firmware kartı ${fw.board_id||'boş'}; yalnız ${PRODUCTION_BOARD} kabul edilir.`);
 return fw;
}
/** Bootloader header must already hold dio / 80 MHz / 16 MB (written unchanged). */
export function checkBootloader(image){
 if(image.length<24||image[0]!==0xe9)throw new Error('bootloader.bin bir ESP imajı değil.');
 if(u16(image,12)!==ESP32S3_CHIP_ID)throw new Error('bootloader.bin ESP32-S3 için değil.');
 if(image[2]!==FLASH_PARAMS.header_mode||image[3]!==FLASH_PARAMS.header_size_freq)
  throw new Error(`bootloader.bin başlığı dio/80m/16MB değil (0x${image[2].toString(16)} 0x${image[3].toString(16)}).`);
 return true;
}
/** Binary partition table must equal partitions/mc_16mb.csv exactly. */
export function parsePartitionTable(bin){
 const out=[];
 for(let o=0;o+32<=bin.length;o+=32){
  const m=u16(bin,o);
  if(m===0x50aa)out.push({label:ascii(bin.subarray(o+12,o+28)),type:bin[o+2],subtype:bin[o+3],offset:u32(bin,o+4),size:u32(bin,o+8)});
  else if(m===0xebeb||m===0xffff)break;
  else throw new Error('partitions.bin içinde bilinmeyen kayıt.');
 }
 return out;
}
export function checkPartitionTable(bin){
 const rows=parsePartitionTable(bin);
 const same=rows.length===PARTITIONS.length&&rows.every((r,i)=>{const e=PARTITIONS[i];return r.label===e.label&&r.type===e.type&&r.subtype===e.subtype&&r.offset===e.offset&&r.size===e.size;});
 if(!same)throw new Error('partitions.bin, mc_16mb.csv düzeniyle eşleşmiyor; korunan bölgeler doğrulanamaz.');
 return rows;
}
export function checkOtadataBlank(bin){
 if(bin.length!==0x2000||!bin.every(v=>v===0xff))throw new Error('otadata_blank.bin 0x2000 bayt 0xFF olmalı.');
 return true;
}
/** Content checks for every image of the write plan. Returns the firmware descriptor. */
export function checkImages(byName){
 for(const p of WRITE_PLAN)if(byName[p.name] instanceof Uint8Array&&['bootloader.bin','firmware.bin'].includes(p.name))imageLayout(byName[p.name],p.name);
 for(const p of WRITE_PLAN)if(!(byName[p.name] instanceof Uint8Array))throw new Error(`${p.name} eksik.`);
 checkBootloader(byName['bootloader.bin']);checkPartitionTable(byName['partitions.bin']);checkOtadataBlank(byName['otadata_blank.bin']);
 const fw=checkAppImage(byName['firmware.bin']);
 assertSafeWrites(WRITE_PLAN.map(p=>({address:p.address,data:byName[p.name]})));
 return fw;
}

export function makeManifest({images,firmware,built_at=new Date().toISOString(),source='oscar .pio/build/esp32s3'}){
 return {kind:PRODUCTION_KIND,schema:PRODUCTION_SCHEMA,board:PRODUCTION_BOARD,chip:PRODUCTION_CHIP,flash_bytes:PRODUCTION_FLASH_BYTES,
  flash:{mode:FLASH_PARAMS.mode,freq:FLASH_PARAMS.freq,size:FLASH_PARAMS.size},
  firmware:{name:firmware.name,version:firmware.version,build_id:firmware.build_id,dirty:firmware.dirty,security_version:firmware.security_version,board_id:firmware.board_id},
  images:WRITE_PLAN.map(p=>{const i=images.find(v=>v.name===p.name);return {name:p.name,address:p.address,bytes:i.bytes,sha256:i.sha256};}),
  preserved:PROTECTED_REGIONS.map(r=>({label:r.label,start:r.start,end:r.end})),erase_all:false,built_at,source};
}

/** Strict manifest validation (browser before download, tests, build). */
export function validateManifest(m){
 const bad=why=>{throw new Error('Üretim firmware manifesti geçersiz: '+why);};
 if(!m||typeof m!=='object')bad('nesne değil');
 if(m.kind!==PRODUCTION_KIND||m.schema!==PRODUCTION_SCHEMA)bad('tür / şema');
 if(m.board!==PRODUCTION_BOARD||m.chip!==PRODUCTION_CHIP||m.flash_bytes!==PRODUCTION_FLASH_BYTES)bad('kart, çip veya flash boyutu');
 if(m.erase_all!==false)bad('erase_all false olmalı');
 if(m.flash?.mode!==FLASH_PARAMS.mode||m.flash?.freq!==FLASH_PARAMS.freq||m.flash?.size!==FLASH_PARAMS.size)bad('flash parametreleri');
 const f=m.firmware;
 if(!f||f.name!=='MilMesh'||f.board_id!==PRODUCTION_BOARD||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(f.version)||!/^[0-9a-f]{8}$/.test(f.build_id)||
    typeof f.dirty!=='boolean'||!Number.isInteger(f.security_version)||f.security_version<0||f.security_version>0xffff)bad('firmware kimliği');
 if(!Array.isArray(m.images)||m.images.length!==WRITE_PLAN.length)bad('imaj sayısı');
 m.images.forEach((img,i)=>{
  const p=WRITE_PLAN[i];
  if(img.name!==p.name||img.address!==p.address)bad(`imaj ${i+1}: ${img.name}@${img.address} beklenen ${p.name}@${hex(p.address)}`);
  if(!/^[a-f0-9]{64}$/.test(img.sha256)||!Number.isInteger(img.bytes)||img.bytes<=0)bad(`imaj ${p.name} hash/boyut`);
 });
 assertSafeWrites(m.images);
 return m;
}

/** Parses the boot identity line, e.g.
 *  [I][fw] MilMesh 1.0.0 build=d5ecc54c-dirty sv=1 board=mc_meshcom_v1 slot=ota_0 state=2 min_sv=1 */
const FW_LINE=/\[fw\]\s+(\S+)\s+(\d+\.\d+\.\d+)\s+build=([0-9a-fA-F]{8})(-dirty)?\s+sv=(\d+)\s+board=(\S+)\s+slot=(\S+)(?:\s+state=(-?\d+))?((?:\s+(?:PENDING_VERIFY|ROLLED_BACK|pending_verify|rolled_back))*)\s+min_sv=(\d+)/;
export function parseFwLine(text){
 const m=FW_LINE.exec(String(text));if(!m)return null;
 const flags=m[9]||'';
 return {name:m[1],version:m[2],build_id:m[3].toLowerCase(),dirty:!!m[4],security_version:Number(m[5]),board_id:m[6],slot:m[7],
  state:m[8]===undefined?null:Number(m[8]),pending_verify:/pending_verify/i.test(flags),rolled_back:/rolled_back/i.test(flags),min_sv:Number(m[10]),line:m[0]};
}
/** Does the running boot line prove the bundled build is the one running from ota_0? */
export function runningMatches(running,fw){
 const problems=[];
 if(!running)return {ok:false,problems:['Açılış satırı görülmedi.']};
 if(running.name!==fw.name||running.version!==fw.version)problems.push(`sürüm ${running.name} ${running.version}, beklenen ${fw.version}`);
 if(running.build_id!==fw.build_id||running.dirty!==fw.dirty)problems.push(`build ${buildLabel(running)}, beklenen ${buildLabel(fw)}`);
 if(running.board_id!==fw.board_id)problems.push(`kart ${running.board_id}`);
 if(running.security_version!==fw.security_version)problems.push(`sv ${running.security_version}, beklenen ${fw.security_version}`);
 if(running.slot!=='ota_0')problems.push(`yuva ${running.slot}, beklenen ota_0`);
 if(running.rolled_back)problems.push('ROLLED_BACK');
 return {ok:!problems.length,problems};
}

/** Warnings shown before writing. `current` comes from the board's flash (read only). */
export function assessUpdate(fw,current={}){
 const warnings=[],blockers=[],info=[];
 const run=current.firmware;
 if(fw.dirty)warnings.push({id:'dirty',text:`Yeni derleme "-dirty": commit edilmemiş değişikliklerle derlenmiş (build ${buildLabel(fw)}).`,confirm:'Commit edilmemiş (-dirty) derlemeyi bilerek yüklüyorum.'});
 if(Number.isInteger(current.min_sv)&&fw.security_version<current.min_sv)
  warnings.push({id:'downgrade',text:`Güvenlik sürümü düşüyor: yeni sv=${fw.security_version}, kartın min_sv=${current.min_sv}. Firmware USB yüklemesini engellemez; kart BLE/OTA ile eski sürüme geri dönüşü reddedecek şekilde ayarlıdır.`,confirm:`Daha düşük güvenlik sürümünü (sv ${fw.security_version} < min_sv ${current.min_sv}) bilerek yüklüyorum.`});
 if(run&&run.board_id!==PRODUCTION_BOARD)blockers.push(`Karttaki yazılım ${run.board_id} kartı için; bu kart ${PRODUCTION_BOARD} değil.`);
 if(run&&run.security_version>fw.security_version&&!(Number.isInteger(current.min_sv)&&fw.security_version<current.min_sv))
  warnings.push({id:'older-sv',text:`Karttaki yazılımın sv=${run.security_version}, yeni sv=${fw.security_version}.`,confirm:'Daha düşük sv’li yazılımı bilerek yüklüyorum.'});
 if(!run)info.push(current.firmware_error||'Karttaki mevcut MilMesh sürümü okunamadı (boş, test yazılımı veya eski sürüm).');
 else if(run.build_id===fw.build_id&&run.dirty===fw.dirty&&run.version===fw.version)info.push('Kartta aynı derleme zaten var; yeniden yüklenecek.');
 if(!Number.isInteger(current.min_sv))info.push('Kartın min_sv değeri NVS’ten okunamadı; geri dönüş kontrolü yapılamadı.');
 return {warnings,blockers,info};
}

// -------------------------------------------------- read-only board inspection ----
// esp_rom_crc32_le(UINT32_MAX, ...) as used by NVS and otadata (== zlib.crc32(data, 0xFFFFFFFF)).
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32le(init,bytes){let c=(~init)>>>0;for(const b of bytes)c=CRC_TABLE[(c^b)&0xff]^(c>>>8);return (~c)>>>0;}

/** Which app slot the bootloader picks from otadata (0x2000 bytes). */
export function parseOtadata(bin){
 let best=null;
 for(const o of [0,0x1000]){
  if(bin.length<o+32)continue;
  const seq=u32(bin,o),state=u32(bin,o+24),crc=u32(bin,o+28);
  if(seq===0xffffffff)continue;
  if(crc32le(0xffffffff,bin.subarray(o,o+4))!==crc)continue;
  if(state===3||state===4)continue; // ESP_OTA_IMG_INVALID / ABORTED
  if(!best||seq>best.seq)best={seq,state};
 }
 return best?{slot:(best.seq-1)%2===0?'ota_0':'ota_1',seq:best.seq,state:best.state}:{slot:'ota_0',seq:null,state:null};
}

/** Reads one u16 key from a raw NVS partition image (namespace fwsec, key min_sv). */
export function readNvsU16(bin,namespace,key){
 const pages=[];
 for(let p=0;p+SECTOR<=bin.length;p+=SECTOR){
  const state=u32(bin,p);
  if(state===0xfffffffe||state===0xfffffffc||state===0xfffffff8)pages.push({p,seq:u32(bin,p+4),freeing:state===0xfffffff8});
 }
 pages.sort((a,b)=>a.seq-b.seq);
 const entries=[];
 for(const {p,seq,freeing} of pages){
  for(let i=0;i<126;){
   const st=(bin[p+32+(i>>2)]>>((i&3)*2))&3;
   const e=p+64+i*32;
   if(st!==2){i++;continue;}
   const span=Math.max(1,bin[e+2]);
   const head=new Uint8Array(28);head.set(bin.subarray(e,e+4),0);head.set(bin.subarray(e+8,e+32),4);
   if(crc32le(0xffffffff,head)===u32(bin,e+4))entries.push({ns:bin[e],type:bin[e+1],key:ascii(bin.subarray(e+8,e+24)),data:bin.subarray(e+24,e+32),seq,freeing});
   i+=st===2&&span<=126-i?span:1;
  }
 }
 const ns=entries.filter(v=>v.ns===0&&v.type===0x01&&v.key===namespace).at(-1);
 if(!ns)return null;
 const hits=entries.filter(v=>v.ns===ns.data[0]&&v.type===0x02&&v.key===key);
 const hit=hits.filter(v=>!v.freeing).at(-1)||hits.at(-1);
 return hit?u16(hit.data,0):null;
}
