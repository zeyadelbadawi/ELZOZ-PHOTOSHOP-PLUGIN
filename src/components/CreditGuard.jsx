'use client';

import React, { useContext, useState, useEffect } from 'react';
import { AlertCircle, Zap } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { CreditService } from '../services/CreditService';

export default function CreditGuard({ children }) {
    const { user, isAuthenticated } = useContext(AuthContext);
    const [hasCredits, setHasCredits] = useState(false);
    const [isChecking, setIsChecking] = useState(true);

    useEffect(() => {
        if (!isAuthenticated || !user) {
            setHasCredits(false);
            setIsChecking(false);
            return;
        }

        checkCredits();
    }, [user, isAuthenticated]);

    const checkCredits = async () => {
        setIsChecking(true);

        const result = await CreditService.hasEnoughCredits(user.id, 1);
        setHasCredits(result.hasCredits);
        setIsChecking(false);
    };

    // If still checking, show loading
    if (isChecking) {
        return (
            <div
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--spacing-2xl)',
                    backgroundColor: 'var(--color-bg-secondary)',
                    borderRadius: 'var(--radius-lg)',
                    textAlign: 'center'
                }}
            >
                <div style={{ color: 'var(--color-text-secondary)' }}>
                    Checking credits...
                </div>
            </div>
        );
    }

    // If no credits, show error message
    if (!hasCredits) {
        return (
            <div
                style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    padding: 'var(--spacing-2xl)',
                    backgroundColor: 'rgba(239, 68, 68, 0.1)',
                    border: '2px solid var(--color-danger)',
                    borderRadius: 'var(--radius-lg)',
                    textAlign: 'center'
                }}
            >
                <AlertCircle size={48} style={{ color: 'var(--color-danger)', marginBottom: 'var(--spacing-md)' }} />

                <h2
                    style={{
                        margin: '0 0 var(--spacing-sm) 0',
                        fontSize: 'var(--font-size-lg)',
                        fontWeight: '700',
                        color: 'var(--color-danger)'
                    }}
                >
                    Insufficient Credits
                </h2>

                <p
                    style={{
                        margin: '0 0 var(--spacing-lg) 0',
                        fontSize: 'var(--font-size-base)',
                        color: 'var(--color-text-secondary)',
                        maxWidth: '400px'
                    }}
                >
                    You need at least 1 credit to run batch processing.
                </p>

                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)',
                        padding: 'var(--spacing-md)',
                        backgroundColor: 'var(--color-bg-secondary)',
                        borderRadius: 'var(--radius-md)',
                        marginBottom: 'var(--spacing-lg)'
                    }}
                >
                    <Zap size={24} style={{ color: 'var(--color-warning)' }} />
                    <div style={{ textAlign: 'left' }}>
                        <div style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                            Your current balance
                        </div>
                        <div
                            style={{
                                fontSize: 'var(--font-size-2xl)',
                                fontWeight: '700',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            {user?.credits || 0} Credits
                        </div>
                    </div>
                </div>

                <p
                    style={{
                        margin: 0,
                        fontSize: 'var(--font-size-sm)',
                        color: 'var(--color-text-secondary)'
                    }}
                >
                    Contact support to purchase more credits
                </p>
            </div>
        );
    }

    // If has credits, render children (Execute panel)
    return <>{children}</>;
}
