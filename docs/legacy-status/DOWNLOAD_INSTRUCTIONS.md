# 📥 دليل تحميل ملفات المشروع

## الطريقة الموصى بها:

### الخيار 1: تحميل الملفات من الدردشة ⭐

جميع الملفات موجودة في الـ **outputs** أعلى الدردشة!

**الخطوات:**
1. اضغط على كل ملف في القائمة
2. اضغط زر "Download" 📥
3. احفظ الملفات في مجلد جديد على جهازك

---

### الخيار 2: إنشاء المشروع يدوياً

إذا واجهت صعوبة في التحميل، يمكنك إنشاء المشروع يدوياً:

#### 1. إنشاء المجلدات:

```bash
mkdir elzoz-plugin
cd elzoz-plugin
mkdir src
mkdir src/components
mkdir src/styles
mkdir src/utils
mkdir icons
```

#### 2. نسخ محتوى كل ملف:

افتح كل ملف من القائمة أعلاه وانسخ محتواه إلى ملف جديد على جهازك.

**الملفات المطلوبة:**

```
elzoz-plugin/
├── manifest.json              ✅ انسخ من الدردشة
├── package.json               ✅ انسخ من الدردشة
├── webpack.config.js          ✅ انسخ من الدردشة
├── .gitignore                 ✅ انسخ من الدردشة
├── README.md                  ✅ انسخ من الدردشة
├── SETUP_GUIDE.md             ✅ انسخ من الدردشة
├── NEXT_STEPS.md              ✅ انسخ من الدردشة
├── src/
│   ├── index.html            ✅ انسخ من الدردشة
│   ├── index.jsx             ✅ انسخ من الدردشة
│   ├── App.jsx               ✅ انسخ من الدردشة
│   ├── components/
│   │   ├── ExcelUpload.jsx   ✅ انسخ من الدردشة
│   │   ├── ImageMapping.jsx  ✅ انسخ من الدردشة
│   │   └── ProgressBar.jsx   ✅ انسخ من الدردشة
│   ├── styles/
│   │   └── main.css          ✅ انسخ من الدردشة
│   └── utils/
│       ├── photoshopActions.js  ✅ انسخ من الدردشة
│       └── excelParser.js       ✅ انسخ من الدردشة
└── icons/                     ⚠️ أنشئ الأيقونات بنفسك
```

---

### الخيار 3: استخدام GitHub (الأفضل) ⭐⭐⭐

إذا كنت تستخدم Git:

```bash
# 1. إنشاء مستودع جديد على GitHub
# 2. Clone المستودع
git clone https://github.com/yourusername/elzoz-plugin.git
cd elzoz-plugin

# 3. انسخ جميع الملفات من الدردشة إلى المجلد

# 4. Commit و Push
git add .
git commit -m "Initial commit - elzoz plugin base structure"
git push origin main
```

**فوائد استخدام GitHub:**
- نسخة احتياطية آمنة
- تتبع التغييرات
- سهولة المشاركة
- Version Control

---

## ✅ التحقق من اكتمال الملفات

بعد تحميل/نسخ جميع الملفات، تأكد من:

```bash
cd elzoz-plugin

# عدد الملفات
ls -R | grep -E "\.(js|jsx|json|css|html|md)$" | wc -l
# يجب أن يكون: 15 ملف

# فحص الهيكل
tree -I 'node_modules|dist'
```

**الناتج المتوقع:**
```
.
├── manifest.json
├── package.json
├── webpack.config.js
├── .gitignore
├── README.md
├── SETUP_GUIDE.md
├── NEXT_STEPS.md
└── src
    ├── index.html
    ├── index.jsx
    ├── App.jsx
    ├── components
    │   ├── ExcelUpload.jsx
    │   ├── ImageMapping.jsx
    │   └── ProgressBar.jsx
    ├── styles
    │   └── main.css
    └── utils
        ├── photoshopActions.js
        └── excelParser.js
```

---

## 🚀 بعد التحميل

1. **تنصيب المكتبات:**
```bash
npm install
```

2. **إنشاء الأيقونات:**
   - أنشئ مجلد `icons/`
   - أضف: `icon-dark.png` و `icon-light.png`
   - المقاسات: 23×23 و 48×48

3. **البناء:**
```bash
npm run build
```

4. **التحميل في Photoshop:**
   - افتح UXP Developer Tool
   - Add Plugin → اختر مجلد المشروع
   - Load

---

## 💡 نصائح

- **استخدم VS Code** لفتح المشروع كاملاً
- **راجع README.md** للتعليمات الكاملة
- **ابدأ بـ NEXT_STEPS.md** للخطوات القادمة

---

## ❓ مشاكل التحميل؟

إذا واجهت مشكلة في تحميل أي ملف:
1. أخبرني واسم الملف
2. سأعيد إرساله بطريقة مختلفة
3. أو يمكنني إنشاء نسخة مبسطة

---

**بالتوفيق! 🎉**
