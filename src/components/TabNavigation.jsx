'use client';

import React, { useContext } from 'react';
import {
    Settings,
    Link as LinkIcon,
    MapPin,
    Play,
    BarChart3,
    Layers,
    Wand2
} from 'lucide-react';
import { useTranslation } from '../hooks/useTranslation';
import { VideoContext } from '../context/VideoContext';

export default function TabNavigation({ activeTab, onTabChange }) {
    const { t, isArabic, dir } = useTranslation();
    const { videoState } = useContext(VideoContext);

    // Define tabs for Image mode
    const imageTabs = [
        { id: 'setup', labelKey: 'tabs.setup', Icon: Settings, step: 1 },
        { id: 'mapping', labelKey: 'tabs.mapping', Icon: LinkIcon, step: 2 },
        { id: 'image-mapping', labelKey: 'tabs.imageMapping', Icon: MapPin, step: 3 },
        { id: 'execute', labelKey: 'tabs.execute', Icon: Play, step: 4 },
        { id: 'analytics', labelKey: 'tabs.analytics', Icon: BarChart3, step: 5 }
    ];

    // Define tabs for Video mode
    const videoTabs = [
        { id: 'video-setup', labelKey: 'tabs.videoSetup', Icon: Settings, step: 1 },
        { id: 'video-layer-mapping', labelKey: 'tabs.videoLayerMapping', Icon: Layers, step: 2 },
        { id: 'video-animation', labelKey: 'tabs.videoAnimation', Icon: Wand2, step: 3 },
        { id: 'video-execute', labelKey: 'tabs.videoExecute', Icon: Play, step: 4 }
    ];

    // Select tabs based on current mode
    const tabs = videoState.currentMode === 'video' ? videoTabs : imageTabs;

    return (
        <div style={{
            padding: 'var(--spacing-lg)',
            background: 'var(--color-bg-secondary)',
            borderBottom: '1px solid var(--color-border)',
            overflowX: 'auto',
            direction: dir,
            textAlign: isArabic ? 'right' : 'left'
        }}>
            <div style={{
                display: 'flex',
                gap: 'var(--spacing-md)',
                minWidth: 'min-content',
                flexDirection: isArabic ? 'row-reverse' : 'row'
            }}>
                {tabs.map(tab => {
                    const Icon = tab.Icon;
                    const isActive = activeTab === tab.id;

                    return (
                        <button
                            key={tab.id}
                            onClick={() => onTabChange(tab.id)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: 'var(--spacing-sm)',
                                padding: 'var(--spacing-md) var(--spacing-lg)',
                                backgroundColor: isActive ? 'var(--color-primary)' : 'var(--color-bg-tertiary)',
                                color: isActive ? 'white' : 'var(--color-text-secondary)',
                                border: isActive ? 'none' : '1px solid var(--color-border)',
                                borderRadius: 'var(--radius-md)',
                                cursor: 'pointer',
                                transition: 'all var(--transition-base)',
                                fontWeight: isActive ? '600' : '500',
                                fontSize: 'var(--font-size-sm)',
                                boxShadow: isActive ? '0 4px 12px rgba(37, 99, 235, 0.2)' : 'none',
                                flexDirection: isArabic ? 'row-reverse' : 'row'
                            }}
                            onMouseEnter={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-bg-hover)';
                                }
                            }}
                            onMouseLeave={(e) => {
                                if (!isActive) {
                                    e.currentTarget.style.backgroundColor = 'var(--color-bg-tertiary)';
                                }
                            }}
                        >
                            <Icon size={16} />
                            <span>{t(tab.labelKey)}</span>
                            <span style={{
                                fontSize: 'var(--font-size-xs)',
                                opacity: 0.7,
                                [isArabic ? 'marginRight' : 'marginLeft']: 'var(--spacing-sm)'
                            }}>
                                {tab.step}
                            </span>
                        </button>
                    );
                })}
            </div>
        </div>
    );
}
