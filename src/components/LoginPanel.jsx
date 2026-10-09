'use client';

import React, { useState, useContext } from 'react';
import { Lock, Mail, LogIn, AlertCircle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';

export default function LoginPanel() {
    const { login, isLoading, error: contextError } = useContext(AuthContext);
    const { t, isArabic, dir } = useTranslation();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleLogin = async (e) => {
        e.preventDefault();

        setError('');
        setIsSubmitting(true);

        // Validation
        if (!email || !password) {
            setError('Please fill in all fields');
            setIsSubmitting(false);
            return;
        }

        if (!email.includes('@')) {
            setError('Please enter a valid email');
            setIsSubmitting(false);
            return;
        }

        // Attempt login
        const result = await login(email, password);

        if (!result.success) {
            setError(result.error || 'Login failed');
            setIsSubmitting(false);
            return;
        }

        // Success - context will handle navigation
        setIsSubmitting(false);
    };

    return (
        <div
            style={{
                display: 'flex',
                height: '100vh',
                background: 'var(--color-bg-primary)'
            }}
        >
            {/* Left side - Branding */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 'var(--spacing-2xl)',
                    background: 'linear-gradient(135deg, #0f0f0f 0%, #1a1a1a 100%)',
                    color: 'white',
                    borderRight: '2px solid var(--color-primary)'
                }}
            >
                {/* Logo */}
                <img
                    src="/images/ze-yellow.png"
                    alt="ZIAD EL-BADAWI"
                    style={{
                        maxWidth: '280px',
                        height: 'auto',
                        marginBottom: 'var(--spacing-xl)',
                        filter: 'drop-shadow(0 0 10px rgba(253, 185, 38, 0.3))'
                    }}
                />
                <p
                    style={{
                        fontSize: 'var(--font-size-lg)',
                        opacity: 0.8,
                        textAlign: 'center',
                        maxWidth: '300px',
                        lineHeight: '1.6',
                        color: 'var(--color-text-secondary)'
                    }}
                >
                    Batch Photo Design Automation for Photoshop
                </p>
            </div>

            {/* Right side - Login Form */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'center',
                    alignItems: 'center',
                    padding: 'var(--spacing-2xl)',
                    background: 'var(--color-bg-primary)'
                }}
            >
                <div
                    style={{
                        width: '100%',
                        maxWidth: '400px',
                        padding: 'var(--spacing-xl)',
                        background: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-lg)',
                        border: '1px solid var(--color-border)',
                        boxShadow: '0 0 20px rgba(253, 185, 38, 0.05)'
                    }}
                >
                    {/* Form Title */}
                    <div style={{ marginBottom: 'var(--spacing-2xl)', textAlign: 'center' }}>
                        <h1
                            style={{
                                fontSize: 'var(--font-size-2xl)',
                                fontWeight: '700',
                                color: 'var(--color-primary)',
                                margin: '0 0 var(--spacing-sm) 0',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--spacing-md)'
                            }}
                        >
                            <LogIn size={24} style={{ color: 'var(--color-primary)' }} />
                            Login
                        </h1>
                        <p
                            style={{
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)',
                                margin: 0
                            }}
                        >
                            Sign in to access the plugin
                        </p>
                    </div>

                    {/* Error Message */}
                    {(error || contextError) && (
                        <div
                            style={{
                                padding: 'var(--spacing-md)',
                                backgroundColor: 'rgba(239, 68, 68, 0.1)',
                                borderLeft: '4px solid var(--color-danger)',
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--spacing-lg)',
                                display: 'flex',
                                gap: 'var(--spacing-sm)'
                            }}
                        >
                            <AlertCircle size={20} style={{ color: 'var(--color-danger)', flexShrink: 0 }} />
                            <p
                                style={{
                                    margin: 0,
                                    color: 'var(--color-danger)',
                                    fontSize: 'var(--font-size-sm)'
                                }}
                            >
                                {error || contextError}
                            </p>
                        </div>
                    )}

                    {/* Login Form */}
                    <form onSubmit={handleLogin}>
                        {/* Email Field */}
                        <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: '600',
                                    marginBottom: 'var(--spacing-sm)',
                                    color: 'var(--color-text-primary)'
                                }}
                            >
                                Email Address
                            </label>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: 'var(--spacing-md)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    gap: 'var(--spacing-md)'
                                }}
                            >
                                <Mail size={18} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                <input
                                    type="email"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder="your@email.com"
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--color-text-primary)',
                                        fontSize: 'var(--font-size-base)',
                                        outline: 'none'
                                    }}
                                    disabled={isSubmitting || isLoading}
                                />
                            </div>
                        </div>

                        {/* Password Field */}
                        <div style={{ marginBottom: 'var(--spacing-xl)' }}>
                            <label
                                style={{
                                    display: 'block',
                                    fontSize: 'var(--font-size-sm)',
                                    fontWeight: '600',
                                    marginBottom: 'var(--spacing-sm)',
                                    color: 'var(--color-text-primary)'
                                }}
                            >
                                Password
                            </label>
                            <div
                                style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    padding: 'var(--spacing-md)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-md)',
                                    backgroundColor: 'var(--color-bg-secondary)',
                                    gap: 'var(--spacing-md)'
                                }}
                            >
                                <Lock size={18} style={{ color: 'var(--color-text-secondary)', flexShrink: 0 }} />
                                <input
                                    type="password"
                                    value={password}
                                    onChange={(e) => setPassword(e.target.value)}
                                    placeholder="••••••••"
                                    style={{
                                        flex: 1,
                                        border: 'none',
                                        background: 'transparent',
                                        color: 'var(--color-text-primary)',
                                        fontSize: 'var(--font-size-base)',
                                        outline: 'none'
                                    }}
                                    disabled={isSubmitting || isLoading}
                                />
                            </div>
                        </div>

                        {/* Login Button */}
                        <button
                            type="submit"
                            disabled={isSubmitting || isLoading}
                            style={{
                                width: '100%',
                                padding: 'var(--spacing-md)',
                                backgroundColor: isSubmitting || isLoading ? 'var(--color-bg-tertiary)' : 'var(--color-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                fontSize: 'var(--font-size-base)',
                                fontWeight: '600',
                                cursor: isSubmitting || isLoading ? 'not-allowed' : 'pointer',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                gap: 'var(--spacing-sm)',
                                opacity: isSubmitting || isLoading ? 0.6 : 1,
                                transition: 'all var(--transition-base)'
                            }}
                        >
                            <LogIn size={18} />
                            {isSubmitting || isLoading ? 'Logging in...' : 'Sign In'}
                        </button>
                    </form>

                    {/* Support Info */}
                    <div
                        style={{
                            marginTop: 'var(--spacing-2xl)',
                            padding: 'var(--spacing-lg)',
                            backgroundColor: 'var(--color-bg-secondary)',
                            borderRadius: 'var(--radius-md)',
                            borderLeft: '4px solid var(--color-info)'
                        }}
                    >
                        <h3
                            style={{
                                margin: '0 0 var(--spacing-md) 0',
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: '600',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            Need Help?
                        </h3>
                        <div
                            style={{
                                display: 'flex',
                                flexDirection: 'column',
                                gap: 'var(--spacing-sm)',
                                fontSize: 'var(--font-size-sm)',
                                color: 'var(--color-text-secondary)'
                            }}
                        >
                            <div>
                                <strong>Name:</strong> Ziad Elbadawi
                            </div>
                            <div>
                                <strong>Email:</strong>{' '}
                                <a
                                    href="mailto:zeyadelbadawi.ze@gmail.com"
                                    style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                                >
                                    zeyadelbadawi.ze@gmail.com
                                </a>
                            </div>
                            <div>
                                <strong>Phone:</strong>{' '}
                                <a
                                    href="tel:+201069942554"
                                    style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                                >
                                    +20 106 9942554
                                </a>
                            </div>
                            <div>
                                <strong>WhatsApp:</strong>{' '}
                                <a
                                    href="https://wa.me/201069942554"
                                    style={{ color: 'var(--color-primary)', textDecoration: 'none' }}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    +20 106 9942554
                                </a>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
