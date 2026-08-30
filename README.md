# 3bot Note

تطبيق ملاحظات عربي تقدمي (PWA) باسم 3bot Note يعمل محليًا ويدعم تلخيص الملاحظات عبر OpenAI API من خلال خادم آمن. لا يصل مفتاح OpenAI إلى المتصفح.

## الميزات

- إدارة كاملة للمجلدات: إضافة، إعادة تسمية، حذف.
- سلة محذوفات مع تراجع فوري وحذف تلقائي بعد 30 يوم.
- بحث متقدم: فلترة بالمجلد، بالتصنيف، والمثبتة فقط.
- تذكير بالنسخة الاحتياطية كل 7 أيام.
- إشعارات Toast مع زر تراجع بدلاً من `alert/confirm/prompt` الأصلية.
- تلخيص آمن بالذكاء الاصطناعي عبر خادم Vercel.
- يعمل بدون اتصال بفضل Service Worker.

## البنية

```
index.html                  ← هيكل HTML فقط
styles/main.css             ← كل الأنماط
src/client/
  app.js                    ← نقطة الدخول ووصل الأحداث
  state.js                  ← الحالة والتخزين والسلة
  actions.js                ← عمليات المجلدات والملاحظات
  render.js                 ← دوال العرض
  search.js                 ← الفلترة والبحث
  io.js                     ← استيراد/تصدير JSON و Markdown
  summarize.js              ← تلخيص AI
  toast.js                  ← إشعارات
  modal.js                  ← نوافذ حوار مخصصة
  backup.js                 ← تذكير النسخ الاحتياطي
api/summarize.js            ← دالة Vercel Serverless
src/summarize-handler.mjs   ← منطق التلخيص
service-worker.js           ← تخزين مؤقت للعمل بدون اتصال
cloud-sync.js               ← واجهة مزامنة سحابية (غير مفعّلة)
```

## التقنية

- HTML وCSS وJavaScript خام. لا Framework، لا خطوة build.
- ES Modules (`<script type="module">`) لتنظيم الكود.
- Service Worker وWeb App Manifest لدعم PWA والعمل دون اتصال.
- خادم Node.js محلي، مع دالة Serverless متوافقة مع Vercel داخل `api/`.

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

## المزامنة السحابية

ملف `cloud-sync.js` مجرد واجهة غير مفعلة. لا تستخدم أمثلة Firebase أو Supabase في الإنتاج دون مصادقة وقواعد صلاحيات تعزل بيانات كل مستخدم.

## النشر

نقطة الدخول هي `index.html`. المشروع يتضمن دالة Vercel و`vercel.json` لرؤوس الأمان. قبل الإطلاق العام، فعّل حد طلبات موزعًا أو WAF على `/api/summarize`.
