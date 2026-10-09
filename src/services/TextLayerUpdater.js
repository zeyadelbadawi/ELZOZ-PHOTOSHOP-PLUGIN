import * as photoshop from 'photoshop';

/**
 * TextLayerUpdater Service
 * Handles updating text in Photoshop layers with Excel data
 * Executes all operations within executeAsModal context
 * 
 * Key Features:
 * - Updates text layers by name (primary) or ID (fallback)
 * - Supports batch updates across multiple layers
 * - Comprehensive error handling with descriptive messages
 * - Recursive layer searching through nested groups
 */

export const TextLayerUpdater = {
    /**
     * Find a layer by ID in the document
     * @param {number} layerId - The layer ID to search for
     * @returns {Object|null} Layer object or null if not found
     */
    async findLayerById(layerId) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            let foundLayer = null;

            const search = (layerSet) => {
                for (const layer of layerSet.layers) {
                    if (layer.id === layerId) {
                        foundLayer = layer;
                        return true;
                    }
                    if (layer.layers && search(layer)) return true;
                }
                return false;
            };

            await photoshop.core.executeAsModal(async () => {
                search(doc);
            });

            if (foundLayer) {
                console.log('  Found layer:', foundLayer.name, '(ID:', foundLayer.id, ')');
            } else {
                console.warn('  Layer ID not found:', layerId);
            }

            return foundLayer;
        } catch (e) {
            console.error('  Find layer error:', e.message);
            throw e;
        }
    },

    /**
     * Find a layer by name in the document
     * @param {string} layerName - The layer name to search for
     * @returns {Object|null} Layer object or null if not found
     */
    async findLayerByName(layerName) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

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

            await photoshop.core.executeAsModal(async () => {
                search(doc);
            });

            if (foundLayer) {
            } else {
                console.warn('  Layer name not found:', layerName);
            }

            return foundLayer;
        } catch (e) {
            console.error('  Find layer error:', e.message);
            throw e;
        }
    },

    /**
     * Update text content in a specific layer
     * @param {number} layerId - The layer ID
     * @param {string} newText - The new text content
     * @returns {Object} Result with success status
     */
    async updateTextLayer(layerId, newText) {
        try {
            console.log(`  Updating layer ${layerId} with text: ${newText}`);

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(async () => {
                let layer = null;
                const search = (layerSet) => {
                    for (const l of layerSet.layers) {
                        if (l.id === layerId) {
                            layer = l;
                            return true;
                        }
                        if (l.layers && search(l)) return true;
                    }
                    return false;
                };

                search(doc);

                if (!layer) {
                    throw new Error(`Layer with ID ${layerId} not found in document`);
                }

                if (layer.kind !== 'text') {
                    console.warn(`  Layer ${layerId} is not a text layer (kind: ${layer.kind})`);
                    return { success: false, reason: 'not_text_layer', layerId };
                }

                layer.textKey = String(newText);
                console.log(`  Layer ${layerId} updated successfully`);
                return { success: true, layerId, newText };
            });
        } catch (e) {
            console.error('  Text update error:', e.message);
            throw new Error(`Failed to update text layer: ${e.message}`);
        }
    },

    /**
     * Update multiple layers at once with text data
     * Strategy: Try by name first (most reliable), fallback to ID
     * @param {Array} updates - Array of {layerId, layerName, text} objects
     * @returns {Object} {results: [], errors: []}
     */
    async updateMultipleLayers(updates) {
        try {

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            const results = [];
            const errors = [];

            return await photoshop.core.executeAsModal(async () => {
                for (const update of updates) {
                    try {
                        const { layerId, layerName, text } = update;
                        console.log(`  Processing update: name="${layerName}", id=${layerId}, text="${text}"`);

                        let layer = null;

                        // Helper: Recursive search by name (PRIMARY - most reliable)
                        const searchByName = (layerSet, targetName) => {
                            for (const l of layerSet.layers) {
                                if (l.name === targetName) {
                                    layer = l;
                                    return true;
                                }
                                if (l.layers && searchByName(l, targetName)) return true;
                            }
                            return false;
                        };

                        // Helper: Recursive search by ID (FALLBACK)
                        const searchById = (layerSet) => {
                            for (const l of layerSet.layers) {
                                if (l.id === layerId) {
                                    layer = l;
                                    return true;
                                }
                                if (l.layers && searchById(l)) return true;
                            }
                            return false;
                        };

                        // PRIMARY: Try by name first (most reliable after document reopen)
                        if (layerName) {
                            console.log(`  Searching by name: "${layerName}"`);
                            searchByName(doc, layerName);
                        }

                        // FALLBACK: If not found by name, try by ID
                        if (!layer && layerId) {
                            console.warn(`  Name not found, trying ID: ${layerId}`);
                            searchById(doc);
                        }

                        if (!layer) {
                            const errorMsg = `Layer "${layerName}" not found. It may have been deleted or renamed in the PSD.`;
                            errors.push({
                                layerId,
                                error: errorMsg,
                                layerName
                            });
                            console.warn('  ' + errorMsg);
                            continue;
                        }

                        // CRITICAL: Validate layer type
                        if (layer.kind !== 'text') {
                            const layerType = layer.kind === 'smartObject' ? 'Smart Object' :
                                layer.kind === 'group' ? 'Group' :
                                    layer.kind === 'pixel' ? 'Pixel/Raster' :
                                        layer.kind;
                            const errorMsg = `Cannot map to non-text layer. "${layer.name}" is a ${layerType}. Only TEXT layers can have their content automatically updated with data.`;
                            errors.push({
                                layerId: layer.id,
                                error: errorMsg,
                                layerName: layer.name
                            });
                            console.warn('  ' + errorMsg);
                            continue;
                        }

                        // Update the text
                        layer.textKey = String(text);
                        results.push({
                            layerId: layer.id,
                            success: true,
                            layerName: layer.name,
                            text
                        });
                        console.log(`  Successfully updated "${layer.name}" with: ${text}`);

                    } catch (e) {
                        errors.push({
                            layerId: update.layerId,
                            error: `Exception: ${e.message}`,
                            layerName: update.layerName
                        });
                        console.error('  Error in update:', e.message);
                    }
                }

                console.log(`  Batch update complete: ${results.length} success, ${errors.length} errors`);
                if (errors.length > 0) {
                    console.warn('  Errors:', errors);
                }

                return { results, errors };
            });
        } catch (e) {
            console.error('  Multiple update fatal error:', e.message);
            throw new Error(`Layer updates failed: ${e.message}`);
        }
    },

    /**
     * Get all text layers in document with their current content
     * @returns {Array} Array of {id, name, kind, text} objects
     */
    async getAllTextLayers() {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            const textLayers = [];

            return await photoshop.core.executeAsModal(async () => {
                const walk = (layerSet, prefix = '') => {
                    for (const layer of layerSet.layers) {
                        if (layer.kind === 'text') {
                            textLayers.push({
                                id: layer.id,
                                name: layer.name,
                                fullPath: prefix ? `${prefix} / ${layer.name}` : layer.name,
                                kind: layer.kind,
                                text: layer.textKey || '',
                                isText: true
                            });
                        }
                        if (layer.layers) {
                            walk(layer, prefix ? `${prefix} / ${layer.name}` : layer.name);
                        }
                    }
                };

                walk(doc);
                return textLayers;
            });
        } catch (e) {
            console.error('  Get text layers error:', e.message);
            throw e;
        }
    },

    /**
     * Get all layers in document (for mapping UI)
     * @returns {Array} All layers with their info
     */
    async getAllLayers() {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            const allLayers = [];

            return await photoshop.core.executeAsModal(async () => {
                const walk = (layerSet, depth = 0, prefix = '') => {
                    for (const layer of layerSet.layers) {
                        allLayers.push({
                            id: layer.id,
                            name: layer.name,
                            fullPath: prefix ? `${prefix} / ${layer.name}` : layer.name,
                            kind: layer.kind,
                            depth,
                            isTextLayer: layer.kind === 'text',
                            isSmartObject: layer.kind === 'smartObject',
                            isGroup: layer.kind === 'group'
                        });

                        if (layer.layers) {
                            walk(layer, depth + 1, prefix ? `${prefix} / ${layer.name}` : layer.name);
                        }
                    }
                };

                walk(doc);
                return allLayers;
            });
        } catch (e) {
            console.error('  Get all layers error:', e.message);
            throw e;
        }
    },

    /**
     * Save document with changes
     * @returns {Object} Success status
     */
    async saveDocument() {
        try {

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(async () => {
                await photoshop.core.executeAsModal(() => doc.save());
                return { success: true };
            });
        } catch (e) {
            console.error('  Save error:', e.message);
            throw new Error(`Failed to save document: ${e.message}`);
        }
    }
};

export default TextLayerUpdater;
