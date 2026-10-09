'use client';

import React from 'react';

export default function PreflightReport({ validationResult, onFixFiles, onSkipImages, onProceed, onCancel }) {
    const { isValid, totalRows, totalMappings, totalMismatches, folderAnalysis, recommendations } = validationResult;

    React.useEffect(() => {

    }, [validationResult]);

    const getStatusIcon = (status) => {
        switch (status) {
            case 'all_ok': return '✅';
            case 'mismatches_found': return '❌';
            case 'folder_not_selected': return '⚠️';
            case 'folder_read_error': return '❌';
            default: return '❓';
        }
    };

    const getStatusColor = (status) => {
        switch (status) {
            case 'all_ok': return 'var(--color-success)';
            case 'mismatches_found': return 'var(--color-danger)';
            case 'folder_not_selected': return 'var(--color-warning)';
            case 'folder_read_error': return 'var(--color-danger)';
            default: return 'var(--color-text-secondary)';
        }
    };

    return (
        <div style={{
            background: 'var(--color-bg-primary)',
            borderRadius: 'var(--radius-lg)',
            padding: 'var(--spacing-lg)',
            marginBottom: 'var(--spacing-lg)',
            border: '2px solid ' + (isValid ? 'var(--color-success)' : 'var(--color-danger)')
        }}>
            {/* Header */}
            <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)', marginBottom: 'var(--spacing-md)' }}>
                    <div style={{ fontSize: '32px' }}>
                        {isValid ? '✅' : '⚠️'}
                    </div>
                    <div>
                        <h2 style={{ margin: '0', color: isValid ? 'var(--color-success)' : 'var(--color-warning)' }}>
                            {isValid ? 'Preflight Check Passed' : 'Preflight Check - Issues Found'}
                        </h2>
                        <p style={{ margin: '4px 0 0 0', fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                            {totalMappings === 0 ? 'No image mappings configured' : `${totalMismatches} issue(s) found`}
                        </p>
                    </div>
                </div>
            </div>

            {/* Summary Stats */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
                gap: 'var(--spacing-md)',
                marginBottom: 'var(--spacing-lg)',
                padding: 'var(--spacing-lg)',
                background: 'rgba(0, 0, 0, 0.1)',
                borderRadius: 'var(--radius-md)'
            }}>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Rows to Process</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{totalRows}</div>
                </div>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Image Mappings</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: 'var(--color-text-primary)' }}>{totalMappings}</div>
                </div>
                <div>
                    <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: '4px' }}>Issues Found</div>
                    <div style={{ fontSize: '20px', fontWeight: '700', color: totalMismatches > 0 ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {totalMismatches}
                    </div>
                </div>
            </div>

            {/* Folder Analysis */}
            {Object.entries(folderAnalysis).length > 0 && (
                <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0', fontSize: '14px', fontWeight: '600' }}>Folder Analysis</h3>
                    {Object.entries(folderAnalysis).map(([folderName, analysis]) => (
                        <div key={folderName} style={{
                            marginBottom: 'var(--spacing-md)',
                            padding: 'var(--spacing-md)',
                            background: 'rgba(0, 0, 0, 0.2)',
                            borderLeft: `4px solid ${getStatusColor(analysis.status)}`,
                            borderRadius: 'var(--radius-md)'
                        }}>
                            {/* Folder Header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', marginBottom: 'var(--spacing-sm)' }}>
                                <span style={{ fontSize: '18px' }}>{getStatusIcon(analysis.status)}</span>
                                <span style={{ fontSize: '13px', fontWeight: '600' }}>📁 {folderName}</span>
                                {analysis.status === 'all_ok' && (
                                    <span style={{ marginLeft: 'auto', fontSize: '11px', color: 'var(--color-success)' }}>
                                        ✓ All {analysis.totalAvailable} files OK
                                    </span>
                                )}
                            </div>

                            {/* Status Message */}
                            {analysis.message && (
                                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                                    {analysis.message}
                                </div>
                            )}

                            {/* Missing Files */}
                            {analysis.missingFiles && analysis.missingFiles.length > 0 && (
                                <div style={{ marginBottom: 'var(--spacing-sm)' }}>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-danger)', marginBottom: '4px' }}>
                                        Missing ({analysis.missingFiles.length}):
                                    </div>
                                    <div style={{
                                        background: 'rgba(255, 0, 0, 0.1)',
                                        borderRadius: '2px',
                                        padding: 'var(--spacing-sm)',
                                        fontSize: '10px',
                                        color: 'var(--color-text-secondary)',
                                        fontFamily: 'monospace',
                                        maxHeight: '100px',
                                        overflowY: 'auto'
                                    }}>
                                        {analysis.missingFiles.map((f, idx) => (
                                            <div key={idx}>❌ {f}</div>
                                        ))}
                                    </div>
                                    {analysis.affectedRows.length > 0 && (
                                        <div style={{ fontSize: '10px', color: 'var(--color-text-secondary)', marginTop: '4px' }}>
                                            Affects rows: {analysis.affectedRows.slice(0, 5).join(', ')}{analysis.affectedRows.length > 5 ? '...' : ''}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Available Files */}
                            {analysis.availableFiles && analysis.availableFiles.length > 0 && (
                                <div>
                                    <div style={{ fontSize: '11px', fontWeight: '600', color: 'var(--color-success)', marginBottom: '4px' }}>
                                        Available ({analysis.availableFiles.length}):
                                    </div>
                                    <div style={{
                                        background: 'rgba(0, 255, 0, 0.05)',
                                        borderRadius: '2px',
                                        padding: 'var(--spacing-sm)',
                                        fontSize: '10px',
                                        color: 'var(--color-text-secondary)',
                                        fontFamily: 'monospace',
                                        maxHeight: '100px',
                                        overflowY: 'auto'
                                    }}>
                                        {analysis.availableFiles.map((f, idx) => (
                                            <div key={idx}>✅ {f}</div>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {/* Action Buttons */}
            <div style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                flexWrap: 'wrap'
            }}>
                {isValid ? (
                    <button
                        onClick={onProceed}
                        style={{
                            padding: 'var(--spacing-md) var(--spacing-lg)',
                            background: 'var(--color-success)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: '13px',
                            fontWeight: '600',
                            flex: '1'
                        }}
                    >
                        ✅ All Good - Execute
                    </button>
                ) : (
                    <>
                        <button
                            onClick={() => {
                                onFixFiles();
                            }}
                            style={{
                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                background: 'var(--color-primary)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '600',
                                flex: '1'
                            }}
                        >
                            🔧 Fix Files First
                        </button>
                        <button
                            onClick={() => {

                                onSkipImages();
                            }}
                            style={{
                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                background: 'var(--color-warning)',
                                color: 'white',
                                border: 'none',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                fontSize: '13px',
                                fontWeight: '600',
                                flex: '1'
                            }}
                        >
                            ⏭️  Skip Images & Execute
                        </button>
                    </>
                )}
                <button
                    onClick={onCancel}
                    style={{
                        padding: 'var(--spacing-md) var(--spacing-lg)',
                        background: 'transparent',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: '13px',
                        fontWeight: '600'
                    }}
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}
