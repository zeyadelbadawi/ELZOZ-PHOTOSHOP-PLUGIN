import * as photoshop from 'photoshop';
import { storage } from 'uxp';

export const DesignExporter = {
    async exportAsPNG(outputFolder, folderObject, fileName) {
        try {
            console.log(`  PNG export starting: fileName=${fileName}`);

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');
            console.log(`  PNG active document found`);

            const pngFileName = fileName.endsWith('.png') ? fileName : `${fileName}.png`;
            console.log(`  PNG final filename: ${pngFileName}`);

            // Create file entry BEFORE executeAsModal
            console.log(`  PNG creating file entry...`);
            const fileEntry = await folderObject.createEntry(pngFileName, { overwrite: true });
            console.log(`  PNG file entry created successfully`);
            const pngNativePath = fileEntry?.nativePath;
            console.log(`  PNG fileEntry.nativePath: ${pngNativePath}`);

            console.log(`  PNG entering executeAsModal...`);
            return await photoshop.core.executeAsModal(async () => {
                try {
                    console.log(`  PNG inside executeAsModal, calling batchPlay...`);
                    console.log(`  PNG using file token approach...`);

                    const batchPlayResponse = await photoshop.action.batchPlay(
                        [
                            {
                                _obj: 'exportSaveForWeb',
                                in: fileEntry,
                                exportOptions: {
                                    _obj: 'exportOptionsSaveForWeb',
                                    format: 'PNG',
                                    interlaced: false
                                }
                            }
                        ],
                        {}
                    );

                    console.log(`  PNG batchPlay response:`, JSON.stringify(batchPlayResponse));

                    // Check if response contains error or result:false
                    if (batchPlayResponse && batchPlayResponse.length > 0) {
                        const response = batchPlayResponse[0];
                        if (response._obj === 'error') {
                            const errorMsg = response.message || 'Unknown export error';
                            console.error('  PNG batchPlay error in response:', errorMsg);
                            throw new Error(`PNG export error: ${errorMsg}`);
                        }
                        if (response.result === false) {
                            const errorMsg = response.onError || 'Export failed';
                            console.error('  PNG batchPlay failed with result:false:', errorMsg);
                            throw new Error(`PNG export failed: ${errorMsg}`);
                        }
                    }

                    console.log(`  PNG export completed successfully`);
                    return {
                        success: true,
                        status: 'exported',
                        format: 'PNG',
                        fileName: pngFileName,
                        nativePath: pngNativePath,
                        message: 'PNG file exported successfully'
                    };
                } catch (e) {
                    console.error('  PNG batchPlay error:', e.message);
                    throw new Error(`PNG export failed: ${e.message}`);
                }
            });
        } catch (e) {
            console.error('  PNG export error:', e.message);
            return {
                success: false,
                status: 'error',
                format: 'PNG',
                fileName,
                error: e.message
            };
        }
    },

    async exportAsJPG(outputFolder, folderObject, fileName, quality = 80) {
        try {
            const clampedQuality = Math.max(0, Math.min(100, quality));
            console.log(`  JPG export starting: fileName=${fileName}, quality=${clampedQuality}`);

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');
            console.log(`  JPG active document found`);

            const jpgFileName = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') ? fileName : `${fileName}.jpg`;
            console.log(`  JPG final filename: ${jpgFileName}`);

            // Create file entry BEFORE executeAsModal
            console.log(`  JPG creating file entry...`);
            const fileEntry = await folderObject.createEntry(jpgFileName, { overwrite: true });
            console.log(`  JPG file entry created successfully`);
            const jpgNativePath = fileEntry?.nativePath;
            console.log(`  JPG fileEntry.nativePath: ${jpgNativePath}`);

            console.log(`  JPG entering executeAsModal...`);
            return await photoshop.core.executeAsModal(async () => {
                try {
                    console.log(`  JPG inside executeAsModal, calling batchPlay...`);
                    console.log(`  JPG using file token approach...`);

                    // Use proper UXP file token format for batchPlay
                    const batchPlayResponse = await photoshop.action.batchPlay(
                        [
                            {
                                _obj: 'exportSaveForWeb',
                                in: fileEntry,
                                exportOptions: {
                                    _obj: 'exportOptionsSaveForWeb',
                                    format: 'JPEG',
                                    quality: clampedQuality,
                                    interlaced: false
                                }
                            }
                        ],
                        {}
                    );

                    console.log(`  JPG batchPlay response:`, JSON.stringify(batchPlayResponse));

                    // Check if response contains error or result:false
                    if (batchPlayResponse && batchPlayResponse.length > 0) {
                        const response = batchPlayResponse[0];
                        if (response._obj === 'error') {
                            const errorMsg = response.message || 'Unknown export error';
                            console.error('  JPG batchPlay error in response:', errorMsg);
                            throw new Error(`JPG export error: ${errorMsg}`);
                        }
                        if (response.result === false) {
                            const errorMsg = response.onError || 'Export failed';
                            console.error('  JPG batchPlay failed with result:false:', errorMsg);
                            throw new Error(`JPG export failed: ${errorMsg}`);
                        }
                    }

                    console.log(`  JPG export completed successfully`);
                    return {
                        success: true,
                        status: 'exported',
                        format: 'JPG',
                        fileName: jpgFileName,
                        quality: clampedQuality,
                        nativePath: jpgNativePath,
                        message: 'JPG file exported successfully'
                    };
                } catch (e) {
                    console.error('  JPG batchPlay error:', e.message);
                    throw new Error(`JPG export failed: ${e.message}`);
                }
            });
        } catch (e) {
            console.error('  JPG export error:', e.message);
            return {
                success: false,
                status: 'error',
                format: 'JPG',
                fileName,
                error: e.message
            };
        }
    },

    async exportAsPSD(outputFolder, folderObject, fileName) {
        try {
            console.log(`  PSD export starting: fileName=${fileName}`);

            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');
            console.log(`  PSD active document found`);

            const psdFileName = fileName.endsWith('.psd') ? fileName : `${fileName}.psd`;
            console.log(`  PSD final filename: ${psdFileName}`);

            // Create file entry BEFORE executeAsModal
            console.log(`  PSD creating file entry...`);
            const fileEntry = await folderObject.createEntry(psdFileName, { overwrite: true });
            console.log(`  PSD file entry created successfully`);
            const psdNativePath = fileEntry?.nativePath;
            console.log(`  PSD fileEntry.nativePath: ${psdNativePath}`);

            console.log(`  PSD entering executeAsModal...`);
            return await photoshop.core.executeAsModal(async () => {
                try {
                    console.log(`  PSD inside executeAsModal, calling batchPlay...`);
                    console.log(`  PSD using file token approach...`);

                    // Use save command with proper file token
                    const batchPlayResponse = await photoshop.action.batchPlay(
                        [
                            {
                                _obj: 'save',
                                in: fileEntry,
                                documentFormat: 'Photoshop PDF'
                            }
                        ],
                        {}
                    );

                    console.log(`  PSD batchPlay response:`, JSON.stringify(batchPlayResponse));

                    // Check if response contains error or result:false
                    if (batchPlayResponse && batchPlayResponse.length > 0) {
                        const response = batchPlayResponse[0];
                        if (response._obj === 'error') {
                            const errorMsg = response.message || 'Unknown export error';
                            console.error('  PSD batchPlay error in response:', errorMsg);
                            throw new Error(`PSD export error: ${errorMsg}`);
                        }
                        if (response.result === false) {
                            const errorMsg = response.onError || 'Export failed';
                            console.error('  PSD batchPlay failed with result:false:', errorMsg);
                            throw new Error(`PSD export failed: ${errorMsg}`);
                        }
                    }

                    console.log(`  PSD export completed successfully`);
                    return {
                        success: true,
                        status: 'exported',
                        format: 'PSD',
                        fileName: psdFileName,
                        layers: 'all_preserved',
                        nativePath: psdNativePath,
                        message: 'PSD file exported successfully'
                    };
                } catch (e) {
                    console.error('  PSD batchPlay error:', e.message);
                    throw new Error(`PSD export failed: ${e.message}`);
                }
            });
        } catch (e) {
            console.error('  PSD export error:', e.message);
            return {
                success: false,
                status: 'error',
                format: 'PSD',
                fileName,
                error: e.message
            };
        }
    },

    async exportMultipleFormats(outputFolder, folderObject, baseName, formats, options = {}) {
        try {
            console.log(`  Batch export starting: baseName=${baseName}, formats=${formats.join(',')}`);
            console.log(`  Batch export outputFolder type: ${typeof outputFolder}`);
            console.log(`  Batch export folderObject type: ${typeof folderObject}`);
            console.log(`  Batch export folderObject.nativePath: ${folderObject?.nativePath}`);

            const results = [];
            const errors = [];
            const jpgQuality = options.jpgQuality || 80;

            for (const format of formats) {
                try {
                    const formattedFormat = format.toLowerCase().trim();
                    const fileName = `${baseName}.${formattedFormat}`;
                    console.log(`  Batch export: exporting format ${formattedFormat}, fileName=${fileName}`);

                    let exportResult;
                    switch (formattedFormat) {
                        case 'jpg':
                        case 'jpeg':
                            console.log(`  Batch export: calling exportAsJPG...`);
                            exportResult = await this.exportAsJPG(outputFolder, folderObject, fileName, jpgQuality);
                            break;
                        case 'png':
                            console.log(`  Batch export: calling exportAsPNG...`);
                            exportResult = await this.exportAsPNG(outputFolder, folderObject, fileName);
                            break;
                        case 'psd':
                            console.log(`  Batch export: calling exportAsPSD...`);
                            exportResult = await this.exportAsPSD(outputFolder, folderObject, fileName);
                            break;
                        default:
                            throw new Error(`Unsupported format: ${formattedFormat}. Supported: jpg, png, psd`);
                    }

                    console.log(`  Batch export: ${formattedFormat} result:`, exportResult);

                    if (exportResult.success) {
                        console.log(`  Batch export: ${formattedFormat} SUCCESS - ${exportResult.nativePath || 'unknown path'}`);
                        results.push(exportResult);
                    } else {
                        console.log(`  Batch export: ${formattedFormat} FAILED - ${exportResult.error}`);
                        errors.push({
                            format: formattedFormat,
                            error: exportResult.error || 'Unknown error',
                            fileName
                        });
                    }
                } catch (e) {
                    console.log(`  Batch export: ${format} threw exception: ${e.message}`);
                    errors.push({
                        format,
                        error: e.message,
                        fileName: `${baseName}.${format}`
                    });
                    console.error(`  Error exporting as ${format}:`, e.message);
                }
            }

            console.log(`  Batch export complete: ${results.length} success, ${errors.length} errors`);
            return { results, errors };
        } catch (e) {
            console.error('  Batch export fatal error:', e.message);
            throw e;
        }
    },

    async getExportRecommendations() {
        try {
            const doc = photoshop.app.activeDocument;
            if (!doc) throw new Error('No active Photoshop document');

            return await photoshop.core.executeAsModal(() => {
                const width = doc.width;
                const height = doc.height;
                const hasTransparency = doc.hasTransparency || false;
                const colorMode = doc.colorMode || 'RGB';

                return {
                    document: {
                        width,
                        height,
                        size: `${width} x ${height}px`,
                        hasTransparency,
                        colorMode,
                        layerCount: doc.layers.length
                    },
                    recommendations: {
                        preferredFormat: hasTransparency ? 'PNG' : 'JPG',
                        suggestedJpgQuality: 80,
                        exportAllFormats: ['JPG', 'PNG', 'PSD'],
                        pngBest: hasTransparency,
                        jpgBest: !hasTransparency
                    }
                };
            });
        } catch (e) {
            console.error('  Export recommendation error:', e.message);
            throw e;
        }
    }
};

export default DesignExporter;
