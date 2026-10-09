'use client';

import React, { createContext, useState } from 'react';

export const VideoContext = createContext();

export function VideoProvider({ children }) {
    const [videoState, setVideoState] = useState({
        // Feature Mode
        currentMode: 'image', // 'image' | 'video'

        // CURRENT STEP
        currentVideoStep: 1, // 1: Setup, 2: Layer Mapping, 3: Animation, 4: Execute

        // SETUP PHASE
        videoPSDs: [], // Array of { id, path, name, file, layerStructure, isValid, error }
        videoLayerStructure: [], // Array of layers from first PSD

        // LAYER MAPPING PHASE
        videoLayerMapping: {}, // { layerId: { includeInAnimation, animationType, preset, custom } }

        // ANIMATION MAPPING PHASE
        videoAnimationSettings: {}, // { layerId: { duration, delay, easing } }

        // EXECUTION PHASE
        videoExecutionConfig: {
            executionMode: 'simultaneous', // 'sequential' | 'simultaneous'
            psdDuration: 3000,
            transitionBetweenPSDs: 'crossfade',
            transitionDuration: 300,
            frameRate: 30,
            resolution: '1920x1080',
            outputFormat: 'mp4', // 'mp4' | 'webm' | 'gif'
            qualityPreset: 'balanced' // 'fast' | 'balanced' | 'high'
        },

        // PROCESSING STATE
        isGenerating: false,
        videoProgress: {
            currentPSD: 0,
            totalPSDs: 0,
            currentFrame: 0,
            totalFrames: 0,
            percentage: 0
        },
        generatedVideoPath: null,
        skippedPSDs: [] // Array of { name, reason }
    });

    const updateVideoState = (updates) => {
        setVideoState(prev => ({ ...prev, ...updates }));
    };

    const setFeatureMode = (mode) => {
        setVideoState(prev => ({ ...prev, currentMode: mode }));
    };

    const setCurrentVideoStep = (step) => {
        setVideoState(prev => ({ ...prev, currentVideoStep: step }));
    };

    const setVideoPSDs = (psds) => {
        setVideoState(prev => ({ ...prev, videoPSDs: psds }));
    };

    const setVideoLayerStructure = (layers) => {
        setVideoState(prev => ({ ...prev, videoLayerStructure: layers }));
    };

    const setVideoLayerMapping = (layerId, mapping) => {
        setVideoState(prev => ({
            ...prev,
            videoLayerMapping: {
                ...prev.videoLayerMapping,
                [layerId]: mapping
            }
        }));
    };

    const setVideoAnimationSettings = (layerId, settings) => {
        setVideoState(prev => ({
            ...prev,
            videoAnimationSettings: {
                ...prev.videoAnimationSettings,
                [layerId]: settings
            }
        }));
    };

    const setVideoExecutionConfig = (config) => {
        setVideoState(prev => ({
            ...prev,
            videoExecutionConfig: {
                ...prev.videoExecutionConfig,
                ...config
            }
        }));
    };

    const updateVideoProgress = (progress) => {
        setVideoState(prev => ({
            ...prev,
            videoProgress: {
                ...prev.videoProgress,
                ...progress
            }
        }));
    };

    const addSkippedPSD = (name, reason) => {
        setVideoState(prev => ({
            ...prev,
            skippedPSDs: [...prev.skippedPSDs, { name, reason }]
        }));
    };

    const setIsGenerating = (isGenerating) => {
        setVideoState(prev => ({ ...prev, isGenerating }));
    };

    const setGeneratedVideoPath = (path) => {
        setVideoState(prev => ({ ...prev, generatedVideoPath: path }));
    };

    const clearVideoState = () => {
        setVideoState({
            currentMode: 'image',
            currentVideoStep: 1,
            videoPSDs: [],
            videoLayerStructure: [],
            videoLayerMapping: {},
            videoAnimationSettings: {},
            videoExecutionConfig: {
                executionMode: 'simultaneous',
                psdDuration: 3000,
                transitionBetweenPSDs: 'crossfade',
                transitionDuration: 300,
                frameRate: 30,
                resolution: '1920x1080',
                outputFormat: 'mp4',
                qualityPreset: 'balanced'
            },
            isGenerating: false,
            videoProgress: {
                currentPSD: 0,
                totalPSDs: 0,
                currentFrame: 0,
                totalFrames: 0,
                percentage: 0
            },
            generatedVideoPath: null,
            skippedPSDs: []
        });
    };

    return (
        <VideoContext.Provider value={{
            videoState,
            updateVideoState,
            setFeatureMode,
            setCurrentVideoStep,
            setVideoPSDs,
            setVideoLayerStructure,
            setVideoLayerMapping,
            setVideoAnimationSettings,
            setVideoExecutionConfig,
            updateVideoProgress,
            addSkippedPSD,
            setIsGenerating,
            setGeneratedVideoPath,
            clearVideoState
        }}>
            {children}
        </VideoContext.Provider>
    );
}
