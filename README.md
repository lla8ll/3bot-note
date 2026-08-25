# Dyoth

تطبيق ملاحظات عربي تقدمي (PWA) يعمل محليًا ويدعم تلخيص الملاحظات عبر OpenAI API من خلال خادم آمن. لا يصل مفتاح OpenAI إلى المتصفح.

## التقنية

- HTML وCSS وJavaScript خام للواجهة.
- Service Worker وWeb App Manifest لدعم PWA والعمل دون اتصال.
- خادم Node.js محلي، مع دالة Serverless متوافقة مع Vercel داخل `api/`.
- لا توجد تبعيات تشغيل خارجية؛ يستخدم الخادم واجهة OpenAI Responses API عبر `fetch`.

## التشغيل محليًا

يتطلب Node.js 22 أو أحدث وpnpm.

```bash
pnpm install
cp .env.example .env.local
pnpm dev
```

ضع `OPENAI_API_KEY` في `.env.local` محليًا فقط. الملف مستبعد من Git. افتح بعدها `http://localhost:3000`.

## التحقق

```bash
pnpm run check
pnpm test
```

لا توجد خطوة build لأن الواجهة ملفات ثابتة. أمر `check` يتحقق من JSON وJavaScript ومسارات PWA والأيقونات ومنع ظهور الاسم القديم أو مفتاح OpenAI في ملفات الواجهة.

## OpenAI API

- تستدعي الواجهة `/api/summarize` عند اختيار زر التلخيص فقط.
- يقرأ الخادم `OPENAI_API_KEY` من متغير البيئة، ويستخدم `gpt-5-mini` افتراضيًا عبر `OPENAI_MODEL`.
- المدخلات محدودة الحجم، والاستجابة غير مخزنة (`store: false`)، وهناك تحقق same-origin وحدّ طلبات مبدئي لكل عميل.
- حد الطلبات داخل الذاكرة حماية أولية فقط؛ قبل الإطلاق العام يجب تفعيل rate limiting ومصادقة أو حماية إساءة استخدام على منصة الاستضافة.
- عند Vercel اضبط `APP_ORIGIN=https://dyoth.net` وأضف `OPENAI_API_KEY` إلى بيئة Production فقط. لا تستخدم مفتاح الإنتاج في Preview deployments.

## المزامنة السحابية

ملف `cloud-sync.js` مجرد واجهة غير مفعلة. لا تستخدم أمثلة Firebase أو Supabase في الإنتاج دون مصادقة وقواعد صلاحيات تعزل بيانات كل مستخدم.

## النشر

نقطة الدخول هي `index.html`، والنطاق الافتراضي للمشروع هو `dyoth.net`. المشروع يتضمن دالة Vercel اختيارية و`vercel.json` لرؤوس الأمان، لكن اختيار منصة النشر وربط DNS و`www` يجب تأكيده قبل تنفيذ أي تغيير خارجي. قبل الإطلاق العام، فعّل حد طلبات موزعًا أو WAF على `/api/summarize` لأن فحص Origin وحده ليس مصادقة.
