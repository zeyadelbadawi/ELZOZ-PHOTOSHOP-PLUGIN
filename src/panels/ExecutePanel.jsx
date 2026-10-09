'use client';

import React, { useContext, useState } from 'react';
import { AlertCircle } from 'lucide-react';
import { ProjectContext } from '../context/ProjectContext';
import { AuthContext } from '../context/AuthContext';
import { useTranslation } from '../hooks/useTranslation';
import { TextLayerUpdater } from '../services/TextLayerUpdater';
import ImageInserter from '../services/ImageInserter.js';
import { ImageMatcher } from '../services/ImageMatcher.js';
import { DesignExporter } from '../services/DesignExporter';
import { ErrorHandler } from '../services/ErrorHandler';
import { PreflightValidator } from '../services/PreflightValidator';
import { CreditService } from '../services/CreditService';
import PreflightReport from '../components/PreflightReport';
import CreditGuard from '../components/CreditGuard';

export default function ExecutePanel() {
    const { projectState, updateProjectState, addError, addResult } = useContext(ProjectContext);
    const { user, updateUserCredits, refreshUserData } = useContext(AuthContext);
    const { t, isArabic, dir } = useTranslation();
    const [isRunning, setIsRunning] = useState(false);
    const [preflightResult, setPreflightResult] = useState(null);
    const [skipImages, setSkipImages] = useState(false);
    const [exportFormats, setExportFormats] = useState({
        jpg: true,
        png: false,
        psd: true
    });
    const [missingImages, setMissingImages] = useState(null);
    const currentAccount = user;
    const updateCredits = (userId, amount) => updateUserCredits(userId, amount);
    const logUsage = (userId, usageData) => console.log(`  Usage logged for user ${userId}:`, usageData);

    const isReady = projectState.excelFile && projectState.psdFile &&
        Object.keys(projectState.mapping).length > 0;

    const handlePreflight = async () => {
        if (!isReady) return;


        const totalItems = projectState.excelData.length;
        const creditsNeeded = totalItems * 1;


        if (user.credits < creditsNeeded) {
            console.error('  INSUFFICIENT CREDITS - Preventing preflight check');
            alert(`⚠️ ${t('execute.insufficientCredits')}. ${t('execute.creditsNeeded')}: ${creditsNeeded}, ${t('execute.creditsAvailable')}: ${user.credits}`);
            return;
        }


        const result = await PreflightValidator.runFullValidation(projectState);



        setPreflightResult(result);
    };

    const handleRun = async (skipImageInsertion = false) => {
        if (!isReady) return;

        setIsRunning(true);
        setPreflightResult(null);

        const totalItems = projectState.excelData.length;
        const creditsNeeded = totalItems * 1;

        if (user.credits < creditsNeeded) {
            alert(`⚠️ ${t('execute.insufficientCredits')}. ${t('execute.creditsNeeded')}: ${creditsNeeded}, ${t('execute.creditsAvailable')}: ${user.credits}`);
            setIsRunning(false);
            return;
        }

        try {

            updateProjectState({
                isProcessing: true,
                progress: 0,
                results: [],
                errors: [],
                batchLog: [],
                processedCount: 0
            });

            let successCount = 0;
            let errorCount = 0;

            for (let i = 0; i < totalItems; i++) {
                const row = projectState.excelData[i];
                const rowNumber = i + 1;
                const progress = Math.round((i / totalItems) * 100);

                updateProjectState({
                    progress,
                    currentItem: `${t('execute.processingRow')} ${rowNumber}/${totalItems}`
                });



                try {
                    const updates = [];
                    for (const [excelColumn, mappedLayer] of Object.entries(projectState.mapping)) {
                        const cellValue = row[excelColumn];

                        if (cellValue === null || cellValue === undefined) {
                            console.warn(`  EMPTY CELL - Column ${excelColumn} for row ${rowNumber}`);
                            continue;
                        }

                        const layerId = typeof mappedLayer === 'string' ? mappedLayer : mappedLayer.id;
                        const layerName = typeof mappedLayer === 'object' ? mappedLayer.name : mappedLayer;

                        const update = { layerId, layerName, text: String(cellValue) };
                        updates.push(update);
                    }

                    if (updates.length === 0) {
                        throw new Error('No mapped values found in this row');
                    }


                    const updateResult = await TextLayerUpdater.updateMultipleLayers(updates);

                    if (updateResult.errors && updateResult.errors.length > 0) {
                        const errorMsg = updateResult.errors.map(e => e.error).join('; ');
                        throw new Error(`Layer updates failed: ${errorMsg}`);
                    }

                    if (!skipImageInsertion) {

                        if (Object.keys(projectState.imageMappingRules || {}).length > 0) {

                            const imageUpdates = [];
                            for (const [layerId, rule] of Object.entries(projectState.imageMappingRules || {})) {

                                const filename = row[rule.columnName];

                                if (!filename) {
                                    console.warn(`  NO FILENAME in column '${rule.columnName}' for row ${rowNumber}`);
                                    continue;
                                }

                                const imagePath = `${rule.folderName}/${String(filename).trim()}`;
                                const layer = projectState.imageLayers.find(l => l.id.toString() === layerId);

                                if (layer) {
                                    const imageUpdate = {
                                        layerId,
                                        layerName: layer.name,
                                        imagePath,
                                        folderName: rule.folderName,
                                        filename: String(filename).trim()
                                    };
                                    imageUpdates.push(imageUpdate);
                                } else {
                                    console.warn('  Layer not found for ID:', layerId);
                                }
                            }


                            if (imageUpdates.length > 0) {
                                try {

                                    const missingFilesList = [];
                                    const folderInfo = {};

                                    for (const update of imageUpdates) {
                                        const { folderName, filename, layerName } = update;


                                        const folderSelection = Object.values(projectState.imageFolderSelections || {}).find(
                                            sel => sel.path.includes(folderName)
                                        );

                                        if (!folderSelection) {
                                            console.warn('  ⚠️ FOLDER NOT SELECTED - No folder object for:', folderName);
                                            console.warn('  Available folders:', Object.values(projectState.imageFolderSelections || {}).map(s => s.path));
                                            continue;
                                        }

                                        const validation = await ImageInserter.validateFileExists(
                                            folderSelection.folderObject,
                                            filename
                                        );

                                        if (validation.exists) {
                                        } else {
                                            console.error('  VALIDATION FAILED:', validation.message);
                                            console.error('  Available files:', validation.availableFiles?.join(', ') || 'None');

                                            missingFilesList.push({
                                                filename,
                                                folderName,
                                                layerName,
                                                folderPath: folderSelection.path,
                                                availableFiles: validation.availableFiles || []
                                            });

                                            folderInfo[folderName] = {
                                                path: folderSelection.path,
                                                availableFiles: validation.availableFiles || []
                                            };
                                        }
                                    }

                                    if (missingFilesList.length > 0) {
                                        console.error('  MISSING FILES DETECTED:', missingFilesList);
                                        setMissingImages({
                                            missingFiles: missingFilesList,
                                            folderInfo: folderInfo,
                                            totalMissing: missingFilesList.length
                                        });
                                        throw new Error(`${missingFilesList.length} image file(s) not found in folder(s)`);
                                    }

                                    const imageResult = await ImageInserter.insertImages(imageUpdates);

                                    if (imageResult.errors && imageResult.errors.length > 0) {
                                        console.warn('  IMAGE INSERTION ERRORS:', imageResult.errors);
                                    }
                                } catch (imgErr) {
                                    console.error('  IMAGE INSERTION ERROR:', imgErr.message);
                                    console.error('  Stack trace:', imgErr.stack);
                                    addError({
                                        row: rowNumber,
                                        message: `Image insertion failed: ${imgErr.message}`,
                                        category: 'image_insertion',
                                        userMessage: 'Some images could not be inserted'
                                    });
                                }
                            } else {
                                console.log('  No image updates for this row - skipping image insertion');
                            }
                            console.log('  ===== IMAGE INSERTION: END =====');
                        }
                    }

                    await TextLayerUpdater.saveDocument();

                    const selectedFormats = Object.keys(exportFormats).filter(k => exportFormats[k]);


                    if (selectedFormats.length > 0) {
                        try {


                            if (!projectState.exportsFolder) {
                                console.warn('  EXPORT CONFIG ERROR - No exports folder configured');
                                addError({
                                    row: rowNumber,
                                    message: 'No exports folder configured',
                                    category: 'export_config_missing',
                                    userMessage: 'Export folder not selected in Setup step'
                                });
                            } else {

                                const firstMappedColumn = Object.keys(projectState.mapping)[0];
                                const exportBaseName = firstMappedColumn && row[firstMappedColumn]
                                    ? `design_${String(row[firstMappedColumn]).substring(0, 20)}`
                                    : `design_row_${rowNumber}`;

                                const exportResult = await DesignExporter.exportMultipleFormats(
                                    projectState.exportsFolder,
                                    projectState.exportsFolderObject,
                                    exportBaseName,
                                    selectedFormats,
                                    { jpgQuality: 80 }
                                );

                                if (exportResult.results) {
                                    exportResult.results.forEach((r, i) => {
                                        console.log(`    Result ${i}:`, r);
                                    });
                                }

                                if (exportResult.errors && exportResult.errors.length > 0) {
                                    console.warn('  Some exports failed:', exportResult.errors);
                                    addError({
                                        row: rowNumber,
                                        message: `Some exports failed: ${exportResult.errors.map(e => e.error).join('; ')}`,
                                        category: 'export_error',
                                        userMessage: 'Some design exports could not be completed'
                                    });
                                }
                            }
                        } catch (expErr) {
                            console.error('  Design export error:', expErr.message);
                            addError({
                                row: rowNumber,
                                message: `Export failed: ${expErr.message}`,
                                category: 'export_error',
                                userMessage: 'Design export encountered an error'
                            });
                        }
                    }

                    addResult({
                        row: rowNumber,
                        status: 'success',
                        itemsUpdated: updates.length,
                        exportFormats: selectedFormats,
                        data: row
                    });
                    successCount++;
                } catch (e) {
                    console.error(`  Error processing row ${rowNumber}:`, e.message);
                    const errorInfo = ErrorHandler.handleRowError(rowNumber, e, { excelColumn: Object.keys(projectState.mapping)[0] });
                    addError(errorInfo);
                    errorCount++;

                    if (errorInfo.action === 'pause') {
                        throw new Error(`Critical error at row ${rowNumber}: ${errorInfo.userMessage}`);
                    }
                }
            }

            updateProjectState({
                progress: 100,
                isProcessing: false,
                currentItem: null
            });

            const creditResult = await CreditService.deductCredits(
                user.id,
                creditsNeeded,
                {
                    action: 'batch_process',
                    psdFile: projectState.psdFile?.name,
                    rowsProcessed: totalItems,
                    successCount,
                    errorCount,
                    formats: Object.keys(exportFormats).filter(k => exportFormats[k]).join(',')
                }
            );

            if (creditResult.success) {

                updateUserCredits(creditResult.creditsAfter);
            } else {
                console.error('  Failed to deduct credits:', creditResult.error);
                addError({
                    row: 'batch',
                    message: 'Failed to deduct credits from account',
                    category: 'credit_deduction_error'
                });
            }

        } catch (error) {
            console.error('  ===== BATCH PROCESSING: ERROR =====');
            console.error('  Critical error:', error.message);
            console.error('  Stack trace:', error.stack);

            addError({
                row: 'batch',
                message: error.message,
                category: 'critical_error',
                userMessage: 'Batch processing encountered a critical error and was halted'
            });

            updateProjectState({
                isProcessing: false
            });
        } finally {
            setIsRunning(false);
        }
    };

    return (
        <CreditGuard>
            <div style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                {/* Header */}
                <div style={{ marginBottom: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ margin: '0 0 var(--spacing-xs) 0', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {t('execute.title')}
                    </h2>
                    <p style={{ margin: '0', color: 'var(--color-text-secondary)', fontSize: '13px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {t('execute.description')}
                    </p>
                </div>

                {/* Status */}
                <div style={{
                    padding: 'var(--spacing-md)',
                    background: isReady ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)',
                    borderRadius: 'var(--radius-md)',
                    marginBottom: 'var(--spacing-lg)',
                    border: `1px solid ${isReady ? 'var(--color-success)' : 'var(--color-danger)'}`,
                    direction: dir,
                    textAlign: isArabic ? 'right' : 'left'
                }}>
                    <div style={{ fontSize: '13px', fontWeight: '600', color: isReady ? 'var(--color-success)' : 'var(--color-danger)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {isReady ? '✅ ' + t('execute.readyToRun') : '⚠️ ' + t('execute.notReady')}
                    </div>
                    {!isReady && (
                        <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginTop: 'var(--spacing-sm)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            Please complete Setup, PSD Upload, and Mapping tabs
                        </div>
                    )}
                </div>

                {/* Preflight Report */}
                {preflightResult && (
                    <PreflightReport
                        validationResult={preflightResult}
                        onFixFiles={() => setPreflightResult(null)}
                        onSkipImages={() => {
                            setSkipImages(true);
                            handleRun(true);
                        }}
                        onProceed={() => handleRun(false)}
                        onCancel={() => setPreflightResult(null)}
                    />
                )}

                {/* Export Settings */}
                <div className="card" style={{ marginBottom: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h3 style={{ margin: '0 0 var(--spacing-md) 0', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {t('execute.exportSettings')}
                    </h3>
                    <div style={{ fontSize: '12px', color: 'var(--color-text-secondary)', marginBottom: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        {t('execute.selectFormats')}
                    </div>
                    <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                        {['jpg', 'png', 'psd'].map(format => (
                            <label key={format} style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-sm)', cursor: 'pointer', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                                <input
                                    type="checkbox"
                                    checked={exportFormats[format]}
                                    onChange={(e) => setExportFormats({ ...exportFormats, [format]: e.target.checked })}
                                    style={{ cursor: 'pointer' }}
                                />
                                <span style={{ fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t(`execute.${format}`)}</span>
                            </label>
                        ))}
                    </div>
                </div>

                {/* Action Buttons */}
                <div style={{ display: 'flex', gap: 'var(--spacing-md)', flexWrap: 'wrap', flexDirection: isArabic ? 'row-reverse' : 'row', direction: dir }}>
                    <button
                        onClick={handlePreflight}
                        disabled={!isReady || isRunning}
                        style={{
                            padding: 'var(--spacing-md) var(--spacing-lg)',
                            background: isReady && !isRunning ? 'var(--color-primary)' : 'var(--color-disabled)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: isReady && !isRunning ? 'pointer' : 'not-allowed',
                            fontSize: '13px',
                            fontWeight: '600',
                            flex: '1',
                            direction: dir,
                            textAlign: 'center'
                        }}
                    >
                        {t('execute.runPreflight')}
                    </button>
                    <button
                        onClick={() => handleRun(false)}
                        disabled={!isReady || isRunning}
                        style={{
                            padding: 'var(--spacing-md) var(--spacing-lg)',
                            background: isReady && !isRunning ? 'var(--color-success)' : 'var(--color-disabled)',
                            color: 'white',
                            border: 'none',
                            borderRadius: 'var(--radius-md)',
                            cursor: isReady && !isRunning ? 'pointer' : 'not-allowed',
                            fontSize: '13px',
                            fontWeight: '600',
                            flex: '1',
                            direction: dir,
                            textAlign: 'center'
                        }}
                    >
                        {isRunning ? `${t('execute.processing')}...` : t('execute.processDesigns')}
                    </button>
                </div>

                {/* Progress */}
                {projectState.isProcessing && (
                    <div style={{ marginTop: 'var(--spacing-lg)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ marginBottom: 'var(--spacing-sm)', fontSize: '13px', fontWeight: '600', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {projectState.currentItem}
                        </div>
                        <div style={{
                            width: '100%',
                            height: '8px',
                            background: 'rgba(0, 0, 0, 0.1)',
                            borderRadius: 'var(--radius-md)',
                            overflow: 'hidden'
                        }}>
                            <div style={{
                                width: `${projectState.progress}%`,
                                height: '100%',
                                background: 'var(--color-primary)',
                                transition: 'width 0.3s ease'
                            }} />
                        </div>
                        <div style={{ marginTop: 'var(--spacing-sm)', fontSize: '12px', color: 'var(--color-text-secondary)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {projectState.progress}%
                        </div>
                    </div>
                )}
            </div>
        </CreditGuard>
    );
}
