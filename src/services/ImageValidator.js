/**
 * ImageValidator.js
 * Handles image file listing, validation, and matching in the images folder
 * Phase 3: Foundation for image insertion
 */

// Supported image extensions
const SUPPORTED_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff'];

/**
 * List all image files in a folder
 * @param {Folder} folderObject - UXP folder object from storage API
 * @returns {Promise<Array>} Array of image file info objects
 */
export async function listImagesInFolder(folderObject) {
    try {
        if (!folderObject) {
            console.warn('  ImageValidator: No folder provided');
            return [];
        }

        console.log('  Listing images in folder:', folderObject.nativePath);

        const entries = await folderObject.getEntries();
        const images = [];

        for (const entry of entries) {
            // Skip folders, only process files
            if (entry.isFolder) {
                console.log('  Skipping folder:', entry.name);
                continue;
            }

            const extension = entry.name.split('.').pop().toLowerCase();

            if (SUPPORTED_EXTENSIONS.includes(extension)) {
                const size = await getFileSizeKB(entry);
                const sizeDisplay = size === -1 ? 'unknown' : `${size}KB`;

                const imageInfo = {
                    name: entry.name,
                    nameWithoutExt: entry.name.replace(/\.[^/.]+$/, ''),
                    extension: extension,
                    path: entry.nativePath,
                    file: entry,
                    size: size
                };

                images.push(imageInfo);
            }
        }

        return images.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
        console.error('  Error listing images:', error);
        throw new Error(`Failed to list images: ${error.message}`);
    }
}

/**
 * Get file size in KB
 * @param {File} file - UXP file object
 * @returns {Promise<number>} File size in KB
 */
async function getFileSizeKB(file) {
    try {
        // Try to get blob size first
        const blob = await file.getBlob();
        if (blob && blob.size > 0) {
            return Math.round(blob.size / 1024);
        }
    } catch (error) {
        console.log('  Blob size unavailable for:', file.name, '- using fallback');
    }

    // Fallback: Try to get size from file stats
    try {
        if (file.size && file.size > 0) {
            return Math.round(file.size / 1024);
        }
    } catch (error) {
        // Size unavailable, use unknown size
    }

    // If all else fails, return -1 to indicate unknown size (not 0 which means error)
    console.warn('  File size unknown for:', file.name, '- using -1 as placeholder');
    return -1;
}

/**
 * Validate that an image file exists
 * @param {Folder} folderObject - UXP folder object
 * @param {string} fileName - Name of the image file to find
 * @returns {Promise<Object|null>} File info if found, null otherwise
 */
export async function findImageFile(folderObject, fileName) {
    try {
        if (!folderObject || !fileName) {
            return null;
        }

        const allImages = await listImagesInFolder(folderObject);
        const found = allImages.find(img => img.name === fileName || img.nameWithoutExt === fileName);

        if (found) {
            console.log('  Image file found:', found.name);
        } else {
            console.warn('  Image file not found:', fileName);
        }

        return found || null;
    } catch (error) {
        console.error('  Error finding image:', error);
        return null;
    }
}

/**
 * Validate an image file by name pattern
 * Pattern like "products/{productId}.jpg" with real data values
 * @param {Folder} folderObject - UXP folder object
 * @param {string} pattern - File pattern with placeholders
 * @param {Object} rowData - Row data with values to substitute
 * @returns {Promise<Object|null>} Resolved file info if found, null otherwise
 */
export async function resolveImagePattern(folderObject, pattern, rowData) {
    try {
        if (!folderObject || !pattern || !rowData) {
            return null;
        }

        // Replace pattern placeholders with actual data
        let fileName = pattern;
        Object.entries(rowData).forEach(([col, value]) => {
            fileName = fileName.replace(`{${col}}`, value);
        });

        console.log('  Resolving pattern:', pattern, '→', fileName);

        return await findImageFile(folderObject, fileName);
    } catch (error) {
        console.error('  Error resolving image pattern:', error);
        return null;
    }
}

/**
 * Validate all image patterns for a dataset
 * @param {Folder} folderObject - UXP folder object
 * @param {Array} excelData - Array of row objects
 * @param {Object} imageMappingRules - Mapping rules { layerId: { columnName, pattern } }
 * @returns {Promise<Object>} Validation results with missing and found counts
 */
export async function validateImagePatterns(folderObject, excelData, imageMappingRules) {
    try {
        if (!folderObject || !excelData || !imageMappingRules) {
            return { total: 0, found: 0, missing: 0, errors: [] };
        }

        console.log('  Validating image patterns for', excelData.length, 'rows');

        const results = {
            total: 0,
            found: 0,
            missing: 0,
            errors: []
        };

        for (let rowIndex = 0; rowIndex < excelData.length; rowIndex++) {
            const rowData = excelData[rowIndex];

            for (const [layerId, rule] of Object.entries(imageMappingRules)) {
                const { columnName, pattern } = rule;
                results.total++;

                // Resolve the file name from pattern
                let fileName = pattern;
                Object.entries(rowData).forEach(([col, value]) => {
                    fileName = fileName.replace(`{${col}}`, value);
                });

                const found = await findImageFile(folderObject, fileName);
                if (found) {
                    results.found++;
                } else {
                    results.missing++;
                    results.errors.push({
                        row: rowIndex + 1,
                        layerId,
                        pattern,
                        resolvedName: fileName,
                        message: `Image not found: ${fileName}`
                    });
                }
            }
        }

        console.log('  Validation complete:', `${results.found}/${results.total} found`, `${results.missing} missing`);
        return results;
    } catch (error) {
        console.error('  Error validating patterns:', error);
        throw new Error(`Pattern validation failed: ${error.message}`);
    }
}

export default {
    listImagesInFolder,
    findImageFile,
    resolveImagePattern,
    validateImagePatterns,
    SUPPORTED_EXTENSIONS
};
