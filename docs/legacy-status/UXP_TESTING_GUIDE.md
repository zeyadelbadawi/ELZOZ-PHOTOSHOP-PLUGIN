# Elzoz UXP Plugin - Phase 3 Testing Guide

## What Changed in Phase 3

### Correct Architecture (UXP Plugin Inside Photoshop)
- **Before**: Attempted to use external API wrapper layer (WRONG)
- **After**: Direct UXP and Photoshop API integration (CORRECT)

This is a native UXP plugin running inside Photoshop. It uses:
- **UXP Storage API** - for file picking and reading (Excel, folders, PSDs)
- **Photoshop API** - for layer manipulation and document operations
- **React UI** - for user interface rendered in the plugin panel

---

## File Structure Overview

```
src/services/
├── UXPBridge.js          # ONLY layer between React UI and Photoshop APIs
│   ├── fileOps           # UXP storage operations
│   └── psOps             # Photoshop batchPlay operations

src/panels/
├── SetupPanel.jsx        # File selection (Excel, folder, PSD)
├── MappingPanel.jsx      # Visual layer-to-column mapping
├── ExecutePanel.jsx      # Real batch processing with PS API
└── AnalyticsPanel.jsx    # Usage statistics

src/context/
├── AccountContext.jsx    # Multi-account system
└── ProjectContext.jsx    # Project state management

plugin/
├── manifest.json         # UXP plugin configuration
├── index.html            # Plugin entry point
└── icons/                # Plugin icons
```

---

## Core Services Reference

### fileOps (UXP Storage)
```javascript
// Pick and read Excel file
const result = await fileOps.pickExcelFile();
// Returns: { file, fileName, path, data: Uint8Array }

// Pick folder
const folder = await fileOps.pickFolder();
// Returns: { folder, path, name, token }

// List files in folder
const files = await fileOps.getFilesFromFolder(folderObj);
// Returns: [ { name, nativePath }, ... ]

// Pick PSD file
const result = await fileOps.pickPSDFile();
// Returns: { file, fileName, path }
```

### psOps (Photoshop API)
```javascript
// Get all layers from active document
const layers = await psOps.getAllLayers();
// Returns: [ { id, name, kind, visible, opacity, blendMode }, ... ]

// Update text layer
await psOps.updateTextLayer(layerId, 'new text');

// Get text from layer
const text = await psOps.getTextLayerContent(layerId);

// Open PSD file
const doc = await psOps.openPSD(psdFile);

// Save current document
await psOps.saveDocument();

// Export layer as PNG
await psOps.exportLayerAsPNG(layerId, outputPath);
```

---

## Running the Plugin Locally

### Prerequisites
1. Adobe Photoshop 26.11.2 or higher (required by manifest.json)
2. UXP Developer Tool installed
3. Node.js and npm

### Setup Steps

```bash
# 1. Install dependencies
npm install

# 2. Start webpack dev server
npm run dev

# 3. In UXP Developer Tool:
#    - File → Open Plugin Project
#    - Select this folder
#    - Click "Watch"
#    - Plugin will load into Photoshop

# 4. In Photoshop:
#    - Plugins → Development → Elzoz (or show panel)
#    - Panel will appear on right side
```

### manifest.json Details
```json
{
  "id": "Test-lw40mk",
  "name": "test",
  "host": {
    "app": "PS",
    "minVersion": "26.11.2"
  },
  "requiredPermissions": {
    "allowCodeGenerationFromStrings": true,
    "localFileSystem": "fullAccess",  // Enables file picking
    "webview": { "allow": "yes" }     // Enables web content
  },
  "entrypoints": [
    {
      "type": "panel",
      "id": "mapping",
      "label": "Mapping"
    }
  ]
}
```

---

## Testing Workflow

### Step 1: File Selection (Setup Tab)
1. Click "Select Excel" 
   - Pick any .xlsx or .csv file
   - Verify data loads and preview displays
2. Click "Select Folder"
   - Pick any folder with images
   - Verify file list appears
3. Click "Select PSD"
   - Pick a .psd template
   - Should extract and display layers

**Debugging**: Check browser console (F12) for ` ` debug logs

### Step 2: Layer Mapping (Mapping Tab)
1. Excel columns should display on left
2. PSD layers should display on right
3. Create mappings by:
   - Selecting a column from dropdown
   - Selecting a layer from dropdown
   - Clicking "Add Mapping"
4. Verify mappings appear in "Current Mappings" section

### Step 3: Batch Processing (Execute Tab)
1. Verify all files are selected
2. Select export formats (JPG, PNG, PSD)
3. Click "RUN" button
4. Monitor progress bar
5. Check results in console

**What happens in Execute**:
1. For each row in Excel:
   - Updates mapped layers with cell values
   - Saves the document
   - Exports in selected formats
2. Deducts credits from current account
3. Logs usage to analytics

### Step 4: Analytics (Analytics Tab)
1. View usage history
2. See credits used
3. Check processed items

---

## Debug Console Access

### In Photoshop
1. **UXP Developer Tool Console**:
   - Plugins → UXP Developer Tool
   - Look for "Console" tab
   - All `console.log()` output appears here

2. **Browser DevTools** (if running webpack dev):
   - Press F12
   - Go to Console tab
   - Filter for ` ` messages

### Debug Logs to Look For
```javascript
// File selection
  Picking Excel file
  Excel file picked: products.xlsx
  Folder selected: /Users/name/Pictures
  PSD file picked: template.psd

// Layer extraction
  Found 15 layers
  Got text from layer: Product Name

// Batch processing
  Starting batch processing...
  Processing row 1/100
  Updating layer [object Object] with value: iPhone 14
  Batch processing complete

// Errors
  Excel picker error: {error details}
  Could not extract layers: {error}
```

---

## Common Issues & Solutions

### Issue: "No active document"
**Cause**: Photoshop doesn't have a document open
**Fix**: Open or create a PSD file in Photoshop before running batch

### Issue: "Layer not found"
**Cause**: Layer ID doesn't exist (might be from wrong document)
**Fix**: Verify mapping is correct; re-extract layers from current document

### Issue: "Cannot read property 'layers' of undefined"
**Cause**: activeDocument is null
**Fix**: Open/switch to correct PSD file in Photoshop

### Issue: "File permissions denied"
**Cause**: Missing permissions in manifest.json
**Fix**: Verify `"requiredPermissions": { "localFileSystem": "fullAccess" }`

### Issue: "Excel data not showing"
**Cause**: XLSX library may not be bundled
**Fix**: Run `npm install xlsx` and ensure it's in webpack config

---

## Real vs Simulated Operations

### FULLY IMPLEMENTED (Real Photoshop API)
- ✅ Extract layers from active document
- ✅ Update text layer content
- ✅ Get text from layers
- ✅ Save document
- ✅ File picker operations
- ✅ Folder operations

### SIMULATED (Ready for Implementation)
- ⏳ Export layers as PNG/JPG (export logic in psOps, needs testing)
- ⏳ Image placement (requires batchPlay for layer replacement)
- ⏳ Advanced text formatting (requires batchPlay text options)

---

## Testing Checklist

### Phase 3 Testing
- [ ] Start webpack dev server
- [ ] Load plugin in UXP Developer Tool
- [ ] Setup Tab
  - [ ] Pick Excel file - loads data
  - [ ] Pick folder - shows files
  - [ ] Pick PSD - extracts layers
- [ ] Mapping Tab
  - [ ] Lists Excel columns
  - [ ] Lists PSD layers
  - [ ] Can create mappings
  - [ ] Mappings display correctly
- [ ] Execute Tab
  - [ ] Shows correct item count
  - [ ] Shows correct credit cost
  - [ ] Can select export formats
  - [ ] Processes with progress bar
  - [ ] Updates document in real Photoshop
  - [ ] Deducts credits
- [ ] Analytics Tab
  - [ ] Shows usage history
  - [ ] Shows correct statistics
- [ ] Console
  - [ ] No JavaScript errors
  - [ ] All   debug logs present
  - [ ] No permission warnings

---

## Next Steps for Phase 4

### Ready for Implementation:
1. **Real image placement** - Use batchPlay to replace image layers
2. **Advanced exports** - Implement multiple format exports
3. **Template variables** - Support {productName}, {price} syntax
4. **Undo/Redo** - Wrap operations in history state
5. **Batch folder output** - Save results to designated folder
6. **UI improvements** - Add more visual feedback

---

## API Reference Quick Links

- [UXP Storage API](https://developer.adobe.com/photoshop/uxp/2.x/reference/UXP/Modules/uxp/UXP/storage/)
- [Photoshop API](https://developer.adobe.com/photoshop/uxp/2.x/ps_reference/)
- [batchPlay Reference](https://developer.adobe.com/photoshop/uxp/2.x/reference/UXP/Modules/photoshop/photoshop/action/#batchplay)
- [UXP Developer Tool Docs](https://developer.adobe.com/photoshop/uxp/2.x/uxp-docs/)

---

## Support & Debugging

If you encounter issues:
1. Check browser console for   debug logs
2. Check UXP Developer Tool console
3. Verify manifest.json permissions
4. Ensure Photoshop 26.11.2+ is installed
5. Try reloading plugin in UXP Developer Tool

Happy testing! 🚀
