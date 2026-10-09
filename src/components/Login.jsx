'use client';

import React, { useState } from 'react';

export const Login = ({ onLoginSuccess, onSwitchToRegister }) => {
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Simulate API call - in production, call your backend
            if (!email || !password) {
                throw new Error('Please fill in all fields');
            }

            if (!email.includes('@')) {
                throw new Error('Please enter a valid email');
            }

            // Get users from localStorage
            const usersData = localStorage.getItem('elzoz_users');
            const users = usersData ? JSON.parse(usersData) : [];

            // Find user
            const user = users.find(u => u.email === email);

            if (!user) {
                throw new Error('User not found. Please register first.');
            }

            // Basic password check (in production, use bcrypt comparison)
            if (user.password !== password) {
                throw new Error('Invalid password');
            }

            // Set current user session
            localStorage.setItem('elzoz_current_user', JSON.stringify({
                id: user.id,
                email: user.email,
                name: user.name,
                credits: user.credits,
                accountType: user.accountType
            }));

            onLoginSuccess(user);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="panel" style={{ justifyContent: 'center', padding: 'var(--spacing-lg)' }}>
            <div style={{ maxWidth: '300px', width: '100%' }}>
                <h1 style={{ textAlign: 'center', marginBottom: 'var(--spacing-xl)' }}>Elzoz Login</h1>

                {error && (
                    <div className="alert danger" style={{ marginBottom: 'var(--spacing-md)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            className="form-input"
                            type="email"
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                            placeholder="your@email.com"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            placeholder="••••••••"
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" disabled={loading} style={{ width: '100%' }}>
                        {loading ? (
                            <span className="flex items-center justify-center gap-sm">
                                <span className="spinner"></span> Logging in...
                            </span>
                        ) : (
                            'Login'
                        )}
                    </button>
                </form>

                <div style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center' }}>
                    <p className="text-secondary">
                        Don't have an account?{' '}
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onSwitchToRegister();
                            }}
                            style={{ color: 'var(--color-primary)', textDecoration: 'none', cursor: 'pointer' }}
                        >
                            Register here
                        </a>
                    </p>
                </div>

                <div style={{ marginTop: 'var(--spacing-xl)', paddingTop: 'var(--spacing-lg)', borderTop: '1px solid var(--color-border)', textAlign: 'center' }}>
                    <p className="text-xs text-secondary">Demo Credentials:</p>
                    <p className="text-xs text-secondary">admin@elzoz.com / admin123</p>
                </div>
            </div>
        </div>
    );
};
