# CRITICAL FIX: Layer Not Found Error Resolution

## Problem Diagnosed
**Error**: `Layer not found; Layer not found` during batch processing

### Root Cause
When a Photoshop document is closed and reopened, the layer IDs change. The plugin was storing and searching by layer ID only, which became invalid after document reload.

### Impact
- 100% batch processing failure rate
- All rows failed with "Layer not found" errors
- Text layer updates couldn't proceed

---

## Solution Implemented

### 1. **TextLayerUpdater.js - Layer Search Strategy**
Updated to use **two-tier lookup strategy**:
1. **PRIMARY**: Search by layer **name** (reliable, persists across sessions)
2. **FALLBACK**: Search by layer **ID** (for compatibility with old mappings)

```javascript
// Now supports both lookup methods
const { layerId, layerName, text } = update;

// Try by NAME first (most reliable after document reopen)
if (layerName) {
    searchByName(doc, layerName);
}

// Try by ID if name not found (fallback)
if (!layer && layerId) {
    searchById(doc);
}
```

### 2. **MappingPanel.jsx - Data Storage Format**
Changed mapping storage from:
```javascript
// OLD: Just layer name string
mapping[column] = "Product Name"
```

To:
```javascript
// NEW: Object with both ID and name
mapping[column] = {
    id: 12345,
    name: "Product Name"
}
```

This provides redundancy and reliability across document sessions.

### 3. **ExecutePanel.jsx - Update Format**
Updated to pass complete layer information to TextLayerUpdater:
```javascript
// Support both old format (string) and new format (object with name and id)
const layerId = typeof mappedLayer === 'string' ? mappedLayer : mappedLayer.id;
const layerName = typeof mappedLayer === 'object' ? mappedLayer.name : mappedLayer;

updates.push({ layerId, layerName, text: String(cellValue) });
```

---

## Backward Compatibility
All changes are backward compatible:
- Old mappings stored as strings will still work (falls back to ID lookup)
- New mappings use object format (prefers name lookup)
- Mixed old and new mappings work together

---

## Testing Checklist

After implementing these changes, verify:

✅ Text layers update successfully during batch processing  
✅ Works after closing and reopening PSD document  
✅ Works with documents that have layers in nested groups  
✅ Old mappings still work if not re-created  
✅ New mappings created after fix use optimized format  

---

## Files Modified
1. `/src/services/TextLayerUpdater.js` - Layer lookup logic
2. `/src/panels/MappingPanel.jsx` - Mapping storage and display
3. `/src/panels/ExecutePanel.jsx` - Update format construction

---

## Future Improvements
1. Add layer path tracking (for nested layers like "Group / Subgroup / TextLayer")
2. Implement automatic layer remapping on session restore
3. Add layer validation before batch processing starts
4. Create layer cache for faster lookups

