'use client';

import React, { useContext } from 'react';
import { ProjectContext } from '../context/ProjectContext';
import { useTranslation } from '../hooks/useTranslation';

export default function MappingPanel() {
    const { projectState, setMapping } = useContext(ProjectContext);
    const { t, isArabic, dir } = useTranslation();
    const { excelColumns, psdLayers, mapping } = projectState;

    // Filter to show only TEXT layers (the only type that can be edited)
    const textLayers = psdLayers.filter(layer => layer.kind === 'text');
    const nonTextLayers = psdLayers.filter(layer => layer.kind !== 'text');

    if (!excelColumns.length || !psdLayers.length) {
        return (
            <div className="panel-content" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                direction: dir
            }}>
                <div className="empty-state">
                    <div className="empty-state-icon">⚙️</div>
                    <div className="empty-state-title">{t('execute.noExcelFile')}</div>
                    <div className="empty-state-description">{t('setup.description')}</div>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-content" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', margin: '0 0 var(--spacing-xs) 0' }}>{t('mapping.title')}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>{t('mapping.description')}</span>
                </div>

                {/* Warning if no text layers found */}
                {textLayers.length === 0 && (
                    <div style={{ marginBottom: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div className="alert danger" style={{ marginBottom: 'var(--spacing-lg)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                            <span style={{ fontSize: '18px', flexShrink: 0 }}>⚠️</span>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <strong>{t('mapping.noTextLayers')}</strong>
                                <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px', direction: dir }}>
                                    {t('mapping.noTextLayersDesc')}
                                    {nonTextLayers.length > 0 && ` ${t('mapping.foundNonText')} ${nonTextLayers.length} ${nonTextLayers.map(l => l.kind).filter((v, i, a) => a.indexOf(v) === i).join(', ')}.`}
                                </p>
                            </div>
                        </div>

                        <div className="card" style={{ marginBottom: 'var(--spacing-lg)', direction: dir }}>
                            <h4 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.howToFix')}</h4>
                            <ol style={{ margin: '0', paddingLeft: isArabic ? '0' : '20px', paddingRight: isArabic ? '20px' : '0', fontSize: '13px', lineHeight: '1.6', color: 'var(--color-text-secondary)', direction: dir, textAlign: isArabic ? 'right' : 'left', listStylePosition: isArabic ? 'inside' : 'outside' }}>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('mapping.step1')}</li>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('mapping.step2')}</li>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('mapping.step3')}</li>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('mapping.step4')}</li>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('mapping.step5')}</li>
                                <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.step6')}</li>
                            </ol>
                        </div>

                        <div className="alert info" style={{ flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                            <span style={{ fontSize: '18px', flexShrink: 0 }}>💡</span>
                            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <strong>{t('mapping.smartObjects')}</strong>
                                <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px', direction: dir }}>
                                    {t('mapping.smartObjectsDesc')}
                                </p>
                            </div>
                        </div>
                    </div>
                )}

                {/* Info about non-text layers */}
                {nonTextLayers.length > 0 && (
                    <div className="alert info" style={{ marginBottom: 'var(--spacing-lg)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                        <span style={{ fontSize: '18px', flexShrink: 0 }}>ℹ️</span>
                        <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            <strong>{t('mapping.textLayersOnly')}</strong>
                            <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px', direction: dir }}>
                                {t('mapping.textLayersOnlyDesc')} {nonTextLayers.length} {t('mapping.nonTextLayersAvailable')}
                            </p>
                        </div>
                    </div>
                )}

                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spacing-lg)',
                    marginTop: 'var(--spacing-lg)',
                    direction: dir,
                    textAlign: isArabic ? 'right' : 'left'
                }}>
                    {/* Excel Columns */}
                    <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.excelColumns')}</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {excelColumns.map(col => (
                                <div
                                    key={col}
                                    style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--color-bg-secondary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        transition: 'all 0.2s ease',
                                        borderLeftWidth: isArabic ? '0' : '3px',
                                        borderRightWidth: isArabic ? '3px' : '0',
                                        borderLeftColor: isArabic ? 'transparent' : (mapping[col] ? 'var(--color-primary)' : 'transparent'),
                                        borderRightColor: isArabic ? (mapping[col] ? 'var(--color-primary)' : 'transparent') : 'transparent',
                                        direction: dir,
                                        textAlign: isArabic ? 'right' : 'left'
                                    }}
                                >
                                    <div style={{ fontWeight: '600', fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{col}</div>
                                    {mapping[col] && (
                                        <div style={{
                                            fontSize: '11px',
                                            color: 'var(--color-primary)',
                                            marginTop: 'var(--spacing-xs)',
                                            direction: dir,
                                            textAlign: isArabic ? 'right' : 'left'
                                        }}>
                                            {isArabic ? '← ' : '→ '} {typeof mapping[col] === 'object' ? mapping[col].name : mapping[col]}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* PSD Layers - Only Text Layers */}
                    <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.textLayers')} ({textLayers.length})</h3>
                        {textLayers.length === 0 ? (
                            <div className="empty-state" style={{ padding: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <div className="empty-state-icon">🔤</div>
                                <div className="empty-state-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.noTextLayersTitle')}</div>
                                <div className="empty-state-description" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.noTextLayersDesc2')}</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                {textLayers.map(layer => {
                                    // Check if layer is mapped (supports both old and new format)
                                    const columnMappedToThis = Object.entries(mapping).find(([, v]) => {
                                        if (typeof v === 'object') {
                                            return v.id === layer.id || v.name === layer.name;
                                        }
                                        return v === layer.name || v === layer.id;
                                    })?.[0];
                                    return (
                                        <div
                                            key={layer.id}
                                            style={{
                                                padding: 'var(--spacing-md)',
                                                background: columnMappedToThis ? 'rgba(16, 185, 129, 0.15)' : 'var(--color-bg-secondary)',
                                                border: columnMappedToThis ? '1px solid var(--color-success)' : '1px solid var(--color-border)',
                                                borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease'
                                            }}
                                        >
                                            <div style={{ fontWeight: '600', fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{layer.name}</div>
                                            <div style={{
                                                fontSize: '10px',
                                                color: 'var(--color-success)',
                                                marginTop: 'var(--spacing-xs)',
                                                textTransform: 'uppercase',
                                                letterSpacing: '0.5px',
                                                direction: dir,
                                                textAlign: isArabic ? 'right' : 'left'
                                            }}>
                                                {t('mapping.textLayerCheckmark')}
                                            </div>
                                            {columnMappedToThis && (
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: 'var(--color-success)',
                                                    marginTop: 'var(--spacing-xs)',
                                                    fontWeight: '600',
                                                    direction: dir,
                                                    textAlign: isArabic ? 'right' : 'left'
                                                }}>
                                                    {isArabic ? '← ' : '→ '} {columnMappedToThis}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                {/* Mapping Controls */}
                <div className="card" style={{ marginTop: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.createMapping')}</h3>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-md)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                        <div style={{ flex: 1, direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            <label className="form-label" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.selectColumn')}</label>
                            <select id="colSelect" className="form-input" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <option value="">{t('mapping.chooseColumn')}</option>
                                {excelColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                        <div style={{ flex: 1, direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            <label className="form-label" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.selectTextLayer')}</label>
                            <select id="layerSelect" className="form-input" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                <option value="">{t('mapping.chooseTextLayer')}</option>
                                {textLayers.map(layer => (
                                    <option key={layer.id} value={layer.id}>{layer.name}</option>
                                ))}
                                {textLayers.length === 0 && (
                                    <option value="" disabled>{t('mapping.noTextLayersAvailableSelect')}</option>
                                )}
                            </select>
                        </div>
                        <button
                            onClick={() => {
                                const col = document.getElementById('colSelect').value;
                                const selectedLayerId = document.getElementById('layerSelect').value;
                                if (col && selectedLayerId) {
                                    // Find the layer object from textLayers (not psdLayers)
                                    const selectedLayer = textLayers.find(l => l.id == selectedLayerId);
                                    if (selectedLayer) {
                                        // Store as object with both name and ID for better reliability
                                        setMapping(col, {
                                            id: selectedLayer.id,
                                            name: selectedLayer.name
                                        });
                                        document.getElementById('colSelect').value = '';
                                        document.getElementById('layerSelect').value = '';
                                    }
                                } else {
                                    console.warn('  Please select both column and layer');
                                }
                            }}
                            style={{ alignSelf: 'flex-end', marginBottom: '0', direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                        >
                            {t('mapping.addMapping')}
                        </button>
                    </div>
                </div>

                {/* Current Mappings */}
                {Object.keys(mapping).length > 0 && (
                    <div className="card" style={{ marginTop: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <h3 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('mapping.currentMappings')} ({Object.keys(mapping).length})</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)', marginTop: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {Object.entries(mapping).map(([col, mappedValue]) => {
                                // Support both old format (string) and new format (object)
                                const displayName = typeof mappedValue === 'object' ? mappedValue.name : mappedValue;
                                const layerId = typeof mappedValue === 'object' ? mappedValue.id : mappedValue;

                                return (
                                    <div
                                        key={col}
                                        style={{
                                            display: 'flex',
                                            justifyContent: isArabic ? 'flex-start' : 'space-between',
                                            alignItems: 'center',
                                            padding: 'var(--spacing-md)',
                                            background: 'var(--color-bg-tertiary)',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--color-border)',
                                            flexDirection: isArabic ? 'row-reverse' : 'row',
                                            direction: dir
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', direction: dir, textAlign: isArabic ? 'right' : 'left', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                            <strong style={{ color: 'var(--color-text-primary)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{col}</strong>
                                            <span style={{ color: 'var(--color-text-secondary)', margin: '0 var(--spacing-xs)' }}>{isArabic ? '← ' : '→'}</span>
                                            <span style={{ color: 'var(--color-primary)', fontWeight: '600', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{displayName}</span>
                                        </div>
                                        <button
                                            onClick={() => {
                                                const newMapping = { ...mapping };
                                                delete newMapping[col];
                                                // Update by clearing and resetting
                                                Object.keys(mapping).forEach(k => delete mapping[k]);
                                                Object.entries(newMapping).forEach(([c, l]) => setMapping(c, l));
                                            }}
                                            className="danger"
                                            style={{ padding: '6px 14px', fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                                        >
                                            {t('mapping.remove')}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
