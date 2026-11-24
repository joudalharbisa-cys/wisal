# وصال

منصة تربط احتياج المستشفيات بمخزون الجمعيات، من تسجيل الطلب إلى تأكيد الاستلام برمز.

هذا هو المشروع الحقيقي، ومبني من الصفر. النموذج التجريبي مرجع للقواعد فقط.

## المتطلبات
- Node 20 أو أحدث
- Java 11 أو أحدث (للمحاكي المحلي فقط)
- كل الأدوات والملفات المؤقتة على درايف D:
  - ذاكرة npm محددة في `.npmrc`.
  - ملفات المحاكي تنحفظ في `.firebase-emulators/` داخل المشروع.

## التشغيل محليًا
1. انسخ `.env.example` إلى `.env.local`.
2. للعمل على المحاكي المحلي بدون حساب Firebase، استخدم هذي القيم:
   ```
   VITE_FIREBASE_API_KEY=demo-key
   VITE_FIREBASE_AUTH_DOMAIN=demo-wesal.firebaseapp.com
   VITE_FIREBASE_PROJECT_ID=demo-wesal
   VITE_FIREBASE_APP_ID=demo-app
   VITE_USE_EMULATORS=true
   ```
3. نزّل الحزم: `npm install`
4. شغّل المحاكي في نافذة: `npm run emulators`
5. شغّل الموقع في نافذة ثانية: `npm run dev`

لو إعدادات Firebase ناقصة، يعرض الموقع رسالة بالمفاتيح الناقصة بدل صفحة بيضاء.

## الاختبارات
- `npm test`: اختبارات الواجهة والمنطق.
- `npm run test:rules`: اختبارات قواعد أمان Firestore على المحاكي.

## الهوية البصرية
كل الألوان والخطوط في ملف واحد: `src/styles/theme.css`. صفحة المراجعة على الرابط `/identity`.

## النشر
1. أنشئ مشروع Firebase على الخطة المجانية (Spark)، وفعّل Authentication (إيميل وكلمة مرور) و Firestore.
2. حط إعدادات تطبيق الويب الحقيقية في `.env.local` بدل القيم التجريبية، وخلّ `VITE_USE_EMULATORS` فاضي.
3. غيّر `default` في `.firebaserc` إلى معرّف مشروعك.
4. سجّل الدخول مرة وحدة: `npx firebase login`
5. انشر: `npm run deploy`

## ملاحظة على إصدارات Firebase
الملف `package.json` يثبّت `@firebase/app` و `@firebase/app-compat` على الإصدارات اللي يحددها Firebase 12.19. بدون هذا التثبيت تنزل نسختين من Firebase ويتعطل Firestore. لما تحدّثون Firebase، حدّثوا هذي الإصدارات معه.
