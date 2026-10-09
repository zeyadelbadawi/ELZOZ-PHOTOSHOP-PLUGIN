'use client';

/**
 * VideoAnimationEngine
 * Core engine for generating frame sequences and compositing animations
 */

class VideoAnimationEngine {
    constructor() {
        this.frameCache = new Map();
        this.layerAnimations = new Map();
    }

    /**
     * Generate animation keyframes for a layer
     */
    generateKeyframes(layerId, layerConfig, animationSettings, psdDuration) {
        const {
            duration = 1000,
            delay = 0,
            easing = 'ease-in-out',
            animationType = 'opacity',
            preset = 'fadeIn'
        } = animationSettings;

        const keyframes = [];
        const frameRate = 30;
        const totalFrames = Math.ceil((psdDuration + duration + delay) / (1000 / frameRate));

        for (let frame = 0; frame < totalFrames; frame++) {
            const time = (frame / frameRate) * 1000;
            const state = this.calculateFrameState(time, layerId, duration, delay, easing, animationType);

            keyframes.push({
                frame,
                time,
                state
            });
        }

        return keyframes;
    }

    /**
     * Calculate layer state at a specific time
     */
    calculateFrameState(time, layerId, duration, delay, easing, animationType) {
        const normalizedTime = Math.max(0, time - delay);
        const progress = Math.min(1, normalizedTime / duration);
        const easedProgress = this.applyEasing(progress, easing);

        let state = {
            opacity: 1,
            scale: { x: 1, y: 1 },
            rotation: 0,
            position: { x: 0, y: 0 }
        };

        // Apply animation type
        if (animationType === 'opacity') {
            state.opacity = progress === 0 ? 0 : easedProgress;
        } else if (animationType === 'scale') {
            const scale = 1 + (easedProgress - 1) * 0.3; // Scale from 1 to 1.3
            state.scale = { x: scale, y: scale };
        } else if (animationType === 'rotation') {
            state.rotation = easedProgress * 360; // Full rotation
        } else if (animationType === 'position') {
            state.position = {
                x: easedProgress * 50, // Move 50 units
                y: 0
            };
        }

        // Only apply if animation is in progress
        if (progress <= 1) {
            return state;
        }

        // After animation ends, return final state
        return {
            opacity: 1,
            scale: { x: 1, y: 1 },
            rotation: 0,
            position: { x: 0, y: 0 }
        };
    }

    /**
     * Apply easing function
     */
    applyEasing(t, easing) {
        if (easing === 'linear') return t;
        if (easing === 'ease-in') return t * t;
        if (easing === 'ease-out') return t * (2 - t);
        if (easing === 'ease-in-out') return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
        if (easing === 'elastic') {
            const c5 = (2 * Math.PI) / 4.5;
            return t === 0 ? 0 : t === 1 ? 1 : -Math.pow(2, 10 * t - 10) * Math.sin((t * 10 - 10.75) * c5);
        }
        if (easing === 'spring') {
            const c1 = 1.70158;
            const c3 = c1 + 1;
            return c3 * t * t * t - c1 * t * t;
        }
        return t;
    }

    /**
     * Build animation timeline for all layers
     */
    buildTimeline(videoLayerMapping, videoAnimationSettings, psdDuration, executionMode = 'simultaneous') {
        const timeline = [];
        let maxEndTime = 0;

        // Build keyframes for each animated layer
        const animatedLayers = Object.entries(videoLayerMapping).filter(([, mapping]) => mapping.includeInAnimation);

        for (const [layerId, mapping] of animatedLayers) {
            const settings = videoAnimationSettings[layerId] || {
                duration: 1000,
                delay: 0,
                easing: 'ease-in-out'
            };

            const keyframes = this.generateKeyframes(
                layerId,
                mapping,
                settings,
                psdDuration
            );

            const endTime = settings.delay + settings.duration;
            maxEndTime = Math.max(maxEndTime, endTime);

            timeline.push({
                layerId,
                keyframes,
                duration: settings.duration,
                delay: settings.delay,
                endTime
            });
        }

        return {
            timeline,
            totalDuration: maxEndTime + psdDuration,
            layerCount: animatedLayers.length
        };
    }

    /**
     * Calculate total video duration
     */
    calculateVideoDuration(psdCount, psdDuration, transitionDuration, executionMode) {
        if (executionMode === 'sequential') {
            // All PSDs play one after another with transitions
            return psdCount * (psdDuration + transitionDuration) - transitionDuration;
        } else {
            // Simultaneous (all animations happen on same PSD frame)
            return psdCount * psdDuration;
        }
    }

    /**
     * Generate frame schedule
     */
    generateFrameSchedule(videoDurationMs, frameRate = 30) {
        const frames = [];
        const frameDuration = 1000 / frameRate;
        const totalFrames = Math.ceil(videoDurationMs / frameDuration);

        for (let i = 0; i < totalFrames; i++) {
            frames.push({
                index: i,
                time: i * frameDuration,
                timestamp: new Date().toISOString()
            });
        }

        return frames;
    }

    /**
     * Create a composite state for rendering
     */
    createCompositeState(psdIndex, frame, timeline) {
        const compositeState = {
            psdIndex,
            frame,
            layers: new Map()
        };

        // Get all layer states at this frame
        for (const layerTimeline of timeline) {
            const keyframe = layerTimeline.keyframes[frame];
            if (keyframe) {
                compositeState.layers.set(layerTimeline.layerId, keyframe.state);
            }
        }

        return compositeState;
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.frameCache.clear();
        this.layerAnimations.clear();
    }
}

export default new VideoAnimationEngine();
