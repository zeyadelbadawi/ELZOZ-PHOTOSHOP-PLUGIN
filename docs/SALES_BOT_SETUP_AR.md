# تشغيل بوت المبيعات (واتساب + تليجرام + الدفع)

ده دليل خطوة بخطوة. الحاجات اللي محتاجة حساباتك إنت، زي Meta وتليجرام والموبايل، لازم تعملها بنفسك. كل الباقي اتعمل خلاص.

## اللي اتعمل بالفعل ✅
- قاعدة البيانات على مشروع Supabase "elzoz": العملاء، والطلبات، والتحويلات، والباقات، والإعدادات، مع حماية كاملة. محدش يقدر يقرا أو يكتب فيها غير السيرفر.
- الـ Edge Function `sales-bot` منشورة على:
  `https://qxclgvmqeztonhdntvni.supabase.co/functions/v1/sales-bot`
  (اتأكدنا إنها بترفض أي طلب من غير المفتاح الصح.)
- مهمة كل 5 دقايق: بتسلّم الطلبات المدفوعة، وبتقفل الطلبات القديمة، وبتبعت التقرير اليومي الساعة 10 بالليل. مفتاحها متخزن في Vault ومحدش بيشوفه.
- مكان خاص لملف البلجن (Storage → `releases`)، والبوت بيبعت لينك تحميل صالح 7 أيام.
- صفحة "المبيعات (واتساب)" في الداشبورد.
- باقات وأسعار تجريبية: 50 / 200 / 500 / 1500 جنيه. عدّلها من الداشبورد ← المبيعات ← الباقات.
- عنوان InstaPay `elbadawi@instapay` ورقم فودافون كاش `01069942554`. عدّلهم من الداشبورد ← المبيعات ← إعدادات البوت.

## قبل ما تبدأ: اعمل 3 مفاتيح عشوائية
Supabase ← SQL Editor ← شغّل الأمر ده **3 مرات**، واحفظ النتايج عندك في مكان آمن. **متبعتهاش لحد ولا في الشات.**
```sql
select encode(extensions.gen_random_bytes(24), 'hex');
```
- الأول = `TG_WEBHOOK_SECRET`
- التاني = `WA_VERIFY_TOKEN`
- التالت = `PAY_WEBHOOK_KEY`

كل المفاتيح بتتحط في: Supabase ← **Edge Functions** ← **Secrets** ← Add new secret.

---

## 1) بوت تليجرام (لوحة تحكمك على الموبايل) — 5 دقايق
1. في تليجرام كلم **@BotFather** ← `/newbot` ← اختار اسم ← هياخد منك username لازم يخلص بـ `bot`.
2. هيديك **token**. حطه في Secret اسمه `TG_BOT_TOKEN`، وحط المفتاح الأول في Secret اسمه `TG_WEBHOOK_SECRET`.
3. افتح اللينك ده في المتصفح بعد ما تبدّل `<TOKEN>` و`<SECRET>`:
   ```
   https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://qxclgvmqeztonhdntvni.supabase.co/functions/v1/sales-bot/tg&secret_token=<SECRET>
   ```
   المفروض يظهر لك `"ok":true`.
4. ابعت `/start` للبوت بتاعك. هيرد عليك بـ **chat id** بتاعك.
5. حط الرقم ده في Secret اسمه `TG_OWNER_CHAT_ID`. من اللحظة دي البوت مش هيرد على أي حد غيرك.
6. ابعت `/help` عشان تشوف الأوامر.

## 2) واتساب (Meta) — 20–30 دقيقة
**بخصوص الرقم:** Meta بتديك **رقم تجريبي مجاني**، تقدر تجرب بيه السيستم كله دلوقتي على لحد 5 أرقام بتحددهم. للعملاء الحقيقيين لازم **خط حقيقي** (شريحة جديدة رخيصة)، ويكون مش متسجل على تطبيق واتساب. الأرقام المجانية اللي على النت **مش آمنة**، لأن أي حد ممكن يستلم كود التفعيل ويسرق الرقم، وواتساب غالباً بيحظرها.

1. ادخل **developers.facebook.com** بحساب فيسبوك ← My Apps ← **Create App** ← اختار الاستخدام الخاص بواتساب (Business / Connect with customers through WhatsApp) ← اربطه بحساب Business (هيتعمل لو مش موجود).
2. من القايمة ← **WhatsApp ← API Setup**:
   - هتلاقي **Test number** (مجاني).
   - في خانة **To**، ضيف رقمك الشخصي وأكده بالكود.
   - انسخ **Phone number ID**، وحطه في Secret اسمه `WA_PHONE_NUMBER_ID`.
3. **Token دايم**:
   - business.facebook.com ← Settings ← **Users ← System users** ← Add (Admin).
   - **Assign assets**: التطبيق + حساب WhatsApp (Full control).
   - **Generate token** بالصلاحيات `whatsapp_business_messaging` و `whatsapp_business_management`، ومدة Never.
   - حطه في Secret اسمه `WA_TOKEN`.
   - (التوكن المؤقت اللي في صفحة API Setup بيخلص بعد 24 ساعة، استخدمه للتجربة بس.)
4. **App secret**: App settings ← Basic ← App secret ← Show. حطه في Secret اسمه `WA_APP_SECRET`.
5. حط المفتاح التاني في Secret اسمه `WA_VERIFY_TOKEN`.
6. **Webhook**: WhatsApp ← **Configuration**:
   - Callback URL: `https://qxclgvmqeztonhdntvni.supabase.co/functions/v1/sales-bot/wa`
   - Verify token: نفس قيمة `WA_VERIFY_TOKEN` ← **Verify and save**.
   - تحت **Webhook fields** ← اعمل **Subscribe** على `messages`.
7. **جرّب:** من واتساب بتاعك ابعت "اهلا" للرقم التجريبي. المفروض يجيلك ترحيب وقايمة، ويجيلك تنبيه على تليجرام 🆕.
8. **قبل العملاء الحقيقيين:**
   - في App settings ← Basic، حط **Privacy Policy URL**: `https://elzoadmin.vercel.app/privacy.html`
     (الصفحة دي بتتنشر مع الداشبورد. اتأكد إن Vercel نشر آخر نسخة.)
   - حوّل التطبيق لـ **Live**.
   - WhatsApp ← API Setup ← **Add phone number** بالخط الحقيقي، واعمل اسم العرض (Display name) واستنى موافقة Meta.
   - غيّر `WA_PHONE_NUMBER_ID` للرقم الجديد.
   - Meta ممكن تطلب توثيق البيزنس لبعض الحدود. البوت بيرد بس على رسايل العملاء، ومش بيبعت رسايل تسويق.

## 3) الذكاء الاصطناعي (اختياري، مجاني) — 3 دقايق
1. ادخل **aistudio.google.com** ← Get API key ← Create.
2. حطه في Secret اسمه `GEMINI_API_KEY`.

البوت بيستخدمه في حاجتين بس:
- يفهم الرسايل اللي مش واضحة.
- يقرا سكرين شوت التحويل عشان يوريهولك. **عمره ما بيوافق على فلوس.**

من غيره البوت بيشتغل عادي بالكلمات والقوايم. ملحوظة: Google ممكن تستخدم بيانات الخطة المجانية لتحسين خدماتها.

## 4) موبايل الدفع (أندرويد) — 15 دقيقة
ده الموبايل اللي فيه خط فودافون كاش (`01069942554`) وأبلكيشن InstaPay أو البنك.

1. سطّب تطبيق تحويل رسايل وإشعارات لـ Webhook. اقتراحات مفتوحة المصدر:
   - **SmsForwarder** (github.com/pppscn/SmsForwarder): رسايل SMS + إشعارات التطبيقات.
   - أو **SMS to URL Forwarder** (github.com/bogkonstantin/android_income_sms_gateway_webhook): رسايل SMS بس.
   - (اتأكد بنفسك من التطبيق قبل ما تديله صلاحية قراءة الرسايل.)
2. اعمل قاعدة (Rule) تبعت لـ:
   ```
   https://qxclgvmqeztonhdntvni.supabase.co/functions/v1/sales-bot/pay?key=<PAY_WEBHOOK_KEY>
   ```
   - Method: **POST**، وBody بصيغة JSON فيه نص الرسالة واسم المرسل، مثلاً:
     `{"from": "<المرسل>", "text": "<نص الرسالة>"}` (استخدم المتغيرات اللي التطبيق بيوفرها).
   - فلتر: رسايل **VF-Cash / Vodafone Cash** وإشعارات تطبيق **InstaPay** أو البنك بس.
3. حط المفتاح التالت في Secret اسمه `PAY_WEBHOOK_KEY`.
4. اقفل **Battery optimization** للتطبيق، وخلي الموبايل على الشاحن ومتوصل نت على طول.
5. **جرّب:** حوّل لنفسك **1 جنيه** من محفظة تانية.
   - المفروض يجيلك على تليجرام: "💰 تحويل وصل ومش متطابق".
   - وفي الداشبورد ← المبيعات ← التحويلات، يظهر بعلامة ✓.
   - لو ظهر "**مش موثوق**"، شوف اسم المرسل الظاهر، وضيفه في Secret اسمه `PAY_ALLOWED_SENDERS`. القيمة دي بتحل مكان القايمة الافتراضية، فاكتبها كاملة، مثلاً:
     `vf-cash,vodafone cash,vodafone,instapay,com.egyptianbanks.instapay,<الاسم الجديد>`

**أمان:** أي رسالة جاية من رقم عادي (مش VF-Cash أو InstaPay) عمرها ما بتعتبر دفع. ولو حد بعت سكرين شوت متزوّر، مفيش حاجة هتتفعل غير بإشعار حقيقي على موبايلك أو بموافقتك.

**نصيحة لأول أسبوع:** من الداشبورد ← إعدادات البوت، اقفل "موافقة تلقائية". كده كل طلب هيستنى زرار ✅ منك على تليجرام، لحد ما تتأكد إن المطابقة شغالة صح مع رسايل البنك عندك. بعدها افتحها.

## 5) ملف البلجن
Supabase ← **Storage** ← `releases` ← Upload. ارفع ملف الـ `.ccx` باسم **`elzoz.ccx`**، أو غيّر الاسم في إعدادات البوت.

## 6) بعد ما الرقم الحقيقي يشتغل
- ابعتلي الرقم، وأنا أغيّر لينك "تواصل معانا" جوه البلجن ليكون على رقم البوت مع كود `[PLUGIN]`.
- لينكات التسويق (كل لينك بكود مصدر عشان تعرف منين بيجي البيع):
  - انستجرام: `https://wa.me/<رقم البوت>?text=أهلاً عايز أعرف عن Elzoz [IG-BIO]`
  - إعلان فيسبوك: `...[FB-AD1]`، تيك توك: `...[TT-VID]`
  - الترشيحات: كل عميل بيستلم كود `REF-XXXXXX` في رسالة التفعيل.

## الاستخدام اليومي
- **تليجرام:** تنبيه لكل عميل جديد، وطلب، وتحويل، وطلب دعم. وزراير ✅ قبول / ❌ رفض.
  - رد على أي تنبيه بـ Reply وردك هيوصل للعميل.
  - `/status` و `/orders` و `/pause` و `/resume` و `/help`.
- **الداشبورد ← المبيعات:** كل الطلبات والمحادثات والتحويلات والباقات والإعدادات، وزرار إيقاف البوت.
- **تقرير يومي** الساعة 10 بالليل: المبيعات، والإيراد، واللي مستني موافقتك، والاشتراكات اللي هتخلص خلال 3 أيام، والعملاء اللي اشتركوا وما استخدموش البلجن.

## كل الـ Secrets في جدول واحد
| الاسم | منين |
|---|---|
| `TG_BOT_TOKEN` | @BotFather |
| `TG_WEBHOOK_SECRET` | المفتاح العشوائي الأول |
| `TG_OWNER_CHAT_ID` | من رد البوت على /start |
| `WA_TOKEN` | System user token |
| `WA_PHONE_NUMBER_ID` | WhatsApp ← API Setup |
| `WA_APP_SECRET` | App settings ← Basic |
| `WA_VERIFY_TOKEN` | المفتاح العشوائي التاني |
| `PAY_WEBHOOK_KEY` | المفتاح العشوائي التالت |
| `GEMINI_API_KEY` | aistudio.google.com (اختياري) |
| `PAY_ALLOWED_SENDERS` | اختياري، لو المرسل مش متعرف |
| `GEMINI_MODEL` / `WA_GRAPH_VERSION` | اختياري. الافتراضي `gemini-3.1-flash-lite` / `v23.0` |

## تحسينات أمان اختيارية
- Supabase ← Authentication ← Passwords: فعّل **Leaked password protection** لو متاحة في خطتك.
- نقل `pg_net` من schema `public` (تحذير بسيط من Supabase): شغّل في SQL Editor:
  ```sql
  drop extension pg_net; create extension pg_net schema extensions;
  ```
  وبعدها قولّي أتأكد إن المهمة كل 5 دقايق لسه شغالة.

## التكلفة
- كل الخدمات على خططها المجانية: Supabase، وTelegram، وGemini، وWhatsApp Cloud API.
- الحاجة الوحيدة اللي ممكن تدفع فيها: شريحة الخط الجديد.
- رسايل واتساب: الرد على العميل جوه 24 ساعة من آخر رسالة منه. مصادر بتقول إن من أكتوبر 2026 أول 1000 رد في الشهر مجاني لكل رقم، فراجع صفحة أسعار Meta. البوت مش بيبعت رسايل تسويق مدفوعة.
