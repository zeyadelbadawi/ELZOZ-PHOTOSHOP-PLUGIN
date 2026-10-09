# Testing Checklist - File Pickers & Scrollability

## Pre-Flight Checks

- [ ] Latest code changes are in place:
  - [ ] `src/services/UXPBridge.js` has proper API initialization
  - [ ] `src/styles.css` has root element styling
  - [ ] `src/panels/Demos.jsx` renders AppContainer

- [ ] Project builds successfully:
  ```bash
  npm run build
  ```
  No errors should appear in console

- [ ] Plugin manifest is valid:
  - [ ] `plugin/manifest.json` exists
  - [ ] Contains `"localFileSystem": "fullAccess"`

---

## Test 1: File Picker - Excel

**Setup:**
- Photoshop is open
- Plugin is loaded and visible
- Setup tab is active

**Steps:**
1. [ ] Click "📁 Select Excel" button
2. [ ] Native file picker dialog should open
3. [ ] Select any `.xlsx`, `.xls`, or `.csv` file
4. [ ] File should be processed

**Expected Results:**
- [ ] Button changes to "✅ Excel Selected"
- [ ] File path appears below button (filename only)
- [ ] Data preview table appears showing first 3 rows
- [ ] Column headers are displayed
- [ ] Data rows show cell values (truncated to 20 chars)

**Debug Info to Check:**
- Open Photoshop Developer Console (Cmd+Option+J Mac, Ctrl+Shift+J Windows)
- Should see message: `  Excel file picked: [filename]`
- Should see: `  Excel parsed successfully with X rows and Y columns`

**If It Fails:**
- [ ] Check console for error messages
- [ ] Verify file is readable Excel format
- [ ] Check if XLSX library loaded (check network tab)

---

## Test 2: File Picker - Images Folder

**Setup:**
- Excel file already selected (from Test 1)
- Setup tab is active

**Steps:**
1. [ ] Click "📁 Select Folder" button
2. [ ] Folder picker dialog should open
3. [ ] Select any folder containing images
4. [ ] Folder should be processed

**Expected Results:**
- [ ] Button changes to "✅ Folder Selected"
- [ ] Folder path appears below button (folder name only)
- [ ] No error messages appear

**Debug Info to Check:**
- Open Photoshop Developer Console
- Should see message: `  Folder selected: /path/to/folder`
- Should see: `  Found X files in folder`

**If It Fails:**
- [ ] Check folder has read permissions
- [ ] Try selecting a different folder
- [ ] Check console for specific error

---

## Test 3: File Picker - PSD File

**Setup:**
- Excel and Folder already selected (from Tests 1-2)
- Setup tab is active
- Photoshop has at least one PSD document open (recommended)

**Steps:**
1. [ ] Click "🎨 Select PSD" button
2. [ ] File picker should open (filtered to `.psd` only)
3. [ ] Select a `.psd` file
4. [ ] File should be processed and layers extracted

**Expected Results:**
- [ ] Button changes to "✅ PSD Selected"
- [ ] File path appears below button (filename only)
- [ ] Shows number of layers: "✓ [filename] (X layers)"
- [ ] No error messages appear

**Debug Info to Check:**
- Open Photoshop Developer Console
- Should see message: `  PSD file picked: [filename]`
- Should see: `  Found X layers` (or error if extraction failed)

**If Layer Extraction Fails:**
- [ ] This is expected if Photoshop has no active document
- [ ] It's NOT a blocker - file is still selected
- [ ] We'll fix layer extraction in Phase 3

---

## Test 4: Scrollability - Setup Panel

**Setup:**
- All 3 files selected (Excel, Folder, PSD)
- Setup tab is active
- Panel has enough content to overflow

**Steps:**
1. [ ] Look at the data preview table at bottom
2. [ ] If table extends beyond panel height, try to scroll
3. [ ] Use mouse wheel while hovering over content

**Expected Results:**
- [ ] Scrollbar appears on right side when needed
- [ ] Content scrolls smoothly up/down
- [ ] Scrollbar disappears when not needed

**If It Fails:**
- [ ] Check browser inspector for CSS issues
- [ ] Verify `overflow: auto` is set on panel
- [ ] Try resizing plugin window

---

## Test 5: Scrollability - Mapping Panel

**Setup:**
- All 3 files selected
- Navigate to "Mapping" tab

**Steps:**
1. [ ] Look at left column (Excel Columns) and right column (PSD Layers)
2. [ ] If content exceeds height, try to scroll
3. [ ] Try scrolling on mapping controls section below

**Expected Results:**
- [ ] Scrollbars appear on any column when needed
- [ ] Can scroll independently on left/right sides
- [ ] All content is accessible by scrolling

**If It Fails:**
- [ ] Check CSS for grid layout issues
- [ ] Verify each column has proper container

---

## Test 6: Scrollability - Execute Panel

**Setup:**
- All 3 files selected and mapped
- Navigate to "Execute" tab

**Steps:**
1. [ ] View processing summary section
2. [ ] View export formats section
3. [ ] If content extends beyond panel, scroll
4. [ ] Verify "RUN" button is always accessible

**Expected Results:**
- [ ] All sections are scrollable
- [ ] Run button remains visible or accessible by scrolling
- [ ] Smooth scrolling behavior

---

## Test 7: Scrollability - Analytics Panel

**Setup:**
- Navigate to "Analytics" tab
- Any files selected or not (doesn't matter)

**Steps:**
1. [ ] Look at statistics cards
2. [ ] Look at usage history table (if available)
3. [ ] Try scrolling if content extends beyond panel

**Expected Results:**
- [ ] All stats are visible or scrollable
- [ ] Tables scroll horizontally if needed
- [ ] No content cut off

---

## Test 8: Tab Navigation

**Setup:**
- All files selected
- All tests above passed

**Steps:**
1. [ ] Click "Setup" tab - should show file selection
2. [ ] Click "Mapping" tab - should show column/layer mapping
3. [ ] Click "Execute" tab - should show batch processing
4. [ ] Click "Analytics" tab - should show statistics
5. [ ] Switch back and forth between tabs

**Expected Results:**
- [ ] Each tab displays correct content
- [ ] No errors when switching
- [ ] Selected state persists (files stay selected)
- [ ] Scrolling position resets per tab

---

## Summary Report

**File Pickers Status:**
- [ ] Excel picker works: YES / NO / PARTIAL
- [ ] Folder picker works: YES / NO / PARTIAL
- [ ] PSD picker works: YES / NO / PARTIAL
- [ ] Error messages are helpful: YES / NO

**Scrollability Status:**
- [ ] Setup panel scrolls: YES / NO
- [ ] Mapping panel scrolls: YES / NO
- [ ] Execute panel scrolls: YES / NO
- [ ] Analytics panel scrolls: YES / NO
- [ ] Scrolling is smooth: YES / NO

**Overall Status:**
- [ ] All features working
- [ ] Most features working (note issues below)
- [ ] Some features need fixing (note issues below)
- [ ] Major issues blocking use (note issues below)

**Issues Found (if any):**
```
[Issue 1]
Description: 
Steps to Reproduce:
Expected vs Actual:
Console Errors:

[Issue 2]
...
```

---

## Next Steps After Testing

### If All Tests Pass ✓
→ Move to Phase 3: Real Photoshop Integration

### If Some File Pickers Fail
→ Check error messages in console
→ Verify Photoshop version is 26.11.2+
→ Check plugin manifest permissions

### If Scrolling Doesn't Work
→ Check window/panel size constraints
→ Verify CSS overflow properties
→ Try resizing plugin panel

---

## Contact / Support

When reporting issues, include:
- [ ] Console error messages (copy full text)
- [ ] Steps to reproduce
- [ ] Expected vs actual behavior
- [ ] Photoshop version
- [ ] Plugin version/build date
