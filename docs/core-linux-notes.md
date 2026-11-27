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

### 1.7. Runtime TTF rasterizer karakter tablosunda `ä / Ä / å / ß` eksik

- **Belirti**: Sistem TTF (`LiberationSans-Regular.ttf`, `font=10000`) aktif olmasına rağmen Fince `Aikaa jäljellä`, `Syvä lumi`, `reitillä` metinlerindeki `ä` karakterleri `?` olarak çiziliyor (`Aikaa j?ljell?`, `Syv? lumi`, `reitill?`).
- **Konum**:
  - `packages/engine/rasterized_font.cpp` (`kRuntimeExtraCodepoints`, satır 140–145)
- **Kök neden**:
  - `kRuntimeExtraCodepoints` listesi Türkçe karakterleri (`Â Ç Î Ö Û Ü â ç î ö û ü Ğ ğ İ ı Ş ş`) içeriyor, ancak Fince ve Almanca için gereken `Ä` (`0x00c4`), `ä` (`0x00e4`), `Å` (`0x00c5`), `å` (`0x00e5`) ve `ß` (`0x00df`) kod noktalarını içermiyor.

---

### 1.8. `flex: 1 1 0px` kullanılan metin kutularında `FlexBasisScope(0)` ilk geçişte yüksekliği şişiriyor

- **Belirti**: `.metrics div` üzerine `flex: 1 1 0px;` verildiğinde Core layout motoru kutuyu ilk olarak `0px` genişlikte ölçüp çok satırlı yükseklik hesaplıyor ve yatay genişleme sonrası bu fazla yüksekliği geri daraltmıyor (~2 kat uzun metrik kartı).
- **Konum**:
  - `packages/engine/ui/layout.cpp` (`FlexBasisScope`, satır 675–681)
- **Workaround (uygulama tarafı)**:
  - Çok satırlı/metin içeren yatay flex kutularında (`.metrics div`) `flex: 1;` bırakmak; `flex: 1 1 0px;` kuralını yalnızca sabit/tek-satır ızgara hücrelerinde (`.row`, `.cell`) kullanmak.

---

## 2. `linux` (`targets/sailfish-os`) Tarafındaki Problemler (Core Değiştirmeden Çözülebilenler)

> **Kısıt**: `core` deposunda değişiklik yapılmayacak. Aşağıdaki çözümler yalnızca `linux` (`targets/sailfish-os`) ve uygulama (`polarpost`) katmanında uygulanabilir olacak şekilde düzenlenmiştir.

### 2.1. `gea::sailfish::fonts::install()` çağrısı `main()` içinde yapıldığı için statik CSS kurallarına yetişmiyor

- **Belirti**: Sailfish hedefi sistem TTF sağlayıcısını (`LiberationSans`, `LiberationSerif`, `LiberationMono`) kurmasına rağmen, statik derlenen `font-family:` kuralları (`.title { font-family: Georgia, serif; }`) TTF yerine bitmap fallback'e düşüyor.
- **Konum**:
  - `targets/sailfish-os/main/sailfish_main.cpp` (~satır 464)
  - `targets/sailfish-os/include/sailfish_fonts.h`
- **Kök neden**:
  - `gea::sailfish::fonts::install()` `main()` içinde çağrılıyor; oysa Core'un ürettiği `GeaPluginCppPreludeRegistration` global constructor'ı `main()` öncesinde çalışıp `FontRegistry::familyId(...)` çağırıyor (bkz. madde 1.1).
- **`linux` tarafında (Core'a dokunmadan) çözüm**:
  - `sailfish_main.cpp` içine ELF öncelikli erken başlatıcı eklemek:
    ```cpp
    __attribute__((constructor(101))) static void sailfish_install_fonts_early()
    {
    	gea::sailfish::fonts::install();
    }
    ```
  - **Güvenlik kontrolü**: Core'daki `FontRegistry::setRuntimeFontProvider` yalnızca `.bss` içindeki `runtimeFontProvider` işaretçisini ve `runtimeFontSlots(false)` fonksiyon-içi statik işaretçisini okur; `sailfish_fonts.h` içindeki `detail::state()` da fonksiyon-içi statiktir. Öncelik `101`, varsayılan öncelikteki (65535) `GeaPluginCppPreludeRegistration` constructor'ından **önce** çalışır; böylece tüm Sailfish uygulamalarındaki statik `font-family:` kuralları Core değiştirilmeden sistem TTF'ye çözülür. (`main()` içindeki mevcut `install()` çağrısı `s.installed` koruması sayesinde idempotent no-op olarak kalabilir.)

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

## 4. Core'a Dokunmadan Çözüm ve Emülatör Doğrulama Özeti (`sailfish-os-fixes` `0a9a0fa` + `polarpost`)

| Konu | Core Değiştirmeden Çözüm | Durum (i486 Emülatör) |
|---|---|---|
| Statik `font-family` bitmap'e düşüyor (1.1, 2.1) | **`linux` (`0a9a0fa`)**: `sailfish_main.cpp` `__attribute__((constructor(200)))` → `gea::sailfish::fonts::install()` | **Doğrulandı** (`.title` = `font=10001` Liberation Serif) |
| `body { font: ... }` `#app` ile eşleşmiyor (1.2) | **Uygulama (`src/style.css`)**: `.game-screen` üzerine `font: 16px system-ui, sans-serif;` eklendi | **Doğrulandı** (tüm metinler `font=10000` Liberation Sans) |
| `flex: 1` sütunları zikzak yapıyor (1.3, 1.8) | **Uygulama (`src/style.css`)**: `.row` ve `.cell` için `flex: 1 1 0px;` (`.metrics div` `flex: 1;`) | **Doğrulandı** (`dpr=1` ve `dpr=2` sütunlar tam hizalı) |
| `<button>` küçük ve sola yaslı (1.5) | **Uygulama (`src/style.css`)**: `.reset` `font-size: 16px` + flex ortalama | **Doğrulandı** |
| Dil değişimi metinleri güncellemiyor (3) | **Uygulama (`src/App.tsx`)**: `msg(game.language)` / `statusMessage(game.language, ...)` ile JSX içinde doğrudan sinyal okuması (20 `language` aboneliği) | **Doğrulandı** (`EN`, `Suomi`, `Deutsch` tüm ekran güncelleniyor) |
| Çok satırlı metin kısalınca artık karakter (`ruutua.n`) (1.4) | **Uygulama**: TTF + `.status { width: 100%; }` sonrası | **Doğrulandı** (`EN → FI` geçişinde artık karakter kalmadı) |
| `i486` emülatörde `"auto"` DPR = 1 (2.3) | **`linux` (`0a9a0fa`)**: `i486` için de panel tabanlı `dpr=2` (`360x800` CSS) | **Doğrulandı** (env override olmadan `dpr=2`) |
| `rpmlint` uyarıları (2.4) | **`linux` (`0a9a0fa`)**: PIE + strip + `URL` + `%changelog` | **Doğrulandı** (`rpmlint`: 0 hata, 0 uyarı) |
| Fince/Almanca `ä / Ä / å / ß → ?` (1.7) | `vendor/core` `kRuntimeExtraCodepoints` listesinde eksik | **Upstream `core` gerekir** |
| Bold / Italic sistem TTF yüzleri (1.6, 2.2) | `linux` (`0a9a0fa`) hazır; Core `RuntimeFontProvider` ağırlık parametresi bekliyor | **Upstream `core` gerekir** |

---

## Öncelik Özeti

| Öncelik | Katman | Konu | Kullanıcıya Etkisi |
|---|---|---|---|
| **Kritik** | `linux` (Core değişmeden) | `sailfish::fonts::install()` → `__attribute__((constructor(101)))` (2.1) | Statik `font-family:` kuralları (ör. `.title`) sistem TTF ile çizilir |
| **Kritik** | Uygulama (Core workaround) | `.game-screen` üzerine `font: 16px system-ui, sans-serif;` + `.reset` stili (1.2, 1.5) | Tüm metinler TTF'ye geçer (`ä/ö/ü` düzelir), `Restart route` normal boyutta ve ortalı olur |
| **Yüksek** | Uygulama (compiler workaround) | `App.tsx` içinde `game.language` doğrudan JSX'te okunacak şekilde güncelleme (3) | `Suomi` / `Deutsch` geçişi tüm ekranı günceller |
| **Orta** | Uygulama (Core workaround) | `.cell` için `flex: 1 1 0px;` (1.3) | `dpr=1` ve `dpr=2`'de tüm tahta sütunları tam hizalanır |
| **Orta** | `core` (upstream) | Çok satırlı metin kısalınca sağ kenarda artık karakter (`ruutua.n`) (1.4) | TTF + `width: 100%` ile emülatörde tekrar kontrol edilmeli |
| **Düşük** | `linux` | `i486` auto DPR eşliği, `rpmlint` (PIE/strip/changelog) (2.3, 2.4) | Emülatör/cihaz eşliği ve paket hijyeni |
| **Upstream** | `core` | `RuntimeFontProvider` Bold/Italic, `body` element eşleştirme, `flex: 1` basis, `font: inherit` (1.1–1.6) | Core repo'suna issue olarak bırakılabilir |
