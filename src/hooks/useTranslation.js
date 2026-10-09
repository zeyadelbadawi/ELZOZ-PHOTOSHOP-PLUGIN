'use client';

import { useContext } from 'react';
import { LanguageContext } from '../context/LanguageContext';
import { t as translateFn } from '../config/translations';
import { rtlConfig } from '../config/rtlConfig';

export function useTranslation() {
    const langContext = useContext(LanguageContext);
    const { language, isArabic, isEnglish } = langContext || { language: 'en', isArabic: false, isEnglish: true };

    // Enhanced translation function with fallback
    const t = (path) => {
        const result = translateFn(language, path);
        return result;
    };

    return {
        // Translation function
        t,

        // Language states
        language,
        isArabic,
        isEnglish,

        // Direction helpers
        dir: isArabic ? 'rtl' : 'ltr',
        textAlign: isArabic ? 'right' : 'left',
        textAlignOpposite: isArabic ? 'left' : 'right',

        // RTL Style helpers
        rtl: {
            getDirection: () => rtlConfig.getDirection(language),
            getMarginStart: (val) => rtlConfig.getMarginStart(val, language),
            getMarginEnd: (val) => rtlConfig.getMarginEnd(val, language),
            getPaddingStart: (val) => rtlConfig.getPaddingStart(val, language),
            getPaddingEnd: (val) => rtlConfig.getPaddingEnd(val, language),
            getContainerStyle: (baseStyle) => rtlConfig.getContainerStyle(baseStyle, language)
        },

        // Conditional styles for RTL
        getStyle: (ltrStyle, rtlStyle) => isArabic ? { ...ltrStyle, ...rtlStyle } : ltrStyle
    };
}

export default useTranslation;
