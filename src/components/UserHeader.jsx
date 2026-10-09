'use client';

import React, { useContext, useState, useEffect } from 'react';
import { LogOut, Zap, Globe, Sparkles } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { LanguageContext } from '../context/LanguageContext';
import { useTranslation } from '../hooks/useTranslation';

export default function UserHeader() {
    const { user, logout } = useContext(AuthContext);
    const { toggleLanguage } = useContext(LanguageContext);
    const { t, isArabic, dir } = useTranslation();
    const [prevCredits, setPrevCredits] = useState(null);
    const [isUpdating, setIsUpdating] = useState(false);

    // Detect credit changes and show animation
    useEffect(() => {
        if (prevCredits !== null && prevCredits !== user?.credits) {
            setIsUpdating(true);
            const timer = setTimeout(() => setIsUpdating(false), 1000);
            return () => clearTimeout(timer);
        }
        setPrevCredits(user?.credits);
    }, [user?.credits]);

    const handleLogout = async () => {
        await logout();
    };

    if (!user) return null;

    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: isArabic ? 'flex-start' : 'flex-end',
                gap: 'var(--spacing-lg)',
                padding: 'var(--spacing-md) var(--spacing-lg)',
                backgroundColor: 'var(--color-bg-secondary)',
                [isArabic ? 'borderRight' : 'borderLeft']: '2px solid var(--color-primary)',
                borderRadius: 'var(--radius-md)',
                direction: dir,
                flexDirection: isArabic ? 'row-reverse' : 'row'
            }}
        >
            {/* Logo Section - Left side */}
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-md)',
                    paddingRight: isArabic ? 0 : 'var(--spacing-md)',
                    paddingLeft: isArabic ? 'var(--spacing-md)' : 0,
                    [isArabic ? 'borderRight' : 'borderLeft']: '1px solid var(--color-border)',
                    flexDirection: isArabic ? 'row-reverse' : 'row'
                }}
            >
                <img
                    src="/images/ze-yellow.png"
                    alt="ZIAD EL-BADAWI"
                    style={{
                        height: '32px',
                        width: 'auto',
                        filter: 'drop-shadow(0 0 4px rgba(253, 185, 38, 0.2))'
                    }}
                />
            </div>
            {/* Credits Display */}
            <style>{`
        @keyframes creditPulse {
          0% { 
            box-shadow: 0 0 0 0 rgba(253, 185, 38, 0.7);
            transform: scale(1);
          }
          50% {
            transform: scale(1.05);
          }
          100% { 
            box-shadow: 0 0 0 10px rgba(253, 185, 38, 0);
            transform: scale(1);
          }
        }
        .credit-updating {
          animation: creditPulse 1s ease-out;
        }
      `}</style>
            <div
                className={isUpdating ? 'credit-updating' : ''}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    borderRadius: 'var(--radius-md)',
                    transition: 'all 0.3s ease',
                    flexDirection: isArabic ? 'row-reverse' : 'row',
                    direction: dir
                }}
            >
                <Zap
                    size={18}
                    style={{
                        color: user.credits > 0 ? 'var(--color-primary)' : 'var(--color-danger)',
                        transition: 'all 0.3s ease',
                        flexShrink: 0
                    }}
                />
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', textAlign: isArabic ? 'right' : 'left', direction: dir }}>
                    <span style={{ fontSize: 'var(--font-size-xs)', color: 'var(--color-text-secondary)' }}>
                        {t('header.credits')}
                    </span>
                    <span
                        style={{
                            fontSize: 'var(--font-size-base)',
                            fontWeight: '600',
                            color: user.credits > 0 ? 'var(--color-text-primary)' : 'var(--color-danger)',
                            transition: 'all 0.3s ease'
                        }}
                    >
                        {user.credits}
                    </span>
                </div>
            </div>

            {/* User Email */}
            <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)', textAlign: isArabic ? 'right' : 'left', direction: dir }}>
                {user.email}
            </div>

            {/* Language Switcher */}
            <button
                onClick={toggleLanguage}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 'var(--spacing-xs)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-base)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: '500',
                    flexDirection: isArabic ? 'row-reverse' : 'row',
                    direction: dir,
                    whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-primary)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = 'var(--color-primary)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
                title={isArabic ? 'Switch to English' : 'التبديل إلى العربية'}
            >
                <Globe size={16} style={{ flexShrink: 0 }} />
                <span style={{ minWidth: '50px', textAlign: 'center' }}>
                    {isArabic ? 'EN' : 'العربية'}
                </span>
            </button>

            {/* Logout Button */}
            <button
                onClick={handleLogout}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-sm) var(--spacing-md)',
                    backgroundColor: 'var(--color-bg-tertiary)',
                    color: 'var(--color-text-secondary)',
                    border: '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all var(--transition-base)',
                    fontSize: 'var(--font-size-sm)',
                    fontWeight: '500',
                    flexDirection: isArabic ? 'row-reverse' : 'row',
                    direction: dir,
                    whiteSpace: 'nowrap'
                }}
                onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-danger)';
                    e.currentTarget.style.color = 'white';
                    e.currentTarget.style.borderColor = 'var(--color-danger)';
                }}
                onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                    e.currentTarget.style.color = 'var(--color-text-secondary)';
                    e.currentTarget.style.borderColor = 'var(--color-border)';
                }}
            >
                <LogOut size={16} style={{ flexShrink: 0 }} />
                {t('header.logout')}
            </button>
        </div>
    );
}
