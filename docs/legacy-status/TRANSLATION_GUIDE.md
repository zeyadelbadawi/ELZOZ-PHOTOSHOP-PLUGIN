# Complete Translation & RTL Implementation Guide

## System Overview

This plugin supports full English/Arabic language switching with automatic RTL (Right-to-Left) layout support. Everything changes dynamically - text, layout direction, alignment, borders, and more.

## Files Created

1. **`/src/config/translations.js`** - All English & Arabic text
2. **`/src/config/rtlConfig.js`** - RTL helper functions
3. **`/src/context/LanguageContext.jsx`** - Global language state management
4. **`/src/hooks/useTranslation.js`** - Custom hook for easy access
5. **`/src/components/UserHeader.jsx`** - Updated with full RTL support

## How to Use in Components

### Basic Usage (Simplest)

```jsx
import { useTranslation } from '../hooks/useTranslation';

export default function MyComponent() {
  const { t, isArabic, dir } = useTranslation();
  
  return (
    <div style={{ direction: dir }}>
      <h1>{t('header.title')}</h1>
      <p>{t('login.email')}</p>
      <button>{t('common.save')}</button>
    </div>
  );
}
```

### With RTL Layout Support

```jsx
import { useTranslation } from '../hooks/useTranslation';

export default function MyComponent() {
  const { t, isArabic, dir, textAlign } = useTranslation();
  
  return (
    <div style={{ direction: dir }}>
      <div style={{ display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
        <input placeholder={t('login.emailPlaceholder')} style={{ textAlign }} />
        <button>{t('common.submit')}</button>
      </div>
    </div>
  );
}
```

### Using RTL Helpers

```jsx
import { useTranslation } from '../hooks/useTranslation';

export default function MyComponent() {
  const { t, isArabic, rtl } = useTranslation();
  
  return (
    <div style={{
      ...rtl.getContainerStyle({
        marginLeft: '20px',
        paddingLeft: '16px',
        textAlign: 'left'
      })
    }}>
      <h1>{t('header.title')}</h1>
    </div>
  );
}
```

### Full Advanced Usage

```jsx
import { useTranslation } from '../hooks/useTranslation';

export default function ComplexComponent() {
  const { 
    t,           // Translation function: t('section.key')
    isArabic,    // Boolean: true if Arabic, false if English
    isEnglish,   // Boolean: opposite of isArabic
    dir,         // Direction string: 'rtl' or 'ltr'
    textAlign,   // Text alignment: 'right' (Arabic) or 'left' (English)
    textAlignOpposite, // Opposite direction
    rtl          // RTL helper object with methods
  } = useTranslation();
  
  return (
    <div style={{ direction: dir }}>
      {/* Simple text */}
      <h1>{t('setup.title')}</h1>
      
      {/* Flexbox with auto-reversal */}
      <div style={{
        display: 'flex',
        flexDirection: isArabic ? 'row-reverse' : 'row',
        gap: '16px'
      }}>
        <input placeholder={t('login.emailPlaceholder')} />
        <button>{t('common.submit')}</button>
      </div>
      
      {/* Text alignment */}
      <p style={{ textAlign }}>{t('common.loadingData')}</p>
      
      {/* Using RTL margin helper */}
      <div style={{ ...rtl.getMarginStart('20px') }}>
        Margin on start (right for Arabic, left for English)
      </div>
      
      {/* Conditional styles */}
      <div style={{
        borderLeft: isArabic ? 'none' : '2px solid blue',
        borderRight: isArabic ? '2px solid blue' : 'none'
      }}>
        Border on the correct side
      </div>
      
      {/* Language check */}
      {isArabic && <p>هذا النص يظهر فقط بالعربية</p>}
      {isEnglish && <p>This text only shows in English</p>}
    </div>
  );
}
```

## Translation Keys Reference

### Header (`header.*`)
- `header.title` - App title
- `header.subtitle` - App subtitle
- `header.credits` - Credits label
- `header.logout` - Logout button
- `header.language` - Language label

### Login Panel (`login.*`)
- `login.title` - Login page title
- `login.subtitle` - Login subtitle
- `login.description` - Description text
- `login.email` - Email label
- `login.emailPlaceholder` - Email input placeholder
- `login.password` - Password label
- `login.passwordPlaceholder` - Password input placeholder
- `login.loginBtn` - Login button text
- `login.loggingIn` - Loading text
- `login.errorMessage` - Error text

### Tabs (`tabs.*`)
- `tabs.setup` - Setup tab
- `tabs.mapping` - Mapping tab
- `tabs.imageMapping` - Image Mapping tab
- `tabs.images` - Images tab
- `tabs.execute` - Execute tab

### Setup Panel (`setup.*`)
- `setup.title` - Title
- `setup.description` - Description
- `setup.selectExcel` - Upload button
- `setup.dragDrop` - Drag/drop text
- `setup.excelInfo` - Info text

### Execute Panel (`execute.*`)
- `execute.title` - Title
- `execute.description` - Description
- `execute.runPreflight` - Preflight button
- `execute.processing` - Processing text
- `execute.insufficientCredits` - Error message
- `execute.creditsNeeded` - Credits label
- `execute.creditsLabel` - Singular credit
- `execute.creditsPlural` - Plural credits
- `execute.creditsBut` - "But need" text
- `execute.contactUs` - Contact text
- `execute.callBtn` - Call button

### No Credits (`noCredits.*`)
- `noCredits.title` - Title
- `noCredits.lockMessage` - Lock message
- `noCredits.message` - Message text
- `noCredits.subtitle` - Subtitle
- `noCredits.callBtn` - Call button
- `noCredits.businessHours` - Hours text

### Preflight (`preflight.*`)
- `preflight.title` - Title
- `preflight.status` - Status label
- `preflight.validDesign` - Valid message
- `preflight.issues` - Issues label
- `preflight.warnings` - Warnings label
- `preflight.skipImages` - Skip button
- `preflight.proceed` - Proceed button
- `preflight.close` - Close button

### Common (`common.*`)
- `common.loading` - Loading text
- `common.error` - Error text
- `common.success` - Success text
- `common.warning` - Warning text
- `common.cancel` - Cancel button
- `common.save` - Save button
- `common.continue` - Continue button
- `common.back` - Back button
- `common.next` - Next button
- `common.submit` - Submit button
- `common.close` - Close button
- `common.delete` - Delete button
- `common.edit` - Edit button
- `common.add` - Add button
- And many more...

## Adding New Translations

When you add a new feature or text:

1. **Add to translations.js** in both `en` and `ar` objects:
```javascript
// In /src/config/translations.js
en: {
  myFeature: {
    title: 'My Feature',
    button: 'Click Me'
  }
},
ar: {
  myFeature: {
    title: 'ميزتي',
    button: 'انقر علي'
  }
}
```

2. **Use in your component:**
```jsx
const { t } = useTranslation();
<h1>{t('myFeature.title')}</h1>
<button>{t('myFeature.button')}</button>
```

## RTL Features Included

✅ **Automatic Direction** - Document direction switches with language
✅ **Flexbox Reversal** - Use `flexDirection: isArabic ? 'row-reverse' : 'row'`
✅ **Text Alignment** - Automatic text direction
✅ **Border Sides** - Switch border from left to right
✅ **Margin/Padding** - Use RTL helpers to flip sides
✅ **localStorage** - Language preference persists across sessions
✅ **No Refresh Needed** - All changes happen instantly

## Next Steps

1. **Rebuild the app:**
```bash
npm run build
npm run uxp:reload
```

2. **Test the language switcher:**
   - Click "EN" / "العربية" button in header
   - Everything should switch to Arabic/English
   - Layout should flip to RTL when Arabic is selected
   - All text should be in the selected language

3. **Update other components** - Use the examples above to add translations to all panels and components

4. **Add new keys** - When adding new text, always add it to translations.js first!

## Troubleshooting

- **Text not translating?** - Check that the key exists in both `en` and `ar` objects
- **Layout not flipping?** - Add `direction: dir` to your container
- **Flexbox order wrong?** - Use `flexDirection: isArabic ? 'row-reverse' : 'row'`
- **Borders on wrong side?** - Use RTL helpers or conditionals
- **Language not persisting?** - Check browser localStorage settings

