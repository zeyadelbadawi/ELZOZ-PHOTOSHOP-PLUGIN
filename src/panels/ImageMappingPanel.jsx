'use client';

import React, { useContext, useState, useEffect } from 'react';
import { Settings, Folder, MapPin } from 'lucide-react';
import { ProjectContext } from '../context/ProjectContext';
import { useTranslation } from '../hooks/useTranslation';

export default function ImageMappingPanel() {
    const { projectState, updateProjectState } = useContext(ProjectContext);
    const { t, isArabic, dir } = useTranslation();
    const { imageLayers, excelColumns, imageFolderSelections, imageMappingRules } = projectState;

    const [selectedLayer, setSelectedLayer] = useState(null);
    const [selectedFolder, setSelectedFolder] = useState('');
    const [selectedColumn, setSelectedColumn] = useState('');
    const [layerMappings, setLayerMappings] = useState({});

    // Sync imageMappingRules from projectState on mount and updates
    useEffect(() => {

        setLayerMappings(imageMappingRules || {});
    }, [imageMappingRules]);

    const handleAddMapping = () => {
        console.log('  ===== ADD IMAGE MAPPING: START =====');
        console.log('  Selected Layer:', JSON.stringify(selectedLayer));
        console.log('  Selected Folder:', selectedFolder);
        console.log('  Selected Column:', selectedColumn);

        if (!selectedLayer || !selectedFolder || !selectedColumn) {
            console.warn('  VALIDATION ERROR - Please select layer, folder, and column');
            console.warn('  selectedLayer:', selectedLayer ? 'YES' : 'NO');
            console.warn('  selectedFolder:', selectedFolder ? 'YES' : 'NO');
            console.warn('  selectedColumn:', selectedColumn ? 'YES' : 'NO');
            return;
        }

        const newRules = {
            ...imageMappingRules,
            [selectedLayer.id]: {
                layerId: selectedLayer.id,
                layerName: selectedLayer.name,
                folderName: selectedFolder,
                columnName: selectedColumn
            }
        };

        console.log('  New imageMappingRules:', JSON.stringify(newRules, null, 2));

        // Save to project state immediately
        updateProjectState({
            imageMappingRules: newRules
        });

        console.log('  Project state updated with imageMappingRules');
        console.log('  ===== ADD IMAGE MAPPING: END =====');

        // Reset form
        setSelectedLayer(null);
        setSelectedFolder('');
        setSelectedColumn('');
    };

    const handleRemoveMapping = (layerId) => {
        console.log('  ===== REMOVE IMAGE MAPPING: START =====');
        console.log('  Removing mapping for layer ID:', layerId);

        const updatedRules = Object.fromEntries(
            Object.entries(imageMappingRules || {}).filter(([key]) => key !== layerId.toString())
        );

        console.log('  Updated imageMappingRules after removal:', JSON.stringify(updatedRules, null, 2));

        updateProjectState({
            imageMappingRules: updatedRules
        });

        console.log('  ===== REMOVE IMAGE MAPPING: END =====');
    };

    if (!imageLayers || imageLayers.length === 0) {
        return (
            <div className="panel-content" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center',
                direction: dir
            }}>
                <div className="empty-state">
                    <div className="empty-state-icon">🖼️</div>
                    <div className="empty-state-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.noImageLayers')}</div>
                    <div className="empty-state-description" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {t('imageMapping.selectPSDWithImageLayers')}
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-content" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
            <div className="section">
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ margin: '0 0 var(--spacing-xs) 0', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.title')}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>
                        {t('imageMapping.description')}
                    </span>
                </div>

                <div className="alert info" style={{ marginBottom: 'var(--spacing-lg)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                    <span style={{ fontSize: '18px', flexShrink: 0 }}>ℹ️</span>
                    <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <strong>{t('imageMapping.mapImageLayersToData')}</strong>
                        <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px', direction: dir }}>
                            {t('imageMapping.mapImageLayersDesc')}
                        </p>
                    </div>
                </div>

                {/* Configuration Form */}
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '8px' }}><Settings size={20} /> {t('imageMapping.addMapping')}</h3>

                    <div className="form-group" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <label className="form-label" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.selectLayer')}</label>
                        <select
                            value={selectedLayer?.id || ''}
                            onChange={(e) => {
                                const layer = imageLayers.find(l => l.id.toString() === e.target.value);
                                setSelectedLayer(layer || null);
                            }}
                            className="form-input"
                            style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                        >
                            <option value="">{t('imageMapping.chooseImageLayer')}</option>
                            {imageLayers.map(layer => (
                                <option key={layer.id} value={layer.id}>
                                    {layer.name} ({layer.kind === 'smartObject' ? t('imageMapping.smartObject') : t('imageMapping.raster')})
                                </option>
                            ))}
                        </select>
                    </div>

                    <div className="form-group" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <label className="form-label" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.folderName')}</label>
                        <select
                            value={selectedFolder}
                            onChange={(e) => {
                                console.log('  Folder selected:', e.target.value);
                                setSelectedFolder(e.target.value);
                            }}
                            className="form-input"
                            style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                        >
                            <option value="">{t('imageMapping.chooseFolderLabel')}</option>
                            {Object.entries(imageFolderSelections || {}).map(([layerId, selection]) => {
                                const folderName = selection.path.split('/').pop();
                                console.log('  Rendering folder option:', folderName, 'for layer:', layerId);
                                return (
                                    <option key={layerId} value={folderName}>
                                        {folderName}
                                    </option>
                                );
                            })}
                        </select>
                        <div style={{
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                            marginTop: 'var(--spacing-sm)',
                            direction: dir,
                            textAlign: isArabic ? 'right' : 'left'
                        }}>
                            {t('imageMapping.selectFromSetupTab')}
                        </div>
                    </div>

                    <div className="form-group" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <label className="form-label" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.columnWithImageFilenames')}</label>
                        <select
                            value={selectedColumn}
                            onChange={(e) => setSelectedColumn(e.target.value)}
                            className="form-input"
                            style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                        >
                            <option value="">{t('imageMapping.chooseColumnLabel')}</option>
                            {excelColumns.map(col => (
                                <option key={col} value={col}>{col}</option>
                            ))}
                        </select>
                        <div style={{
                            fontSize: '11px',
                            color: 'var(--color-text-secondary)',
                            marginTop: 'var(--spacing-sm)',
                            direction: dir,
                            textAlign: isArabic ? 'right' : 'left'
                        }}>
                            {t('imageMapping.columnContainsImageFilenames')}
                        </div>
                    </div>

                    <button
                        onClick={handleAddMapping}
                        style={{ width: '100%', marginTop: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}
                    >
                        {t('imageMapping.addMapping')}
                    </button>
                </div>

                {/* Existing Mappings */}
                {Object.keys(layerMappings).length > 0 && (
                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('imageMapping.activeMappings')}</h3>

                        {Object.values(layerMappings).map(mapping => (
                            <div
                                key={mapping.layerId}
                                style={{
                                    padding: 'var(--spacing-md)',
                                    marginBottom: 'var(--spacing-md)',
                                    backgroundColor: 'rgba(16, 185, 129, 0.1)',
                                    border: '1px solid var(--color-success)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    justifyContent: isArabic ? 'flex-start' : 'space-between',
                                    alignItems: 'start',
                                    flexDirection: isArabic ? 'row-reverse' : 'row',
                                    direction: dir
                                }}
                            >
                                <div style={{ flex: 1, direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                    <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                        {mapping.layerName}
                                    </div>
                                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                        <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', alignItems: 'center', gap: '4px' }}><Folder size={14} /> {t('imageMapping.folder')}: <strong>{mapping.folderName}</strong></div>
                                        <div style={{ marginTop: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>📄 {t('imageMapping.column')}: <strong>{mapping.columnName}</strong></div>
                                    </div>
                                </div>
                                <button
                                    onClick={() => handleRemoveMapping(mapping.layerId)}
                                    className="danger"
                                    style={{
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        fontSize: '11px',
                                        whiteSpace: 'nowrap',
                                        marginLeft: isArabic ? 'auto' : '0',
                                        marginRight: isArabic ? '0' : 'auto',
                                        direction: dir,
                                        textAlign: isArabic ? 'right' : 'left'
                                    }}
                                >
                                    {t('mapping.remove')}
                                </button>
                            </div>
                        ))}
                    </div>
                )}

                {Object.keys(layerMappings).length === 0 && (
                    <div className="alert" style={{ background: 'var(--color-bg-tertiary)', border: '1px dashed var(--color-border)', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                        <span style={{ fontSize: '18px', flexShrink: 0 }}><MapPin size={18} style={{ color: 'var(--color-primary)' }} /></span>
                        <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            <strong>{t('imageMapping.noMappingsYet')}</strong>
                            <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                {t('imageMapping.addMappingsAbove')}
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
