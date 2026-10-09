'use client';

import React, { useState, useContext, useEffect } from 'react';
import { Sparkles, AlertCircle } from 'lucide-react';
import { AuthContext } from '../context/AuthContext';
import { LanguageProvider } from '../context/LanguageContext';
import { ProjectProvider } from '../context/ProjectContext';
import { VideoProvider, VideoContext } from '../context/VideoContext'; // Updated import
import LoginPanel from './LoginPanel';
import TabNavigation from './TabNavigation';
import UserHeader from './UserHeader';
import FeatureModeSelector from './FeatureModeSelector';
import NoCreditsOverlay from './NoCreditsOverlay';
import SetupPanel from '../panels/SetupPanel';
import MappingPanel from '../panels/MappingPanel';
import ImageMappingPanel from '../panels/ImageMappingPanel';
import ImagesPanel from '../panels/ImagesPanel';
import ExecutePanel from '../panels/ExecutePanel';
import AnalyticsPanel from '../panels/AnalyticsPanel';
import VideoSetupPanel from '../panels/VideoSetupPanel';
import VideoLayerMappingPanel from '../panels/VideoLayerMappingPanel';
import VideoAnimationPanel from '../panels/VideoAnimationPanel';
import VideoExecutePanel from '../panels/VideoExecutePanel';

function AppContent() {
    const [activeTab, setActiveTab] = useState('setup');
    const { videoState } = useContext(VideoContext);

    // Auto-switch tab when video step changes
    useEffect(() => {
        if (videoState.currentMode === 'video') {
            const stepToTabMap = {
                1: 'video-setup',
                2: 'video-layer-mapping',
                3: 'video-animation',
                4: 'video-execute'
            };
            const newTab = stepToTabMap[videoState.currentVideoStep] || 'video-setup';
            setActiveTab(newTab);
        }
    }, [videoState.currentVideoStep, videoState.currentMode]);

    const renderTabContent = () => {
        // Image mode tabs
        if (videoState.currentMode === 'image') {
            switch (activeTab) {
                case 'setup':
                    return <SetupPanel />;
                case 'mapping':
                    return <MappingPanel />;
                case 'image-mapping':
                    return <ImageMappingPanel />;
                case 'images':
                    return <ImagesPanel />;
                case 'execute':
                    return <ExecutePanel />;
                case 'analytics':
                    return <AnalyticsPanel />;
                default:
                    return null;
            }
        }

        // Video mode tabs
        if (videoState.currentMode === 'video') {
            switch (activeTab) {
                case 'video-setup':
                    return <VideoSetupPanel />;
                case 'video-layer-mapping':
                    return <VideoLayerMappingPanel />;
                case 'video-animation':
                    return <VideoAnimationPanel />;
                case 'video-execute':
                    return <VideoExecutePanel />;
                default:
                    return null;
            }
        }

        return null;
    };

    return (
        <ProjectProvider>
            <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100vh',
                overflow: 'hidden',
                background: 'var(--color-bg-primary)'
            }}>
                {/* Professional Header */}
                <div style={{
                    padding: 'var(--spacing-lg)',
                    borderBottom: '1px solid var(--color-border)',
                    background: 'linear-gradient(135deg, var(--color-bg-secondary) 0%, var(--color-bg-tertiary) 100%)',
                    flexShrink: 0
                }}>
                    <div style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center'
                    }}>
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 'var(--spacing-md)'
                        }}>
                            <div style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: '40px',
                                height: '40px',
                                background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
                                borderRadius: 'var(--radius-lg)',
                                color: 'white'
                            }}>
                                <Sparkles size={20} />
                            </div>
                            <div>
                                <h1 style={{
                                    margin: 0,
                                    fontSize: 'var(--font-size-2xl)',
                                    fontWeight: '700',
                                    color: 'var(--color-text-primary)'
                                }}>
                                    Elzoz Studio
                                </h1>
                                <p style={{
                                    margin: '2px 0 0 0',
                                    fontSize: 'var(--font-size-sm)',
                                    color: 'var(--color-text-muted)'
                                }}>
                                    Batch Photo Design Automation
                                </p>
                            </div>
                        </div>
                        <UserHeader />
                    </div>
                </div>

                {/* Feature Mode Selector */}
                <FeatureModeSelector />

                {/* Tab Navigation */}
                <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />

                {/* Content Area with No Credits Overlay */}
                <NoCreditsOverlay showOverlay={true}>
                    <div style={{
                        flex: 1,
                        display: 'flex',
                        flexDirection: 'column',
                        overflowY: 'auto',
                        overflowX: 'hidden',
                        minHeight: 0,
                        background: 'var(--color-bg-primary)'
                    }}>
                        <div style={{
                            flex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            padding: 'var(--spacing-lg)'
                        }}>
                            {renderTabContent()}
                        </div>
                    </div>
                </NoCreditsOverlay>
            </div>
        </ProjectProvider>
    );
}

export default function AppContainer() {
    const contextValue = useContext(AuthContext);


    if (!contextValue) {
        console.error('  AppContainer: AuthContext not found! Make sure AuthProvider wraps this component');
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--color-bg-primary)',
                flexDirection: 'column',
                gap: 'var(--spacing-lg)'
            }}>
                <p style={{ color: 'var(--color-text-primary)', textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                    <AlertCircle size={20} style={{ color: 'var(--color-error)' }} /> Context Error: AuthProvider not found
                </p>
                <p style={{ color: 'var(--color-text-secondary)', fontSize: '12px' }}>
                    Check console for details
                </p>
            </div>
        );
    }

    const { isAuthenticated, isLoading } = contextValue;

    if (isLoading) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100vh',
                background: 'var(--color-bg-primary)',
                flexDirection: 'column',
                gap: 'var(--spacing-lg)'
            }}>
                <div style={{
                    width: '40px',
                    height: '40px',
                    background: 'linear-gradient(135deg, var(--color-primary) 0%, var(--color-info) 100%)',
                    borderRadius: 'var(--radius-lg)',
                    animation: 'spin 1s linear infinite'
                }} />
                <p style={{ color: 'var(--color-text-secondary)' }}>Loading...</p>
            </div>
        );
    }

    if (!isAuthenticated) {
        return <LoginPanel />;
    }

    return (
        <LanguageProvider>
            <ProjectProvider>
                <VideoProvider>
                    <AppContent />
                </VideoProvider>
            </ProjectProvider>
        </LanguageProvider>
    );
}
