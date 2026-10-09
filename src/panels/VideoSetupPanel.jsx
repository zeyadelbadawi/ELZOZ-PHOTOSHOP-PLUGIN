'use client';

import React, { useContext, useState } from 'react';
import { FolderOpen, AlertCircle, CheckCircle2, Loader } from 'lucide-react';
import { VideoContext } from '../context/VideoContext';
import { useTranslation } from '../hooks/useTranslation';
import VideoSetupService from '../services/VideoSetupService';

export default function VideoSetupPanel() {
    const { videoState, setVideoPSDs, setVideoLayerStructure, setCurrentVideoStep, clearVideoState } = useContext(VideoContext);
    const { t, isArabic, dir } = useTranslation();
    const [isLoading, setIsLoading] = useState(false);
    const [validationError, setValidationError] = useState(null);
    const [validationWarnings, setValidationWarnings] = useState([]);

    const handleSelectFolder = async () => {
        try {
            setIsLoading(true);
            setValidationError(null);
            setValidationWarnings([]);


            // Use the global window command exposed in index.jsx
            const result = await window.pickVideoPSDFolder();

            if (!result) {
                setIsLoading(false);
                return;
            }


            // Load all PSDs from folder
            const loadResult = await VideoSetupService.loadPSDsFromFolder(result.folder);

            if (!loadResult.success) {
                setValidationError(loadResult.error);
                setIsLoading(false);
                return;
            }

            if (loadResult.count === 0) {
                setValidationError('No PSD files found in the selected folder');
                setIsLoading(false);
                return;
            }


            // Validate layer consistency
            const validationResult = VideoSetupService.validateLayerConsistency(
                loadResult.psdFiles
            );

            if (!validationResult.isValid) {
                console.warn(' VideoSetupPanel: Layer validation warnings:', validationResult.errors);
                setValidationWarnings(validationResult.errors);
            }

            // Save to context
            setVideoPSDs(loadResult.psdFiles);

            if (loadResult.psdFiles[0]?.layerStructure) {
                const layers = loadResult.psdFiles[0].layerStructure;
                setVideoLayerStructure(layers);
                console.log('[v0] VideoSetupPanel: Setting videoLayerStructure with', layers.length, 'layers:', layers.map(l => ({ id: l.layerId, name: l.name })));
            } else {
                console.warn('[v0] VideoSetupPanel: First PSD has no layer structure');
            }

            setIsLoading(false);
        } catch (error) {
            console.error(' VideoSetupPanel Error:', error);
            setValidationError(error.message);
            setIsLoading(false);
        }
    };

    const handleCancel = () => {
        setVideoPSDs([]);
        setVideoLayerStructure([]);
        setValidationError(null);
        setValidationWarnings([]);
        setIsLoading(false);
    };

    const handleNextStep = () => {
        if (videoState.videoPSDs.length > 0) {
            setCurrentVideoStep(2);
        }
    };

    return (
        <div className="panel-content" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
            <div className="section" style={{ boxSizing: 'border-box', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', margin: '0 0 var(--spacing-xs) 0' }}>Video Setup - Step 1/4</h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>Select a folder containing PSD files to create an animated video</span>
                </div>

                {/* Requirements Box */}
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="form-group">
                        <label className="form-label">Requirements:</label>
                        <ul style={{ margin: 0, paddingLeft: isArabic ? 0 : '20px', paddingRight: isArabic ? '20px' : 0, fontSize: '12px', color: 'var(--color-text-secondary)', lineHeight: '1.6' }}>
                            <li>All PSD files must have identical layer structure</li>
                            <li>All layers must have the same names across PSDs</li>
                            <li>Layer order should be consistent</li>
                        </ul>
                    </div>
                </div>

                {/* Folder Selection */}
                <div className="card">
                    <div className="form-group">
                        <label className="form-label" style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <FolderOpen size={16} style={{ color: 'var(--color-primary)' }} />
                            Select PSD Folder
                        </label>
                        <button onClick={handleSelectFolder} disabled={isLoading} style={{ width: '100%', opacity: isLoading ? 0.6 : 1 }}>
                            {isLoading ? (
                                <>
                                    <Loader size={14} style={{ display: 'inline', marginRight: '8px', animation: 'spin 1s linear infinite' }} />
                                    Loading PSDs...
                                </>
                            ) : (
                                <>
                                    <FolderOpen size={14} style={{ display: 'inline', marginRight: '8px' }} />
                                    Select Folder with PSD Files
                                </>
                            )}
                        </button>
                    </div>
                </div>

                {/* Error Display */}
                {validationError && (
                    <div className="alert danger" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <AlertCircle size={16} />
                        <div>
                            <strong>Error loading PSDs:</strong>
                            <p style={{ margin: 'var(--spacing-xs) 0 0 0', fontSize: '12px' }}>{validationError}</p>
                        </div>
                    </div>
                )}

                {/* Validation Warnings */}
                {validationWarnings.length > 0 && (
                    <div className="alert warning" style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <AlertCircle size={16} />
                        <div>
                            <strong>Warning: {validationWarnings.length} PSD(s) have inconsistent layers</strong>
                            <ul style={{ margin: 'var(--spacing-xs) 0 0 0', paddingLeft: isArabic ? 0 : '20px', paddingRight: isArabic ? '20px' : 0, fontSize: '11px' }}>
                                {validationWarnings.map((warning, idx) => (
                                    <li key={idx}>{warning.psdName}: {warning.issue}</li>
                                ))}
                            </ul>
                        </div>
                    </div>
                )}

                {/* PSD List - Table Format */}
                {videoState.videoPSDs.length > 0 && (
                    <div style={{ marginBottom: 'var(--spacing-lg)' }}>
                        <h3 style={{ marginBottom: 'var(--spacing-md)', display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                            Found PSD Files ({videoState.videoPSDs.length})
                        </h3>

                        {/* Table Container - Scrollable */}
                        <div style={{ overflowX: 'auto', borderRadius: 'var(--radius-lg)', border: '1px solid var(--color-border)' }}>
                            <table style={{ minWidth: '100%' }}>
                                <thead>
                                    <tr>
                                        <th style={{ textAlign: isArabic ? 'right' : 'left' }}>File Name</th>
                                        <th style={{ textAlign: 'center', minWidth: '80px' }}>Total</th>
                                        <th style={{ textAlign: 'center', minWidth: '80px' }}>Text</th>
                                        <th style={{ textAlign: 'center', minWidth: '80px' }}>Images</th>
                                        <th style={{ textAlign: 'center', minWidth: '80px' }}>Shapes</th>
                                        <th style={{ textAlign: 'center', minWidth: '80px' }}>Groups</th>
                                        <th style={{ textAlign: 'center', minWidth: '60px' }}>Status</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {videoState.videoPSDs.map((psd) => {
                                        const layers = psd.layerStructure || [];
                                        const textCount = layers.filter(l => l.type === 'text').length;
                                        const imageCount = layers.filter(l => l.type === 'image').length;
                                        const shapeCount = layers.filter(l => l.type === 'shape').length;
                                        const groupCount = layers.filter(l => l.type === 'group').length;

                                        return (
                                            <tr key={psd.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                                                <td style={{ textAlign: isArabic ? 'right' : 'left', fontWeight: '500' }}>{psd.name}</td>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: 'var(--color-primary)' }}>
                                                    <span style={{ background: 'rgba(253, 185, 38, 0.15)', padding: '2px 8px', borderRadius: '4px' }}>{layers.length}</span>
                                                </td>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: '#f59e0b' }}>{textCount}</td>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: '#3b82f6' }}>{imageCount}</td>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: '#8b5cf6' }}>{shapeCount}</td>
                                                <td style={{ textAlign: 'center', fontWeight: '600', color: '#06b6d4' }}>{groupCount}</td>
                                                <td style={{ textAlign: 'center' }}>
                                                    {psd.isValid ? (
                                                        <CheckCircle2 size={16} style={{ color: '#10b981' }} />
                                                    ) : (
                                                        <AlertCircle size={16} style={{ color: '#ef4444' }} />
                                                    )}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>

                        {/* Legend */}
                        <div style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-md)', backgroundColor: 'var(--color-bg-secondary)', borderRadius: 'var(--radius-md)', fontSize: '11px', color: 'var(--color-text-secondary)', display: 'flex', gap: 'var(--spacing-lg)', flexWrap: 'wrap', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#f59e0b' }} />
                                Text
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#3b82f6' }} />
                                Images
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#8b5cf6' }} />
                                Shapes
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                <div style={{ width: '10px', height: '10px', borderRadius: '2px', backgroundColor: '#06b6d4' }} />
                                Groups
                            </div>
                        </div>
                    </div>
                )}

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end', marginTop: 'var(--spacing-xl)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                    <button
                        className="secondary"
                        style={{ minWidth: '120px' }}
                        disabled={isLoading}
                        onClick={handleCancel}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleNextStep}
                        style={{ minWidth: '120px', opacity: videoState.videoPSDs.length > 0 && !isLoading ? 1 : 0.5 }}
                        disabled={videoState.videoPSDs.length === 0 || isLoading}
                    >
                        Next Step →
                    </button>
                </div>
            </div>

            <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
        </div>
    );
}
