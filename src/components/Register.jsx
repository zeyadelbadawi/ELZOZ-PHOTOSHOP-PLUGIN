'use client';

import React, { useState } from 'react';

export const Register = ({ onRegisterSuccess, onSwitchToLogin }) => {
    const [formData, setFormData] = useState({
        name: '',
        email: '',
        password: '',
        confirmPassword: ''
    });
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const handleChange = (e) => {
        const { name, value } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: value
        }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            // Validation
            if (!formData.name || !formData.email || !formData.password || !formData.confirmPassword) {
                throw new Error('Please fill in all fields');
            }

            if (!formData.email.includes('@')) {
                throw new Error('Please enter a valid email');
            }

            if (formData.password.length < 6) {
                throw new Error('Password must be at least 6 characters');
            }

            if (formData.password !== formData.confirmPassword) {
                throw new Error('Passwords do not match');
            }

            // Get existing users
            const usersData = localStorage.getItem('elzoz_users');
            const users = usersData ? JSON.parse(usersData) : [];

            // Check if email already exists
            if (users.some(u => u.email === formData.email)) {
                throw new Error('Email already registered');
            }

            // Create new user (in production, hash password with bcrypt)
            const newUser = {
                id: Date.now().toString(),
                name: formData.name,
                email: formData.email,
                password: formData.password, // In production, hash this!
                credits: 100, // New users get 100 credits
                accountType: 'free',
                createdAt: new Date().toISOString()
            };

            // Save user
            users.push(newUser);
            localStorage.setItem('elzoz_users', JSON.stringify(users));

            // Set current session
            localStorage.setItem('elzoz_current_user', JSON.stringify({
                id: newUser.id,
                email: newUser.email,
                name: newUser.name,
                credits: newUser.credits,
                accountType: newUser.accountType
            }));

            onRegisterSuccess(newUser);
        } catch (err) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="panel" style={{ justifyContent: 'center', padding: 'var(--spacing-lg)' }}>
            <div style={{ maxWidth: '300px', width: '100%' }}>
                <h1 style={{ textAlign: 'center', marginBottom: 'var(--spacing-xl)' }}>Create Account</h1>

                {error && (
                    <div className="alert danger" style={{ marginBottom: 'var(--spacing-md)' }}>
                        {error}
                    </div>
                )}

                <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                    <div className="form-group">
                        <label className="form-label">Full Name</label>
                        <input
                            className="form-input"
                            type="text"
                            name="name"
                            value={formData.name}
                            onChange={handleChange}
                            placeholder="Your Name"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Email</label>
                        <input
                            className="form-input"
                            type="email"
                            name="email"
                            value={formData.email}
                            onChange={handleChange}
                            placeholder="your@email.com"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Password</label>
                        <input
                            className="form-input"
                            type="password"
                            name="password"
                            value={formData.password}
                            onChange={handleChange}
                            placeholder="••••••••"
                            disabled={loading}
                        />
                    </div>

                    <div className="form-group">
                        <label className="form-label">Confirm Password</label>
                        <input
                            className="form-input"
                            type="password"
                            name="confirmPassword"
                            value={formData.confirmPassword}
                            onChange={handleChange}
                            placeholder="••••••••"
                            disabled={loading}
                        />
                    </div>

                    <button type="submit" disabled={loading} style={{ width: '100%' }}>
                        {loading ? (
                            <span className="flex items-center justify-center gap-sm">
                                <span className="spinner"></span> Creating...
                            </span>
                        ) : (
                            'Create Account'
                        )}
                    </button>
                </form>

                <div style={{ marginTop: 'var(--spacing-lg)', textAlign: 'center' }}>
                    <p className="text-secondary">
                        Already have an account?{' '}
                        <a
                            href="#"
                            onClick={(e) => {
                                e.preventDefault();
                                onSwitchToLogin();
                            }}
                            style={{ color: 'var(--color-primary)', textDecoration: 'none', cursor: 'pointer' }}
                        >
                            Login here
                        </a>
                    </p>
                </div>
            </div>
        </div>
    );
};
