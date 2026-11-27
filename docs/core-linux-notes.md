# GeaStack Core ve Linux (Sailfish OS) Problem Notları

Bu notlar, **Polar Post v0.1.9** uygulamasının **Sailfish OS 5.1.0.11 (`i486`)** emülatöründe (`720x1600`, `sailjail`, `GEA_SAILFISH_DPR=auto` → `dpr=2` ve varsayılan `dpr=1`) gerçek dokunmatik giriş (`uinput`) ve `GEA_TEXT_BASELINE_DEBUG=1` ile test edilmesi sırasında tespit edilen kök nedenleri özetler.

## Test Ortamı

- **Uygulama**: `polar-post` `0.1.9` (`c21232a`)
- **`core` revizyonu**: `77b980616b5be74b0e5cec70bda16864b9fce76a` (`@geastack/core@0.1.55`)
- **`linux` revizyonu**: `25ab067` (`sailfish-device-fixes`, `targets/sailfish-os`)
- **Hedef / Emülatör**: `SailfishOS-5.1.0.11-i486` (`720x1600`, OpenGLES2 + vsync, `sailjail`)

---

## 1. `core` Tarafındaki Problemler

### 1.1. Statik `font-family` kuralları `RuntimeFontProvider` kurulmadan önce çözülüyor (init sırası hatası)

- **Belirti**: `.title { font-family: Georgia, serif; }` gibi kurallar sistem TTF fontu yerine 8x16 ASCII bitmap fallback fontuna düşüyor (`font_id = -1`). Buna karşılık `font: bold 26px Georgia, serif` shorthand kullanan `.metrics strong` düzgün şekilde Liberation Serif TTF (`font=10001`) ile çiziliyor.
- **Konum**:
  - `packages/engine/ui/style.cpp` (`storeStaticFontFamilyCompiledValue`, ~satır 1985–1995)
  - `packages/engine/rasterized_font.cpp` (`FontRegistry::setRuntimeFontProvider`, ~satır 689–693)
  - `packages/core/scripts/build-gea-vite-geatsc.mjs` (`cssStaticFontFamilyValue`, ~satır 2417–2421)
- **Kök neden**:
  1. Üretilen C++ stil kaydı (`GeaPluginCppPreludeRegistration`), C++ static constructor olarak `main()` çalışmadan önce yürütülüyor ve `StyleSheet::registerStaticFontFamilyRule(...)` çağırıyor.
  2. `storeStaticFontFamilyCompiledValue()` tam bu kayıt anında `FontRegistry::familyId(family)` çağırıp sonucu `compiled.values[0]` içine kalıcı olarak yazıyor.
  3. Hedef platformlar (`sailfish_main.cpp`, `prerender_fonts.h` vb.) `FontRegistry::setRuntimeFontProvider(...)` çağrısını `main()` içinde yaptığı için o anda sağlayıcı `nullptr` oluyor ve `familyId` kalıcı olarak `-1` dönüyor.
  4. Ek olarak `cssStaticFontFamilyValue()` yalnızca ilk aile adını (`cssStaticPrimaryFontFamily`) alıyor; `"CustomFont", sans-serif` gibi fallback zincirindeki ikincil aileler statik yolda kayboluyor.
- **Önerilen çözüm**:
  - `registerStaticFontFamilyRule` ailesini ham string (veya tam fallback listesi) olarak saklayıp stil çözümleme aşamasında tembel (lazy) çözmek ya da `FontRegistry::setRuntimeFontProvider(...)` çağrıldığında derlenmiş `CssDeclarationId::FontFamily` değerlerini yeniden çözümleyip stil önbelleğini geçersiz kılmak.

---

### 1.2. Basit `body { ... }` element seçicisi kök düğümle eşleşmiyor

- **Belirti**: `body { font: 16px system-ui, sans-serif; }` gibi standart kök kuralları native tarafta hiçbir düğüme uygulanmıyor. Sonuç olarak:
  - Tüm alt düğümler `font_id = -1` miras alıp 8x16 ASCII bitmap fontuna düşüyor; ASCII dışı karakterler (`ä`, `ö`, `ü`, Türkçe karakterler vb.) `?` olarak çiziliyor (`reitillä` → `reitill?`).
  - `16px` taban boyutu miras alınmadığı için açık `font-size` vermeyen öğeler (ör. `.reset` butonu) çok küçük (1x 8x16 bitmap) görünüyor.
- **Konum**:
  - `packages/engine/ui/style.cpp` (`ruleMatchesNode`, ~satır 12455–12469)
  - `packages/engine/ui/selector.cpp` (`atom`, ~satır 365–367)
  - `packages/engine/ui/document.cpp` (`Document::getElementById`, ~satır 161–170)
- **Kök neden**:
  - Bileşik seçici eşleştiricisi `selector.cpp:366-367` içinde `body` için özel takma ad var: `(a.name == "body" && n == t.mountedRoot())`.
  - Ancak tekil element kurallarını işleyen `style.cpp:12463-12464` (`CssRule::SelectorType::Element`) yalnızca `state.nodes[node].tag_id == rule.selectorTagId` kontrolü yapıyor.
  - `Document::getElementById("app")` ile oluşturulan `#app` kökü `body` etiketine sahip olmadığı için `body { ... }` kuralları sessizce boşa düşüyor.
- **Önerilen çözüm**:
  - `ruleMatchesNode` içindeki `SelectorType::Element` kolunda da `selector.cpp` ile tutarlı biçimde `body` (ve gerekirse `html`) kuralının `mountedRoot()` ile eşleşmesini sağlamak (veya implicit `#app` kökünde eşleştirme köprüsü kurmak).

---

### 1.3. `flex: 1` shorthand'i `flex-basis: 0%` yerine `kUnset` (`auto`) olarak derleniyor

- **Belirti**: Eşit genişlikli olması gereken 7x7 flexbox ızgarasındaki `.row > .cell { flex: 1; }` sütunları, özellikle geniş görünümde (`dpr=1`, 530px panel) içeriği olan hücrelerde (işaretçi/metin içerenler) daha geniş başlıyor ve satırlar arası dikey ızgara çizgileri zikzak yapıyor.
- **Konum**:
  - `packages/core/scripts/build-gea-vite-geatsc.mjs` (`cssStaticFlexValue`, ~satır 2442–2470)
  - `packages/engine/ui/style.cpp` (`storeStaticFlexCompiledValue` ~satır 2026–2039, `CssCompiledKind::Flex` uygulaması ~satır 14477–14492)
- **Kök neden**:
  - CSS Flexbox standardına göre tek sayılı `flex: <number>` (ör. `flex: 1`), `flex-grow: <number>; flex-shrink: 1; flex-basis: 0%` anlamına gelir.
  - `cssStaticFlexValue("flex", "1")` açık uzunluk token'ı görmediği için `hasBasis = false` döndürüyor.
  - `style.cpp:14480-14481` ise `compiled->aux == 0` olduğunda `Property::FlexBasis` değerini `0` yerine `kUnset` (`auto`) olarak atıyor; bu da `flex: 1` yerine `flex: 1 1 auto` davranışı üretiyor.
- **Önerilen çözüm**:
  - `cssStaticFlexValue` içinde en az bir sayısal grow değeri verilmiş ama açık basis verilmemişse CSS spesifikasyonuna uygun şekilde `basis = 0` (`hasBasis = true`) üretmek (aynı kural çalışma zamanı `flex` parser'ında da doğrulanmalı).

---

### 1.4. Çok satırlı metin kısaldığında sağ kenarda artık glif kalması (dirty-rect / repaint)

- **Belirti**: `<p class="status">` (2 satıra sarılan `createTextLeaf("p")`) metni İngilizceden (`... An open`) Finceye (`... ruutua.`) geçerek ilk satırda kısaldığında, önceki metnin son karakteri silinmeden ekranda kaldı (`ruutua.n`). Bir sonraki hamlede satır sayısı değişince temizlendi.
- **Konum**:
  - `packages/engine/ui/text.cpp` (`Tree::setText`, ~satır 1568–1720 ve `TextRenderer` dirty/bbox tahmin yolu)
- **Kök neden**:
  - Sabit `min-height` / aynı yükseklikte kalan çok satırlı sarılmış metin güncellemelerinde dirty bölgesi veya önceki satır genişliğinin kapsadığı alan tam temizlenmiyor / eski gliflerin son pikselleri dışarıda kalıyor.
- **Önerilen çözüm**:
  - Metin güncellendiğinde `Tree::setText` ve display-list dirty toplamında önceki kayıtlı metin/satır sınır kutusu ile yeni sınır kutusunun birleşimini (`union(oldBounds, newBounds)`) her zaman dirty rect olarak işaretlemek.

---

### 1.5. `font: inherit` yok sayılıyor ve `<button>` varsayılan hizalama/font kalıtımı tarayıcıdan farklı

- **Belirti**: `button { font: inherit; }` kuralı uygulanmıyor; `<button>` etiketleri (`Restart route`) tarayıcıdaki gibi ortalanmış değil sola yaslı çiziliyor.
- **Konum**:
  - `packages/engine/ui/style.cpp` (`parseFontShorthand` ~satır 4042–4097, `CssDeclarationId::Font` ~satır 10178–10189)
- **Kök neden**:
  - `parseFontShorthand` CSS genel anahtar kelimelerini (`inherit`, `initial`, `unset`) reddedip erken dönüyor.
  - Native UA stil sayfasında `button` için `text-align: center` varsayılanı bulunmuyor.
- **Önerilen çözüm**:
  - `CssDeclarationId::Font` içinde `inherit` değerini ebeveynin `FontId`, `FontSize`, `FontWeight`, `LineHeight` değerlerini miras alacak şekilde ele almak; UA varsayılanlarında `button` için `text-align: center` değerlendirmek.

---

### 1.6. `RuntimeFontProvider` arayüzünde ağırlık/stil (Bold / Italic) desteği yok

- **Belirti**: `font-weight: 700` / `800` veya `font: bold ...` verilse bile sistem TTF sağlayıcısı yalnızca tek (Regular) TTF dosyasını verebiliyor; kalın/italik yüzler kullanılamıyor.
- **Konum**:
  - `packages/core/include/graphics/font.h` (`RuntimeFontProvider`, ~satır 131–145)
  - `packages/engine/rasterized_font.cpp` (`runtimeTtfFontForFamily`, ~satır 669–678)
- **Kök neden**:
  - `RuntimeFontProvider::fontBytes(int familyId, unsigned long *length)` imzası `weight` ve `italic`/`stretch` parametrelerini almıyor.
- **Önerilen çözüm**:
  - İsteğe bağlı `fontBytesForStyle(int familyId, int weight, int stretch, unsigned long *length)` (veya geriye dönük uyumlu genişletme) ekleyerek platform sağlayıcılarının Bold/Italic TTF dosyalarını döndürebilmesini sağlamak.

---

## 2. `linux` (`targets/sailfish-os`) Tarafındaki Problemler

### 2.1. `gea::sailfish::fonts::install()` çağrısı `main()` içinde yapıldığı için statik CSS kurallarına yetişmiyor

- **Belirti**: Sailfish hedefi sistem TTF sağlayıcısını (`LiberationSans`, `LiberationSerif`, `LiberationMono`) kurmasına rağmen, statik derlenen `font-family:` kuralları (`.title { font-family: Georgia, serif; }`) TTF yerine bitmap fallback'e düşüyor.
- **Konum**:
  - `targets/sailfish-os/main/sailfish_main.cpp` (~satır 464)
  - `targets/sailfish-os/include/sailfish_fonts.h`
- **Kök neden**:
  - `gea::sailfish::fonts::install()` `main()` içinde çağrılıyor; oysa Core'un ürettiği `GeaPluginCppPreludeRegistration` global constructor'ı `main()` öncesinde çalışıp `FontRegistry::familyId(...)` çağırıyor (bkz. madde 1.1).
- **Önerilen çözüm**:
  - Asıl düzeltme Core tarafında (1.1) yapılmalı. Buna ek olarak Sailfish hedefi, erken init güvenliği veya `install()` sonrası stil yeniden çözümleme/yenileme ile senkronize edilmeli.

---

### 2.2. `sailfish_fonts.h` yalnızca Regular TTF yüzlerini yüklüyor

- **Belirti**: Sailfish OS 5.1.0.11 üzerinde `/usr/share/fonts/liberation/` altında `LiberationSans-Bold.ttf`, `LiberationSerif-Bold.ttf`, `LiberationMono-Bold.ttf` (ve Italic sürümleri) mevcut olmasına rağmen tüm metinler Regular ağırlıkla çiziliyor.
- **Konum**:
  - `targets/sailfish-os/include/sailfish_fonts.h` (`defaultCandidatesForSlot`, ~satır 122–146)
- **Kök neden**:
  - Her aile slotu (`sans`, `serif`, `mono`) tek bir `bytes` tamponu tutuyor ve Core'un mevcut `RuntimeFontProvider` API'si ağırlık parametresi geçirmiyor (bkz. madde 1.6).
- **Önerilen çözüm**:
  - Core `RuntimeFontProvider` ağırlık/stil desteği eklediğinde `sailfish_fonts.h` içinde Bold/Italic aday yollarını da (`/usr/share/fonts/liberation/Liberation*-Bold.ttf` vb.) desteklemek.

---

### 2.3. `i486` emülatöründe `devicePixelRatio: "auto"` davranışının ARM telefonlardan ayrışması

- **Belirti**: Sailfish OS 5.1.0.11 emülatörü `720x1600` (Jolla C2 ile aynı fiziksel çözünürlük) ile açılıyor. Ancak `config.mjs` `i486` için `"auto"` değerini `dpr=1` (`720x1600` CSS) olarak sabitliyor; ARM telefonlarda aynı panel `dpr=2` (`360x800` CSS) seçiyor.
- **Konum**:
  - `targets/sailfish-os/config.mjs` (`sailfishDensity`, ~satır 99–104)
- **Etki**:
  - Emülatörde uygulamayı varsayılan olarak (`GEA_SAILFISH_DPR=auto` geçmeden) açtığınızda `@media (max-width: 719px)` gibi telefon kuralları tetiklenmiyor ve masaüstü görünümü açılıyor; gerçek cihazdaki layout davranışını test etmek için ayrıca `GEA_SAILFISH_DPR=auto` vermek gerekiyor.
- **Önerilen çözüm**:
  - Emülatör çözünürlüğü zaten telefon paneli boyutunda (`720x1600` veya `540x960`) olduğundan `i486` için de panel tabanlı `"auto"` DPR hesaplamasının kullanılması veya en azından dokümantasyonda/test scriptlerinde telefon parity testi için `GEA_SAILFISH_DPR=auto` kullanımının vurgulanması.

---

### 2.4. `rpmlint` uyarıları / unstripped binary ve PIE

- **Belirti**: `sfdk check` içinde resmi Harbour doğrulayıcısı `PASSED` dönüyor; ancak `rpmlint` şu çıktıları üretiyor:
  - `W: unstripped-binary-or-object /usr/bin/harbour-gea-polar-post`
  - `W: position-independent-executable-suggested /usr/bin/harbour-gea-polar-post`
  - `W: no-url-tag`
  - `E: no-changelogname-tag`
- **Konum**:
  - `targets/sailfish-os/config.mjs` (`rpmSpec`) ve `targets/sailfish-os/CMakeLists.txt`
- **Önerilen çözüm**:
  - Release derlemesinde PIE bayrakları (`-fPIE -pie`), strip adımı ve `.spec` dosyasında `URL` / `%changelog` alanlarının eklenmesiyle `rpmlint` çıktısı da sıfır hata/uyarı seviyesine indirilebilir.

---

### 2.5. Başlatma sonrası pencere boyutu değişimi (`720x1600` → `720x1527`) ve üst 73px siyah şerit

- **Belirti**: Uygulama ilk olarak `720x1600` ile `Application::init` oluyor, hemen ardından Wayland/Lipstick tarafından `720x1527` boyutuna yeniden boyutlandırılıyor (`[sailfish] resized to 720x1527`); ekranın üstünde ~73px siyah çentik/kesim bandı oluşuyor.
- **Konum**:
  - `targets/sailfish-os/main/sailfish_display.cpp` (`ensure_window`, `SDL_WINDOW_FULLSCREEN_DESKTOP`)
  - `targets/sailfish-os/main/sailfish_main.cpp` (`g_resize_pending`, ~satır 509–530)
- **Not**: Emülatörün dconf kesim tanımı (`cutouts = [[320, 0, 80, 43]]`) nedeniyle compositor pencereyi 73px daraltıyor. Yeniden boyutlandırma yolu düzgün çalışıyor ve layout bozulmuyor; ancak ilk karede gereksiz tam boyutlu init + tam ağaç kirletme/yeniden çizim oluşuyor ve tam ekran çentik alanı siyah kalıyor.

---

## 3. Ek Not: Native Derleyici (`@geastack/compiler` / `@geastack/geatsc-plugin-gea`)

Doğrudan `vendor/core` C++ motorunda veya `vendor/linux` hedefinde olmamakla birlikte, aynı emülatör testinde kritik bir derleyici/reaktivite hatası daha görüldü:

- **Belirti**: `Suomi` veya `Deutsch` seçildiğinde yalnızca dil butonlarının `.active` sınıfı ve `<p class="status">` güncelleniyor; başlık, alt başlık, metrik etiketleri, lejant, `Restart route` ve hücre saat ekleri (`1h`) İngilizce kalıyor.
- **Kök neden**: `template()` içindeki `const t = game.language === 'fi' ? finnish : ...` yerel değişkeni üzerinden okunan `{t.title}`, `{t.reset}` vb. ifadeler için derleyici `gea::jsx::subscribeSignal(..., &GameStore::language, ...)` üretmiyor; yalnızca tek seferlik statik metin düğümleri oluşturuyor. Web çalışma zamanında (`@geajs/core`) Proxy tabanlı takip çalıştığı için Playwright testleri geçerken native derlemede dil değişimi kırılıyor.

---

## Öncelik Özeti

| Öncelik | Katman | Konu | Kullanıcıya Etkisi |
|---|---|---|---|
| **Kritik** | `core` | `body` element seçicisi `#app` kökünü eşlemiyor (1.2) | Tüm uygulama 8x16 ASCII bitmap fonta düşüyor (`ä/ö/ü/Türkçe → ?`), taban `font-size` kayboluyor |
| **Kritik** | `core` + `linux` | Statik `font-family` init sırası (`GeaPluginCppPreludeRegistration` vs `sailfish::fonts::install`) (1.1, 2.1) | Açık `font-family:` kuralları (ör. `.title`) sistem TTF yerine bitmap fontla çiziliyor |
| **Yüksek** | `compiler` | Yerel türetilmiş `const t = game.language ...` abonelik üretmiyor (3) | Native Sailfish/iOS derlemelerinde dil değiştirme UI'ın büyük kısmını güncellemiyor |
| **Orta** | `core` | `flex: 1` → `FlexBasis = kUnset` (`auto`) (1.3) | Flexbox ızgara sütunları içerik genişliğine göre kayıp zikzak yapıyor |
| **Orta** | `core` | Çok satırlı metin kısalınca sağ kenarda artık karakter (`ruutua.n`) (1.4) | Dinamik metin güncellemelerinde görsel artık kalıyor |
| **Düşük** | `core` + `linux` | `font: inherit`, `<button>` ortalama, Bold/Italic TTF, `i486` auto DPR, `rpmlint` (1.5, 1.6, 2.2–2.5) | Görsel tutarlılık, emülatör/cihaz eşliği ve paket hijyeni |
