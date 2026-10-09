/**
 * Video Render Service
 * Handles frame rendering and layer transformation
 */

import VideoAnimationService from './VideoAnimationService.js';

class VideoRenderService {
    static frameCache = new Map();

    /**
     * Apply animation to a layer at a specific time
     */
    static applyAnimationToLayer(layer, layerMapping, animationSettings, currentTime) {
        if (!layerMapping?.includeInAnimation) {
            return { ...layer };
        }

        const settings = animationSettings || {};
        const delay = settings.delay || 0;
        const duration = settings.duration || 1000;

        // Calculate if animation is active
        const progress = VideoAnimationService.calculateAnimationProgress(
            currentTime,
            delay,
            duration
        );

        if (progress === -1) {
            // Animation not started, return layer at initial state
            return { ...layer };
        }

        if (progress === 1) {
            // Animation completed
            const result = { ...layer };
            if (layerMapping.animationType === 'preset') {
                const transforms = VideoAnimationService.applyPresetAnimation(
                    layer,
                    layerMapping.preset.name,
                    1,
                    layerMapping.preset.intensity,
                    layer.bounds
                );
                return { ...result, ...transforms };
            }
            return result;
        }

        // Animation in progress
        const clampedProgress = Math.max(0, Math.min(1, progress));
        let transforms = {};

        if (layerMapping.animationType === 'preset') {
            transforms = VideoAnimationService.applyPresetAnimation(
                layer,
                layerMapping.preset.name,
                clampedProgress,
                layerMapping.preset.intensity,
                layer.bounds
            );
        } else if (layerMapping.animationType === 'custom' && layerMapping.custom?.keyframes) {
            const absoluteTime = clampedProgress * duration;
            transforms = VideoAnimationService.interpolateKeyframes(
                layerMapping.custom.keyframes,
                absoluteTime,
                layerMapping.custom.easing || 'linear'
            );
        }

        return { ...layer, ...transforms };
    }

    /**
     * Render all layers at a specific time
     */
    static renderFrameState(layers, layerMappings, animationSettings, currentTime) {
        const frameState = layers.map(layer => {
            const layerMapping = layerMappings[layer.layerId];
            return this.applyAnimationToLayer(layer, layerMapping, animationSettings[layer.layerId], currentTime);
        });

        return frameState;
    }

    /**
     * Generate all frame data for a PSD
     */
    static generateFrameSequence(layers, layerMappings, animationSettings, duration, frameRate) {
        const frames = [];
        const frameCount = Math.ceil((duration / 1000) * frameRate);
        const frameInterval = 1000 / frameRate; // Time between frames in ms

        for (let frameIndex = 0; frameIndex < frameCount; frameIndex++) {
            const currentTime = frameIndex * frameInterval;
            const frameState = this.renderFrameState(
                layers,
                layerMappings,
                animationSettings,
                currentTime
            );

            frames.push({
                frameIndex,
                time: currentTime,
                layers: frameState,
                data: JSON.stringify(frameState) // Serialized for caching
            });
        }

        return frames;
    }

    /**
     * Cache a rendered frame
     */
    static cacheFrame(frameKey, frameData) {
        this.frameCache.set(frameKey, frameData);
    }

    /**
     * Get cached frame
     */
    static getCachedFrame(frameKey) {
        return this.frameCache.get(frameKey);
    }

    /**
     * Clear frame cache
     */
    static clearCache() {
        this.frameCache.clear();
    }

    /**
     * Get cache statistics
     */
    static getCacheStats() {
        return {
            cachedFrames: this.frameCache.size,
            memorySizeMB: (this.frameCache.size * 0.5) // Rough estimate
        };
    }

    /**
     * Optimize layer visibility based on opacity
     */
    static shouldRenderLayer(layer, threshold = 0.01) {
        return !layer.opacity || layer.opacity >= threshold;
    }

    /**
     * Create layer transformation matrix
     */
    static createTransformMatrix(layer) {
        const matrix = {
            translate: [layer.position?.x || 0, layer.position?.y || 0],
            scale: [layer.scale || 100, layer.scale || 100],
            rotate: layer.rotation || 0,
            opacity: layer.opacity !== undefined ? layer.opacity : 100
        };
        return matrix;
    }

    /**
     * Validate render configuration
     */
    static validateRenderConfig(config) {
        const errors = [];

        if (!config.frameRate || config.frameRate < 1 || config.frameRate > 120) {
            errors.push('Frame rate must be between 1 and 120');
        }

        if (!config.duration || config.duration < 100 || config.duration > 600000) {
            errors.push('Duration must be between 100ms and 10 minutes');
        }

        if (!config.resolution || !config.resolution.match(/^\d+x\d+$/)) {
            errors.push('Invalid resolution format');
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default VideoRenderService;
