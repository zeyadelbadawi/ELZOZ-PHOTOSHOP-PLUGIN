/**
 * ImageMatcher Service
 * Matches images with spreadsheet data using filenames as keys
 * Maps layer IDs to image files based on folder structure and Excel column data
 */

export const ImageMatcher = {
    /**
     * Match images with spreadsheet rows based on filename column
     * Returns mapping of (layerId, rowIndex) -> imagePath
     *
     * @param {Array} excelData - Array of row objects from Excel
     * @param {Object} imageMappingRules - { layerId: { folderName, columnName } }
     * @param {string} baseFolderPath - Base path to images folder
     * @returns {Object} Mapping of matches: { 'layerId_rowIndex': { imagePath, filename, layerId, rowIndex } }
     */
    buildImageMatches(excelData, imageMappingRules, baseFolderPath) {
        try {
            console.log('  ===== IMAGE MATCHING: START =====');
            console.log('  Building image matches...');
            console.log('  Excel rows count:', excelData.length);
            console.log('  Image mapping rules count:', Object.keys(imageMappingRules).length);
            console.log('  Image mapping rules:', JSON.stringify(imageMappingRules, null, 2));
            console.log('  Base folder path:', baseFolderPath);

            const matches = {};

            // For each layer mapping
            Object.entries(imageMappingRules).forEach(([layerId, rule]) => {
                const { folderName, columnName } = rule;

                console.log(`  Processing layer ${layerId}:`, { folderName, columnName });

                if (!folderName || !columnName) {
                    console.warn('  INVALID MAPPING - Missing folderName or columnName:', { layerId, rule });
                    return;
                }

                // For each row in Excel data
                excelData.forEach((row, rowIndex) => {
                    const filename = row[columnName];

                    if (!filename) {
                        console.warn(`  NO FILENAME in column '${columnName}' for row ${rowIndex}. Row data:`, row);
                        return;
                    }

                    const imagePath = `${folderName}/${filename}`;
                    const matchKey = `${layerId}_${rowIndex}`;
                    const fullPath = `${baseFolderPath}/${imagePath}`;

                    const match = {
                        layerId: parseInt(layerId),
                        rowIndex,
                        folderName,
                        filename: String(filename).trim(),
                        imagePath,
                        fullPath
                    };

                    console.log(`  MATCH FOUND - Layer ${layerId}, Row ${rowIndex}:`, JSON.stringify(match));

                    matches[matchKey] = match;
                });
            });

            console.log('  Total image matches built:', Object.keys(matches).length);
            console.log('  All matches:', JSON.stringify(matches, null, 2));
            console.log('  ===== IMAGE MATCHING: END =====');
            return matches;
        } catch (e) {
            console.error('  IMAGE MATCHING ERROR:', e.message);
            console.error('  Stack trace:', e.stack);
            throw e;
        }
    },

    /**
     * Get images for a specific row and layer
     * @param {number} rowIndex - Index of row in Excel
     * @param {number} layerId - Layer ID in PSD
     * @param {Object} matches - Matches object from buildImageMatches
     * @returns {Object|null} Match object or null if no match
     */
    getImageForRowAndLayer(rowIndex, layerId, matches) {
        const matchKey = `${layerId}_${rowIndex}`;
        return matches[matchKey] || null;
    },

    /**
     * Get all images for a specific row (across all layers)
     * @param {number} rowIndex - Index of row
     * @param {Object} matches - Matches object
     * @returns {Array} Array of match objects for this row
     */
    getImagesForRow(rowIndex, matches) {
        return Object.values(matches).filter(m => m.rowIndex === rowIndex);
    },

    /**
     * Get all images for a specific layer (across all rows)
     * @param {number} layerId - Layer ID
     * @param {Object} matches - Matches object
     * @returns {Array} Array of match objects for this layer
     */
    getImagesForLayer(layerId, matches) {
        return Object.values(matches).filter(m => m.layerId === parseInt(layerId));
    },

    /**
     * Validate that all required images exist
     * This is for offline validation before batch processing
     * @param {Object} matches - Matches from buildImageMatches
     * @param {Function} fileExistsCheckFn - Async function to check if file exists
     * @returns {Object} Validation results
     */
    async validateImageMatches(matches, fileExistsCheckFn) {
        try {
            console.log('  Validating image matches...');

            const results = {
                total: Object.keys(matches).length,
                valid: [],
                missing: [],
                errors: []
            };

            for (const [key, match] of Object.entries(matches)) {
                try {
                    const exists = await fileExistsCheckFn(match.fullPath);

                    if (exists) {
                        results.valid.push(match);
                    } else {
                        results.missing.push({
                            ...match,
                            reason: 'File not found'
                        });
                    }
                } catch (e) {
                    results.errors.push({
                        ...match,
                        error: e.message
                    });
                }
            }

            console.log('  Validation results:', {
                valid: results.valid.length,
                missing: results.missing.length,
                errors: results.errors.length
            });

            return results;
        } catch (e) {
            console.error('  Error validating image matches:', e.message);
            throw e;
        }
    },

    /**
     * Create a summary of image mappings for review
     * @param {Object} excelData - Excel data
     * @param {Object} imageMappingRules - Mapping rules
     * @param {Array} imageLayers - Available image layers
     * @returns {Object} Summary object
     */
    getSummary(excelData, imageMappingRules, imageLayers) {
        const summary = {
            totalRows: excelData.length,
            totalLayers: imageLayers.length,
            mappedLayers: Object.keys(imageMappingRules).length,
            mappingDetails: []
        };

        Object.entries(imageMappingRules).forEach(([layerId, rule]) => {
            const layer = imageLayers.find(l => l.id.toString() === layerId);
            summary.mappingDetails.push({
                layerId: parseInt(layerId),
                layerName: layer?.name || 'Unknown',
                folderName: rule.folderName,
                columnName: rule.columnName,
                dataPoints: excelData.length // Each row will need an image
            });
        });

        return summary;
    }
};

export default ImageMatcher;
