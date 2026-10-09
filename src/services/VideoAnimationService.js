/**
 * Video Animation Service
 * Handles animation preset definitions, keyframe calculations, and animation logic
 */

const ANIMATION_PRESETS = {
    FADE: {
        fadeIn: (layer, progress, intensity = 1) => ({
            opacity: 100 * progress * intensity
        }),
        fadeOut: (layer, progress, intensity = 1) => ({
            opacity: 100 * (1 - progress) * intensity
        })
    },

    ZOOM: {
        zoomIn: (layer, progress, intensity = 1) => ({
            scale: 50 + (100 * progress) * intensity,
            opacity: progress * 100
        }),
        zoomOut: (layer, progress, intensity = 1) => ({
            scale: 150 - (50 * progress) * intensity,
            opacity: 100 - (progress * 50)
        })
    },

    SLIDE: {
        slideLeft: (layer, progress, intensity = 1, bounds = {}) => ({
            position: { x: (bounds.width || 100) * (1 - progress) * intensity, y: 0 }
        }),
        slideRight: (layer, progress, intensity = 1, bounds = {}) => ({
            position: { x: -(bounds.width || 100) * (1 - progress) * intensity, y: 0 }
        }),
        slideUp: (layer, progress, intensity = 1, bounds = {}) => ({
            position: { x: 0, y: (bounds.height || 100) * (1 - progress) * intensity }
        }),
        slideDown: (layer, progress, intensity = 1, bounds = {}) => ({
            position: { x: 0, y: -(bounds.height || 100) * (1 - progress) * intensity }
        })
    },

    ROTATE: {
        spin: (layer, progress, intensity = 1) => ({
            rotation: 360 * progress * intensity
        }),
        rotateLeft: (layer, progress, intensity = 1) => ({
            rotation: -45 * progress * intensity
        }),
        rotateRight: (layer, progress, intensity = 1) => ({
            rotation: 45 * progress * intensity
        })
    },

    SCALE: {
        scaleUp: (layer, progress, intensity = 1) => ({
            scale: 100 + (50 * progress) * intensity
        }),
        scaleDown: (layer, progress, intensity = 1) => ({
            scale: 100 - (30 * progress) * intensity
        })
    }
};

const EASING_FUNCTIONS = {
    linear: (t) => t,
    easeIn: (t) => t * t,
    easeOut: (t) => t * (2 - t),
    easeInOut: (t) => t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t,
    bounce: (t) => {
        if (t < 0.5) {
            return 2 * t * t;
        } else {
            return -1 + (4 - 2 * t) * t;
        }
    }
};

class VideoAnimationService {
    /**
     * Get all available animation presets
     */
    static getAvailablePresets() {
        const presets = [];
        Object.entries(ANIMATION_PRESETS).forEach(([category, animations]) => {
            Object.keys(animations).forEach((name) => {
                presets.push({
                    name,
                    category,
                    label: this.formatAnimationName(name)
                });
            });
        });
        return presets;
    }

    /**
     * Format animation name for display
     */
    static formatAnimationName(name) {
        return name
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }

    /**
     * Apply preset animation to layer
     */
    static applyPresetAnimation(layer, presetName, progress, intensity = 1, bounds = {}) {
        for (const [category, animations] of Object.entries(ANIMATION_PRESETS)) {
            if (animations[presetName]) {
                return animations[presetName](layer, progress, intensity, bounds);
            }
        }
        console.warn(`[v0] VideoAnimationService: Unknown preset: ${presetName}`);
        return {};
    }

    /**
     * Calculate easing value
     */
    static calculateEasing(easingName, progress) {
        const easingFn = EASING_FUNCTIONS[easingName] || EASING_FUNCTIONS.linear;
        return Math.max(0, Math.min(1, easingFn(progress)));
    }

    /**
     * Interpolate between keyframes
     */
    static interpolateKeyframes(keyframes, currentTime, easing = 'linear') {
        if (!keyframes || keyframes.length === 0) return {};

        // Find surrounding keyframes
        let prevKeyframe = keyframes[0];
        let nextKeyframe = keyframes[0];

        for (let i = 0; i < keyframes.length; i++) {
            if (keyframes[i].time <= currentTime) {
                prevKeyframe = keyframes[i];
            }
            if (keyframes[i].time >= currentTime && !nextKeyframe) {
                nextKeyframe = keyframes[i];
                break;
            }
        }

        if (prevKeyframe === nextKeyframe || prevKeyframe.time === nextKeyframe.time) {
            return prevKeyframe;
        }

        // Calculate progress between keyframes
        const timeDiff = nextKeyframe.time - prevKeyframe.time;
        const timeOffset = currentTime - prevKeyframe.time;
        let progress = timeOffset / timeDiff;

        // Apply easing
        progress = this.calculateEasing(easing, progress);

        // Interpolate all properties
        const result = { time: currentTime };
        Object.keys(prevKeyframe).forEach((key) => {
            if (key === 'time') return;

            const prevValue = prevKeyframe[key];
            const nextValue = nextKeyframe[key];

            if (typeof prevValue === 'number' && typeof nextValue === 'number') {
                result[key] = prevValue + (nextValue - prevValue) * progress;
            } else {
                result[key] = progress < 0.5 ? prevValue : nextValue;
            }
        });

        return result;
    }

    /**
     * Calculate animation progress based on timing
     */
    static calculateAnimationProgress(currentTime, animationDelay, animationDuration) {
        if (currentTime < animationDelay) {
            return -1; // Not started
        }

        const elapsedTime = currentTime - animationDelay;
        if (elapsedTime > animationDuration) {
            return 1; // Completed
        }

        return elapsedTime / animationDuration;
    }

    /**
     * Generate preview data for animation
     */
    static generateAnimationPreview(layer, animationConfig, duration = 1000, steps = 30) {
        const frames = [];
        const frameInterval = duration / (steps - 1);

        for (let i = 0; i < steps; i++) {
            const time = i * frameInterval;
            const progress = time / duration;

            let frame;
            if (animationConfig.animationType === 'preset') {
                frame = this.applyPresetAnimation(
                    layer,
                    animationConfig.preset.name,
                    progress,
                    animationConfig.preset.intensity || 1,
                    layer.bounds
                );
            } else if (animationConfig.animationType === 'custom' && animationConfig.custom.keyframes) {
                frame = this.interpolateKeyframes(
                    animationConfig.custom.keyframes,
                    time,
                    animationConfig.custom.easing || 'linear'
                );
            } else {
                frame = {};
            }

            frames.push({
                time,
                progress,
                ...frame
            });
        }

        return frames;
    }

    /**
     * Validate animation configuration
     */
    static validateAnimationConfig(config) {
        const errors = [];

        if (!config) {
            errors.push('Animation config is required');
            return { isValid: false, errors };
        }

        if (!config.animationType || !['preset', 'custom'].includes(config.animationType)) {
            errors.push('Invalid animation type');
        }

        if (config.animationType === 'preset') {
            if (!config.preset || !config.preset.name) {
                errors.push('Preset name is required');
            }
            if (config.preset.intensity === undefined || config.preset.intensity < 0 || config.preset.intensity > 1) {
                errors.push('Preset intensity must be between 0 and 1');
            }
        }

        if (config.animationType === 'custom') {
            if (!config.custom || !Array.isArray(config.custom.keyframes) || config.custom.keyframes.length < 2) {
                errors.push('Custom animation requires at least 2 keyframes');
            }
        }

        return {
            isValid: errors.length === 0,
            errors
        };
    }
}

export default VideoAnimationService;
