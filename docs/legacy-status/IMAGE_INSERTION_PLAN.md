# Image Insertion Feature - Complete Implementation Plan

## Executive Summary
Build a dedicated **Images Panel** to handle dynamic image insertion into multiple smart objects per design batch. This will be a complete, standalone system that works alongside text mapping.

---

## Architecture Overview

### Current Flow (Text Only)
```
Excel → Mapping Panel → Execute Panel → Text Updates → Export
```

### New Flow (With Images)
```
Excel Data
    ↓
├─ Setup Panel (existing)
├─ Mapping Panel (existing) → Text layer mappings
├─ Images Panel (NEW) → Image layer mappings & config
├─ Execute Panel (enhanced) → Run both text + image updates
└─ Analytics Panel (existing)
```

---

## New Panel: ImagesPanel.jsx

### Location
`src/panels/ImagesPanel.jsx`

### Responsibilities
1. **Detect image layers** - Find all smart objects, pixel layers, and image layers in PSD
2. **Configure image sources** - Map Excel columns to image file locations
3. **Set image behavior** - How to handle multiple images, sizing, positioning
4. **Preview mappings** - Show which images will go where

### User Flow in Images Panel

```
┌─────────────────────────────────────────┐
│ Step 1: Configure Image Folders         │
│ ├─ Primary images folder                │
│ ├─ Optional fallback folder             │
│ └─ Image naming convention              │
├─────────────────────────────────────────┤
│ Step 2: Detect Image Layers             │
│ ├─ Smart Objects                        │
│ ├─ Pixel/Raster Layers                  │
│ └─ Selection options                    │
├─────────────────────────────────────────┤
│ Step 3: Map Excel Columns to Images     │
│ ├─ Column: Product ID → Image layer     │
│ ├─ Naming rule: "products/{id}.jpg"    │
│ └─ Fallback image option                │
├─────────────────────────────────────────┤
│ Step 4: Preview Mappings                │
│ ├─ Show detected image layers           │
│ ├─ Show Excel column mapping            │
│ └─ Display sample images                │
└─────────────────────────────────────────┘
```

---

## Data Structure: Image Mapping

### ImageMappingContext (new in ProjectContext)
```javascript
{
  imageMapping: {
    // Format: imageMappingId -> Excel column
    "product_image": "product_id", // Will look for: products/{product_id}.jpg
    "thumbnail": "sku"             // Will look for: thumbs/{sku}.jpg
  },
  
  imageLayers: [
    {
      id: "layer_123",
      name: "Product Image",
      kind: "smartobject",
      mappedColumn: "product_id"
    },
    {
      id: "layer_456", 
      name: "Thumbnail",
      kind: "pixel",
      mappedColumn: "sku"
    }
  ],
  
  imageConfig: {
    imageFoldersMap: {
      "product_image": "/path/to/products/",
      "thumbnail": "/path/to/thumbnails/"
    },
    fileFormat: "jpg", // or "png"
    fallbackImage: "/path/to/fallback.jpg",
    autoScale: true,
    maintainAspectRatio: true
  }
}
```

---

## Tab Navigation Update

### New Tab Structure
```
Setup (1)
  ↓
Mapping (2) - Text columns
  ↓
Images (2b) - Image layers [NEW]
  ↓
Execute (3)
  ↓
Analytics (4)
```

### TabNavigation.jsx Update
```javascript
const tabs = [
  { id: 'setup', label: 'Setup', icon: '⚙️', step: 1 },
  { id: 'mapping', label: 'Mapping', icon: '🔗', step: 2 },
  { id: 'images', label: 'Images', icon: '🖼️', step: '2b' }, // NEW
  { id: 'execute', label: 'Execute', icon: '▶️', step: 3 },
  { id: 'analytics', label: 'Analytics', icon: '📊', step: 4 }
];
```

---

## ImagesPanel.jsx - Detailed Components

### Section 1: Image Folders Configuration
```
Title: "Configure Image Sources"
- Primary Folder Picker Button
- Fallback Folder Picker Button (optional)
- Display current folders
- File format selector: JPG / PNG / Auto-detect
```

### Section 2: Detect Image Layers
```
Title: "Found Image Layers (3)"
- Checkbox list of all smart objects & raster layers
- Type indicator (Smart Object / Raster / Pixel)
- Enable/disable toggle per layer
- Current mapping display
```

### Section 3: Map Columns to Images
```
Title: "Image Mapping"
For each enabled image layer:
├─ Layer name selector (dropdown)
├─ Excel column selector (dropdown)
├─ Naming convention input (e.g., "products/{id}.jpg")
├─ Add / Remove mapping buttons
└─ Fallback image selector
```

### Section 4: Preview & Summary
```
Title: "Mapping Preview"
Table showing:
- Image Layer Name
- Mapped Column
- Naming Pattern
- Status (✓ Ready)
```

---

## ImageInserter.js - Full Implementation

### Key Methods

#### 1. detectImageLayers()
```javascript
// Returns all smart objects, raster, and pixel layers
{
  smartObjects: [...],
  rasterLayers: [...],
  pixelLayers: [...]
}
```

#### 2. mapImagePathForRow(row, imageMapping, folderMap)
```javascript
// Given a row and mapping, return:
{
  "layer_123": "/path/to/product.jpg",
  "layer_456": "/path/to/thumb.jpg"
}
```

#### 3. insertImageIntoLayer(layerId, imagePath)
```javascript
// Core insertion logic for smart object or raster layer
```

#### 4. replaceSingleSmartObject(smartObjectLayer, imagePath)
```javascript
// Replace smart object contents with new image
// Uses: File I/O + executeAsModal
```

#### 5. updateRasterLayer(rasterLayer, imagePath)
```javascript
// Paste image into raster layer
// Uses: Clipboard API (if available) or direct placement
```

---

## Enhanced ExecutePanel.jsx Logic

### Current Flow
```javascript
for (row of excelData) {
  updateTextLayers(row, textMapping)
  saveDocument()
}
```

### New Flow
```javascript
for (row of excelData) {
  // 1. Update text layers
  updateTextLayers(row, textMapping)
  
  // 2. Update images (NEW)
  imagePaths = mapImagePathForRow(row, imageMapping, folderMap)
  insertImages(imagePaths)
  
  // 3. Save & export
  saveDocument()
  exportDesign()
}
```

---

## File Structure - New Files to Create

```
src/
├── panels/
│   └── ImagesPanel.jsx (NEW - 200-300 lines)
│
├── services/
│   ├── ImageInserter.js (EXPAND - add real implementation)
│   └── ImagePathResolver.js (NEW - helper service)
│
└── context/
    └── ProjectContext.jsx (EXTEND - add imageMapping state)
```

---

## Implementation Phases

### Phase 1: Core Image Layer Detection (1 hour)
- ImagesPanel UI scaffolding
- ImageInserter.detectImageLayers() method
- Update ProjectContext with imageMapping state

### Phase 2: Image Mapping Configuration (1.5 hours)
- Folder picker integration
- Column-to-layer mapping UI
- ImagePathResolver service

### Phase 3: Image Insertion Logic (2 hours)
- ImageInserter.insertImageIntoLayer() implementation
- Smart object replacement logic
- Error handling for missing images

### Phase 4: ExecutePanel Integration (1 hour)
- Integrate image insertion into batch loop
- Progress tracking
- Error recovery

### Phase 5: Testing & Polish (1 hour)
- Handle edge cases
- Performance optimization
- Documentation

**Total Time Estimate: 6-7 hours for complete MVP**

---

## Technical Challenges & Solutions

### Challenge 1: Multiple Image Formats
**Solution**: Support JPG, PNG, auto-detect by file extension

### Challenge 2: Image Not Found
**Solution**: 
- Check multiple locations
- Use fallback image
- Skip layer & log warning
- Continue processing

### Challenge 3: Smart Object vs Raster Differences
**Solution**:
- Smart Objects: Use "Place" command
- Raster: Use paste into selection
- Fallback: Convert to raster if needed

### Challenge 4: Performance with Large Batches
**Solution**:
- Batch size optimization
- Cache image file paths
- Progress reporting every N items

### Challenge 5: Memory Management
**Solution**:
- Close documents between batches (if needed)
- Garbage collection hints
- Stream large file operations

---

## UI/UX Design Approach

### Color Scheme
- Primary: Blue (`#5b7cff`) - Active selections
- Success Green (`#10b981`) - Mapped images
- Warning Orange (`#f59e0b`) - Missing images
- Neutral Gray - Unselected layers

### Layout
- Vertical scroll within panel-content
- Cards for each section
- Alerts for errors/warnings
- Preview table at bottom

### Visual Feedback
- "✓" for mapped layers
- "!" for potential issues
- Colored borders for status
- Loading states during detection

---

## Data Flow Diagram

```
┌──────────────────────────────────────────────────────────┐
│               ImagesPanel.jsx                            │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 1. Detect layers (ImageInserter.detectImageLayers) │ │
│  │    → Update imageMapping state                     │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 2. Configure folders & mapping                     │ │
│  │    → Store in ProjectContext                       │ │
│  └────────────────────────────────────────────────────┘ │
│  ┌────────────────────────────────────────────────────┐ │
│  │ 3. Preview mappings                                │ │
│  │    → Validate before Execute                       │ │
│  └────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────┘
           ↓
┌──────────────────────────────────────────────────────────┐
│               ExecutePanel.jsx                           │
│  For each row in Excel:                                  │
│  ├─ TextLayerUpdater.updateMultipleLayers()              │
│  └─ ImageInserter.insertImagesForRow()                   │
└──────────────────────────────────────────────────────────┘
```

---

## Success Criteria

- [x] UI displays all image layers in PSD
- [x] Users can map Excel columns to image layers
- [x] System finds images by name/path pattern
- [x] Images are inserted into smart objects
- [x] Multiple images per design batch work
- [x] Error handling for missing images
- [x] Progress tracking in Execute panel
- [x] Batch processing completes successfully

---

## Next Steps

1. **Create ImagesPanel.jsx** - Build the UI component
2. **Extend ImageInserter.js** - Implement core insertion logic
3. **Update ProjectContext** - Add imageMapping state
4. **Create ImagePathResolver** - Helper service for file paths
5. **Integrate with ExecutePanel** - Hook into batch loop
6. **Test with real PSDs** - Validate with 2-3 real templates

---

## Notes for Development

- Keep image insertion separate from text updates for clarity
- Support nested layer groups (Smart Objects can be in groups)
- Cache detected layers to avoid re-scanning
- Consider memory usage with large image batches
- Document API for future extensions

