'use client';

import React, { useContext, useState } from 'react';
import { BarChart3, Palette, Save, Folder, Check, CheckCircle2 } from 'lucide-react';
import { ProjectContext } from '../context/ProjectContext';
import { useTranslation } from '../hooks/useTranslation';
import * as XLSX from 'xlsx';

export default function SetupPanel() {
    const { projectState, updateProjectState } = useContext(ProjectContext);
    const { t, isArabic, dir } = useTranslation();
    const [excelPreview, setExcelPreview] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [imageFolderSelections, setImageFolderSelections] = useState(() => {
        // Initialize from projectState if available
        return projectState.imageFolderSelections || {};
    });

    // Sync imageFolderSelections from projectState when it changes
    React.useEffect(() => {
        if (projectState.imageFolderSelections && Object.keys(projectState.imageFolderSelections).length > 0) {
            setImageFolderSelections(projectState.imageFolderSelections);
        }
    }, [projectState.imageFolderSelections]);

    const handlePickExcel = async () => {
        try {
            setLoading(true);
            setError(null);


            const result = await window.pickExcelCommand();
            if (!result) {
                return;
            }



            // === 🔹 الطريقة الصحيحة في UXP لقراءة Excel ===
            const storage = window.__ELZOZ_STORAGE;

            if (!storage) {
                throw new Error("UXP storage not available in React panel");
            }


            const arrayBuffer = await result.file.read({
                format: storage.formats.binary
            });

            // تحويله إلى Uint8Array (اللي xlsx بيستقبله)
            const uint8Array = new Uint8Array(arrayBuffer);

            // === 🔹 Parse Excel ===
            const workbook = XLSX.read(uint8Array, { type: 'array' });

            const sheet = workbook.Sheets[workbook.SheetNames[0]];

            const jsonData = XLSX.utils.sheet_to_json(sheet);
            const columns = Object.keys(jsonData[0] || {});


            updateProjectState({
                excelPath: result.path,
                excelFile: result.file,
                excelData: jsonData,
                excelColumns: columns,
                excelRowCount: jsonData.length
            });

            setExcelPreview(jsonData.slice(0, 3));

        } catch (e) {
            console.error('  EXCEL UPLOAD ERROR:', e.message);
            console.error('  Stack trace:', e.stack);
            setError('Failed to load Excel file: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePickImages = async () => {
        try {
            setLoading(true);
            setError(null);

            // Call the global window command exposed in index.jsx
            const result = await window.pickImagesFolder();

            if (result) {

                updateProjectState({
                    imagesFolder: result.path,
                    imagesFolderObject: result.folder
                });
            }
        } catch (e) {
            console.error('  Folder picker error:', e);
            setError('Failed to select folder: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePickExportsFolder = async () => {
        try {
            setLoading(true);
            setError(null);

            const result = await window.pickExportsFolder();

            if (result) {

                updateProjectState({
                    exportsFolder: result.path,
                    exportsFolderObject: result.folder
                });
            }
        } catch (e) {
            console.error('  Exports folder picker error:', e);
            setError('Failed to select exports folder: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    const handlePickImageLayerFolder = async (imageLayerId, layerName) => {
        try {

            const folder = await window.pickImagesFolder();

            if (folder) {

                const newSelection = {
                    path: folder.path,
                    folderObject: folder.folder
                };


                setImageFolderSelections(prev => {
                    const updated = {
                        ...prev,
                        [imageLayerId]: newSelection
                    };

                    // Also update project state so it's available in other tabs
                    updateProjectState({
                        imageFolderSelections: updated
                    });

                    return updated;
                });
            } else {
            }
        } catch (e) {
            console.error('  IMAGE FOLDER PICKER ERROR:', e.message);
            console.error('  Stack trace:', e.stack);
            setError('Failed to select folder for image layer: ' + e.message);
        }
    };

    const handlePickPSD = async () => {
        try {
            setLoading(true);
            setError(null);

            // Use the global function exposed in index.jsx
            const result = await window.pickPSDCommand();
            if (result) {

                updateProjectState({
                    psdFile: result.file,
                    psdPath: result.path,
                    psdFileName: result.path.split('/').pop()
                });

                // Open PSD and extract layers
                try {
                    await window.openPSDInPhotoshop(result.file);

                    const layers = await window.getAllLayersFromPSD();

                    // Auto-detect image layers
                    const imageLayersDetected = await window.detectImageLayers();

                    updateProjectState({
                        psdLayers: layers,
                        imageLayers: imageLayersDetected
                    });
                } catch (layerError) {
                    console.error('  PSD LAYER EXTRACTION ERROR:', layerError.message);
                    console.error('  Stack trace:', layerError.stack);
                    setError('PSD selected but could not read layers. Make sure Photoshop is open.');
                }
            } else {
            }
        } catch (e) {
            console.error('  PSD PICKER ERROR:', e.message);
            console.error('  Stack trace:', e.stack);
            setError('Failed to select PSD: ' + e.message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="panel-content" style={{
            overflowY: 'auto',
            overflowX: 'auto',
            direction: dir,
            textAlign: isArabic ? 'right' : 'left'
        }}>
            <div className="section" style={{ boxSizing: 'border-box', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <h2 style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', margin: '0 0 var(--spacing-xs) 0' }}>{t('setup.title')}</h2>
                    <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>{t('setup.description')}</span>
                </div>

                <div className="card" style={{ marginBottom: 'var(--spacing-lg)' }}>
                    <div className="form-group">
                        <label className="form-label"><BarChart3 size={16} style={{ marginRight: '8px', display: 'inline', color: 'var(--color-primary)' }} />{t('setup.selectExcel')}</label>
                        <button onClick={handlePickExcel} style={{ width: '100%' }}>
                            {projectState.excelPath ? '✅ ' + t('setup.selectedFile') : t('setup.selectExcel')}
                        </button>
                        {projectState.excelPath && (
                            <div style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <p className="text-secondary text-sm" style={{ margin: '0', direction: dir }}>
                                    <Check size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} />{projectState.excelPath.split('/').pop()}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-accent-emerald)', margin: 'var(--spacing-xs) 0 0 0', direction: dir }}>
                                    {projectState.excelRowCount} {t('setup.rowsDetected')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="form-group">
                        <label className="form-label"><Palette size={16} style={{ marginRight: '8px', display: 'inline', color: 'var(--color-primary)' }} />{t('setup.title')}</label>
                        <button onClick={handlePickPSD} style={{ width: '100%' }}>
                            {projectState.psdPath ? <><CheckCircle2 size={14} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} /> {t('common.select')}</> : <><Palette size={14} style={{ marginRight: '4px', display: 'inline' }} /> {t('setup.title')}</>}
                        </button>
                        {projectState.psdPath && (
                            <div style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <p className="text-secondary text-sm" style={{ margin: '0', direction: dir }}>
                                    <Check size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} />{projectState.psdPath.split('/').pop()}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-accent-teal)', margin: 'var(--spacing-xs) 0 0 0', direction: dir }}>
                                    {projectState.psdLayers?.length || 0} {t('setup.layersFound')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>

                <div className="card">
                    <div className="form-group">
                        <label className="form-label"><Save size={16} style={{ marginRight: '8px', display: 'inline', color: 'var(--color-primary)' }} />{t('setup.exportFolder')}</label>
                        <button onClick={handlePickExportsFolder} style={{ width: '100%' }}>
                            {projectState.exportsFolder ? <><CheckCircle2 size={14} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} /> {t('common.select')}</> : <><Folder size={14} style={{ marginRight: '4px', display: 'inline' }} /> {t('setup.selectExcel')}</>}
                        </button>
                        {projectState.exportsFolder && (
                            <div style={{ marginTop: 'var(--spacing-sm)', padding: 'var(--spacing-sm)', backgroundColor: 'var(--color-bg-tertiary)', borderRadius: 'var(--radius-md)', border: '1px solid var(--color-border)' }}>
                                <p className="text-secondary text-sm" style={{ margin: '0', direction: dir }}>
                                    <Check size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} />{projectState.exportsFolder.split('/').pop()}
                                </p>
                                <p className="text-xs" style={{ color: 'var(--color-accent-emerald)', margin: 'var(--spacing-xs) 0 0 0', direction: dir }}>
                                    {t('setup.designsSaveHere')}
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {projectState.imageLayers && projectState.imageLayers.length > 0 && (
                <div className="section" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <div className="section-title" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <h3 style={{ margin: '0 0 var(--spacing-xs) 0', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>🖼️ {t('setup.detectedImageLayers')}</h3>
                        <span style={{ fontSize: '12px', color: 'var(--color-text-tertiary)', direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>
                            {projectState.imageLayers.length} {t('setup.imageLayers')}
                        </span>
                    </div>
                    <div className="card" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--spacing-md)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                            {projectState.imageLayers.map((imageLayer, idx) => {
                                // Use projectState instead of local state to ensure persistence across tabs
                                const folderSelected = projectState.imageFolderSelections?.[imageLayer.id] || imageFolderSelections[imageLayer.id];
                                return (
                                    <div
                                        key={imageLayer.id || idx}
                                        style={{
                                            padding: 'var(--spacing-md)',
                                            backgroundColor: 'var(--color-bg-tertiary)',
                                            borderRadius: 'var(--radius-md)',
                                            border: '1px solid var(--color-border)',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: isArabic ? 'flex-start' : 'space-between',
                                            flexDirection: isArabic ? 'row-reverse' : 'row',
                                            direction: dir
                                        }}
                                    >
                                        <div style={{ flex: 1, direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                            <div style={{ fontWeight: '600', fontSize: '13px', marginBottom: 'var(--spacing-xs)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                                <Folder size={16} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-primary)' }} />{imageLayer.name}
                                            </div>
                                            {folderSelected ? (
                                                <div style={{ fontSize: '11px', color: 'var(--color-success)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                                    <Check size={14} style={{ marginRight: '4px', display: 'inline', color: 'var(--color-success)' }} />{t('setup.folderSelected')}: {folderSelected.path.split('/').pop()}
                                                </div>
                                            ) : (
                                                <div style={{ fontSize: '11px', color: 'var(--color-text-secondary)', direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                                                    {t('setup.selectFolderForImages')}
                                                </div>
                                            )}
                                        </div>
                                        <button
                                            onClick={() => handlePickImageLayerFolder(imageLayer.id, imageLayer.name)}
                                            style={{
                                                padding: '6px 16px',
                                                fontSize: '12px',
                                                flexShrink: 0,
                                                marginLeft: isArabic ? 'auto' : '0',
                                                marginRight: isArabic ? '0' : 'auto',
                                                direction: dir,
                                                textAlign: isArabic ? 'right' : 'left'
                                            }}
                                        >
                                            {folderSelected ? t('setup.changeFolderButton') : t('setup.selectFolderButton')}
                                        </button>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {excelPreview.length > 0 && (
                <div className="section">
                    <div className="section-title">
                        <h3 style={{ margin: 0, direction: dir }}><BarChart3 size={16} style={{ marginRight: '8px', display: 'inline', color: 'var(--color-primary)' }} />{t('common.preview')}</h3>
                    </div>
                    <div className="card" style={{ overflowX: 'auto', marginBottom: 'var(--spacing-lg)' }}>
                        <table>
                            <thead>
                                <tr>
                                    {projectState.excelColumns.slice(0, 4).map(col => (
                                        <th key={col}>
                                            {col}
                                        </th>
                                    ))}
                                    {projectState.excelColumns.length > 4 && (
                                        <th>
                                            +{projectState.excelColumns.length - 4} {t('common.more')}
                                        </th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {excelPreview.map((row, idx) => (
                                    <tr key={idx}>
                                        {projectState.excelColumns.slice(0, 4).map(col => (
                                            <td key={col}>
                                                {String(row[col] || '').slice(0, 20)}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            <div className="alert info" style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'flex', flexDirection: isArabic ? 'row-reverse' : 'row', gap: 'var(--spacing-md)' }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>ℹ️</span>
                <div style={{ flex: 1, direction: dir, textAlign: isArabic ? 'right' : 'left' }}>
                    <strong style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', display: 'block' }}>{t('setup.nextSteps')}:</strong>
                    <ul style={{ margin: 'var(--spacing-sm) 0', paddingLeft: isArabic ? '0' : '20px', paddingRight: isArabic ? '20px' : '0', fontSize: '12px', direction: dir, textAlign: isArabic ? 'right' : 'left', listStylePosition: isArabic ? 'inside' : 'outside' }}>
                        <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('setup.step1AllFilesRequired')}</li>
                        <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('setup.step2ExcelData')}</li>
                        <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left', marginBottom: 'var(--spacing-xs)' }}>{t('setup.step3PSDTemplate')}</li>
                        <li style={{ direction: dir, textAlign: isArabic ? 'right' : 'left' }}>{t('setup.step4Mapping')}</li>
                    </ul>
                </div>
            </div>
        </div>
    );
}
