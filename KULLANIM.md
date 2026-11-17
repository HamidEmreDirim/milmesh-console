# MilMesh Web Kart Testi · Web 0.8.0 / Test firmware 0.6.0

Uygulama: **https://milmesh-kart-test-20261029.h-emre.chatgpt.site/#setup**. Yerel kullanım: **http://localhost:4173**; paket kökünde `./start_web.sh` ile açılır. Güncellemeden sonra sayfayı **Cmd+Shift+R** ile yenileyin. Uyku/uyanma düzeltmeleri ve uyanık LED göstergeleri için karta **0.6.0 firmware yüklenmelidir**. 30 Ekim fiziksel testlerinde `mb_004` güncellendi; uyku testinde kullanılacak diğer kartlarda da 0.6.0 bulunmalıdır. Siteye erişim mevcut paylaşım izinlerine bağlıdır.

USB yükleme için Web Serial, testler için Web Bluetooth gerekir. Bu bilgisayarda Opera ile bu iki özellik doğrulanmıştır. Uyumlu masaüstü Chrome/Edge de kullanılabilir; Safari/Firefox bu bağlantı akışını desteklemez. İlk kullanımda işletim sistemi ve tarayıcı izinlerini verin. Kart kayıtları bu tarayıcıda tutulur.

## İki bölüm: Yazılım güncelleme ve Kart testi (Web 0.8.0)

Sayfanın üstünde iki sekme vardır. Site her zaman **Yazılım güncelleme** sekmesiyle açılır.

- **Yazılım güncelleme**: sahadaki kartın MilMesh üretim yazılımını USB ile günceller (aşağıdaki “MilMesh firmware güncelle” bölümü). Bu sekmede yalnız güncellemeyle ilgili kısımlar görünür: kısa adım rehberi (USB’ye tak → port seç → kartı oku ve güncelle → açılış doğrulaması), tarayıcı notu ve bu tarayıcıdaki güncelleme geçmişi. Kart testi menüsü, bağlı kartlar, kart bilgisi, test rehberi ve Test günlüğü gizlenir.
- **Kart testi**: tezgahtaki test akışının tamamı (Kartlar, Komponentler, Güç ve uyku, LoRa haberleşme, Test raporu). Davranışı 0.7.0 ile aynıdır.

Doğrudan bağlantılar: `#guncelle` güncelleme sekmesini, `#test` Kart testi sekmesini açar; `#test/components`, `#test/power`, `#test/radio`, `#test/report` doğrudan ilgili test ekranına gider. Sekme değiştirince adres satırı buna göre güncellenir. Boş veya tanınmayan adres güncelleme sekmesini açar; eski `#setup`, `#power` gibi bağlantılar Kart testi sekmesine yönlenir.

Sekme değiştirmek çalışan bir işlemi durdurmaz; Bluetooth bağlantıları ve bekleyen güç testleri korunur. Bir güncelleme, yükleme veya test sürerken sekme değiştirilemez; işlem bitince geçin.

Yazılım güncelleme bilgisayarda **Chrome, Edge veya Opera** (Web Serial) gerektirir. Sayfa iPhone/iPad, Android telefon, Safari veya Firefox’ta açılırsa sekmenin üstünde uyarı görünür; **Bağlantıyı kopyala** ile adresi alıp bilgisayarda açın.

## Kart adları ve eski kartlarla uyumluluk

Kartlar ekranında **Tek kart** veya **İki kart · LoRa** seçin. Tek kartta yalnız A alanı görünür. Tek kart yüklemesinin hedefi seçtiğiniz USB portudur; eski kartın veya gizli B alanının adı/MAC kaydı bunu engellemez. İki karttan tek karta geçince B alanının etkin port ve eşleşmesi bırakılır; önceki raporlar saklanır. Ad ve karşı kart MAC kontrolleri iki kart modunda etkin kartlara uygulanır. Her kartın kendi USB yükleme ve Bluetooth düğmesi vardır; üstteki **Kartları yönet** yalnız bu ekrana döner. Kart bağlandıktan sonra aynı düğme **Testleri aç**, bağlantı kesilince **Yeniden bağlan** olur. İki kart bağlıyken de düğmeler çalışır.

0.6.0 yüklemesinde girilen PCB adı (`mb_001`, `mb_004` gibi) aynı işlemin içinde karta kalıcı kaydedilir ve **Bluetooth yayın adı da aynen bu isim olur**. Ad 1–24 ASCII harf/rakam, `_` veya `-` içermelidir; iki karta farklı ad verin. Sadece formu değiştirmek kartı yeniden adlandırmaz: USB’den **Adı ve yazılımı güncelle** gerekir. İsim kaydı eFuse MAC’e bağlıdır; başka karta ait veya bozuk kayıt kullanılmaz. Uyku/yeniden başlatma isim kaydını silmez. Yeniden tam flash silme işlemi kaydı da siler ve yeni verilen adı yazar.

0.4.0/0.4.1 kartlarına bağlanma korunur; eski kartlar `MC-…` adıyla görünür. İsimli yayın ve sinyal ölçümü 0.5.0 ile geldi; yeni dağıtım 0.6.0’dır. Uyku testleri eski sürümde başlatılmaz. Eski UUID hatasına ait açık uyumluluk tanımı korunur; MAC, tam ELF, açılış, API ve komut bitiş kontrolleri devam eder. Ayrı bir araçla 0.6.0 yüklenmişse, eski 0.4.x/0.5.0 tarayıcı kaydı yalnız aynı MAC/ad ve dağıtılan 0.6.0 ELF kimliği eşleşince yenilenebilir; bu işlem bir USB yükleme PASS kaydı üretmez. Önceki raporlar saklanır.

## Tek kart

1. Üstteki **Kart testi** sekmesini açın (`#test`). USB’yi takın. Diğer seri monitörleri kapatın. **Kartlar** ekranında `mb_001` gibi PCB adını girin ve **USB portu seç** düğmesine basın. Tarayıcı `/dev/cu.usbmodem…` yolunu sayfaya açıklamaz; port sistem penceresinden seçilir.
2. **Adı kaydet ve yükle** düğmesine basın. ESP32-S3 ve 16 MB flash doğrulanır, flash tamamen silinir, üç eşleşen firmware imajı ve karta özel isim sektörü yazılır; dördünün yazım MD5’leri kontrol edilir. İndirilen dosyalar ayrıca SHA-256 ile doğrulanır. Eski firmware kopyalanmaz; eFuse ve batarya entegresinin profili değiştirilmez.
3. Gerekirse BOOT basılıyken RESET’e basıp portu yeniden seçin. Yükleme bittikten sonra BOOT’u bırakın. Yayın görünmüyorsa yalnız RESET’e basın. Kart alanındaki **Bluetooth ile bağlan** ile verdiğiniz isimdeki kartı seçin. Canlı MAC, sürüm, tam ELF ve karta yazılan isim eşleşmeden yükleme testi geçti sayılmaz. Ardından aynı alandaki **Testleri aç** düğmesine basın.
4. **Komponentler → Komponentleri test et** akışını çalıştırın. LED testinde önce **Hazırım, LED’leri yak** penceresini onaylayın; kartı izleyin ve sonraki pencerede LED’leri ayrı ayrı işaretleyin. Gerekirse **Tekrar göster** kullanın. Ardından 15 saniyelik pencerede SW3’e basıp bırakın, IMU için **10 saniye** kartı üç eksende çevirin. GPS’te MON-VER komut/yanıtı ve geçerli UART verisi kontrol edilir; fix beklenmez. Bluetooth testi yaklaşık **20 saniye** sürer; üç ayrı bağlantıda üretilen her 20 baytlık yük birebir karşılaştırılır. USB ile sensör/veri yolu kararlılık adımı **10 saniyedir**; USB link stres testi değildir.
5. **Test raporu → PDF indir** düğmesi gerçek PDF dosyası indirir. ✓ geçti, ✕ kaldı; eksik, atlanan ve çalıştırılmayan kontroller farklı gösterilir. JSON indirmesi ham kayıtları ve kimlikleri, CSV sonuç tablosunu içerir. Aynı oturumdaki FAIL, sıradan bir sonraki PASS ile gizlenmez. Bilinçli düzeltme için satırdaki **Düzelt** düğmesini kullanın; ham kayıt saklanır.

## LED testini elle başlatma

LED 1/2/3 satırlarından **Çalıştır** ile başlatılan test hem USB bağlıyken hem bataryada çalışır. İlk pencerede kart adı ve besleme bilgisi gösterilir; **Hazırım, LED’leri yak** düğmesine basmadan LED komutu gönderilmez. Testi atlamak veya pencereyi kapatmak LED’leri yakmaz. Sıra LED 1 → LED 2 → LED 3; her LED yaklaşık 0,6 saniye yanar. Gözlem penceresindeki **Tekrar göster** sırayı yeniden çalıştırır.

Karttan üç LED’e ait açma kaydı ve sıra bitişi alınmazsa görsel PASS kabul edilmez. Açma komutunun kabul edilmesi, LED’in fiziksel yandığını tek başına kanıtlamaz; her LED için gördüğünüz sonucu seçin. Gözlenmeyen LED başarılı sayılmaz. Otomatik batarya test akışı LED yakmaz; ayrıca elle LED testi seçilebilir. USB veri bağlantısı olmayan yönlendirmeli otomatik komponent akışında LED adımı yine atlanır.

## Uyanık ve uyku LED göstergeleri

0.6.0 web firmware’inde kart uyanıkken **LED 1/2 sürekli yanar, LED 3 yanıp söner**. Gerçek uykuya girişte üç LED kapanır; uyanınca Bluetooth geri gelmeden önce göstergeler açılır. Gücün kesilmesi de LED’leri söndürebilir; tek başına karanlık LED uyku kanıtı değildir. Giriş engellenirse veya BLE kapanamazsa hata kaydedilir ve kart uyanık göstergeye döner. Bağlantı kapatmanın zaman aşımı sessiz bekleme yerine kaydedilmiş hata ve kontrollü yeniden başlatma üretir.

LED komponent testi sırasında göstergeler geçici durur, üç LED sırayla gösterilir ve durum göstergesi geri gelir. Bu göstergeler LED testine kendiliğinden PASS yazmaz.

## Sonucu elle düzeltme

Etkin kartın sonuç satırındaki **Düzelt** ile Geçti / Kaldı / Eksik koşul / Atlandı seçebilirsiniz; isterseniz açıklama ekleyin. Bağlantı kesilmişken de rapor düzeltilebilir. Bu işlem cihazda test başlatmaz, uyandırmaz ve bekleyen güç testini iptal etmez.

Düzeltilen satır **Elle**, PDF’de **GEÇTİ (ELLE)** gibi işaretlenir. JSON, ilk ham ölçümleri ve tüm düzeltme geçmişini ayrı tutar; CSV kaynak alanı `operator_override` olur. **Özgün ölçüm sonucuna dön** düzeltmeyi geri alır. Düzeltmeden sonra o satır için yeni test çalıştırılırsa yeni ölçüm esas alınır; yeni hata eski düzeltmeyle gizlenmez. Önceki kapatılmış oturumlar salt okunur arşivdir.

## İki kartlı LoRa

1. A ve B için farklı isim ve farklı USB portları seçin; **İki karta da isim ve yazılım yükle** düğmesini kullanın. Kartların eFuse MAC adresleri aynıysa ikinci kart silinmez.
2. İki kartı ayrı ayrı Bluetooth ile bağlayın. İki kartın firmware ELF hash’i aynı olmalıdır. Uygun LoRa antenleri, 5 V beslemesi ve pin11 dahil bütün GND bağlantılarını kontrol edin.
3. **LoRa haberleşme → Haberleşme + profil testini başlat** düğmesine basın. Alıcıdan RX hazır bildirimi gelmeden TX yapılmaz. Her yönde beş eşsiz paket, TX_DONE ve karşı kartın CRC geçerli yük baytlarıyla doğrulanır. Yalnız TX_DONE başarılı sonuç sayılmaz.
4. Ardından çipte 6 / 15 / 21 dBm komutları alıcı tarafta uygulanır ve karşı kartın −9 dBm komutuyla gönderdiği eşsiz paket iki yönde kontrol edilir. Bunlar nominal 0,2 / 1 / 2 W profil **komutlarının kabul testidir**. Yüksek güçte TX yapılmaz, gerçek RF watt ölçülmez. Düşük güç / ayrım kontrolü ve BLE + LoRa eşzamanlılık stres testi çalıştırılmaz.
5. Sonuçlar iki kartın raporuna ayrı kaydedilir. **İki kartı tek PDF indir** düğmesi birleşik rapor oluşturur. İki kartın ham JSON dosyalarını da ayrı indirin.

## Batarya ve uyku

- **Gerçek güç kesme / açma:** Önce Güç ve uyku ekranından testi hazırlayın. USB ve bataryayı tamamen çıkarın; en az 5 saniye sonra bataryayı takın. Yeniden Bluetooth ile bağlanın. Yeni POWERON açılışı ve sizin fiziksel güç kesme beyanınız birlikte değerlendirilir. Yalnız batarya kutusu da işaretlenir ve USB veri bağlantısı yoksa bataryada soğuk açılış kaydedilir. Rayların gerçekten 0 V olması yazılımla ölçülmez.
- **Batarya testleri:** USB’yi fiziksel olarak çıkarın, batarya takılı kalsın. Komponentler ekranından batarya akışını başlatın. Flash, ölçüm entegresi, SW3, IMU, GPS, üç BLE bağlantısı ve **20 saniye** sensör/veri yolu kararlılığı kontrol edilir. Bu akış yaklaşık 1–2 dakika sürer ve LED komponent gözlemi içermez; uyanık durum göstergesi açık kalır. USB veri varlığı 20 ms periyotla gözlenir; bu kayıt fiziksel kablo çıkarma beyanıyla birlikte kullanılır, tek başına elektriksel VBUS yokluğu kanıtı değildir.
- **Hafif / derin uyku:** Batarya ile ve USB çıkarılmışken modu seçin, SW3’ü bırakın ve başlatın. Yaklaşık 3,5 saniye sonra uykuya giriş denenir. Gerçek uykuya girişte üç LED söner; **SW3’e ışıklar söndükten sonra** basıp bırakın. Zamanlayıcı varsayılanı 10 saniyedir. Uyanınca LED 1/2 yanar, LED 3 yanıp söner ve uygulama bağlantıyı otomatik arar. Otomatik bağlantı olmazsa **Yeniden bağlan ve kontrol et** veya **Bluetooth listesinden yeniden seç** kullanın. Yeniden seçimde de aynı MAC ve tam ELF kimliği aranır. İstek belirteci, önceki/yeni açılış kimliği, reset nedeni ve gerçek uyanma kaynağı eşleşmeden PASS verilmez. SW3 modunda zamanlayıcıyla geri dönüş, SW3 başarısı sayılmaz.
- **Yazılımsal bekleme:** MCU derin uykuya girer; zamanlayıcı yoktur, SW3 ile uyanır. Bluetooth kapalıyken tarayıcı kartı Bluetooth üzerinden uyandıramaz. **Bu mod bütün kartın beslemesini kesmez.** GNSS ve diğer devrelerin güç tüketimi devam edebilir. GPIO37 / TPS63020 EN_3V3 hattı sürülmez; mevcut donanımda güvenli bir yazılımsal ana güç kesme işlevi doğrulanmış değildir.
- **Yeniden başlatma:** Yeni açılış kimliği ve SW reset nedeni doğrulanır. Bu işlem fiziksel güç kesme değildir.
- Bekleyen test tarayıcıda kaybolursa güç ekranındaki **Karttaki bekleyen güç testini temizle** düğmesiyle yalnız güç testi kaydını iptal edin.

Uzun kararlılık testinde ilk normal örnekler, bütün FAIL kayıtları ve son sayaçlar tutulur. Tekrarlanan başarısız olmayan örneklerin özetlenen sayısı `COMMAND.data.normal_samples_summarized` alanındadır. Tampon taşarsa veya komut bitiş kaydı eksikse test başarılı sayılmaz.

## Bluetooth veri bütünlüğü: servis kaydı hatası

Web 0.6.1, **GATT Service no longer exists** hatası için bağlantı yaşam döngüsünü düzeltir; firmware 0.6.0 aynı kalır. Sayfayı **Cmd+Shift+R** ile yenileyin, kartı yeniden bağlayın ve yeni test oturumunda Bluetooth veri bütünlüğünü çalıştırın. Önceki oturumdaki hata kayıtları korunur; gerektiğinde ayrı bir yeni oturum açın veya bilinçli operatör değerlendirmesi için **Düzelt** kullanın.

Bağlantı kesme isteğinden sonra gerçek kapanma olayı beklenir; yeni bağlantıda servis ve karakteristikler yeniden keşfedilir. Keşif sırasında silinen GATT kaydı için en fazla üç hazırlık denemesi yapılır. İlk paket gönderilmeden önceki salt okunur kimlik/durum kontrolü eski kayıtla karşılaşırsa bir kez bağlantı yenilenebilir; MAC, tam ELF ve açılış kontrolleri korunur. Test sırasında gönderilmiş paketler tekrar edilmez. Aktarımda servis kaybı, veri uyuşmazlığı veya reset olursa deneme başarılı sayılmaz; tamamlanan tur/paket sayısı ve özgün hata rapora yazılır.

Bu hata tarayıcının geçersiz GATT servis kaydını belirtir; tek başına anten arızası tanısı değildir. Düzeltme test ortamında aynı hata üretilerek doğrulandı; 2 Kasım güncellemesinde gerçek kartta yeni fiziksel test yapılmadı.

## Bluetooth “out of range” ve sinyal testi

Bu hata tek başına anten arızası tanısı değildir. Chromium bunu bir `NetworkError` olarak döndürür; [kaynak kodundaki hata eşlemesi](https://chromium.googlesource.com/chromium/src/+/refs/heads/main/third_party/blink/renderer/modules/bluetooth/bluetooth_error.cc) bir anten ölçümü yapmaz. Kartın uyuması/gücünün kesilmesi, başka uygulama bağlantısı veya işletim sistemi bağlantı durumu da değerlendirilmelidir. Uyku sırasında bağlantının kapanması beklenir.

BLE testi bağlantılar arasında 1,5 saniye bekler. Bağlantı/servis keşfinde geçici `NetworkError` için 700/1500 ms aralıklı en fazla üç deneme yapılır. Komponent/RF komutları veya başarısız veri paketleri otomatik tekrar edilmez. Kalıcı hata bağlantı koşulu olarak kaydedilir; açılış/reset değişimi ve paket uyuşmazlığı gizlenmez.

**Kartlar → Bluetooth bağlantısını değerlendir → Sinyal ve 20 paket testi** beş sinyal örneği ve tek bağlantıda 20 bayt karşılaştırmalı paket toplar. Gösterilen RSSI, **kartın bilgisayardan aldığı** sinyaldir; örnek yaşı da saklanır. Eski firmware’de RSSI desteklenmediği açıkça belirtilir. Paket PASS sonucu antenin kazancını, eşleşmesini veya menzilini doğrulamaz. Bluetooth 2,4 GHz yolu, LoRa 433 MHz anteninden ayrıdır. İki kartın sinyalini karşılaştırırken mesafe ve yönü aynı tutun.

## MilMesh firmware güncelle (üretim yazılımı, USB)

Telefon uygulamasından firmware güncellemesi kaldırıldı. Sahadaki kartın **MilMesh üretim yazılımı** bu ekranla, kart bilgisayara USB ile takılarak güncellenir. Bu akış test firmware’ini (0.6.0) yüklemez ve flash’ı **tamamen silmez**.

1. Kartı USB ile takın. Seri monitörleri (pio monitor, Arduino vb.) ve test merkezinin diğer USB işlemlerini kapatın. Opera veya uyumlu Chrome/Edge kullanın.
2. Üstteki **Yazılım güncelleme** sekmesini açın (site bu sekmeyle açılır; doğrudan bağlantı `#guncelle`). **Paketteki yazılım** kutusunda yüklenecek sürüm, build kimliği, güvenlik sürümü (sv) ve kart (`mc_meshcom_v1`) görünür. “Paket yok” yazıyorsa bu web sürümünde üretim paketi yoktur.
3. **USB portu seç** ile kartın `usbmodem…` portunu seçin.
4. **Kartı oku ve güncelle** düğmesine basın. Önce yalnız okuma yapılır: ESP32-S3 ve 16 MB flash, eFuse MAC, 0x340000’deki **fabrika kart adı**, kartın açılan uygulama yuvası, oradaki MilMesh sürümü/build/sv ve NVS’teki `min_sv`. Bir onay penceresi kart adını, mevcut ve yeni sürümü, yazılacak ve korunacak bölgeleri gösterir. **Güncellemeyi başlat** demeden hiçbir şey yazılmaz; **Vazgeç** kartı mevcut yazılımla yeniden başlatır.
5. Uyarı varsa ayrı onay kutusu işaretlenmeden devam edilemez:
   - **-dirty derleme:** yazılım commit edilmemiş değişikliklerle derlenmiştir (geliştirme derlemesi).
   - **Güvenlik sürümü düşüyor:** yeni `sv`, kartın `min_sv` değerinden küçüktür. USB yüklemesi bunu engellemez; kart sonradan eski sürüme geri dönüşü reddedecek şekilde ayarlıdır. Bilmeden onaylamayın.
   - Karttaki MilMesh yazılımı başka bir kart tipi bildiriyorsa güncelleme engellenir.
6. Yazılan bölgeler: önyükleyici `0x0`, bölüm tablosu `0x8000`, boş otadata `0x341000` (kart ota_0’dan açılır), uygulama `0x10000`. Her bölgenin yazım MD5’i kontrol edilir. **Yazılmayan bölgeler:** NVS (cihaz adı, PIN, Bluetooth eşleşmeleri, kanallar, radyo ayarları), phy_init, scratch (çevrimdışı mesajlar), autolog, kimlik sektörü 0x340000 ve ota_1. `0xE000` (Arduino boot_app0) hiçbir zaman yazılmaz.
7. Kart yeniden başlar; uygulama USB’den `[I][fw] MilMesh 1.0.0 build=… sv=… board=mc_meshcom_v1 slot=ota_0 … min_sv=…` satırını basar. 5 saniye içinde satır gelmezse kart bir kez (uygulama modunda) yeniden başlatılır. Satırdaki sürüm/build/sv paketle eşleşirse **Çalışıyor ✓** görünür.
8. 30 saniye içinde satır görülmezse sonuç **Yazıldı · açılış görülmedi** olur: yazım doğrulanmıştır ama yeni yazılımın çalıştığı kanıtlanmamıştır. Kartı çıkarıp takın veya RESET’e basın, LED/Bluetooth ile kontrol edin; gerekirse güncellemeyi tekrarlayın. Yükleme yarıda kalırsa kart açılmayabilir; BOOT basılıyken RESET’e basıp portu yeniden seçerek aynı adımları uygulayın.

Son 10 güncelleme (kart adı, MAC, önceki → yeni sürüm, sonuç) bu tarayıcıda saklanır. Kart adı bu ekranda yalnız okunur; değiştirmek için Kart testi sekmesindeki Kartlar ekranının test firmware akışı gerekir ve o akış flash’ı tamamen siler.

Paketi yenilemek (geliştirici): oscar’da firmware derlendikten sonra `web-console` içinde `npm run build` çalıştırın. Kaynak dizin `--production-build=DİZİN` veya `MILMESH_FW_BUILD_DIR` ile değiştirilebilir. Tanımlayıcı kartı `mc_meshcom_v1` değilse paketleme reddedilir.

## İstek üzerine kapsam dışında

USB bağlantı kararlılığı; kart teslim/anakart revizyon kaydı; BQ27441 batarya profil uygunluğu; GPS fix bekleme; 3,3 V ve 5 V raylarının elektriksel ölçümü; gerçek şarj fonksiyonu; batarya koruma eşikleri; ESD; pasifler/kristal/SAW/RF ağı/konnektörler; LoRa düşük güç/ayrım kontrolü; otomatik batarya akışında üç LED; BLE + LoRa eşzamanlılık stresi. Ham firmware kayıtlarında bu konulara ait tanı bilgileri bulunabilir; uygulama bunları kapsam içi test sonucu saymaz. Şarj durum pini ve BQ27441 ham verisi, gerçek şarj veya doğru batarya profili iddiası taşımaz.

## Yerel kullanım ve sonraki kartlar

`./start_web.sh` çalıştırın, Opera veya uyumlu Chrome/Edge ile `http://localhost:4173` açın. Hazır `dist/` klasörü ve firmware imajları pakettedir; Node.js kurmak gerekmez. 4173 meşgulse `./start_web.sh 4174` kullanın.

Raporları indirdikten sonra **Yeni kartlar için oturumu kapat** düğmesiyle sonraki kartlara geçin. Önceki oturumlar Test raporu ekranında en fazla 12 kayıt olarak tutulur. Tarayıcı verileri silinebilir; kalıcı arşiv için PDF ve JSON dosyalarını indirin.

Kaynaklar: `web-console/` web uygulaması; `firmware/main/` gömülü yazılım; `firmware/release_v0.6.0/` eşleşen derlenmiş test imajları; `web-console/dist/firmware/production/` MilMesh üretim imajları ve manifesti. Önceki sürümler ve tarihli fiziksel test raporları ayrı korunur.
