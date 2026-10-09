'use client';

import React, { useContext, useState, useEffect } from 'react';
import { Folder, Check, CheckCircle2, Palette, Settings, AlertTriangle } from 'lucide-react';
import { ProjectContext } from '../context/ProjectContext.jsx';
import { useTranslation } from '../hooks/useTranslation';
import { UXPBridge } from '../services/UXPBridge.js';
import { listImagesInFolder, validateImagePatterns } from '../services/ImageValidator.js';

export default function ImagesPanel() {
    const { projectState, setImageMapping, removeImageMapping } = useContext(ProjectContext);
    const { t, isArabic, dir } = useTranslation();
    const { excelColumns, psdLayers, imagesFolder, imageMappingRules } = projectState;

    // Filter to show only image layers (smart objects, raster, pixel layers)
    const imageLayers = psdLayers.filter(layer =>
        layer.kind === 'smartObject' || layer.kind === 'pixel' || layer.kind === 'raster'
    );
    const textLayers = psdLayers.filter(layer => layer.kind === 'text');

    const [selectedImageLayer, setSelectedImageLayer] = useState(null);
    const [selectedColumn, setSelectedColumn] = useState('');
    const [imagePattern, setImagePattern] = useState('');
    const [previewPatterns, setPreviewPatterns] = useState({});

    // Image listing state
    const [foundImages, setFoundImages] = useState([]);
    const [validationResults, setValidationResults] = useState(null);
    const [isValidating, setIsValidating] = useState(false);

    // Load images from folder when it changes
    useEffect(() => {
        const loadImages = async () => {
            if (imagesFolder && projectState.imagesFolderObject) {
                try {
                    const images = await listImagesInFolder(projectState.imagesFolderObject);
                    setFoundImages(images);
                } catch (error) {
                    console.error('  Error loading images:', error);
                    setFoundImages([]);
                }
            } else {
                setFoundImages([]);
            }
        };
        loadImages();
    }, [imagesFolder, projectState.imagesFolderObject]);

    // Validate image patterns when mappings change
    const handleValidatePatterns = async () => {
        if (!projectState.imagesFolderObject || !projectState.excelData || Object.keys(imageMappingRules).length === 0) {
            console.warn('  Cannot validate: missing folder, data, or mappings');
            return;
        }

        try {
            setIsValidating(true);
            const results = await validateImagePatterns(
                projectState.imagesFolderObject,
                projectState.excelData,
                imageMappingRules
            );
            setValidationResults(results);
        } catch (error) {
            console.error('  Validation error:', error);
        } finally {
            setIsValidating(false);
        }
    };

    // Generate preview file paths based on pattern and first row of data
    useEffect(() => {
        if (imagePattern && projectState.excelData.length > 0) {
            const firstRow = projectState.excelData[0];
            let preview = imagePattern;

            Object.entries(firstRow).forEach(([col, value]) => {
                preview = preview.replace(`{${col}}`, value);
            });

            if (selectedImageLayer) {
                setPreviewPatterns(prev => ({
                    ...prev,
                    [selectedImageLayer.id]: preview
                }));
            }
        }
    }, [imagePattern, selectedImageLayer, projectState.excelData]);

    const handleAddImageMapping = () => {
        if (!selectedImageLayer || !selectedColumn || !imagePattern) {
            console.warn('  Please select layer, column, and provide pattern');
            return;
        }

        setImageMapping(selectedImageLayer.id, selectedColumn, imagePattern);


        // Reset form
        setSelectedImageLayer(null);
        setSelectedColumn('');
        setImagePattern('');
    };

    const handleRemoveImageMapping = (layerId) => {
        removeImageMapping(layerId);
    };

    if (!excelColumns.length || !psdLayers.length) {
        return (
            <div className="panel-content" style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                textAlign: 'center'
            }}>
                <div className="empty-state">
                    <div className="empty-state-icon">📋</div>
                    <div className="empty-state-title">Setup Required</div>
                    <div className="empty-state-description">Please complete the Setup tab first to import Excel and PSD files.</div>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-content">
            <div className="section">
                <div className="section-title">
                    <h2>🖼️ Image Mapping</h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)' }}>Step 3 of 5</span>
                </div>

                {/* Info Alert */}
                <div className="alert info" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <span style={{ fontSize: '18px' }}>ℹ️</span>
                    <div>
                        <strong>Dynamic Image Insertion</strong>
                        <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px' }}>
                            Map Excel columns to image layers. Supports smart objects, raster layers, and more. Use naming patterns like {"products/{productId}.jpg"}.
                        </p>
                    </div>
                </div>

                {/* Images Folder Status */}
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Folder size={20} /> Image Folder</h3>
                    <div style={{
                        padding: 'var(--spacing-lg)',
                        background: imagesFolder ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${imagesFolder ? 'var(--color-success)' : 'var(--color-danger)'}`,
                        borderRadius: 'var(--radius-lg)',
                        textAlign: 'center'
                    }}>
                        {imagesFolder ? (
                            <>
                                <div style={{ fontSize: '18px', marginBottom: 'var(--spacing-sm)', color: 'var(--color-success)' }}><Check size={20} /></div>
                                <div style={{ fontWeight: '600', color: 'var(--color-success)', marginBottom: 'var(--spacing-xs)' }}>
                                    Folder Selected
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    {imagesFolder.split('/').pop()}
                                </div>
                            </>
                        ) : (
                            <>
                                <div style={{ fontSize: '18px', marginBottom: 'var(--spacing-sm)' }}>⚠️</div>
                                <div style={{ fontWeight: '600', color: 'var(--color-danger)', marginBottom: 'var(--spacing-xs)' }}>
                                    No Folder Selected
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    Selected in Setup tab
                                </div>
                            </>
                        )}
                    </div>
                </div>

                {/* Found Images List */}
                {imagesFolder && foundImages.length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)' }}>📸 Found Images ({foundImages.length})</h3>
                        <div style={{
                            display: 'grid',
                            gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))',
                            gap: 'var(--spacing-md)'
                        }}>
                            {foundImages.map((img, idx) => (
                                <div
                                    key={idx}
                                    style={{
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--color-bg-secondary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        fontSize: '11px'
                                    }}
                                >
                                    <div style={{ fontWeight: '600', marginBottom: 'var(--spacing-xs)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                        {img.name}
                                    </div>
                                    <div style={{ color: 'var(--color-text-secondary)', fontSize: '10px' }}>
                                        {img.size === -1 ? 'size unknown' : `${img.size}KB`}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}

                {/* Available Image Layers */}
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Palette size={20} /> Available Image Layers ({imageLayers.length})</h3>

                    {imageLayers.length === 0 ? (
                        <div className="empty-state" style={{ padding: 'var(--spacing-lg)' }}>
                            <div className="empty-state-icon">🖼️</div>
                            <div className="empty-state-title">No Image Layers</div>
                            <div className="empty-state-description">
                                Your PSD has no smart objects or raster layers. Add them in Photoshop to enable image insertion.
                            </div>
                        </div>
                    ) : (
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--spacing-md)' }}>
                            {imageLayers.map(layer => {
                                const isMapped = Object.keys(imageMappingRules).includes(layer.id.toString());
                                const mapping = isMapped ? imageMappingRules[layer.id] : null;

                                return (
                                    <div
                                        key={layer.id}
                                        style={{
                                            padding: 'var(--spacing-md)',
                                            background: isMapped ? 'rgba(16, 185, 129, 0.1)' : 'var(--color-bg-secondary)',
                                            border: isMapped ? '1px solid var(--color-success)' : '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-lg)',
                                            transition: 'all 0.2s ease',
                                            cursor: 'pointer'
                                        }}
                                        onClick={() => setSelectedImageLayer(layer)}
                                    >
                                        <div style={{ fontWeight: '600', fontSize: '12px', marginBottom: 'var(--spacing-xs)' }}>
                                            {layer.name}
                                        </div>
                                        <div style={{
                                            fontSize: '10px',
                                            color: 'var(--color-text-secondary)',
                                            textTransform: 'uppercase',
                                            letterSpacing: '0.5px',
                                            marginBottom: 'var(--spacing-sm)'
                                        }}>
                                            {layer.kind === 'smartObject' ? 'Smart Object' :
                                                layer.kind === 'pixel' ? 'Raster Layer' : 'Image Layer'}
                                        </div>

                                        {isMapped && mapping && (
                                            <div style={{
                                                fontSize: '11px',
                                                color: 'var(--color-success)',
                                                padding: 'var(--spacing-sm)',
                                                background: 'rgba(16, 185, 129, 0.2)',
                                                borderRadius: 'var(--radius-md)',
                                                marginBottom: 'var(--spacing-sm)'
                                            }}>
                                                <div style={{ fontWeight: '600', marginBottom: 'var(--spacing-xs)' }}>
                                                    Mapped: {mapping.columnName}
                                                </div>
                                                <div style={{ fontSize: '10px', opacity: 0.8 }}>
                                                    Pattern: {mapping.pattern}
                                                </div>
                                            </div>
                                        )}

                                        <button
                                            onClick={(e) => {
                                                e.stopPropagation();
                                                if (isMapped) {
                                                    handleRemoveImageMapping(layer.id);
                                                } else {
                                                    setSelectedImageLayer(layer);
                                                }
                                            }}
                                            style={{
                                                width: '100%',
                                                padding: 'var(--spacing-sm)',
                                                fontSize: '11px'
                                            }}
                                            className={isMapped ? 'danger' : ''}
                                        >
                                            {isMapped ? 'Remove Mapping' : 'Create Mapping'}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Mapping Configuration */}
                {imageLayers.length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Settings size={20} /> Configure Mapping</h3>

                        {selectedImageLayer ? (
                            <div style={{
                                padding: 'var(--spacing-lg)',
                                background: 'var(--color-bg-tertiary)',
                                borderRadius: 'var(--radius-lg)',
                                border: '1px solid var(--color-border)',
                                marginBottom: 'var(--spacing-lg)'
                            }}>
                                <div style={{ fontWeight: '600', marginBottom: 'var(--spacing-md)', fontSize: '13px' }}>
                                    Selected Layer: {selectedImageLayer.name}
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Excel Column</label>
                                    <select
                                        value={selectedColumn}
                                        onChange={(e) => setSelectedColumn(e.target.value)}
                                        className="form-input"
                                    >
                                        <option value="">Choose a column...</option>
                                        {excelColumns.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="form-group">
                                    <label className="form-label">Image File Pattern</label>
                                    <input
                                        type="text"
                                        value={imagePattern}
                                        onChange={(e) => setImagePattern(e.target.value)}
                                        placeholder="e.g., products/{productId}.jpg or images/{productName}.png"
                                        className="form-input"
                                    />
                                    <div style={{
                                        fontSize: '11px',
                                        color: 'var(--color-text-secondary)',
                                        marginTop: 'var(--spacing-sm)'
                                    }}>
                                        Use column names in curly braces: {"{ columnName }"}
                                    </div>
                                </div>

                                {/* Pattern Preview */}
                                {previewPatterns[selectedImageLayer.id] && (
                                    <div style={{
                                        marginTop: 'var(--spacing-lg)',
                                        padding: 'var(--spacing-md)',
                                        background: 'var(--color-bg-primary)',
                                        borderRadius: 'var(--radius-md)',
                                        border: '1px solid var(--color-border)'
                                    }}>
                                        <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-sm)' }}>
                                            Preview (first row):
                                        </div>
                                        <div style={{
                                            fontSize: '12px',
                                            color: 'var(--color-primary)',
                                            fontFamily: 'monospace',
                                            wordBreak: 'break-all'
                                        }}>
                                            {previewPatterns[selectedImageLayer.id]}
                                        </div>
                                    </div>
                                )}

                                <div style={{ display: 'flex', gap: 'var(--spacing-md)', marginTop: 'var(--spacing-lg)' }}>
                                    <button
                                        onClick={handleAddImageMapping}
                                        style={{ flex: 1 }}
                                    >
                                        Add Image Mapping
                                    </button>
                                    <button
                                        onClick={() => setSelectedImageLayer(null)}
                                        className="secondary"
                                        style={{ flex: 1 }}
                                    >
                                        Cancel
                                    </button>
                                </div>
                            </div>
                        ) : (
                            <div style={{
                                padding: 'var(--spacing-lg)',
                                textAlign: 'center',
                                color: 'var(--color-text-secondary)',
                                fontSize: '13px'
                            }}>
                                Select an image layer to configure mapping
                            </div>
                        )}
                    </div>
                )}

                {/* Validation Status */}
                {Object.keys(imageMappingRules).length > 0 && (
                    <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Check size={20} /> Image Pattern Validation</h3>
                        <button
                            onClick={handleValidatePatterns}
                            disabled={isValidating}
                            style={{ width: '100%', marginBottom: 'var(--spacing-md)' }}
                        >
                            {isValidating ? 'Validating...' : 'Validate All Patterns'}
                        </button>

                        {validationResults && (
                            <div style={{
                                padding: 'var(--spacing-md)',
                                background: validationResults.missing === 0 ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                                border: `1px solid ${validationResults.missing === 0 ? 'var(--color-success)' : 'var(--color-danger)'}`,
                                borderRadius: 'var(--radius-md)',
                                marginBottom: 'var(--spacing-md)'
                            }}>
                                <div style={{ fontWeight: '600', marginBottom: 'var(--spacing-sm)' }}>
                                    {validationResults.missing === 0 ? <><CheckCircle2 size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} /> All images found!</> : <><AlertTriangle size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-warning)' }} /> Missing images</>}
                                </div>
                                <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)' }}>
                                    Found: {validationResults.found} / {validationResults.total}
                                </div>
                            </div>
                        )}

                        {validationResults && validationResults.errors.length > 0 && (
                            <div style={{ marginTop: 'var(--spacing-md)' }}>
                                <div style={{ fontSize: '11px', fontWeight: '600', marginBottom: 'var(--spacing-sm)', color: 'var(--color-danger)' }}>
                                    Missing Images:
                                </div>
                                <div style={{
                                    maxHeight: '200px',
                                    overflowY: 'auto',
                                    fontSize: '10px',
                                    background: 'var(--color-bg-secondary)',
                                    padding: 'var(--spacing-sm)',
                                    borderRadius: 'var(--radius-md)'
                                }}>
                                    {validationResults.errors.slice(0, 10).map((err, idx) => (
                                        <div key={idx} style={{ marginBottom: 'var(--spacing-xs)', fontFamily: 'monospace' }}>
                                            Row {err.row}: {err.resolvedName}
                                        </div>
                                    ))}
                                    {validationResults.errors.length > 10 && (
                                        <div style={{ color: 'var(--color-text-secondary)' }}>
                                            ... and {validationResults.errors.length - 10} more
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Current Image Mappings Summary */}
                {Object.keys(imageMappingRules).length > 0 && (
                    <div className="card">
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-lg)', display: 'flex', alignItems: 'center', gap: '8px', flexDirection: isArabic ? 'row-reverse' : 'row' }}><Check size={20} /> Configured Mappings ({Object.keys(imageMappingRules).length})</h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                            {Object.entries(imageMappingRules).map(([layerId, rule]) => {
                                const layer = imageLayers.find(l => l.id.toString() === layerId);
                                return (
                                    <div
                                        key={layerId}
                                        style={{
                                            padding: 'var(--spacing-md)',
                                            background: 'var(--color-bg-secondary)',
                                            border: '1px solid var(--color-border)',
                                            borderRadius: 'var(--radius-md)'
                                        }}
                                    >
                                        <div style={{
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                            alignItems: 'flex-start',
                                            gap: 'var(--spacing-md)'
                                        }}>
                                            <div>
                                                <div style={{ fontWeight: '600', marginBottom: 'var(--spacing-xs)' }}>
                                                    {layer?.name}
                                                </div>
                                                <div style={{
                                                    fontSize: '12px',
                                                    color: 'var(--color-text-secondary)',
                                                    marginBottom: 'var(--spacing-sm)'
                                                }}>
                                                    Column: <strong>{rule.columnName}</strong>
                                                </div>
                                                <div style={{
                                                    fontSize: '11px',
                                                    color: 'var(--color-text-secondary)',
                                                    fontFamily: 'monospace',
                                                    backgroundColor: 'var(--color-bg-tertiary)',
                                                    padding: 'var(--spacing-sm)',
                                                    borderRadius: 'var(--radius-md)'
                                                }}>
                                                    {rule.pattern}
                                                </div>
                                            </div>
                                            <button
                                                onClick={() => handleRemoveImageMapping(layerId)}
                                                className="danger"
                                                style={{ padding: '6px 12px', fontSize: '11px', whiteSpace: 'nowrap' }}
                                            >
                                                Remove
                                            </button>
                                        </div>
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
