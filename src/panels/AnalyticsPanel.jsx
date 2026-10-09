'use client';

import React, { useContext, useMemo } from 'react';
import { BarChart3, TrendingUp, User, Mail, ArrowUp, ArrowDown, CheckCircle2, XCircle } from 'lucide-react';
import { AccountContext } from '../context/AccountContext';
import { ProjectContext } from '../context/ProjectContext';
import { useTranslation } from '../hooks/useTranslation';

export default function AnalyticsPanel() {
    const accountContext = useContext(AccountContext);
    const projectContext = useContext(ProjectContext);
    const { t, isArabic, dir } = useTranslation();

    // Add fallback for contexts that might not be initialized yet
    const currentAccount = accountContext?.currentAccount;
    const projectState = projectContext?.projectState || {};
    const usage = currentAccount?.usage || [];

    // Calculate analytics metrics from real usage data
    const analytics = useMemo(() => {
        if (!usage || usage.length === 0) {
            return {
                totalProcessed: 0,
                totalCreditsUsed: 0,
                successCount: 0,
                failureCount: 0,
                successRate: 0,
                avgItemsPerBatch: 0,
                avgCreditsPerBatch: 0,
                totalBatches: 0,
                lastBatchDate: null
            };
        }

        const totalBatches = usage.length;
        const totalProcessed = usage.reduce((sum, u) => sum + (u.itemsProcessed || 0), 0);
        const totalCreditsUsed = usage.reduce((sum, u) => sum + (u.creditsUsed || 0), 0);
        const successCount = usage.reduce((sum, u) => sum + (u.successful || 0), 0);
        const failureCount = usage.reduce((sum, u) => sum + (u.failed || 0), 0);
        const successRate = totalProcessed > 0 ? Math.round((successCount / totalProcessed) * 100) : 0;
        const avgItemsPerBatch = totalBatches > 0 ? Math.round(totalProcessed / totalBatches) : 0;
        const avgCreditsPerBatch = totalBatches > 0 ? Math.round(totalCreditsUsed / totalBatches) : 0;
        const lastBatchDate = usage.length > 0 ? new Date(usage[usage.length - 1].timestamp) : null;

        return {
            totalProcessed,
            totalCreditsUsed,
            successCount,
            failureCount,
            successRate,
            avgItemsPerBatch,
            avgCreditsPerBatch,
            totalBatches,
            lastBatchDate
        };
    }, [usage]);

    // Get data for the last 7 batches (or fewer if less history exists)
    const recentBatches = useMemo(() => {
        return usage.slice(-7).reverse().map((item, idx) => ({
            index: idx + 1,
            items: item.itemsProcessed || 0,
            credits: item.creditsUsed || 0,
            date: new Date(item.timestamp)
        }));
    }, [usage]);

    // Calculate trends
    const creditsTrend = useMemo(() => {
        if (usage.length < 2) return 0;
        const recent = usage.slice(-5);
        const avgRecent = recent.reduce((sum, u) => sum + (u.creditsUsed || 0), 0) / recent.length;
        const older = usage.slice(-10, -5);
        const avgOlder = older.length > 0 ? older.reduce((sum, u) => sum + (u.creditsUsed || 0), 0) / older.length : avgRecent;
        return avgOlder > 0 ? Math.round(((avgRecent - avgOlder) / avgOlder) * 100) : 0;
    }, [usage]);

    const StatCard = ({ title, value, subtitle, color = 'var(--color-primary)', trend = null }) => (
        <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
            <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '600', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                {title}
            </div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                <div style={{ fontSize: '36px', fontWeight: '700', color: color, direction: dir }}>
                    {value}
                </div>
                {trend !== null && (
                    <div style={{ fontSize: '12px', color: trend > 0 ? 'var(--color-warning)' : 'var(--color-accent-emerald)', fontWeight: '600', direction: dir }}>
                        {trend > 0 ? <ArrowUp size={16} style={{ display: 'inline', verticalAlign: 'middle' }} /> : <ArrowDown size={16} style={{ display: 'inline', verticalAlign: 'middle' }} />} {Math.abs(trend)}%
                    </div>
                )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-sm)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                {subtitle}
            </div>
        </div>
    );

    return (
        <div className="panel-content" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
            {/* Main Analytics Stats */}
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', margin: '0 0 var(--spacing-xs) 0' }}>{t('analytics.title')}</h2>
                    <p style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', color: 'var(--color-text-secondary)', margin: 0, fontSize: '12px' }}>
                        {analytics.totalBatches} {t('analytics.batch')} • {analytics.lastBatchDate ? analytics.lastBatchDate.toLocaleDateString(isArabic ? 'ar-EG' : 'en-US') : 'No data'}
                    </p>
                </div>

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: 'var(--spacing-lg)',
                    marginBottom: 'var(--spacing-lg)',
                    direction: dir,
                    textAlign: isArabic ? 'right' : 'left'
                }}>
                    <StatCard
                        title={t('analytics.totalDesigns')}
                        value={analytics.totalProcessed}
                        subtitle={t('analytics.designsGenerated')}
                        color="var(--color-primary)"
                    />

                    <StatCard
                        title={t('analytics.creditsUsed')}
                        value={analytics.totalCreditsUsed}
                        subtitle={t('analytics.totalCredits')}
                        color="var(--color-warning)"
                        trend={creditsTrend}
                    />

                    <StatCard
                        title={t('analytics.remaining')}
                        value={currentAccount?.credits || 0}
                        subtitle={t('analytics.creditsAvailable')}
                        color="var(--color-accent-emerald)"
                    />

                    <StatCard
                        title={t('analytics.successRate')}
                        value={analytics.successRate + '%'}
                        subtitle={t('analytics.completionRate')}
                        color="var(--color-accent-teal)"
                    />
                </div>
            </div>

            {/* Detailed Metrics */}
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ margin: 0, direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '8px' }}><BarChart3 size={20} style={{ color: 'var(--color-primary)' }} /> {t('common.details')}</h3>
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
                    gap: 'var(--spacing-lg)',
                    direction: dir
                }}>
                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {t('common.successful')}
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-accent-emerald)', direction: dir }}>
                            {analytics.successCount}
                        </div>
                    </div>

                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {t('common.failed')}
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-accent-red)', direction: dir }}>
                            {analytics.failureCount}
                        </div>
                    </div>

                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {t('common.average')} / Batch
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-primary)', direction: dir }}>
                            {analytics.avgItemsPerBatch}
                        </div>
                    </div>

                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ fontSize: '11px', color: 'var(--color-text-tertiary)', textTransform: 'uppercase', fontWeight: '600', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            Avg Credits / Batch
                        </div>
                        <div style={{ fontSize: '24px', fontWeight: '700', color: 'var(--color-warning)', direction: dir }}>
                            {analytics.avgCreditsPerBatch}
                        </div>
                    </div>
                </div>
            </div>

            {/* Processing History */}
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ margin: 0, direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '8px' }}><TrendingUp size={20} style={{ color: 'var(--color-primary)' }} /> {t('analytics.processingHistory')}</h3>
                </div>
                <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    {usage.length === 0 ? (
                        <div className="empty-state" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            <div className="empty-state-icon"><BarChart3 size={32} style={{ color: 'var(--color-text-tertiary)' }} /></div>
                            <div className="empty-state-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('analytics.noHistory')}</div>
                            <div className="empty-state-description" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('analytics.startBatchJob')}</div>
                        </div>
                    ) : (
                        <div style={{
                            display: 'flex',
                            flexDirection: 'column',
                            gap: 'var(--spacing-sm)',
                            marginTop: 'var(--spacing-md)',
                            direction: dir
                        }}>
                            {usage.slice().reverse().map((item, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--color-bg-tertiary)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-border)',
                                        fontSize: '12px',
                                        transition: 'all 0.2s ease',
                                        direction: dir,
                                        textAlign: isArabic ? 'right' : 'left'
                                    }}
                                >
                                    <div style={{
                                        display: 'flex',
                                        justifyContent: isArabic ? 'flex-end' : 'space-between',
                                        alignItems: 'center',
                                        marginBottom: 'var(--spacing-sm)',
                                        flexDirection: isArabic ? 'row-reverse' : 'row',
                                        direction: dir
                                    }}>
                                        <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                            <strong style={{ color: 'var(--color-text-primary)' }}>
                                                Batch {usage.length - idx}: {item.itemsProcessed || 0} {t('analytics.items')}
                                            </strong>
                                            <span style={{ color: 'var(--color-text-secondary)', fontSize: '11px', marginLeft: isArabic ? 0 : '8px', marginRight: isArabic ? '8px' : 0, direction: dir }}>
                                                <div style={{ display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '4px' }}>• {item.successful || 0} <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} /> {item.failed || 0} <XCircle size={14} style={{ color: 'var(--color-error)' }} /></div>
                                            </span>
                                        </div>
                                        <span className="badge warning" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                            -{item.creditsUsed || 0} {t('common.credit')}
                                        </span>
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '11px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                        {new Date(item.timestamp).toLocaleString(isArabic ? 'ar-EG' : 'en-US')}
                                    </div>
                                    {item.formats && item.formats.length > 0 && (
                                        <div style={{
                                            marginTop: 'var(--spacing-sm)',
                                            display: 'flex',
                                            gap: 'var(--spacing-xs)',
                                            flexWrap: 'wrap',
                                            flexDirection: isArabic ? 'row-reverse' : 'row',
                                            direction: dir
                                        }}>
                                            {item.formats.map(fmt => (
                                                <span
                                                    key={fmt}
                                                    className="badge info"
                                                    style={{ fontSize: '11px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                                                >
                                                    {fmt.toUpperCase()}
                                                </span>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>

            {/* Account Information */}
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ margin: 0, direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '8px' }}><User size={20} style={{ color: 'var(--color-primary)' }} /> {t('common.account')}</h3>
                </div>
                <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <div style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--spacing-md)',
                        direction: dir
                    }}>
                        <div style={{
                            display: 'flex',
                            justifyContent: isArabic ? 'flex-end' : 'space-between',
                            alignItems: 'center',
                            padding: 'var(--spacing-md)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            flexDirection: isArabic ? 'row-reverse' : 'row',
                            direction: dir
                        }}>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Mail size={14} /> Email</span>
                                <strong style={{ display: 'block', fontSize: '13px', marginTop: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left', wordBreak: 'break-all' }}>
                                    {currentAccount?.email || 'Not available'}
                                </strong>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: isArabic ? 'flex-end' : 'space-between',
                            alignItems: 'center',
                            padding: 'var(--spacing-md)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            flexDirection: isArabic ? 'row-reverse' : 'row',
                            direction: dir
                        }}>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>{t('common.accountName')}</span>
                                <strong style={{ display: 'block', fontSize: '14px', marginTop: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                    {currentAccount?.name || 'Unknown'}
                                </strong>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: isArabic ? 'flex-end' : 'space-between',
                            alignItems: 'center',
                            padding: 'var(--spacing-md)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            flexDirection: isArabic ? 'row-reverse' : 'row',
                            direction: dir
                        }}>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>{t('common.memberSince')}</span>
                                <strong style={{ display: 'block', fontSize: '14px', marginTop: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                    {currentAccount?.createdAt ? new Date(currentAccount.createdAt).toLocaleDateString(isArabic ? 'ar-EG' : 'en-US') : 'N/A'}
                                </strong>
                            </div>
                        </div>

                        <div style={{
                            display: 'flex',
                            justifyContent: isArabic ? 'flex-end' : 'space-between',
                            alignItems: 'center',
                            padding: 'var(--spacing-md)',
                            background: 'var(--color-bg-tertiary)',
                            borderRadius: 'var(--radius-md)',
                            border: '1px solid var(--color-border)',
                            flexDirection: isArabic ? 'row-reverse' : 'row',
                            direction: dir
                        }}>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>{t('analytics.totalBatches') || 'Total Batches'}</span>
                                <strong style={{ display: 'block', fontSize: '14px', marginTop: 'var(--spacing-xs)', color: 'var(--color-primary)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                    {analytics.totalBatches}
                                </strong>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
