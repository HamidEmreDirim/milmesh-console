export const BOARD_NAME_MAX=24;
export const IDENTITY_ADDRESS=0x340000;
export const IDENTITY_SIZE=4096;
export function validateBoardName(value){
 const name=String(value??'').trim();
 if(!/^[A-Za-z0-9_-]{1,24}$/.test(name))throw new Error('Kart adı 1–24 harf, sayı, alt çizgi veya tire içermeli.');
 return name;
}
export function identityHash(bytes){let h=2166136261;for(const v of bytes)h=Math.imul(h^v,16777619)>>>0;return h;}
export function encodeBoardIdentity(value,mac){
 const name=validateBoardName(value);
 if(!/^[a-f0-9]{2}(:[a-f0-9]{2}){5}$/i.test(mac))throw new Error('Kart ismi için geçerli eFuse MAC gerekli.');
 const image=new Uint8Array(IDENTITY_SIZE).fill(255);image.fill(0,0,48);
 image.set(new TextEncoder().encode('MCID'));image[4]=1;image[5]=name.length;
 image.set(mac.split(':').map(s=>parseInt(s,16)),6);image.set(new TextEncoder().encode(name),12);
 new DataView(image.buffer).setUint32(44,identityHash(image.subarray(0,44)),true);
 return image;
}
/** Read-only decode of the 0x340000 sector (inverse of encodeBoardIdentity). */
export function decodeBoardIdentity(bytes,mac=null){
 const b=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);
 if(b.length<48)return {valid:false,reason:'Kısa kimlik sektörü.'};
 if(b.subarray(0,48).every(v=>v===255))return {valid:false,reason:'Kimlik sektörü boş (kart adı kaydedilmemiş).'};
 if(new TextDecoder().decode(b.subarray(0,4))!=='MCID'||b[4]!==1)return {valid:false,reason:'Kimlik sektöründe MCID v1 kaydı yok.'};
 const view=new DataView(b.buffer,b.byteOffset,b.byteLength);
 if(view.getUint32(44,true)!==identityHash(b.subarray(0,44)))return {valid:false,reason:'Kimlik sektörü bütünlük değeri tutmuyor.'};
 const length=b[5];if(length<1||length>BOARD_NAME_MAX)return {valid:false,reason:'Kart adı uzunluğu geçersiz.'};
 const name=new TextDecoder().decode(b.subarray(12,12+length));
 const recordMac=[...b.subarray(6,12)].map(v=>v.toString(16).padStart(2,'0')).join(':');
 if(!/^[A-Za-z0-9_-]{1,24}$/.test(name))return {valid:false,reason:'Kart adı karakterleri geçersiz.',mac:recordMac};
 const macMatches=mac?recordMac===mac.toLowerCase():null;
 return {valid:true,name,mac:recordMac,mac_matches:macMatches,reason:macMatches===false?'Kayıt başka bir karta ait (MAC eşleşmiyor).':null};
}
