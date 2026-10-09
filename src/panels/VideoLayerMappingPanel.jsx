'use client';

import React, { useContext, useState, useEffect } from 'react';
import { Eye, EyeOff, Play } from 'lucide-react';
import { VideoContext } from '../context/VideoContext';
import { useTranslation } from '../hooks/useTranslation';

export default function VideoLayerMappingPanel() {
    const { videoState, setVideoLayerMapping, setCurrentVideoStep } = useContext(VideoContext);
    const { t, isArabic, dir } = useTranslation();

    const [selectedLayerId, setSelectedLayerId] = useState(null);
    const [isPreviewPlaying, setIsPreviewPlaying] = useState(false);

    // Get layers - use structure first, then fallback to first PSD
    const layers = videoState.videoLayerStructure?.length > 0
        ? videoState.videoLayerStructure
        : (videoState.videoPSDs?.[0]?.layerStructure || []);

    // Initialize videoLayerMapping on first render if not already done
    useEffect(() => {
        if (layers && layers.length > 0 && Object.keys(videoState.videoLayerMapping).length === 0) {
            console.log('[v0] VideoLayerMappingPanel: Initializing layer mapping for', layers.length, 'layers');
            layers.forEach((layer) => {
                setVideoLayerMapping(layer.layerId, {
                    includeInAnimation: false,
                    animationType: 'preset',
                    preset: { name: 'fadeIn', intensity: 1 },
                    custom: { keyframes: [] }
                });
            });
        }
    }, []);

    const includedLayersCount = layers.filter(l =>
        videoState.videoLayerMapping[l.layerId]?.includeInAnimation
    ).length;

    const getLayerIcon = (layerType) => {
        switch (layerType) {
            case 'text': return 'T';
            case 'pixel': return '◼';
            case 'group': return '⬚';
            default: return '●';
        }
    };

    const getLayerColor = (layerType) => {
        switch (layerType) {
            case 'text': return '#60a5fa';
            case 'pixel': return '#34d399';
            case 'group': return '#f59e0b';
            default: return '#9ca3af';
        }
    };

    console.log('[v0] VideoLayerMappingPanel render:', {
        layersCount: layers?.length || 0,
        videoStructureLength: videoState.videoLayerStructure?.length || 0,
        psdCount: videoState.videoPSDs?.length || 0,
        mappingCount: Object.keys(videoState.videoLayerMapping || {}).length
    });

    const selectedLayer = layers?.find(l => l.layerId === selectedLayerId);

    const handleToggleLayer = (layerId) => {
        const currentMapping = videoState.videoLayerMapping[layerId] || {};
        setVideoLayerMapping(layerId, {
            ...currentMapping,
            includeInAnimation: !currentMapping.includeInAnimation
        });
    };

    const handleLayerSelect = (layerId) => {
        setSelectedLayerId(layerId);
    };

    const handlePreviewLayer = async (layerId) => {
        try {
            setIsPreviewPlaying(true);
            await new Promise(resolve => setTimeout(resolve, 2000));
            setIsPreviewPlaying(false);
        } catch (error) {
            console.error('[v0] VideoLayerMappingPanel: Preview error', error);
            setIsPreviewPlaying(false);
        }
    };

    const handlePreviousStep = () => {
        console.log('[v0] VideoLayerMappingPanel: Going back to step 1');
        setCurrentVideoStep(1);
    };

    const handleNextStep = () => {
        console.log('[v0] VideoLayerMappingPanel: Moving to step 3');
        setCurrentVideoStep(3);
    };

    // Safety check
    if (!layers || layers.length === 0) {
        return (
            <div className="panel-content" style={{ direction: dir }}>
                <div className="section">
                    <div className="empty-state" style={{ padding: 'var(--spacing-lg)', textAlign: 'center', direction: dir }}>
                        <div className="empty-state-icon">⚠️</div>
                        <div className="empty-state-title" style={{ direction: dir }}>No Layers Found</div>
                        <div className="empty-state-description" style={{ direction: dir }}>
                            Please go back to Setup and select a PSD file
                        </div>
                        <button
                            onClick={handlePreviousStep}
                            style={{ marginTop: 'var(--spacing-md)', padding: 'var(--spacing-sm) var(--spacing-md)', fontSize: '12px' }}
                        >
                            Back to Setup
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="panel-content" style={{ direction: dir }}>
            <div className="section">
                <div className="section-title" style={{ direction: dir }}>
                    <h2 style={{ margin: '0 0 var(--spacing-xs) 0', direction: dir }}>
                        Layer Mapping - Step 2/4
                    </h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', display: 'block', direction: dir }}>
                        Select which layers to animate in the video
                    </span>
                </div>

                {/* Two Column Layout */}
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spacing-lg)',
                    marginTop: 'var(--spacing-lg)'
                }}>
                    {/* Left Column - Layer List */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', fontSize: '14px', fontWeight: '600' }}>
                            Layers ({includedLayersCount}/{layers?.length || 0})
                        </h3>

                        {layers && layers.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                                {layers.map((layer, index) => {
                                    const mapping = videoState.videoLayerMapping[layer.layerId] || {};
                                    const isSelected = selectedLayerId === layer.layerId;
                                    const isIncluded = mapping.includeInAnimation;

                                    return (
                                        <div
                                            key={layer.layerId || `layer-${index}`}
                                            onClick={() => handleLayerSelect(layer.layerId)}
                                            style={{
                                                padding: 'var(--spacing-md)',
                                                background: isSelected ? 'rgba(253, 185, 38, 0.15)' : 'var(--color-bg-secondary)',
                                                border: isSelected ? '2px solid var(--color-primary)' : (isIncluded ? '1px solid var(--color-success)' : '1px solid var(--color-border)'),
                                                borderRadius: 'var(--radius-md)',
                                                cursor: 'pointer',
                                                transition: 'all 0.2s ease',
                                                display: 'flex',
                                                justifyContent: 'space-between',
                                                alignItems: 'center',
                                                flexDirection: isArabic ? 'row-reverse' : 'row'
                                            }}
                                        >
                                            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', flex: 1, flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                                <div
                                                    style={{
                                                        width: '24px',
                                                        height: '24px',
                                                        borderRadius: '4px',
                                                        background: getLayerColor(layer.type),
                                                        display: 'flex',
                                                        alignItems: 'center',
                                                        justifyContent: 'center',
                                                        color: 'white',
                                                        fontSize: '12px',
                                                        fontWeight: '600',
                                                        flexShrink: 0
                                                    }}
                                                >
                                                    {getLayerIcon(layer.type)}
                                                </div>
                                                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                                                    <div style={{ color: 'var(--color-text-primary)', fontWeight: '600', fontSize: '12px' }}>
                                                        {layer.name}
                                                    </div>
                                                    <div style={{ fontSize: '10px', color: 'var(--color-text-tertiary)' }}>
                                                        {layer.type}
                                                    </div>
                                                </div>
                                            </div>

                                            <button
                                                onClick={(e) => {
                                                    e.stopPropagation();
                                                    handleToggleLayer(layer.layerId);
                                                }}
                                                style={{
                                                    width: '32px',
                                                    height: '32px',
                                                    borderRadius: 'var(--radius-md)',
                                                    border: 'none',
                                                    background: isIncluded ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                                                    color: isIncluded ? '#000000' : 'var(--color-text-secondary)',
                                                    cursor: 'pointer',
                                                    display: 'flex',
                                                    alignItems: 'center',
                                                    justifyContent: 'center',
                                                    transition: 'all 0.2s ease',
                                                    flexShrink: 0
                                                }}
                                            >
                                                {isIncluded ? <Eye size={16} /> : <EyeOff size={16} />}
                                            </button>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-lg)', background: 'var(--color-bg-secondary)' }}>
                                <p style={{ color: 'var(--color-text-secondary)', margin: 0, fontSize: '12px' }}>
                                    No layers found. Go back and select a PSD folder.
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Right Column - Layer Details */}
                    <div>
                        <h3 style={{ marginTop: 0, marginBottom: 'var(--spacing-md)', fontSize: '14px', fontWeight: '600' }}>
                            Layer Details
                        </h3>

                        {selectedLayer ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                                <div className="card">
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>Name:</span>
                                        <span style={{ color: 'var(--color-primary)', fontWeight: '600' }}>{selectedLayer.name}</span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 'var(--spacing-md)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>Type:</span>
                                        <span style={{ color: 'var(--color-text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>
                                            {selectedLayer.type}
                                        </span>
                                    </div>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                        <span style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>Visible:</span>
                                        <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>
                                            {selectedLayer.visible ? 'Yes' : 'No'}
                                        </span>
                                    </div>
                                </div>

                                <label
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 'var(--spacing-md)',
                                        padding: 'var(--spacing-md)',
                                        background: videoState.videoLayerMapping[selectedLayer.layerId]?.includeInAnimation ? 'rgba(16, 185, 129, 0.15)' : 'transparent',
                                        border: '1px solid ' + (videoState.videoLayerMapping[selectedLayer.layerId]?.includeInAnimation ? '#10b981' : 'var(--color-border)'),
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        flexDirection: isArabic ? 'row-reverse' : 'row'
                                    }}
                                    onClick={() => handleToggleLayer(selectedLayer.layerId)}
                                >
                                    <input
                                        type="checkbox"
                                        checked={videoState.videoLayerMapping[selectedLayer.layerId]?.includeInAnimation || false}
                                        onChange={() => handleToggleLayer(selectedLayer.layerId)}
                                        style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                                    />
                                    <span style={{ color: 'var(--color-text-primary)', fontWeight: '600', fontSize: '12px' }}>
                                        Include in Animation
                                    </span>
                                </label>

                                <button
                                    onClick={() => handlePreviewLayer(selectedLayer.layerId)}
                                    disabled={isPreviewPlaying}
                                    style={{
                                        padding: 'var(--spacing-md)',
                                        background: isPreviewPlaying ? '#999' : 'var(--color-primary)',
                                        color: '#000000',
                                        border: 'none',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: isPreviewPlaying ? 'not-allowed' : 'pointer',
                                        fontWeight: '600',
                                        fontSize: '12px',
                                        transition: 'all 0.2s ease',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 'var(--spacing-sm)',
                                        opacity: isPreviewPlaying ? 0.6 : 1
                                    }}
                                >
                                    <Play size={16} />
                                    {isPreviewPlaying ? 'Previewing...' : 'Preview'}
                                </button>
                            </div>
                        ) : (
                            <div className="card" style={{ textAlign: 'center', padding: 'var(--spacing-lg)' }}>
                                <p style={{ color: 'var(--color-text-secondary)', margin: 0 }}>Select a layer to view details</p>
                            </div>
                        )}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', justifyContent: 'flex-end', marginTop: 'var(--spacing-xl)', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                    <button className="secondary" style={{ minWidth: '120px' }} onClick={handlePreviousStep}>
                        ← Back
                    </button>
                    <button
                        onClick={handleNextStep}
                        style={{ minWidth: '120px', opacity: includedLayersCount > 0 ? 1 : 0.5 }}
                        disabled={includedLayersCount === 0}
                    >
                        Next Step →
                    </button>
                </div>
            </div>
        </div>
    );
}
