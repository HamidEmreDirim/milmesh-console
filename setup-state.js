export function slotForCard(slots,index,receipt){
 return receipt?.mac?slots.find(s=>s.run.mac===receipt.mac):slots.find(s=>s.roleIndex===index);
}
export function activeCardIndices(deviceCount){return deviceCount===2?[0,1]:[0];}
export function uploadNamesAreDistinct({deviceCount,indices,names,flashSlots}){
 const effective=activeCardIndices(deviceCount).map(i=>indices.includes(i)?names[i]:flashSlots[i]?.receipt?.name).filter(Boolean);
 return new Set(effective).size===effective.length;
}
export function flashGuards({deviceCount,index,flashSlots,slots}){
 const active=activeCardIndices(deviceCount),peers=active.filter(i=>i!==index);
 if(!active.includes(index))throw new Error('Bu kart alanı seçili test modunda etkin değil.');
 // In single-card mode the explicitly selected USB port is the upload target;
 // an earlier receipt describes history, not another active physical board.
 if(deviceCount!==2)return {disallowMACs:[]};
 return {
  expectedMAC:flashSlots[index]?.receipt?.mac||slotForCard(slots,index,flashSlots[index]?.receipt)?.run.mac,
  disallowMACs:[...new Set([...peers.map(i=>flashSlots[i]?.receipt?.mac),...slots.filter(s=>peers.includes(s.roleIndex)).map(s=>s.run.mac)].filter(Boolean).map(mac=>mac.toLowerCase()))]
 };
}
export function cardAction({slot,receipt,busy=false}){
 if(busy)return {kind:'wait',label:'İşlem sürüyor…',disabled:true};
 if(slot?.board.connected)return {kind:'open',label:slot.run.pending?'Güç testine dön':'Testleri aç',disabled:false};
 if(slot)return {kind:'reconnect',label:'Yeniden bağlan',disabled:false};
 return {kind:'connect',label:receipt?'Bluetooth ile bağlan':'Yazılım yüklü, bağlan',disabled:false};
}
export function advertisedName(receipt){
 if(!receipt)return null;
 return receipt.ble_name||('MC-'+receipt.mac.split(':').slice(3).join('').toUpperCase());
}
export function canAdoptCurrentIdentity(receipt,info,release,name){
 return !!receipt && ['0.4.0','0.4.1','0.5.0'].includes(receipt.version) &&
  receipt.mac?.toLowerCase()===info.mac?.toLowerCase() && info.named===true && info.name===name &&
  release?.version==='0.6.0' && info.fw===release.version && /^[a-f0-9]{64}$/.test(release.elf_sha256) && info.elf_sha256===release.elf_sha256;
}
