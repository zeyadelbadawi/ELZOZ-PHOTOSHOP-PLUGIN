// RTL Configuration for Arabic Support
// Automatically applies RTL styles when using Arabic language

export const rtlConfig = {
    isRTL: (language) => language === 'ar',

    // Directional styles
    getDirection: (language) => language === 'ar' ? 'rtl' : 'ltr',

    // Margin/Padding direction helpers
    getMarginStart: (value, language) => ({
        [language === 'ar' ? 'marginRight' : 'marginLeft']: value
    }),

    getMarginEnd: (value, language) => ({
        [language === 'ar' ? 'marginLeft' : 'marginRight']: value
    }),

    getPaddingStart: (value, language) => ({
        [language === 'ar' ? 'paddingRight' : 'paddingLeft']: value
    }),

    getPaddingEnd: (value, language) => ({
        [language === 'ar' ? 'paddingLeft' : 'paddingRight']: value
    }),

    // Flexbox alignment helpers (flips for RTL)
    getFlexAlign: (align, language) => {
        if (language !== 'ar') return align;

        const flipMap = {
            'flex-start': 'flex-end',
            'flex-end': 'flex-start',
            'left': 'right',
            'right': 'left'
        };

        return flipMap[align] || align;
    },

    // Text alignment
    getTextAlign: (align, language) => {
        if (language !== 'ar') return align;

        const flipMap = {
            'left': 'right',
            'right': 'left'
        };

        return flipMap[align] || align;
    },

    // Combined RTL styles
    getContainerStyle: (baseStyle, language) => {
        if (language !== 'ar') return baseStyle;

        return {
            ...baseStyle,
            direction: 'rtl',
            textAlign: 'right',
            ...(baseStyle.textAlign === 'left' && { textAlign: 'right' }),
            ...(baseStyle.marginLeft && { marginRight: baseStyle.marginLeft, marginLeft: undefined }),
            ...(baseStyle.marginRight && { marginLeft: baseStyle.marginRight, marginRight: undefined }),
            ...(baseStyle.paddingLeft && { paddingRight: baseStyle.paddingLeft, paddingLeft: undefined }),
            ...(baseStyle.paddingRight && { paddingLeft: baseStyle.paddingRight, paddingRight: undefined })
        };
    }
};

export default rtlConfig;
