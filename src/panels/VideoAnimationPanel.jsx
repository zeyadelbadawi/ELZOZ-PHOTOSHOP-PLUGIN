'use client';

import React, { useContext, useState } from 'react';
import { Wand2, ChevronDown } from 'lucide-react';
import { VideoContext } from '../context/VideoContext';
import { useTranslation } from '../hooks/useTranslation';

// Animation presets
const ANIMATION_PRESETS = {
    OPACITY: [
        { name: 'Fade In', value: 'fadeIn' },
        { name: 'Fade Out', value: 'fadeOut' }
    ],
    POSITION: [
        { name: 'Slide Left', value: 'slideLeft' },
        { name: 'Slide Right', value: 'slideRight' },
        { name: 'Slide Up', value: 'slideUp' },
        { name: 'Slide Down', value: 'slideDown' }
    ],
    SCALE: [
        { name: 'Zoom In', value: 'zoomIn' },
        { name: 'Zoom Out', value: 'zoomOut' }
    ],
    ROTATION: [
        { name: 'Spin', value: 'spin' },
        { name: 'Rotate Left', value: 'rotateLeft' },
        { name: 'Rotate Right', value: 'rotateRight' }
    ]
};

export default function VideoAnimationPanel() {
    const { videoState, setVideoAnimationSettings, setCurrentVideoStep } = useContext(VideoContext);
    const { t, isArabic, dir } = useTranslation();

    const [expandedLayerId, setExpandedLayerId] = useState(null);

    const layersWithAnimation = videoState.videoLayerStructure.filter(
        l => videoState.videoLayerMapping[l.id]?.includeInAnimation
    );

    const handleAnimationChange = (layerId, field, value) => {
        const current = videoState.videoAnimationSettings[layerId] || {};

        setVideoAnimationSettings(layerId, {
            ...current,
            [field]: value
        });
    };

    const getSliderValue = (layerId, field) => {
        return videoState.videoAnimationSettings[layerId]?.[field] ||
            (field === 'duration' ? 1000 : field === 'delay' ? 0 : 0);
    };

    const handlePreviousStep = () => {
        console.log('  VideoAnimationPanel: Going back to step 2');
        setCurrentVideoStep(2);
    };

    const handleNextStep = () => {
        console.log('  VideoAnimationPanel: Moving to step 4');
        setCurrentVideoStep(4);
    };

    return (
        <div
            style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--spacing-lg)',
                height: '100%',
                direction: dir,
                textAlign: isArabic ? 'right' : 'left'
            }}
        >
            {/* Header */}
            <div>
                <h2
                    style={{
                        margin: 0,
                        fontSize: 'var(--font-size-2xl)',
                        fontWeight: '700',
                        color: 'var(--color-text-primary)',
                        display: 'flex',
                        flexDirection: isArabic ? 'row-reverse' : 'row',
                        alignItems: 'center',
                        gap: 'var(--spacing-md)'
                    }}
                >
                    <Wand2 size={24} style={{ color: 'var(--color-primary)' }} />
                    Animation Config - Step 3/4
                </h2>
                <p
                    style={{
                        margin: 'var(--spacing-sm) 0 0 0',
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-base)'
                    }}
                >
                    Configure animation duration, delay, and easing for each layer
                </p>
            </div>

            {/* Main Content */}
            <div
                style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 'var(--spacing-md)',
                    minHeight: 0,
                    overflowY: 'auto'
                }}
            >
                {layersWithAnimation.length === 0 ? (
                    <div
                        style={{
                            background: 'var(--color-bg-secondary)',
                            border: '1px solid var(--color-border)',
                            borderRadius: 'var(--radius-lg)',
                            padding: 'var(--spacing-xl)',
                            textAlign: 'center',
                            color: 'var(--color-text-muted)'
                        }}
                    >
                        <p>No layers selected for animation. Go back to select layers.</p>
                    </div>
                ) : (
                    layersWithAnimation.map((layer, idx) => {
                        const isExpanded = expandedLayerId === layer.id;
                        const settings = videoState.videoAnimationSettings[layer.id] || {
                            duration: 1000,
                            delay: 0,
                            easing: 'ease-in-out'
                        };

                        return (
                            <div
                                key={layer.id}
                                style={{
                                    background: 'var(--color-bg-secondary)',
                                    border: '1px solid var(--color-border)',
                                    borderRadius: 'var(--radius-lg)',
                                    overflow: 'hidden'
                                }}
                            >
                                {/* Header - Expandable */}
                                <button
                                    onClick={() => setExpandedLayerId(isExpanded ? null : layer.id)}
                                    style={{
                                        width: '100%',
                                        padding: 'var(--spacing-md) var(--spacing-lg)',
                                        background: isExpanded ? 'var(--color-bg-tertiary)' : 'transparent',
                                        border: 'none',
                                        cursor: 'pointer',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        gap: 'var(--spacing-md)',
                                        flexDirection: isArabic ? 'row-reverse' : 'row',
                                        transition: 'all var(--transition-base)'
                                    }}
                                    onMouseEnter={(e) => {
                                        e.currentTarget.style.background = 'var(--color-bg-tertiary)';
                                    }}
                                    onMouseLeave={(e) => {
                                        if (!isExpanded) {
                                            e.currentTarget.style.background = 'transparent';
                                        }
                                    }}
                                >
                                    <div
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 'var(--spacing-md)',
                                            flex: 1,
                                            minWidth: 0,
                                            flexDirection: isArabic ? 'row-reverse' : 'row'
                                        }}
                                    >
                                        <div
                                            style={{
                                                width: '24px',
                                                height: '24px',
                                                borderRadius: '4px',
                                                background: 'var(--color-primary)',
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'center',
                                                color: '#000',
                                                fontSize: '12px',
                                                fontWeight: '600',
                                                flexShrink: 0
                                            }}
                                        >
                                            {idx + 1}
                                        </div>
                                        <div style={{ minWidth: 0 }}>
                                            <div
                                                style={{
                                                    color: 'var(--color-text-primary)',
                                                    fontWeight: '600',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    textAlign: isArabic ? 'right' : 'left'
                                                }}
                                            >
                                                {layer.name}
                                            </div>
                                            <div
                                                style={{
                                                    fontSize: 'var(--font-size-xs)',
                                                    color: 'var(--color-text-muted)',
                                                    textAlign: isArabic ? 'right' : 'left'
                                                }}
                                            >
                                                {settings.duration}ms duration, {settings.delay}ms delay
                                            </div>
                                        </div>
                                    </div>

                                    <ChevronDown
                                        size={20}
                                        style={{
                                            color: 'var(--color-text-secondary)',
                                            flexShrink: 0,
                                            transform: isExpanded ? 'rotate(-180deg)' : 'rotate(0deg)',
                                            transition: 'transform var(--transition-base)'
                                        }}
                                    />
                                </button>

                                {/* Expanded Content */}
                                {isExpanded && (
                                    <div
                                        style={{
                                            padding: 'var(--spacing-lg)',
                                            borderTop: '1px solid var(--color-border)',
                                            display: 'flex',
                                            flexDirection: 'column',
                                            gap: 'var(--spacing-lg)'
                                        }}
                                    >
                                        {/* Duration Slider */}
                                        <div>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: 'var(--spacing-md)',
                                                    fontSize: 'var(--font-size-sm)',
                                                    fontWeight: '600',
                                                    color: 'var(--color-text-primary)',
                                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                                }}
                                            >
                                                <span>Duration</span>
                                                <span
                                                    style={{
                                                        background: 'var(--color-primary)',
                                                        color: '#000',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontWeight: '700'
                                                    }}
                                                >
                                                    {settings.duration}ms
                                                </span>
                                            </label>
                                            <input
                                                type="range"
                                                min="100"
                                                max="5000"
                                                step="100"
                                                value={settings.duration}
                                                onChange={(e) => handleAnimationChange(layer.id, 'duration', parseInt(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    cursor: 'pointer',
                                                    accentColor: 'var(--color-primary)'
                                                }}
                                            />
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    marginTop: '8px',
                                                    fontSize: 'var(--font-size-xs)',
                                                    color: 'var(--color-text-muted)',
                                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                                }}
                                            >
                                                <span>100ms</span>
                                                <span>5000ms</span>
                                            </div>
                                        </div>

                                        {/* Delay Slider */}
                                        <div>
                                            <label
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: 'var(--spacing-md)',
                                                    fontSize: 'var(--font-size-sm)',
                                                    fontWeight: '600',
                                                    color: 'var(--color-text-primary)',
                                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                                }}
                                            >
                                                <span>Delay</span>
                                                <span
                                                    style={{
                                                        background: 'var(--color-primary)',
                                                        color: '#000',
                                                        padding: '4px 8px',
                                                        borderRadius: '4px',
                                                        fontWeight: '700'
                                                    }}
                                                >
                                                    {settings.delay}ms
                                                </span>
                                            </label>
                                            <input
                                                type="range"
                                                min="0"
                                                max="3000"
                                                step="100"
                                                value={settings.delay}
                                                onChange={(e) => handleAnimationChange(layer.id, 'delay', parseInt(e.target.value))}
                                                style={{
                                                    width: '100%',
                                                    cursor: 'pointer',
                                                    accentColor: 'var(--color-primary)'
                                                }}
                                            />
                                            <div
                                                style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    marginTop: '8px',
                                                    fontSize: 'var(--font-size-xs)',
                                                    color: 'var(--color-text-muted)',
                                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                                }}
                                            >
                                                <span>0ms</span>
                                                <span>3000ms</span>
                                            </div>
                                        </div>

                                        {/* Easing Dropdown */}
                                        <div>
                                            <label
                                                style={{
                                                    display: 'block',
                                                    marginBottom: 'var(--spacing-md)',
                                                    fontSize: 'var(--font-size-sm)',
                                                    fontWeight: '600',
                                                    color: 'var(--color-text-primary)'
                                                }}
                                            >
                                                Easing
                                            </label>
                                            <select
                                                value={settings.easing}
                                                onChange={(e) => handleAnimationChange(layer.id, 'easing', e.target.value)}
                                                style={{
                                                    width: '100%',
                                                    padding: 'var(--spacing-md)',
                                                    background: 'var(--color-bg-tertiary)',
                                                    color: 'var(--color-text-primary)',
                                                    border: '1px solid var(--color-border)',
                                                    borderRadius: 'var(--radius-md)',
                                                    cursor: 'pointer',
                                                    fontSize: 'var(--font-size-sm)',
                                                    fontWeight: '500'
                                                }}
                                            >
                                                <option value="linear">Linear</option>
                                                <option value="ease-in">Ease In</option>
                                                <option value="ease-out">Ease Out</option>
                                                <option value="ease-in-out">Ease In-Out</option>
                                                <option value="cubic-bezier(0.68, -0.55, 0.265, 1.55)">Elastic</option>
                                                <option value="cubic-bezier(0.34, 1.56, 0.64, 1)">Spring</option>
                                            </select>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Action Buttons */}
            <div
                style={{
                    display: 'flex',
                    gap: 'var(--spacing-md)',
                    justifyContent: 'space-between',
                    flexDirection: isArabic ? 'row-reverse' : 'row'
                }}
            >
                <button
                    onClick={handlePreviousStep}
                    style={{
                        padding: 'var(--spacing-md) var(--spacing-lg)',
                        background: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-base)',
                        fontWeight: '600',
                        transition: 'all var(--transition-base)'
                    }}
                >
                    ← Back
                </button>
                <button
                    onClick={handleNextStep}
                    style={{
                        padding: 'var(--spacing-md) var(--spacing-lg)',
                        background: 'var(--color-primary)',
                        color: '#000000',
                        border: 'none',
                        borderRadius: 'var(--radius-md)',
                        cursor: 'pointer',
                        fontSize: 'var(--font-size-base)',
                        fontWeight: '700',
                        transition: 'all var(--transition-base)'
                    }}
                >
                    Next Step →
                </button>
            </div>
        </div>
    );
}
