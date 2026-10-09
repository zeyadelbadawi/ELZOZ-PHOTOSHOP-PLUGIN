'use client';

import React, { useContext } from 'react';
import { Video, Image } from 'lucide-react';
import { VideoContext } from '../context/VideoContext';
import { useTranslation } from '../hooks/useTranslation';

export default function FeatureModeSelector() {
    const { videoState, setFeatureMode } = useContext(VideoContext);
    const { isArabic, dir } = useTranslation();

    const handleModeChange = (mode) => {
        if (videoState.currentMode !== mode) {
            setFeatureMode(mode);
        }
    };

    const currentMode = videoState.currentMode;

    return (
        <div
            style={{
                padding: 'var(--spacing-md) var(--spacing-lg)',
                background: 'var(--color-bg-secondary)',
                borderBottom: '1px solid var(--color-border)',
                display: 'flex',
                gap: 'var(--spacing-md)',
                flexDirection: isArabic ? 'row-reverse' : 'row',
                direction: dir,
                alignItems: 'center'
            }}
        >
            {/* Image Mode Button */}
            <button
                onClick={() => handleModeChange('image')}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-md) var(--spacing-lg)',
                    backgroundColor:
                        currentMode === 'image'
                            ? 'var(--color-primary)'
                            : 'var(--color-bg-tertiary)',
                    color:
                        currentMode === 'image'
                            ? '#000000'
                            : 'var(--color-text-secondary)',
                    border:
                        currentMode === 'image'
                            ? 'none'
                            : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontWeight: currentMode === 'image' ? '700' : '600',
                    fontSize: 'var(--font-size-lg)',
                    boxShadow:
                        currentMode === 'image'
                            ? '0 4px 12px rgba(253, 185, 38, 0.3)'
                            : 'none'
                }}
                onMouseEnter={(e) => {
                    if (currentMode !== 'image') {
                        e.currentTarget.style.backgroundColor =
                            'var(--color-bg-hover)';
                        e.currentTarget.style.borderColor =
                            'var(--color-primary)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (currentMode !== 'image') {
                        e.currentTarget.style.backgroundColor =
                            'var(--color-bg-tertiary)';
                        e.currentTarget.style.borderColor =
                            'var(--color-border)';
                    }
                }}
            >
                <Image size={20} />
                <span>Images</span>
            </button>

            {/* Video Mode Button */}
            <button
                onClick={() => handleModeChange('video')}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    padding: 'var(--spacing-md) var(--spacing-lg)',
                    backgroundColor:
                        currentMode === 'video'
                            ? 'var(--color-primary)'
                            : 'var(--color-bg-tertiary)',
                    color:
                        currentMode === 'video'
                            ? '#000000'
                            : 'var(--color-text-secondary)',
                    border:
                        currentMode === 'video'
                            ? 'none'
                            : '1px solid var(--color-border)',
                    borderRadius: 'var(--radius-lg)',
                    cursor: 'pointer',
                    transition: 'all 0.3s ease',
                    fontWeight: currentMode === 'video' ? '700' : '600',
                    fontSize: 'var(--font-size-lg)',
                    boxShadow:
                        currentMode === 'video'
                            ? '0 4px 12px rgba(253, 185, 38, 0.3)'
                            : 'none'
                }}
                onMouseEnter={(e) => {
                    if (currentMode !== 'video') {
                        e.currentTarget.style.backgroundColor =
                            'var(--color-bg-hover)';
                        e.currentTarget.style.borderColor =
                            'var(--color-primary)';
                    }
                }}
                onMouseLeave={(e) => {
                    if (currentMode !== 'video') {
                        e.currentTarget.style.backgroundColor =
                            'var(--color-bg-tertiary)';
                        e.currentTarget.style.borderColor =
                            'var(--color-border)';
                    }
                }}
            >
                <Video size={20} />
                <span>Video</span>
            </button>

            {/* Visual Indicator */}
            <div
                style={{
                    marginLeft: 'auto',
                    marginRight: isArabic ? 'auto' : 0,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--spacing-sm)',
                    paddingLeft: 'var(--spacing-lg)',
                    borderLeft: '1px solid var(--color-border)',
                    fontSize: 'var(--font-size-sm)',
                    color: 'var(--color-text-secondary)'
                }}
            >
                <div
                    style={{
                        width: '8px',
                        height: '8px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--color-primary)',
                        animation: 'pulse 2s ease-in-out infinite'
                    }}
                />
                <span>{currentMode === 'image' ? 'Batch Images' : 'Video Creation'}</span>
            </div>

            <style>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.5;
          }
        }
      `}</style>
        </div>
    );
}
