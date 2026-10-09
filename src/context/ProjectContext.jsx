'use client';

import React, { createContext, useState } from 'react';

export const ProjectContext = createContext();

export function ProjectProvider({ children }) {
    const [projectState, setProjectState] = useState({
        excelPath: null,
        excelFile: null,
        excelData: [],
        excelColumns: [],

        imagesFolder: null,
        imagesFolderObject: null, // UXP folder object for image operations
        psdFile: null,
        psdPath: null,
        psdLayers: [],

        // Export folder for designs (JPG, PNG, PSD)
        exportsFolder: null,
        exportsFolderObject: null,

        mapping: {}, // { excelColumn: photoshop layerId } for TEXT layers

        // Image insertion configuration
        imageMapping: {}, // { excelColumn: { layerId, layerName, imagePattern } } for IMAGE layers
        imageLayers: [], // Array of image/smart object layers found in PSD
        imageFolderSelections: {}, // { layerId: { path: string, folderObject: UXP } } - folders selected for each image layer
        imageNamingPatterns: {}, // { layerId: patternString } e.g., "products/{productId}.jpg"
        imageMappingRules: {}, // { layerId: { columnName, folderName } }

        isProcessing: false,
        progress: 0, // 0-100
        currentItem: null, // Track which item being processed
        processedCount: 0, // Number of successfully processed items
        results: [],
        errors: [], // Array of { row, message, category, action }
        batchLog: [] // Detailed log of entire batch
    });

    const updateProjectState = (updates) => {
        setProjectState(prev => ({ ...prev, ...updates }));
    };

    const setMapping = (column, layerId) => {
        setProjectState(prev => ({
            ...prev,
            mapping: {
                ...prev.mapping,
                [column]: layerId
            }
        }));
        // Save to localStorage
        localStorage.setItem('elzoz_mapping', JSON.stringify({
            ...projectState.mapping,
            [column]: layerId
        }));
    };

    const addError = (error) => {
        setProjectState(prev => ({
            ...prev,
            errors: [...prev.errors, error],
            batchLog: [...prev.batchLog, { type: 'error', ...error, timestamp: new Date().toISOString() }]
        }));
    };

    const addResult = (result) => {
        setProjectState(prev => ({
            ...prev,
            results: [...prev.results, result],
            processedCount: prev.processedCount + 1,
            batchLog: [...prev.batchLog, { type: 'result', ...result, timestamp: new Date().toISOString() }]
        }));
    };

    const setImageMapping = (layerId, columnName, pattern) => {
        setProjectState(prev => ({
            ...prev,
            imageMappingRules: {
                ...prev.imageMappingRules,
                [layerId]: { columnName, pattern }
            }
        }));
        localStorage.setItem('elzoz_imageMappingRules', JSON.stringify({
            ...projectState.imageMappingRules,
            [layerId]: { columnName, pattern }
        }));
    };

    const removeImageMapping = (layerId) => {
        setProjectState(prev => ({
            ...prev,
            imageMappingRules: Object.fromEntries(
                Object.entries(prev.imageMappingRules).filter(([key]) => key !== layerId)
            )
        }));
    };

    const clearProject = () => {
        setProjectState({
            excelPath: null,
            excelFile: null,
            excelData: [],
            excelColumns: [],
            imagesFolder: null,
            imagesFolderObject: null,
            psdFile: null,
            psdPath: null,
            psdLayers: [],
            exportsFolder: null,
            exportsFolderObject: null,
            mapping: {},
            imageMapping: {},
            imageLayers: [],
            imageFolderSelections: {},
            imageNamingPatterns: {},
            imageMappingRules: {},
            isProcessing: false,
            progress: 0,
            currentItem: null,
            processedCount: 0,
            results: [],
            errors: [],
            batchLog: []
        });
    };

    return (
        <ProjectContext.Provider value={{
            projectState,
            updateProjectState,
            setMapping,
            setImageMapping,
            removeImageMapping,
            addError,
            addResult,
            clearProject
        }}>
            {children}
        </ProjectContext.Provider>
    );
}
