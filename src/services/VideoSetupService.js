/**
 * Video Setup Service - Load and validate multiple PSD files
 * Uses global window commands exposed in index.jsx (same pattern as image feature)
 * These are: window.openPSDInPhotoshop(), window.getAllLayersFromPSD(), window.closePSDDocument()
 */

class VideoSetupService {
    /**
     * Load all PSD files from a folder
     */
    static async loadPSDsFromFolder(folderObject) {
        try {

            if (!folderObject) {
                throw new Error('No folder object provided');
            }

            // Get all entries in the folder
            const entries = await folderObject.getEntries();


            // Filter for PSD files only
            const psdFiles = entries.filter(entry =>
                entry.name.toLowerCase().endsWith('.psd') && !entry.isFolder
            );


            if (psdFiles.length === 0) {
                return {
                    success: true,
                    psdFiles: [],
                    count: 0
                };
            }

            // Load and extract layers from each PSD
            const loadedPSDs = [];
            for (const psdFile of psdFiles) {

                try {
                    const layerData = await this.extractLayerStructureFromPSD(psdFile);

                    loadedPSDs.push({
                        id: `psd_${Date.now()}_${Math.random()}`,
                        path: psdFile.nativePath,
                        name: psdFile.name,
                        file: psdFile,
                        layerStructure: layerData.layers,
                        isValid: layerData.success,
                        error: layerData.error || null
                    });
                } catch (error) {
                    console.error('  VideoSetupService: Error with', psdFile.name, error);
                    loadedPSDs.push({
                        id: `psd_${Date.now()}_${Math.random()}`,
                        path: psdFile.nativePath,
                        name: psdFile.name,
                        file: psdFile,
                        layerStructure: [],
                        isValid: false,
                        error: error.message
                    });
                }
            }


            return {
                success: true,
                psdFiles: loadedPSDs,
                count: loadedPSDs.length
            };
        } catch (error) {
            console.error('  VideoSetupService: Error loading PSDs', error);
            return {
                success: false,
                error: error.message,
                psdFiles: [],
                count: 0
            };
        }
    }

    /**
     * Extract layer structure from a PSD file using global window commands
     * (Same pattern as existing image feature)
     */
    static async extractLayerStructureFromPSD(psdFile) {
        try {

            // Use global command to open PSD (same pattern as image feature)
            if (!window.openPSDInPhotoshop) {
                throw new Error('window.openPSDInPhotoshop command not available');
            }

            const doc = await window.openPSDInPhotoshop(psdFile);

            if (!doc) {
                throw new Error('Could not open PSD file');
            }


            // Use global command to get all layers (same pattern as image feature)
            if (!window.getAllLayersFromPSD) {
                throw new Error('window.getAllLayersFromPSD command not available');
            }

            const layers = await window.getAllLayersFromPSD();


            // Close the document without saving (using global command if available)
            if (window.closePSDDocument) {
                await window.closePSDDocument();
            }

            // Transform layers to our video format
            const videoLayers = layers.map(layer => ({
                layerId: `layer_${layer.id}`,
                name: layer.name,
                type: this.detectLayerType(layer.kind),
                depth: (layer.name.match(/\s\/\s/g) || []).length,
                visible: layer.visible,
                opacity: 100,
                bounds: {
                    x: 0,
                    y: 0,
                    width: 100,
                    height: 100
                }
            }));

            return {
                success: true,
                layers: videoLayers,
                layerCount: videoLayers.length
            };
        } catch (error) {
            console.error('  VideoSetupService: Error extracting layers from', psdFile.name, error);
            return {
                success: false,
                error: error.message,
                layers: []
            };
        }
    }

    /**
     * Detect layer type from Photoshop kind property
     */
    static detectLayerType(kind) {
        if (!kind) return 'unknown';
        const kindStr = String(kind).toLowerCase();
        if (kindStr.includes('text')) return 'text';
        if (kindStr.includes('pixel') || kindStr.includes('image')) return 'image';
        if (kindStr.includes('smartobject')) return 'smartobject';
        if (kindStr.includes('group')) return 'group';
        return 'shape';
    }

    /**
     * Validate that all PSDs have identical layer structures
     */
    static validateLayerConsistency(psdArray) {
        try {
            if (psdArray.length === 0) {
                return { isValid: true, errors: [] };
            }

            const errors = [];
            const firstPSDLayers = psdArray[0].layerStructure || [];
            const firstPSDLayerNames = new Set(firstPSDLayers.map(l => l.name));

            // Check all PSDs have the same layers
            for (let i = 1; i < psdArray.length; i++) {
                const currentPSD = psdArray[i];
                const currentLayers = currentPSD.layerStructure || [];
                const currentLayerNames = new Set(currentLayers.map(l => l.name));


                // Check for missing layers
                for (const layerName of firstPSDLayerNames) {
                    if (!currentLayerNames.has(layerName)) {
                        errors.push({
                            psdName: currentPSD.name,
                            issue: `Missing layer: "${layerName}"`
                        });
                    }
                }

                // Check for extra layers
                for (const layerName of currentLayerNames) {
                    if (!firstPSDLayerNames.has(layerName)) {
                        errors.push({
                            psdName: currentPSD.name,
                            issue: `Extra layer: "${layerName}"`
                        });
                    }
                }
            }


            return {
                isValid: errors.length === 0,
                errors
            };
        } catch (error) {
            console.error('  VideoSetupService: Validation error', error);
            return {
                isValid: false,
                errors: [{ issue: error.message }]
            };
        }
    }
}

export default VideoSetupService;
