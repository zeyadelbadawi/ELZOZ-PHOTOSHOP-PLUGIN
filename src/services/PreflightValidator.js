/**
 * PreflightValidator - Comprehensive validation before batch execution
 * Scans all image mappings and folders to find all mismatches at once
 */

export class PreflightValidator {
    /**
     * Run complete pre-flight validation
     * @param {Object} projectState - Current project state
     * @returns {Object} {isValid, summary, folderMismatches, recommendations}
     */
    static async runFullValidation(projectState) {

        const result = {
            isValid: true,
            totalRows: projectState.excelData?.length || 0,
            totalMappings: Object.keys(projectState.imageMappingRules || {}).length,
            totalMismatches: 0,
            folderAnalysis: {},
            recommendations: [],
            canExecute: true,
            canSkipImages: true
        };

        // If no image mappings, validation passes
        if (!projectState.imageMappingRules || Object.keys(projectState.imageMappingRules).length === 0) {

            return result;
        }

        const folderMismatches = {};

        // Group mappings by folder
        const mappingsByFolder = {};
        for (const [layerId, rule] of Object.entries(projectState.imageMappingRules || {})) {
            if (!mappingsByFolder[rule.folderName]) {
                mappingsByFolder[rule.folderName] = [];
            }
            mappingsByFolder[rule.folderName].push({
                layerId,
                layerName: rule.layerName,
                folderName: rule.folderName,
                columnName: rule.columnName
            });
        }

        for (const [folderName, mappings] of Object.entries(mappingsByFolder)) {
            console.log(`    📁 "${folderName}": ${mappings.length} mapping(s)`);
            mappings.forEach(m => {
                console.log(`       - Layer "${m.layerName}" ← Column "${m.columnName}"`);
            });
        }

        // For each folder, validate files
        for (const [folderName, mappings] of Object.entries(mappingsByFolder)) {
            console.log(`  \n  ============ VALIDATING FOLDER: "${folderName}" ============`);

            const folderMissingFiles = new Set();
            const filesSeenInExcel = new Set();
            const availableFiles = [];
            const affectedRows = new Set();

            // Get the folder object from imageFolderSelections
            const folderSelection = Object.values(projectState.imageFolderSelections || {}).find(
                sel => sel.path.includes(folderName)
            );

            if (!folderSelection) {
                console.error(`  ❌ FOLDER NOT SELECTED: "${folderName}"`);
                folderMismatches[folderName] = {
                    status: 'folder_not_selected',
                    message: `Folder "${folderName}" not selected in Setup tab`,
                    missingFiles: [],
                    availableFiles: [],
                    affectedRows: []
                };
                result.isValid = false;
                continue;
            }

            console.log(`  📂 Folder path: ${folderSelection.path}`);

            // Get all files in the folder
            try {
                const files = await folderSelection.folderObject.getEntries();
                files.forEach(f => {
                    if (f.isFile) {
                        availableFiles.push(f.name);
                    }
                });
                console.log(`  ✅ Found ${availableFiles.length} files in folder`);
            } catch (err) {
                console.error(`  ❌ Error reading folder "${folderName}":`, err.message);
                folderMismatches[folderName] = {
                    status: 'folder_read_error',
                    message: `Could not read folder: ${err.message}`,
                    missingFiles: [],
                    availableFiles: [],
                    affectedRows: [],
                    error: err.message
                };
                result.isValid = false;
                continue;
            }

            // Check each mapping's column in Excel data
            let checkedCount = 0;
            for (const mapping of mappings) {
                console.log(`  \n  Checking mapping: Layer "${mapping.layerName}" uses column "${mapping.columnName}"`);

                for (let rowIdx = 0; rowIdx < projectState.excelData.length; rowIdx++) {
                    const row = projectState.excelData[rowIdx];
                    const filename = row[mapping.columnName];

                    if (!filename) {
                        console.log(`    Row ${rowIdx + 1}: EMPTY filename`);
                        continue;
                    }

                    const cleanFilename = String(filename).trim();
                    filesSeenInExcel.add(cleanFilename);
                    checkedCount++;

                    // Check if file exists in folder
                    const fileExists = availableFiles.some(f => f === cleanFilename);

                    if (!fileExists) {
                        console.error(`    ❌ Row ${rowIdx + 1}: FILE NOT FOUND: "${cleanFilename}"`);
                        folderMissingFiles.add(cleanFilename);
                        affectedRows.add(rowIdx + 1);
                        result.totalMismatches++;
                    } else {
                        console.log(`    ✅ Row ${rowIdx + 1}: "${cleanFilename}" OK`);
                    }
                }
            }

            console.log(`  \n  Folder Analysis Complete:`);
            console.log(`    - Total files checked: ${checkedCount}`);
            console.log(`    - Missing files: ${folderMissingFiles.size}`);
            console.log(`    - Affected rows: ${affectedRows.size}`);

            // Store folder analysis
            if (folderMissingFiles.size > 0) {
                result.isValid = false;
                folderMismatches[folderName] = {
                    status: 'mismatches_found',
                    missingFiles: Array.from(folderMissingFiles),
                    availableFiles,
                    affectedRows: Array.from(affectedRows),
                    totalMissing: folderMissingFiles.size,
                    totalAvailable: availableFiles.length,
                    impactedRowCount: affectedRows.size
                };
                console.log(`  ❌ "${folderName}": ${folderMissingFiles.size} missing file(s) affecting ${affectedRows.size} row(s)`);
            } else {
                folderMismatches[folderName] = {
                    status: 'all_ok',
                    missingFiles: [],
                    availableFiles,
                    affectedRows: [],
                    totalMissing: 0,
                    totalAvailable: availableFiles.length
                };
                console.log(`  ✅ "${folderName}": ALL FILES OK`);
            }
        }

        // Generate recommendations
        if (result.totalMismatches > 0) {
            result.recommendations.push({
                type: 'fix_files',
                title: 'Fix Image Files',
                description: `${result.totalMismatches} image file(s) are missing. Rename files in your folder to match Excel.`,
                action: 'fix_files'
            });
            result.recommendations.push({
                type: 'skip_images',
                title: 'Skip Images & Execute Text Only',
                description: 'Proceed without inserting images. Text mappings will still update.',
                action: 'skip_images'
            });
        } else {
            result.recommendations.push({
                type: 'proceed',
                title: 'Execute',
                description: 'All image files validated successfully.',
                action: 'proceed'
            });
        }

        result.folderAnalysis = folderMismatches;


        return result;
    }
}
