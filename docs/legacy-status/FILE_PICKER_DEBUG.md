# File Picker Implementation & Debug Guide

## Current Status

The file pickers have been fixed in `src/services/UXPBridge.js` to:
- Properly initialize UXP APIs
- Handle cases where APIs might not be available
- Provide clear error messages
- Support Excel (.xlsx, .xls, .csv), PSD, and folder picking

## File Picker Flow

```
User clicks "Select Excel" button in SetupPanel
  ↓
handlePickExcel() calls fileOps.pickExcelFile()
  ↓
pickExcelFile() uses fs.getFileForOpening() (UXP API)
  ↓
User sees native file dialog
  ↓
File is read and parsed with XLSX library
  ↓
ExcelData saved to ProjectContext
  ↓
UI updates to show success and file preview
```

## Testing Checklist

When running the plugin in Photoshop:

### 1. Check Console Output
```
Open Photoshop Developer Console (Cmd+Option+J on Mac, Ctrl+Shift+J on Windows)
Look for messages like:
- "  Excel file picked: myfile.xlsx"
- "  Folder selected: /Users/..."
- "  PSD file picked: template.psd"
```

### 2. Test Excel Picker
- Click "Select Excel" button
- A file picker should open
- Select any .xlsx, .xls, or .csv file
- The button should change to "✅ Excel Selected"
- A preview table should appear showing first 3 rows

### 3. Test Folder Picker
- Click "Select Folder" button
- A folder picker should open
- Select any folder with images
- Button should change to "✅ Folder Selected"

### 4. Test PSD Picker
- Click "Select PSD" button
- A file picker should open
- Select a .psd file
- Button should change to "✅ PSD Selected"
- Layers should be extracted and shown (e.g., "7 layers")

## Error Messages

If something fails, you'll see errors like:
- "File system API not available. Make sure the plugin is running in Photoshop."
  → The plugin isn't running in Photoshop or UXP APIs aren't initialized
  
- "Failed to pick Excel file: User cancelled"
  → User closed the file dialog without selecting

- "Failed to pick PSD file: Permission denied"
  → The PSD file can't be accessed (permissions issue)

## Key Files Modified

- `src/services/UXPBridge.js` - Fixed file picker initialization and error handling
- `src/panels/SetupPanel.jsx` - Already properly connected to file pickers
- `src/styles.css` - Added scrollability to panels

## Scrollability

All 4 panels now have proper scrolling:
- **Setup Panel** - Scrolls to see full file selection and preview
- **Mapping Panel** - Scrolls when many columns/layers exist
- **Execute Panel** - Scrolls to see all options and progress
- **Analytics Panel** - Scrolls to see full statistics

Each panel has `overflow: 'auto'` CSS which creates scrollbars when content exceeds available space.

## Next: Testing in Photoshop

1. Build the plugin: `npm run build`
2. Load in Photoshop via Plugin Manager
3. Check Developer Console for " " messages
4. Try each file picker button
5. Check console for success/error messages

If console shows API errors, we may need to verify:
- UXP plugin manifest configuration
- Permissions in manifest.json
- Plugin sandbox permissions
