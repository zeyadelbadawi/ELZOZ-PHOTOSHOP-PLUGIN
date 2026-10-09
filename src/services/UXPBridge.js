/**
 * UXP Bridge - Direct access to Photoshop and UXP APIs
 * This is the only layer between React and Photoshop
 * 
 * UXP globals available in plugin context:
 * - window.uxp (UXP APIs)
 * - window.require('photoshop') (Photoshop APIs)
 */

// Get global references
let photoshop = {};
let fs = {};
let storage = {}; // Declare the storage variable

// Initialize UXP API
if (typeof window !== 'undefined') {
    try {
        const uxp = window.uxp || {};
        fs = uxp.storage ? uxp.storage.localFileSystem : {};
        storage = uxp.storage || {}; // Import or declare the storage variable

        if (window.require) {
            try {
                photoshop = window.require('photoshop');
            } catch (e) {
                console.warn('  Photoshop module not available yet');
            }
        }
    } catch (e) {
        console.warn('  UXP initialization issue:', e.message);
    }
}

/**
 * File handling via UXP storage API
 */
export const fileOps = {
    /**
     * Pick and read an Excel file
     */
    async pickExcelFile() {
        try {
            if (!fs.getFileForOpening) {
                throw new Error('File system API not available. Make sure the plugin is running in Photoshop.');
            }

            const excelFile = await fs.getFileForOpening({
                types: ['xlsx', 'xls', 'csv']
            });

            if (!excelFile) {
                return null;
            }

            const uxp = window.uxp || {};
            const storageFormats = uxp.storage?.formats || {};
            const data = await excelFile.read({ format: storageFormats.binary || 'binary' });
            console.log(`  Excel file picked: ${excelFile.name}`);

            return {
                file: excelFile,
                fileName: excelFile.name,
                path: excelFile.nativePath,
                data: new Uint8Array(data)
            };
        } catch (e) {
            console.error('  Excel picker error:', e.message);
            throw new Error(`Failed to pick Excel file: ${e.message}`);
        }
    },

    /**
     * Pick folder for images
     */
    async pickFolder() {
        try {
            if (!fs.getFolder) {
                throw new Error('File system API not available. Make sure the plugin is running in Photoshop.');
            }

            const folder = await fs.getFolder();
            if (!folder) {
                return null;
            }

            console.log(`  Folder selected: ${folder.nativePath}`);

            return {
                folder: folder,
                path: folder.nativePath,
                name: folder.name
            };
        } catch (e) {
            console.error('  Folder picker error:', e.message);
            throw new Error(`Failed to pick folder: ${e.message}`);
        }
    },

    /**
     * Get files from a folder
     */
    async getFilesFromFolder(folder) {
        try {
            const entries = await folder.getEntries();
            const files = entries.filter(entry => !entry.isFolder);
            console.log(`  Found ${files.length} files in folder`);
            return files.map(f => ({
                name: f.name,
                nativePath: f.nativePath
            }));
        } catch (e) {
            console.error('  Get files error:', e);
            throw e;
        }
    },

    /**
     * Pick a PSD file
     */
    async pickPSDFile() {
        try {
            if (!fs.getFileForOpening) {
                throw new Error('File system API not available. Make sure the plugin is running in Photoshop.');
            }

            const psdFile = await fs.getFileForOpening({
                types: ['psd']
            });

            if (!psdFile) {
                return null;
            }


            return {
                file: psdFile,
                fileName: psdFile.name,
                path: psdFile.nativePath
            };
        } catch (e) {
            console.error('  PSD picker error:', e.message);
            throw new Error(`Failed to pick PSD file: ${e.message}`);
        }
    }
};

/**
 * Photoshop batchPlay commands for layer manipulation
 */
export const psOps = {
    /**
     * Get all layers from current document
     */
    async getAllLayers() {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active document');

            const layers = [];

            const collectLayers = (layerArray) => {
                for (const layer of layerArray) {
                    layers.push({
                        id: layer.id,
                        name: layer.name,
                        kind: layer.kind,
                        visible: layer.visible,
                        opacity: layer.opacity,
                        blendMode: layer.blendMode
                    });

                    if (layer.layers && layer.layers.length > 0) {
                        collectLayers(layer.layers);
                    }
                }
            };

            collectLayers(doc.layers);
            console.log(`  Found ${layers.length} layers`);
            return layers;
        } catch (e) {
            console.error('  Get layers error:', e);
            throw e;
        }
    },

    /**
     * Update text layer content
     */
    async updateTextLayer(layerId, newText) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active document');

            // Find layer by ID
            const findLayerById = (layers, id) => {
                for (const layer of layers) {
                    if (layer.id === id) return layer;
                    if (layer.layers) {
                        const found = findLayerById(layer.layers, id);
                        if (found) return found;
                    }
                }
                return null;
            };

            const layer = findLayerById(doc.layers, layerId);
            if (!layer) throw new Error(`Layer ${layerId} not found`);
            if (layer.kind !== 'text') throw new Error('Layer is not a text layer');

            layer.textKey = newText;
            console.log(`  Updated text layer: ${layer.name}`);
            return true;
        } catch (e) {
            console.error('  Update text layer error:', e);
            throw e;
        }
    },

    /**
     * Get text layer content
     */
    async getTextLayerContent(layerId) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active document');

            // Find layer by ID
            const findLayerById = (layers, id) => {
                for (const layer of layers) {
                    if (layer.id === id) return layer;
                    if (layer.layers) {
                        const found = findLayerById(layer.layers, id);
                        if (found) return found;
                    }
                }
                return null;
            };

            const layer = findLayerById(doc.layers, layerId);
            if (!layer) throw new Error(`Layer ${layerId} not found`);
            if (layer.kind !== 'text') throw new Error('Layer is not a text layer');

            console.log(`  Got text from layer: ${layer.name}`);
            return layer.textKey || '';
        } catch (e) {
            console.error('  Get text layer error:', e);
            throw e;
        }
    },

    /**
     * Open a PSD file
     */
    async openPSD(psdFile) {
        try {
            const doc = await photoshop.open(psdFile);
            console.log(`  Opened PSD: ${doc.title}`);
            return doc;
        } catch (e) {
            console.error('  Open PSD error:', e);
            throw e;
        }
    },

    /**
     * Save current document
     */
    async saveDocument() {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active document');

            await doc.save();
            console.log(`  Saved: ${doc.title}`);
            return true;
        } catch (e) {
            console.error('  Save error:', e);
            throw e;
        }
    },

    /**
     * Export layer as PNG
     */
    async exportLayerAsPNG(layerId, outputPath) {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active document');

            // Find and select layer
            const findLayerById = (layers, id) => {
                for (const layer of layers) {
                    if (layer.id === id) return layer;
                    if (layer.layers) {
                        const found = findLayerById(layer.layers, id);
                        if (found) return found;
                    }
                }
                return null;
            };

            const layer = findLayerById(doc.layers, layerId);
            if (!layer) throw new Error(`Layer ${layerId} not found`);

            // Use batchPlay to export
            await photoshop.action.batchPlay(
                [
                    {
                        _obj: 'export',
                        _in: layer,
                        _out: outputPath,
                        format: 'PNG'
                    }
                ],
                {}
            );

            console.log(`  Exported layer to: ${outputPath}`);
            return true;
        } catch (e) {
            console.error('  Export error:', e);
            throw e;
        }
    }
};

export default { fileOps, psOps };
