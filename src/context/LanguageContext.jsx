'use client';

import React, { createContext, useState, useCallback, useEffect } from 'react';

export const LanguageContext = createContext();

export function LanguageProvider({ children }) {
    const [language, setLanguage] = useState('en'); // 'en' or 'ar'
    const [mounted, setMounted] = useState(false);

    // Load language from localStorage on mount
    useEffect(() => {
        if (typeof window !== 'undefined') {
            const savedLanguage = localStorage.getItem('elzoz_language') || 'en';
            setLanguage(savedLanguage);
            applyRTL(savedLanguage);
        }
        setMounted(true);
    }, []);

    const applyRTL = (lang) => {
        if (typeof window !== 'undefined') {
            const isArabic = lang === 'ar';
            document.documentElement.dir = isArabic ? 'rtl' : 'ltr';
            document.documentElement.lang = lang;
            document.body.dir = isArabic ? 'rtl' : 'ltr';
            document.body.style.direction = isArabic ? 'rtl' : 'ltr';
            document.body.style.textAlign = isArabic ? 'right' : 'left';
            localStorage.setItem('elzoz_language', lang);
            // Force CSS reflow for immediate effect
            void document.body.offsetHeight;
        }
    };

    const toggleLanguage = useCallback(() => {
        setLanguage(prev => {
            const newLang = prev === 'en' ? 'ar' : 'en';
            applyRTL(newLang);
            return newLang;
        });
    }, []);

    const isArabic = language === 'ar';
    const isEnglish = language === 'en';

    if (!mounted) return null; // Avoid hydration mismatch

    return (
        <LanguageContext.Provider value={{ language, toggleLanguage, isArabic, isEnglish }}>
            {children}
        </LanguageContext.Provider>
    );
}

export default LanguageContext;
