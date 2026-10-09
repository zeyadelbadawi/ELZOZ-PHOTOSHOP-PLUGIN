'use client';

import React, { useContext, useState } from 'react';
import { Play, Pause, RotateCcw, CheckCircle2, AlertCircle, Zap } from 'lucide-react';
import { VideoContext } from '../context/VideoContext';
import { useTranslation } from '../hooks/useTranslation';

export default function VideoExecutePanel() {
    const { videoState, updateVideoState, setIsGenerating, updateVideoProgress, setCurrentVideoStep } = useContext(VideoContext);
    const { t, isArabic, dir } = useTranslation();

    const [executionStarted, setExecutionStarted] = useState(false);

    const handleStartGeneration = async () => {
        try {
            setExecutionStarted(true);
            setIsGenerating(true);
            updateVideoProgress({ percentage: 0, currentPSD: 0, currentFrame: 0 });

            // Simulate video generation progress
            for (let psdIdx = 0; psdIdx < videoState.videoPSDs.length; psdIdx++) {
                updateVideoProgress({
                    currentPSD: psdIdx + 1,
                    totalPSDs: videoState.videoPSDs.length,
                    percentage: Math.round(((psdIdx + 1) / videoState.videoPSDs.length) * 100)
                });

                // Simulate frame processing
                await new Promise(resolve => setTimeout(resolve, 1500));
            }

            updateVideoProgress({ percentage: 100 });
            setIsGenerating(false);
        } catch (error) {
            console.error('  VideoExecutePanel: Generation error', error);
            setIsGenerating(false);
        }
    };

    const handlePause = () => {
        setIsGenerating(false);
    };

    const handleReset = () => {
        setExecutionStarted(false);
        setIsGenerating(false);
        updateVideoProgress({
            percentage: 0,
            currentPSD: 0,
            currentFrame: 0,
            totalPSDs: 0,
            totalFrames: 0
        });
    };

    const handlePreviousStep = () => {
        console.log('  VideoExecutePanel: Going back to step 3');
        setCurrentVideoStep(3);
    };

    const progress = videoState.videoProgress;
    const isProcessing = videoState.isGenerating;

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
                    <Zap size={24} style={{ color: 'var(--color-primary)' }} />
                    Generate Video - Step 4/4
                </h2>
                <p
                    style={{
                        margin: 'var(--spacing-sm) 0 0 0',
                        color: 'var(--color-text-secondary)',
                        fontSize: 'var(--font-size-base)'
                    }}
                >
                    Review settings and generate your animated video
                </p>
            </div>

            {/* Main Content */}
            <div
                style={{
                    flex: 1,
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 'var(--spacing-lg)',
                    minHeight: 0
                }}
            >
                {/* Left - Settings Summary */}
                <div
                    style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--spacing-lg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--spacing-lg)',
                        minHeight: 0,
                        overflowY: 'auto'
                    }}
                >
                    <h3
                        style={{
                            margin: 0,
                            fontSize: 'var(--font-size-lg)',
                            fontWeight: '600',
                            color: 'var(--color-text-primary)'
                        }}
                    >
                        Video Settings
                    </h3>

                    {/* Settings Grid */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {/* Files */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                PSD Files:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>
                                {videoState.videoPSDs.length}
                            </span>
                        </div>

                        {/* Animated Layers */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Animated Layers:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>
                                {Object.values(videoState.videoLayerMapping).filter(m => m.includeInAnimation).length}
                            </span>
                        </div>

                        {/* Resolution */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Resolution:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>
                                {videoState.videoExecutionConfig.resolution}
                            </span>
                        </div>

                        {/* Format */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Format:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600', textTransform: 'uppercase' }}>
                                {videoState.videoExecutionConfig.outputFormat}
                            </span>
                        </div>

                        {/* Frame Rate */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Frame Rate:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600' }}>
                                {videoState.videoExecutionConfig.frameRate} FPS
                            </span>
                        </div>

                        {/* Quality */}
                        <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                            <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                Quality:
                            </span>
                            <span style={{ color: 'var(--color-text-primary)', fontWeight: '600', textTransform: 'capitalize' }}>
                                {videoState.videoExecutionConfig.qualityPreset}
                            </span>
                        </div>
                    </div>

                    {/* Separator */}
                    <div style={{ borderTop: '1px solid var(--color-border)' }} />

                    {/* PSD List */}
                    <div>
                        <h4
                            style={{
                                margin: '0 0 var(--spacing-md) 0',
                                fontSize: 'var(--font-size-sm)',
                                fontWeight: '600',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            PSD Files ({videoState.videoPSDs.length})
                        </h4>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-sm)' }}>
                            {videoState.videoPSDs.map((psd, idx) => (
                                <div
                                    key={psd.id}
                                    style={{
                                        padding: 'var(--spacing-sm) var(--spacing-md)',
                                        background: 'var(--color-bg-tertiary)',
                                        borderRadius: 'var(--radius-sm)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'space-between',
                                        fontSize: 'var(--font-size-sm)',
                                        flexDirection: isArabic ? 'row-reverse' : 'row'
                                    }}
                                >
                                    <span style={{ color: 'var(--color-text-primary)' }}>
                                        {idx + 1}. {psd.name}
                                    </span>
                                    {psd.isValid ? (
                                        <CheckCircle2 size={14} style={{ color: '#10b981' }} />
                                    ) : (
                                        <AlertCircle size={14} style={{ color: 'var(--color-danger)' }} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Right - Progress & Controls */}
                <div
                    style={{
                        background: 'var(--color-bg-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-lg)',
                        padding: 'var(--spacing-lg)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 'var(--spacing-lg)',
                        justifyContent: 'space-between'
                    }}
                >
                    {/* Progress Section */}
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 'var(--spacing-lg)' }}>
                        <h3
                            style={{
                                margin: 0,
                                fontSize: 'var(--font-size-lg)',
                                fontWeight: '600',
                                color: 'var(--color-text-primary)'
                            }}
                        >
                            Generation Progress
                        </h3>

                        {/* Main Progress Bar */}
                        <div>
                            <div
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    alignItems: 'center',
                                    marginBottom: 'var(--spacing-md)',
                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                }}
                            >
                                <span style={{ color: 'var(--color-text-secondary)', fontSize: 'var(--font-size-sm)' }}>
                                    Overall Progress
                                </span>
                                <span
                                    style={{
                                        color: 'var(--color-primary)',
                                        fontWeight: '700',
                                        fontSize: 'var(--font-size-lg)'
                                    }}
                                >
                                    {progress.percentage}%
                                </span>
                            </div>
                            <div
                                style={{
                                    width: '100%',
                                    height: '12px',
                                    background: 'var(--color-bg-tertiary)',
                                    borderRadius: '6px',
                                    overflow: 'hidden',
                                    border: '1px solid var(--color-border)'
                                }}
                            >
                                <div
                                    style={{
                                        height: '100%',
                                        background: 'linear-gradient(90deg, var(--color-primary), #FDB926)',
                                        width: `${progress.percentage}%`,
                                        transition: 'width 0.3s ease'
                                    }}
                                />
                            </div>
                        </div>

                        {/* Details */}
                        {executionStarted && (
                            <div
                                style={{
                                    background: 'var(--color-bg-tertiary)',
                                    padding: 'var(--spacing-md)',
                                    borderRadius: 'var(--radius-md)',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    gap: 'var(--spacing-sm)'
                                }}
                            >
                                {progress.totalPSDs > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                            Processing PSD:
                                        </span>
                                        <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>
                                            {progress.currentPSD} / {progress.totalPSDs}
                                        </span>
                                    </div>
                                )}
                                {progress.totalFrames > 0 && (
                                    <div style={{ display: 'flex', justifyContent: 'space-between', flexDirection: isArabic ? 'row-reverse' : 'row' }}>
                                        <span style={{ fontSize: 'var(--font-size-sm)', color: 'var(--color-text-secondary)' }}>
                                            Frames:
                                        </span>
                                        <span style={{ fontWeight: '600', color: 'var(--color-text-primary)' }}>
                                            {progress.currentFrame} / {progress.totalFrames}
                                        </span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Control Buttons */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)' }}>
                        {!executionStarted ? (
                            <button
                                onClick={handleStartGeneration}
                                style={{
                                    padding: 'var(--spacing-md) var(--spacing-lg)',
                                    background: 'var(--color-primary)',
                                    color: '#000',
                                    border: 'none',
                                    borderRadius: 'var(--radius-md)',
                                    cursor: 'pointer',
                                    fontWeight: '700',
                                    fontSize: 'var(--font-size-base)',
                                    display: 'flex',
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    gap: 'var(--spacing-md)',
                                    transition: 'all var(--transition-base)',
                                    flexDirection: isArabic ? 'row-reverse' : 'row'
                                }}
                                onMouseEnter={(e) => {
                                    e.currentTarget.style.transform = 'scale(1.02)';
                                    e.currentTarget.style.boxShadow = '0 4px 12px rgba(253, 185, 38, 0.3)';
                                }}
                                onMouseLeave={(e) => {
                                    e.currentTarget.style.transform = 'scale(1)';
                                    e.currentTarget.style.boxShadow = 'none';
                                }}
                            >
                                <Play size={18} />
                                Start Generation
                            </button>
                        ) : (
                            <>
                                {isProcessing ? (
                                    <button
                                        onClick={handlePause}
                                        style={{
                                            padding: 'var(--spacing-md) var(--spacing-lg)',
                                            background: 'var(--color-warning)',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            cursor: 'pointer',
                                            fontWeight: '700',
                                            fontSize: 'var(--font-size-base)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 'var(--spacing-md)',
                                            flexDirection: isArabic ? 'row-reverse' : 'row'
                                        }}
                                    >
                                        <Pause size={18} />
                                        Pause Generation
                                    </button>
                                ) : (
                                    <button
                                        onClick={handleStartGeneration}
                                        style={{
                                            padding: 'var(--spacing-md) var(--spacing-lg)',
                                            background: 'var(--color-primary)',
                                            color: '#000',
                                            border: 'none',
                                            borderRadius: 'var(--radius-md)',
                                            cursor: 'pointer',
                                            fontWeight: '700',
                                            fontSize: 'var(--font-size-base)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            gap: 'var(--spacing-md)',
                                            flexDirection: isArabic ? 'row-reverse' : 'row'
                                        }}
                                    >
                                        <Play size={18} />
                                        Resume Generation
                                    </button>
                                )}
                                <button
                                    onClick={handleReset}
                                    style={{
                                        padding: 'var(--spacing-md) var(--spacing-lg)',
                                        background: 'var(--color-bg-tertiary)',
                                        color: 'var(--color-text-secondary)',
                                        border: '1px solid var(--color-border)',
                                        borderRadius: 'var(--radius-md)',
                                        cursor: 'pointer',
                                        fontWeight: '600',
                                        fontSize: 'var(--font-size-base)',
                                        display: 'flex',
                                        alignItems: 'center',
                                        justifyContent: 'center',
                                        gap: 'var(--spacing-md)',
                                        flexDirection: isArabic ? 'row-reverse' : 'row'
                                    }}
                                >
                                    <RotateCcw size={18} />
                                    Reset
                                </button>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Bottom Action Buttons */}
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
                    disabled={isProcessing}
                    style={{
                        padding: 'var(--spacing-md) var(--spacing-lg)',
                        background: 'var(--color-bg-tertiary)',
                        color: 'var(--color-text-secondary)',
                        border: '1px solid var(--color-border)',
                        borderRadius: 'var(--radius-md)',
                        cursor: isProcessing ? 'not-allowed' : 'pointer',
                        fontSize: 'var(--font-size-base)',
                        fontWeight: '600',
                        transition: 'all var(--transition-base)',
                        opacity: isProcessing ? 0.5 : 1
                    }}
                >
                    ← Back
                </button>
                {progress.percentage === 100 && (
                    <button
                        style={{
                            padding: 'var(--spacing-md) var(--spacing-lg)',
                            background: '#10b981',
                            color: '#fff',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: 'pointer',
                            fontSize: 'var(--font-size-base)',
                            fontWeight: '700',
                            transition: 'all var(--transition-base)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            gap: 'var(--spacing-md)',
                            flexDirection: isArabic ? 'row-reverse' : 'row'
                        }}
                    >
                        <CheckCircle2 size={18} />
                        Download Video
                    </button>
                )}
            </div>
        </div>
    );
}
