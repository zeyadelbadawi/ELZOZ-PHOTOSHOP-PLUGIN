# Debug Log Guide - Multi-Image Import Feature

This document explains all the debug logs added to the system to help you track the entire flow from PSD upload to batch generation.

---

## Overview of Flow

```
PSD Upload → Image Detection → Folder Selection → Excel Upload 
→ Image Mapping Configuration → Batch Generation with Image Insertion
```

---

## Files Modified with Debug Logs

### 1. **src/services/ImageDetector.js** ✅ MODIFIED
**Purpose:** Detects all image layers in the PSD document

**Debug Logs Added:**
```
[v0] ========== IMAGE DETECTOR: START ==========
[v0] Detecting image layers...
[v0] Active document found: <filename>
[v0] Inside executeAsModal, starting layer walk...
[v0] Walking layer set at depth X, prefix: "...", layer count: Y
[v0] Processing layer: "<name>", kind: <type>, id: <id>
[v0] IMAGE LAYER DETECTED: <full layer details JSON>
[v0] Layer "<name>" has nested layers, recursing...
[v0] Layer walk completed
[v0] TOTAL IMAGE LAYERS DETECTED: X
[v0] All detected layers: <complete JSON array>
[v0] ========== IMAGE DETECTOR: END ==========
```

**What to Check:**
- Look for "IMAGE LAYER DETECTED" - confirms images were found
- Check "TOTAL IMAGE LAYERS DETECTED" - should match your expected count
- Verify layer IDs, kinds (smartObject/pixel/raster), and names

---

### 2. **src/panels/SetupPanel.jsx** ✅ MODIFIED
**Purpose:** Handles PSD upload, Excel upload, and folder selection

#### A) Excel Upload Section
**Debug Logs:**
```
[v0] ========== EXCEL UPLOAD: START ==========
[v0] Picking Excel file
[v0] Excel file selected: <path>
[v0] File name: <filename>
[v0] Reading file as binary...
[v0] File read successfully, size: <bytes>
[v0] Parsing Excel workbook...
[v0] Workbook sheets: [sheet1, sheet2, ...]
[v0] Using sheet: <sheet_name>
[v0] ===== EXCEL COMPLETE DATA =====
[v0] Total rows: X
[v0] Columns: [col1, col2, col3, ...]
[v0] FULL EXCEL DATA: <complete JSON data>
[v0] ===== END EXCEL DATA =====
[v0] ========== EXCEL UPLOAD: END ==========
```

**What to Check:**
- "FULL EXCEL DATA" - This shows ALL your Excel data in JSON format
- Verify column names match what you'll use for mapping
- Check row count matches expected number of designs
- Verify data values are correct

#### B) PSD Upload Section
**Debug Logs:**
```
[v0] ========== PSD UPLOAD: START ==========
[v0] Picking PSD file
[v0] PSD file selected: <path>
[v0] PSD file name: <name>
[v0] Opening PSD in Photoshop...
[v0] PSD opened successfully
[v0] Extracting all layers...
[v0] Total layers extracted: X
[v0] All layers: <complete JSON>
[v0] ===== AUTO-DETECTING IMAGE LAYERS =====
[v0] Image layers detected count: X
[v0] Image layers details: <complete JSON>
[v0] ===== IMAGE DETECTION COMPLETE =====
[v0] Project state updated with layers and image layers
[v0] ========== PSD UPLOAD: END ==========
```

**What to Check:**
- "Image layers detected count" - should be 1 or more
- "Image layers details" - verify layer IDs match (they're used in mapping)
- Compare with "All layers" to understand the full structure

#### C) Image Folder Selection
**Debug Logs:**
```
[v0] ===== IMAGE FOLDER SELECTION: START =====
[v0] Picking folder for image layer
[v0] Image Layer ID: <id>
[v0] Layer Name: <name>
[v0] Image layer folder selected
[v0] Folder path: /path/to/images
[v0] Folder name: <folder_name>
[v0] Updating imageFolderSelections for ID: <id>
[v0] New selection: {"path": "...", "folderObject": {...}}
[v0] Updated imageFolderSelections: <complete JSON>
[v0] ===== IMAGE FOLDER SELECTION: END =====
```

**What to Check:**
- "Image Layer ID" - matches the ID from detection
- "Folder path" - verify it contains your image files
- "Updated imageFolderSelections" - shows all selected folders

---

### 3. **src/panels/ImageMappingPanel.jsx** ✅ MODIFIED
**Purpose:** Creates mappings between image layers, folders, and Excel columns

#### Add Mapping
**Debug Logs:**
```
[v0] ===== ADD IMAGE MAPPING: START =====
[v0] Selected Layer: {"id": X, "name": "...", ...}
[v0] Selected Folder: "folder_name"
[v0] Selected Column: "image_filename"
[v0] VALIDATION ERROR - Please select layer, folder, and column
[v0] selectedLayer: YES/NO
[v0] selectedFolder: YES/NO
[v0] selectedColumn: YES/NO
[v0] Mapping object created: {"layerId": X, "layerName": "...", ...}
[v0] Local layer mappings updated: <complete JSON>
[v0] Saving to project state...
[v0] Project state updated
[v0] Current imageMappingRules: <complete JSON>
[v0] Form reset
[v0] ===== ADD IMAGE MAPPING: END =====
```

**What to Check:**
- "Selected Layer/Folder/Column" - verify all 3 are selected
- If validation error - check which one is missing
- "Current imageMappingRules" - shows the complete mapping configuration

#### Remove Mapping
**Debug Logs:**
```
[v0] ===== REMOVE IMAGE MAPPING: START =====
[v0] Removing mapping for layer ID: <id>
[v0] Local mappings after removal: <JSON>
[v0] Updated imageMappingRules: <JSON>
[v0] ===== REMOVE IMAGE MAPPING: END =====
```

---

### 4. **src/services/ImageMatcher.js** ✅ MODIFIED
**Purpose:** Matches Excel filenames with actual image files

**Debug Logs:**
```
[v0] ===== IMAGE MATCHING: START =====
[v0] Building image matches...
[v0] Excel rows count: X
[v0] Image mapping rules count: X
[v0] Image mapping rules: <complete JSON>
[v0] Base folder path: /path/to/base
[v0] Processing layer <id>: {"folderName": "...", "columnName": "..."}
[v0] INVALID MAPPING - Missing folderName or columnName: <details>
[v0] NO FILENAME in column 'column_name' for row X. Row data: <row JSON>
[v0] MATCH FOUND - Layer X, Row Y: <match details JSON>
[v0] Total image matches built: Z
[v0] All matches: <complete JSON>
[v0] ===== IMAGE MATCHING: END =====
```

**What to Check:**
- "Total image matches built" - should equal (number of layers × number of rows)
- "MATCH FOUND" - logs should show a match for each image needed
- "NO FILENAME" - if this appears, check your Excel column name
- "All matches" - shows all matched image paths

---

### 5. **src/panels/ExecutePanel.jsx** ✅ MODIFIED
**Purpose:** Executes batch generation with text and image insertion

#### Row Processing
**Debug Logs:**
```
[v0] ========== PROCESSING ROW ==========
[v0] Row X/Total
[v0] Row data: <complete row JSON>
[v0] Starting text layer updates...
[v0] Excel column 'col_name': <value>
[v0] EMPTY CELL - Column X for row Y
[v0] Text update prepared: {"layerId": X, "layerName": "...", "text": "..."}
[v0] Applying X text updates for row Y
[v0] All updates: <complete JSON array>
[v0] Text update result: <result JSON>
```

**What to Check:**
- "Row data" - verify the Excel data for this row
- "Text update prepared" - check values are correct
- "All updates" - should have entries for each mapped column

#### Image Insertion
**Debug Logs:**
```
[v0] Checking for image mappings...
[v0] Image mapping rules: <complete JSON>
[v0] ===== IMAGE INSERTION: Row X =====
[v0] Processing image for layer <id>
[v0] Rule - Folder: <folder>, Column: <column>
[v0] Filename from column 'col_name': <filename>
[v0] NO FILENAME in column 'col_name' for row X
[v0] Image path constructed: folder/filename
[v0] Looking for layer with ID: X | Found: YES/NO
[v0] Layer not found for ID: X
[v0] Image update prepared: <JSON>
[v0] Total image updates for row X: Y
[v0] All image updates: <complete JSON array>
[v0] Calling ImageInserter.insertImages()...
[v0] Image insertion completed for row X
[v0] Image result: <result JSON>
[v0] IMAGE INSERTION ERRORS: <error array>
[v0] IMAGE INSERTION ERROR: <error message>
[v0] No image updates for this row - skipping image insertion
[v0] ===== IMAGE INSERTION: END =====
```

**What to Check:**
- "Image mapping rules" - confirms mappings are loaded
- "Filename from column" - verify filename is read correctly
- "Image path constructed" - check path format
- "Found: YES/NO" - should be YES for layer to be found
- "Total image updates" - should be > 0 if images configured
- "IMAGE INSERTION ERRORS" - if any errors occur

#### Document Save & Export
**Debug Logs:**
```
[v0] Saving document after row X
[v0] Document saved successfully
[v0] ===== EXPORT: Row X =====
[v0] Exporting to formats: [JPG, PNG, PSD]
[v0] Export base name: design_name_X
[v0] Exports folder path: /path/to/exports
[v0] EXPORT CONFIG ERROR - No exports folder configured
```

---

## How to Use These Logs

### Step 1: Upload PSD
1. Click "Select PSD" button
2. Open Browser Console (F12 → Console tab)
3. Look for:
   ```
   ========== PSD UPLOAD: START ==========
   ...
   TOTAL IMAGE LAYERS DETECTED: X
   ...
   ========== PSD UPLOAD: END ==========
   ```
4. **Expected:** Should detect your image layers with correct count

### Step 2: Select Image Folders
1. Click folder selection button for each image
2. Look for:
   ```
   ===== IMAGE FOLDER SELECTION: START =====
   Updated imageFolderSelections: {...}
   ===== IMAGE FOLDER SELECTION: END =====
   ```
3. **Expected:** Should show all selected folders

### Step 3: Upload Excel
1. Click "Select Excel" button
2. Look for:
   ```
   ===== EXCEL COMPLETE DATA =====
   FULL EXCEL DATA: [{"Col1": "Val1", "Col2": "Val2"}, ...]
   ===== END EXCEL DATA =====
   ```
3. **Expected:** All your spreadsheet data in JSON format

### Step 4: Create Image Mappings
1. Go to "Image Map" tab
2. Add mapping for each image layer
3. Look for:
   ```
   ===== ADD IMAGE MAPPING: START =====
   Current imageMappingRules: {"layerId1": {"folderName": "...", "columnName": "..."}}
   ===== ADD IMAGE MAPPING: END =====
   ```
4. **Expected:** All mappings saved in imageMappingRules

### Step 5: Execute Generation
1. Click "Execute" button
2. Look for logs for EACH ROW:
   ```
   ========== PROCESSING ROW ==========
   Row X/Total
   Row data: {...}
   
   [Text updates logs...]
   
   ===== IMAGE INSERTION: Row X =====
   All image updates: [...]
   Image insertion completed
   ===== IMAGE INSERTION: END =====
   
   ===== EXPORT: Row X =====
   Exporting to formats: [...]
   ===== EXPORT: END =====
   ```
3. **Expected:** Should see complete flow for each row

---

## Common Issues & Debug

### Issue: No image layers detected
**Look for:** `TOTAL IMAGE LAYERS DETECTED: 0`
**Check:**
- PSD file has image content (not just text)
- Image layers are at top level (not deeply nested)
- Photoshop is open and document is active

### Issue: Excel data not showing
**Look for:** Missing `FULL EXCEL DATA` section
**Check:**
- Excel file format is correct (.xlsx)
- File has headers in first row
- Data rows are below headers

### Issue: Image matching not working
**Look for:** `NO FILENAME in column` or `Total image matches built: 0`
**Check:**
- Column name in mapping matches Excel column exactly
- Excel cells contain filenames (not empty)
- Filenames match actual image files in folder

### Issue: Images not inserting
**Look for:** `IMAGE INSERTION ERRORS` or `Layer not found`
**Check:**
- Layer ID from mapping matches detected layer ID
- Folder path is correct
- Image files exist in specified folder
- Filename in Excel matches actual filename

---

## Copy-Paste These Sections to Monitor

### Quick Check Template
When testing, look for these key sections:

```
[v0] TOTAL IMAGE LAYERS DETECTED: X
[v0] FULL EXCEL DATA: [...]
[v0] Current imageMappingRules: {...}
[v0] Total image matches built: Z
[v0] All image updates: [...]
[v0] Image insertion completed
```

If all these sections appear with correct data, your flow is working correctly!
