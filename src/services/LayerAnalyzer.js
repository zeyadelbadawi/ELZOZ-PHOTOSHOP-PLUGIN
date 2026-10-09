import * as photoshop from 'photoshop';

/**
 * LayerAnalyzer Service
 * Analyzes document structure and layer properties
 * Provides detailed information about layers for better mapping
 */

export const LayerAnalyzer = {
    /**
     * Get all layers with detailed information
     */
    async getAllLayersDetailed() {
        try {

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            const layers = [];

            return await photoshop.core.executeAsModal(async () => {
                const walk = (layerSet, prefix = '', depth = 0) => {
                    for (const layer of layerSet.layers) {
                        layers.push({
                            id: layer.id,
                            name: prefix + layer.name,
                            kind: layer.kind,
                            depth,
                            visible: layer.visible,
                            opacity: layer.opacity,
                            locked: layer.locked,
                            isGroupEnd: layer.isGroupEnd
                        });

                        if (layer.layers) {
                            walk(layer, prefix + layer.name + ' / ', depth + 1);
                        }
                    }
                };

                walk(doc);
                return layers;
            });
        } catch (e) {
            console.error('  Layer analysis error:', e.message);
            throw e;
        }
    },

    /**
     * Get statistics about document
     */
    async getDocumentStats() {
        try {

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(async () => {
                let textLayerCount = 0;
                let smartObjectCount = 0;
                let groupCount = 0;
                let totalLayerCount = 0;

                const walk = (layerSet) => {
                    for (const layer of layerSet.layers) {
                        totalLayerCount++;

                        switch (layer.kind) {
                            case 'text':
                                textLayerCount++;
                                break;
                            case 'smartobject':
                                smartObjectCount++;
                                break;
                            case 'group':
                                groupCount++;
                                break;
                        }

                        if (layer.layers) walk(layer);
                    }
                };

                walk(doc);

                const stats = {
                    documentName: doc.title,
                    width: doc.width,
                    height: doc.height,
                    colorMode: doc.colorMode,
                    totalLayers: totalLayerCount,
                    textLayers: textLayerCount,
                    smartObjects: smartObjectCount,
                    groups: groupCount
                };

                return stats;
            });
        } catch (e) {
            console.error('  Stats error:', e.message);
            throw e;
        }
    },

    /**
     * Check if a layer is editable (text or smart object)
     */
    async isLayerEditable(layerId) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(async () => {
                const findLayer = (layerSet) => {
                    for (const layer of layerSet.layers) {
                        if (layer.id === layerId) {
                            return layer.kind === 'text' || layer.kind === 'smartobject';
                        }
                        if (layer.layers) {
                            const result = findLayer(layer);
                            if (result !== undefined) return result;
                        }
                    }
                    return false;
                };

                return findLayer(doc);
            });
        } catch (e) {
            console.error('  Editability check error:', e.message);
            throw e;
        }
    },

    /**
     * Get layer by name (useful for finding layers by display name)
     */
    async getLayerByName(layerName) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(async () => {
                let foundLayer = null;

                const search = (layerSet) => {
                    for (const layer of layerSet.layers) {
                        if (layer.name === layerName) {
                            foundLayer = layer;
                            return true;
                        }
                        if (layer.layers && search(layer)) return true;
                    }
                    return false;
                };

                search(doc);
                return foundLayer;
            });
        } catch (e) {
            console.error('  Get layer by name error:', e.message);
            throw e;
        }
    }
};

export default LayerAnalyzer;
