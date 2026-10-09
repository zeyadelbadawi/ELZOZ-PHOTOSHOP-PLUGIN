# Phase 3: Real Photoshop Processing

## Overview
Phase 3 transforms the UI from a mockup into a real, working Photoshop automation plugin. The file pickers now work and data flows through the system. Now we implement actual PSD manipulation.

## Phase 3 Milestones

### 3.1 - Enhanced Layer Extraction (IN PROGRESS)
**Goal:** Read actual layer data from opened PSD files
**Status:** Partial - getAllLayersFromPSD() exists but needs enhancement

**Changes Needed:**
- Improve `getAllLayersFromPSD()` in index.jsx to extract layer properties
- Add layer type detection (text layers, smart objects, groups)
- Add layer dimensions and positions
- Filter out non-editable layers

**Files to Modify:**
- `src/index.jsx` - Enhance getAllLayersFromPSD()
- `src/services/BatchProcessor.js` - Add layer analysis

---

### 3.2 - Text Layer Updates (NEXT)
**Goal:** Update text in PSD layers from Excel data
**Status:** Not implemented

**Core Function:**
```javascript
updateTextLayerFromExcel(layerId, excelValue, psdDocument)
  ↓
  Find text layer by ID
  ↓
  Validate text value
  ↓
  Update layer.textKey.content = excelValue
  ↓
  Save changes
```

**Files to Create:**
- `src/services/TextLayerUpdater.js` - New service for text updates
- `src/utils/TextValidation.js` - Text formatting and validation

**Files to Modify:**
- `src/index.jsx` - Add updateTextLayer() command
- `src/panels/MappingPanel.jsx` - Show text layer types
- `src/panels/ExecutePanel.jsx` - Run text updates

---

### 3.3 - Image Insertion (THEN)
**Goal:** Insert product images into smart objects
**Status:** Not implemented

**Core Function:**
```javascript
insertImageIntoSmartObject(smartObjectId, imagePath, psdDocument)
  ↓
  Find smart object layer
  ↓
  Load image file
  ↓
  Replace smart object linked file
  ↓
  Update bounds if needed
```

**Files to Create:**
- `src/services/ImageInserter.js` - New service for image replacement
- `src/utils/ImageProcessing.js` - Image format handling

**Files to Modify:**
- `src/index.jsx` - Add insertImage() command
- `src/panels/ExecutePanel.jsx` - Show image insertion progress

---

### 3.4 - File Export (FINALLY)
**Goal:** Export final designs as JPG, PNG, or PSD
**Status:** Not implemented

**Core Function:**
```javascript
exportDesign(psdDocument, format, outputPath)
  ↓
  Merge layers if needed
  ↓
  Apply export settings
  ↓
  Save to disk
  ↓
  Return export path
```

**Files to Create:**
- `src/services/DesignExporter.js` - New service for export
- `src/utils/ExportSettings.js` - Format-specific settings

**Files to Modify:**
- `src/index.jsx` - Add exportDesign() command
- `src/panels/ExecutePanel.jsx` - Show export options and progress

---

## Timeline & Priority

### Immediate (This Week)
1. Fix Excel file read format ✅ DONE
2. Enhance getAllLayersFromPSD() - Extract all layer properties
3. Create MappingPanel layer visualization
4. Test layer extraction with real PSDs

### Short-term (Next Week)
5. Build TextLayerUpdater service
6. Implement text update in Photoshop
7. Test with real Excel → PSD text updates
8. Build UI for Execute tab progress

### Medium-term (Following Week)
9. Build ImageInserter service
10. Implement image replacement in smart objects
11. Handle multiple images per design
12. Build image preview in Execute tab

### Later (After That)
13. Build DesignExporter service
14. Support multiple export formats
15. Batch export handling
16. Final testing and optimization

---

## Current Component Flow

```
SetupPanel (Files Selected)
    ↓
    excelFile ──────────┐
    psdFile ────────────┼──→ ProjectContext
    psdLayers ──────────┤
    excelData ──────────┘
    ↓
MappingPanel (Column → Layer Mapping)
    ↓
    mappingConfig ──────→ ProjectContext
    ↓
ExecutePanel (Batch Processing)
    ↓
    For each row in excelData:
      1. Update text layers with values
      2. Insert images
      3. Export design
    ↓
AnalyticsPanel (Results & Stats)
```

---

## Technical Considerations

### Photoshop APIs Available
- `app.documents[0]` - Active document
- `app.activeDocument.layers` - Layer access
- `layer.kind` - Layer type detection
- `TextItem.content` - Text layer content
- `SmartObject.linked` - Smart object file
- `Document.saveAs()` - File export

### UXP Constraints
- Must work within plugin sandbox
- File I/O through UXP storage APIs only
- Async operations require proper await handling
- Error handling crucial for user feedback

---

## Success Metrics for Phase 3

✅ Excel data successfully reads
✅ PSD layers fully extracted and visible
✅ Text layers update with Excel values
✅ Images replace smart objects correctly
✅ Designs export in multiple formats
✅ Batch processing completes without errors
✅ Analytics shows accurate statistics
✅ UI provides clear progress feedback

