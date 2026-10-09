import * as photoshop from 'photoshop';

/**
 * ImageDetector Service
 * Detects and analyzes image layers in Photoshop documents
 * Provides information about smart objects, raster layers, and image layers
 */

export const ImageDetector = {
    /**
     * Detect all image layers (smart objects, raster, pixel layers) in the document
     * @returns {Array} Array of detected image layers with metadata
     */
    async detectImageLayers() {
        try {
            console.log('  ========== IMAGE DETECTOR: START ==========');
            console.log('  Detecting image layers...');

            const doc = photoshop.app.activeDocument;
            if (!doc) {
                console.error('  No active Photoshop document found');
                throw new Error('No active Photoshop document');
            }
            console.log('  Active document found:', doc.name);

            const imageLayers = [];

            return await photoshop.core.executeAsModal(async () => {
                console.log('  Inside executeAsModal, starting layer walk...');
                const walk = (layerSet, prefix = '', depth = 0) => {
                    console.log(`  Walking layer set at depth ${depth}, prefix: "${prefix}", layer count: ${layerSet.layers?.length || 0}`);

                    for (const layer of layerSet.layers) {
                        console.log(`  Processing layer: "${prefix + layer.name}", kind: ${layer.kind}, id: ${layer.id}`);

                        // Check if it's an image layer (smart object, raster, or pixel)
                        if (layer.kind === 'smartObject' || layer.kind === 'pixel' || layer.kind === 'raster') {
                            const detectedLayer = {
                                id: layer.id,
                                name: prefix + layer.name,
                                kind: layer.kind,
                                depth,
                                visible: layer.visible,
                                opacity: layer.opacity,
                                locked: layer.locked
                            };
                            console.log('  IMAGE LAYER DETECTED:', JSON.stringify(detectedLayer));
                            imageLayers.push(detectedLayer);
                        }

                        if (layer.layers) {
                            console.log(`  Layer "${prefix + layer.name}" has nested layers, recursing...`);
                            walk(layer, prefix + layer.name + ' / ', depth + 1);
                        }
                    }
                };

                walk(doc);
                console.log('  Layer walk completed');
                console.log('  TOTAL IMAGE LAYERS DETECTED:', imageLayers.length);
                console.log('  All detected layers:', JSON.stringify(imageLayers, null, 2));
                console.log('  ========== IMAGE DETECTOR: END ==========');
                return imageLayers;
            });
        } catch (e) {
            console.error('  IMAGE DETECTOR ERROR:', e.message);
            console.error('  Stack trace:', e.stack);
            throw e;
        }
    },

    /**
     * Get count of image layers
     * @returns {number} Count of image layers
     */
    async getImageLayerCount() {
        try {
            const imageLayers = await this.detectImageLayers();
            return imageLayers.length;
        } catch (e) {
            console.error('  Error getting image layer count:', e.message);
            return 0;
        }
    },

    /**
     * Get image layers grouped by type
     * @returns {Object} Object with properties for each layer type
     */
    async getImageLayersByType() {
        try {
            const imageLayers = await this.detectImageLayers();

            const grouped = {
                smartObjects: imageLayers.filter(l => l.kind === 'smartObject'),
                rasterLayers: imageLayers.filter(l => l.kind === 'raster' || l.kind === 'pixel'),
                total: imageLayers.length
            };

            console.log('  Image layers by type:', grouped);
            return grouped;
        } catch (e) {
            console.error('  Error grouping image layers:', e.message);
            throw e;
        }
    }
};

export default ImageDetector;
