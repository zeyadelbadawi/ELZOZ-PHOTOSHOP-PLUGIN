'use client';

import React, { createContext, useState, useEffect } from 'react';
import { SupabaseClient } from '../services/SupabaseClient';

export const AccountContext = createContext();

export function AccountProvider({ children }) {
    const [accounts, setAccounts] = useState([]);
    const [currentAccount, setCurrentAccount] = useState(null);
    const [loading, setLoading] = useState(true);

    // Load accounts from localStorage and Supabase on mount
    useEffect(() => {
        const loadAccounts = async () => {
            try {
                // Try to get user ID from localStorage (set by auth system)
                const savedUserId = localStorage.getItem('elzoz_user_id');

                if (savedUserId) {
                    // Try to fetch account from Supabase
                    try {
                        const account = await SupabaseClient.makeRequest('accounts', 'GET', { user_id: savedUserId });

                        if (account && account.length > 0) {
                            setAccounts(account);
                            setCurrentAccount(account[0]);
                            setLoading(false);
                            return;
                        }
                    } catch (dbError) {
                    }
                }

                // Fallback to localStorage
                const saved = localStorage.getItem('elzoz_accounts');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setAccounts(parsed);
                    if (parsed.length > 0) {
                        setCurrentAccount(parsed[0]);
                    }
                } else {
                    // Create default account
                    const defaultAccount = {
                        id: 'acc_' + Date.now(),
                        name: 'My Account',
                        email: localStorage.getItem('elzoz_user_email') || 'user@example.com',
                        credits: 1000,
                        createdAt: new Date().toISOString(),
                        usage: []
                    };
                    setAccounts([defaultAccount]);
                    setCurrentAccount(defaultAccount);
                    localStorage.setItem('elzoz_accounts', JSON.stringify([defaultAccount]));
                }
            } catch (error) {
                console.error('  Error loading accounts:', error);
                // Fallback to localStorage
                const saved = localStorage.getItem('elzoz_accounts');
                if (saved) {
                    const parsed = JSON.parse(saved);
                    setAccounts(parsed);
                    if (parsed.length > 0) {
                        setCurrentAccount(parsed[0]);
                    }
                }
            } finally {
                setLoading(false);
            }
        };

        loadAccounts();
    }, []);

    const switchAccount = (accountId) => {
        const account = accounts.find(a => a.id === accountId);
        if (account) {
            setCurrentAccount(account);
        }
    };

    const updateCredits = (accountId, amount) => {
        const updated = accounts.map(a =>
            a.id === accountId
                ? { ...a, credits: Math.max(0, a.credits + amount) }
                : a
        );
        setAccounts(updated);
        localStorage.setItem('elzoz_accounts', JSON.stringify(updated));

        if (currentAccount?.id === accountId) {
            setCurrentAccount(updated.find(a => a.id === accountId));
        }
    };

    const addAccount = (name) => {
        const newAccount = {
            id: 'acc_' + Date.now(),
            name,
            email: 'account@example.com',
            credits: 1000,
            createdAt: new Date().toISOString(),
            usage: []
        };
        const updated = [...accounts, newAccount];
        setAccounts(updated);
        localStorage.setItem('elzoz_accounts', JSON.stringify(updated));
        return newAccount;
    };

    const logUsage = (accountId, data) => {
        const updated = accounts.map(a =>
            a.id === accountId
                ? {
                    ...a,
                    usage: [...(a.usage || []), {
                        timestamp: new Date().toISOString(),
                        ...data
                    }]
                }
                : a
        );
        setAccounts(updated);
        localStorage.setItem('elzoz_accounts', JSON.stringify(updated));
    };

    return (
        <AccountContext.Provider value={{
            accounts,
            currentAccount,
            switchAccount,
            updateCredits,
            addAccount,
            logUsage,
            loading
        }}>
            {children}
        </AccountContext.Provider>
    );
}
