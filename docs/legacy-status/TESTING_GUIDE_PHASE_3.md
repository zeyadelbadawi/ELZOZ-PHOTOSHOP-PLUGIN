# Phase 3 Testing Guide - Text, Image, Export Services

## System Requirements for Testing

1. Adobe Photoshop with UXP plugin support
2. Sample PSD file with:
   - Multiple text layers (for text updates testing)
   - Smart objects or raster layers (for image insertion testing)
3. Sample Excel file with product/design data
4. Sample images folder for image insertion

---

## Test Setup: Prepare Test Files

### 1. Create Sample PSD File

**Layers needed**:
```
- Product Name (TEXT layer)
- Product Price (TEXT layer)
- Product Image (SMART OBJECT or RASTER layer)
- Product Description (TEXT layer)
- Design Background (any layer)
```

**Save as**: `test-design.psd`

### 2. Create Sample Excel File

**Columns needed**:
```
ProductName  | Price | ImageFile  | Description
Widget A     | 99.99 | widget_a.jpg | Great product
Widget B     | 149.99| widget_b.jpg | Better product
Widget C     | 199.99| widget_c.jpg | Best product
```

**Save as**: `products.xlsx`

### 3. Create Sample Images

Create or copy images:
```
images/
  ├── widget_a.jpg
  ├── widget_b.jpg
  └── widget_c.jpg
```

---

## Test 1: Text Layer Updates (TextLayerUpdater)

### Step 1: Navigate to Setup Tab
1. Click "Select PSD File" and choose `test-design.psd`
2. Should show:
   - ✅ "1 document loaded"
   - ✅ Layer list showing text layers

### Step 2: Navigate to Mapping Tab
1. Should see all layers listed
2. Create mappings:
   - "Product Name" → maps to Excel column "ProductName"
   - "Product Price" → maps to Excel column "Price"
   - "Product Description" → maps to Excel column "Description"
3. Click "Save Mappings"

### Step 3: Navigate to Execute Tab
1. Select export formats: ✓ JPG, ✓ PSD
2. Click "RUN"

### Expected Behavior - TEXT LAYER TEST PASS ✅
- Progress bar fills (1-3 rows)
- Console shows:
  ```
  [v0] Starting batch text updates for 3 layers
  [v0] Searching by name: "Product Name"
  [v0] Successfully updated "Product Name" with: Widget A
  [v0] Document saved successfully
  ```
- After each row processes:
  - Row count increments
  - Credits deducted (should see -3 if 3 products)
  - Analytics tab shows 3 rows processed

### If Test Fails ❌
**Error**: "Layer not found"
- Check that layer names in PSD exactly match mapping names
- Check console for: `[v0] Layer name not found, trying by ID`

**Error**: "Cannot map to non-text layer"
- Verify you mapped to TEXT layers only
- Don't map to smart objects/raster for text updates

---

## Test 2: Image Insertion (ImageInserter)

### Step 1: In Mapping Tab, Add Image Rules
1. Click "Configure Image Insertion"
2. Map "Product Image" layer to:
   - Column: "ImageFile"
   - Pattern: `images/{ImageFile}`
3. Click "Save Image Rules"

### Step 2: In Execute Tab
1. Make sure Excel has ImageFile column filled
2. Folder icon shows correct images folder selected
3. Click "RUN"

### Expected Behavior - IMAGE INSERTION TEST PASS ✅
- Console shows:
  ```
  [v0] Processing image insertions for row 1
  [v0] Resolved image path: images/widget_a.jpg
  [v0] Found layer: Product Image (smartObject)
  [v0] Preparing to place image in smart object: Product Image
  [v0] Image insertion prepared for: Product Image
  ```
- No errors in console
- Analytics shows image operations logged

### If Test Fails ❌
**Error**: "No valid image path"
- Check pattern format: should be `images/{ColumnName}`
- Check Excel column name matches pattern

**Error**: "Layer not found"
- Verify image layer exists in PSD with exact name

**Error**: "Cannot insert image into pixel layer"
- Use only Smart Objects or Raster layers for images
- Don't use text or group layers

---

## Test 3: Export Functionality (DesignExporter)

### Step 1: In Execute Tab
1. Select export formats:
   - ✓ JPG (quality slider default 80)
   - ✓ PNG
   - ✓ PSD
2. Click "RUN"

### Expected Behavior - EXPORT TEST PASS ✅
- Console shows:
  ```
  [v0] Preparing JPG export: product_1.jpg (quality: 80)
  [v0] JPG export prepared successfully
  [v0] Preparing PNG export: product_1.png
  [v0] PNG export prepared successfully
  [v0] Batch export complete: 3 prepared, 0 errors
  ```
- In Analytics tab after completion:
  - Shows export formats used
  - No export errors logged

### JPG Quality Testing
1. In Execute Tab, set JPG Quality slider
2. Adjust from 50 to 95
3. Run again
4. Console should show updated quality:
   ```
   [v0] JPG export prepared successfully (quality: 75)
   ```

### If Test Fails ❌
**Error**: "Unsupported format"
- Make sure format is: jpg, png, or psd
- Check spelling

**Error**: "Export folder not accessible"
- Phase 3.2: This will be implemented with file dialogs
- For now, folder validation is mocked

---

## Test 4: End-to-End Batch Processing

### Full Workflow Test

1. **Setup Tab**
   - Select PSD file
   - Select Excel file
   - Select images folder
   - ✅ All show "loaded" status

2. **Mapping Tab**
   - Create 3 text mappings
   - Create 1 image mapping
   - Save both
   - ✅ "Mappings saved" message

3. **Execute Tab**
   - Select all 3 formats
   - Set JPG quality to 85
   - Click "RUN"

4. **Expected Outcomes**
   - ✅ Progress bar fills from 0→100
   - ✅ 3 rows process (or however many in Excel)
   - ✅ Console shows all text, image, export operations
   - ✅ 3 credits deducted per batch
   - ✅ Switch to Analytics tab
   - ✅ Should show 3 successful rows processed
   - ✅ No critical errors (warnings OK)

### Console Log Checklist
```
✅ [v0] Starting batch text updates for X layers
✅ [v0] Successfully updated "Layer Name" with: value
✅ [v0] Processing image insertions for row X
✅ [v0] Resolved image path: correct/path.jpg
✅ [v0] Preparing JPG export...
✅ [v0] Document saved successfully
```

---

## Test 5: Error Handling & Edge Cases

### Test 5A: Missing Layer
1. Remove or rename a layer in the PSD
2. Run batch
3. Expected: Error in console, row skipped, batch continues
   ```
   [v0] Layer not found. It may have been deleted...
   ```

### Test 5B: Missing Column in Excel
1. Excel missing "ProductName" column but mapped to it
2. Run batch
3. Expected: Error logged, but image insertion continues if configured
   ```
   [v0] Unresolved placeholder in pattern...
   ```

### Test 5C: Invalid Image Path
1. Excel column points to non-existent image
2. Run batch
3. Expected: Image error logged, text update still succeeds
   ```
   [v0] No valid image path provided
   ```

### Test 5D: Insufficient Credits
1. Account has 1 credit, batch needs 3
2. Click "RUN"
3. Expected: Alert appears before processing
   ```
   ❌ Insufficient credits. Need 3, have 1
   ```

---

## Test 6: UI/UX Verification

### Progress Bar
- [ ] Fills smoothly from 0 to 100%
- [ ] Shows current row count (Row 1/3, Row 2/3, etc.)
- [ ] Doesn't jump to 100 instantly

### Credits Display
- [ ] Shows before processing
- [ ] Deducts correctly during batch
- [ ] Updates in real-time in AccountManager

### Error Display
- [ ] Shows in Analytics tab after run
- [ ] Error count matches actual errors
- [ ] Error messages are readable

### Export Format Selection
- [ ] Checkboxes toggle on/off
- [ ] JPG quality slider responsive (50-100)
- [ ] Selected formats shown in status

---

## Phase 3.2 - What's Not Yet Implemented

These features are prepared but need batchPlay/file API in Phase 3.2:

| Feature | Status | When |
|---------|--------|------|
| Actual JPG export to disk | Prepared | Phase 3.2 |
| Actual PNG export to disk | Prepared | Phase 3.2 |
| Actual PSD save-as | Prepared | Phase 3.2 |
| Smart object image insertion | Prepared | Phase 3.2 |
| Image file validation | Mocked | Phase 3.2 |
| Export folder validation | Mocked | Phase 3.2 |

**For now**: All operations show as "prepared" in console and complete successfully, but files are not actually written to disk (Phase 3.2).

---

## Console Debugging Commands

### Check Active Document
```javascript
console.log('[v0] Active doc:', photoshop.app.activeDocument.name)
```

### List All Layers
```javascript
const doc = photoshop.app.activeDocument;
const walk = (set) => {
  for (const layer of set.layers) {
    console.log('[v0]', layer.name, '(' + layer.kind + ')');
    if (layer.layers) walk(layer);
  }
};
walk(doc);
```

### Check Layer by Name
```javascript
const layer = projectState.getAllLayers().find(l => l.name === 'ProductName');
console.log('[v0] Found layer:', layer ? layer : 'NOT FOUND');
```

---

## Success Criteria - Phase 3.1 Complete ✅

All tests pass when:
- [ ] Text layers update with Excel data (console shows updates)
- [ ] Image mappings recognized and logged (console shows paths)
- [ ] Export formats selected and logged (console shows export prep)
- [ ] Batch processing completes without fatal errors
- [ ] Credits deducted correctly
- [ ] Analytics show correct row counts
- [ ] No unhandled exceptions in console
- [ ] Error messages are descriptive and actionable

---

## Next Steps: Phase 3.2

Once Phase 3.1 testing is complete:

1. Implement actual batchPlay API for JPG/PNG export
2. Implement saveAs for PSD export
3. Implement smart object image replacement
4. Implement raster layer image replacement
5. Full file I/O testing

At that point, actual files will be written to disk.

