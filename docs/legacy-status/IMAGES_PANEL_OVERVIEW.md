# Images Panel - Visual Architecture

## Current Tab Structure (Before)
```
┌─────────────────────────────────────────┐
│  Setup    Mapping    Execute  Analytics  │
└─────────────────────────────────────────┘
```

## New Tab Structure (After)
```
┌────────────────────────────────────────────────────────┐
│  Setup    Mapping    Images    Execute    Analytics    │
│   (1)       (2)       (2b)       (3)         (4)       │
└────────────────────────────────────────────────────────┘
```

---

## ImagesPanel Layout - 4 Sections

### Section 1: Image Folders
```
┌──────────────────────────────────────────┐
│ 📁 Configure Image Sources               │
├──────────────────────────────────────────┤
│ Primary Folder:                          │
│ [📁 Select Folder]  → /Users/images/    │
│                                          │
│ Fallback Folder:                         │
│ [📁 Select Folder]  → /Users/fallback/  │
│                                          │
│ File Format: [JPG / PNG / Auto-detect]   │
└──────────────────────────────────────────┘
```

### Section 2: Detect Image Layers
```
┌──────────────────────────────────────────┐
│ 🎨 Found Image Layers (3)                │
├──────────────────────────────────────────┤
│ ☑ Product Image          (Smart Object) │
│ ☑ Thumbnail              (Raster)       │
│ ☐ Background             (Pixel)        │
│                                          │
│ [✓ Enable All] [Disable All]             │
└──────────────────────────────────────────┘
```

### Section 3: Map Columns to Images
```
┌──────────────────────────────────────────┐
│ 🔗 Image Mapping                         │
├──────────────────────────────────────────┤
│ Layer: [Product Image      ▼]            │
│ Column: [product_id        ▼]            │
│ Pattern: products/{id}.jpg                │
│ [✓ Mapped]                               │
│ [Remove] [Add Another]                   │
│                                          │
│ Layer: [Thumbnail          ▼]            │
│ Column: [sku               ▼]            │
│ Pattern: thumbs/{id}.png                 │
│ [✓ Mapped]                               │
│ [Remove] [Add Another]                   │
│                                          │
│ Fallback Image: [Select Image]           │
│ Behavior: [Skip / Use Fallback]          │
└──────────────────────────────────────────┘
```

### Section 4: Preview & Status
```
┌──────────────────────────────────────────┐
│ ✓ Summary                                │
├──────────────────────────────────────────┤
│ Layer Name          │ Column  │ Status   │
│─────────────────────┼─────────┼──────────│
│ Product Image       │ ProdID  │ ✓ Ready  │
│ Thumbnail           │ SKU     │ ✓ Ready  │
│                                          │
│ Ready to proceed to Execute tab          │
└──────────────────────────────────────────┘
```

---

## Data Flow: Excel Row → Images

```
Excel Row: {product_id: "123", sku: "ABC-456"}
    ↓
ImagePathResolver.mapImagePaths()
    ↓
{
  "layer_Product": "/Users/images/products/123.jpg",
  "layer_Thumbnail": "/Users/images/thumbs/ABC-456.png"
}
    ↓
ImageInserter.insertImagesForRow()
    ├─ Replace smart object with 123.jpg
    └─ Paste into thumbnail layer with ABC-456.png
    ↓
saveDocument() + exportImage()
```

---

## Technical Architecture

### ProjectContext State Addition
```javascript
imageMapping: {
  imageLayers: [
    {
      id: "layer_123",
      name: "Product Image",
      kind: "smartobject",
      mappedColumn: "product_id",
      folderPath: "/Users/images/products/",
      pattern: "{product_id}.jpg"
    }
  ],
  
  imageFolderMap: {
    "primary": "/Users/images/",
    "fallback": "/Users/fallback/"
  },
  
  imageConfig: {
    autoScale: true,
    maintainAspectRatio: true,
    onMissing: "skip" // or "fallback"
  }
}
```

### ExecutePanel.jsx Enhancement
```javascript
// Current loop
for (row of excelData) {
  updateTextLayers(row, textMapping)
  saveDocument()
}

// Enhanced loop
for (row of excelData) {
  // 1. Text updates
  updateTextLayers(row, textMapping)
  
  // 2. Image insertions (NEW)
  imagePaths = ImagePathResolver.resolve(row, imageMapping)
  ImageInserter.insertImagesForRow(imagePaths)
  
  // 3. Save & export
  saveDocument()
  exportDesign(row)
}
```

---

## Implementation Timeline

| Phase | Task | Time | Files |
|-------|------|------|-------|
| 1 | UI + Detection | 1h | ImagesPanel.jsx |
| 2 | Mapping Config | 1.5h | ImagesPanel.jsx |
| 3 | Core Logic | 2h | ImageInserter.js + ImagePathResolver.js |
| 4 | Execute Integration | 1h | ExecutePanel.jsx |
| 5 | Testing & Polish | 1h | All files |
| **Total** | | **6-7h** | |

---

## Key Benefits of New Panel Approach

✓ **Separation of Concerns** - Images handled independently from text
✓ **Scalability** - Easy to add more image layers
✓ **User Experience** - Clear workflow (Setup → Mapping → Images → Execute)
✓ **Flexibility** - Support multiple image naming conventions
✓ **Error Handling** - Better diagnostics for missing images
✓ **Future-Ready** - Can extend to other layer types later

---

## Example Real-World Scenario

### Your Business Card Template
```
PSD Layers:
├─ Background (Pixel Layer)
├─ Company Logo (Smart Object)
├─ Product Image (Smart Object)  ← Can map to product_id column
├─ Thumbnail (Raster)            ← Can map to sku column
└─ Text Fields (Text Layers)      ← Existing Mapping Tab handles these
```

### Excel Data
```
| product_id | sku        | company | phone      |
|─────────────┼────────────┼─────────┼────────────|
| 001         | ABC-2024   | ACME    | 555-0001   |
| 002         | XYZ-2025   | TechCo  | 555-0002   |
```

### Processing Flow
```
1. Text Mapping:    company → "Company Name" layer
                   phone → "Phone" layer

2. Image Mapping:   product_id → "Product Image" layer (001.jpg)
                   sku → "Thumbnail" layer (ABC-2024.png)

3. Result:
   ├─ Text updated (company name, phone)
   ├─ Product image 001.jpg inserted
   ├─ Thumbnail ABC-2024.png inserted
   └─ Design exported as business_card_001.jpg
```

---

## Questions for You

Before I start implementing, confirm:

1. **Image Folder Structure**: How should images be organized?
   - Option A: All in one folder, find by filename
   - Option B: Subfolders per layer type
   - Option C: User-specified mapping

2. **Multiple Images per Batch**: Should each row process ALL images, or allow selective?

3. **Missing Image Behavior**:
   - Skip the layer?
   - Use fallback image?
   - Show error and stop?
   - Continue to next row?

4. **Image Sizing**: Should we:
   - Auto-scale to fit smart object bounds?
   - Preserve original size?
   - User-configured?

5. **Priority**: Start with Smart Objects first, then add Raster layers?

