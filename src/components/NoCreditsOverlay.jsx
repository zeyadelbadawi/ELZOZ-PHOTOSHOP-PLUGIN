'use client';

import React, { useContext } from 'react';
import { AuthContext } from '../context/AuthContext';
import { Lock, Phone, AlertCircle } from 'lucide-react';

/**
 * NoCreditsOverlay - Reusable component that wraps content
 * Shows an overlay with "No Credits" message if user has 0 credits
 * Can be used on any panel, section, or future component
 * 
 * Usage:
 * <NoCreditsOverlay>
 *   <YourComponent />
 * </NoCreditsOverlay>
 */
export default function NoCreditsOverlay({ children, requiredCredits = 1, showOverlay = true }) {
    const { user } = useContext(AuthContext);

    // Check if user has enough credits
    const hasEnoughCredits = user && user.credits >= requiredCredits;
    const hasNoCredits = user && user.credits <= 0;

    if (!showOverlay || hasEnoughCredits) {
        return children;
    }

    return (
        <div style={{
            position: 'relative',
            width: '100%',
            height: '100%'
        }}>
            {/* Blurred content behind */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                filter: 'blur(4px)',
                pointerEvents: 'none',
                opacity: 0.5,
                overflow: 'hidden'
            }}>
                {children}
            </div>

            {/* Overlay */}
            <div style={{
                position: 'absolute',
                top: 0,
                left: 0,
                right: 0,
                bottom: 0,
                background: 'rgba(0, 0, 0, 0.7)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                zIndex: 1000,
                backdropFilter: 'blur(2px)'
            }}>
                {/* Card */}
                <div style={{
                    background: 'var(--color-bg-secondary)',
                    border: '2px solid var(--color-warning)',
                    borderRadius: 'var(--radius-lg)',
                    padding: 'var(--spacing-2xl)',
                    maxWidth: '450px',
                    textAlign: 'center',
                    boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                    animation: 'slideUp 0.4s ease-out'
                }}>
                    {/* Icon */}
                    <div style={{
                        display: 'flex',
                        justifyContent: 'center',
                        marginBottom: 'var(--spacing-lg)'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: '64px',
                            height: '64px',
                            background: 'linear-gradient(135deg, var(--color-warning) 0%, var(--color-error) 100%)',
                            borderRadius: 'var(--radius-lg)',
                            color: 'white'
                        }}>
                            <Lock size={32} />
                        </div>
                    </div>

                    {/* Title */}
                    <h2 style={{
                        margin: '0 0 var(--spacing-md) 0',
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: '700',
                        color: 'var(--color-text-primary)'
                    }}>
                        No Credits Available
                    </h2>

                    {/* Current Credits */}
                    <div style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 'var(--spacing-sm)',
                        marginBottom: 'var(--spacing-lg)',
                        padding: 'var(--spacing-md)',
                        background: 'var(--color-bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        border: '1px solid var(--color-border)'
                    }}>
                        <AlertCircle size={18} style={{ color: 'var(--color-warning)' }} />
                        <span style={{
                            fontSize: 'var(--font-size-md)',
                            color: 'var(--color-text-secondary)'
                        }}>
                            Current Credits: <strong>{user?.credits || 0}</strong>
                        </span>
                    </div>

                    {/* Description */}
                    <p style={{
                        margin: '0 0 var(--spacing-2xl) 0',
                        fontSize: 'var(--font-size-md)',
                        color: 'var(--color-text-secondary)',
                        lineHeight: '1.6'
                    }}>
                        You've used all your available credits. To continue using Elzoz Studio's features, please get in touch with our team to unlock premium packages.
                    </p>

                    {/* CTA Button */}
                    <a
                        href="tel:+1-555-123-4567"
                        style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-sm)',
                            padding: 'var(--spacing-md) var(--spacing-lg)',
                            background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: 'var(--font-size-md)',
                            fontWeight: '600',
                            transition: 'all var(--transition-base)',
                            textDecoration: 'none',
                            boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)'
                        }}
                        onMouseEnter={(e) => {
                            e.target.style.transform = 'translateY(-2px)';
                            e.target.style.boxShadow = '0 6px 16px rgba(37, 99, 235, 0.4)';
                        }}
                        onMouseLeave={(e) => {
                            e.target.style.transform = 'translateY(0)';
                            e.target.style.boxShadow = '0 4px 12px rgba(37, 99, 235, 0.3)';
                        }}
                    >
                        <Phone size={18} />
                        <span>Call to Charge Credits</span>
                    </a>

                    {/* Footer Note */}
                    <p style={{
                        margin: 'var(--spacing-lg) 0 0 0',
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-muted)'
                    }}>
                        Available 9 AM - 6 PM EST, Monday - Friday
                    </p>
                </div>
            </div>

            <style>{`
                @keyframes slideUp {
                    from {
                        opacity: 0;
                        transform: translateY(20px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
            `}</style>
        </div>
    );
}
