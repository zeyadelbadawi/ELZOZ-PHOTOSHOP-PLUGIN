# Complete Test Example with Expected Output

This document shows a complete end-to-end test scenario with sample data and expected debug log output.

---

## Test Scenario

### Sample PSD Structure
```
PSD File: shoes_design.psd
├── Background
├── Product Image (SMART OBJECT) ← Image Layer 1
├── Brand Logo (RASTER) ← Image Layer 2
├── Product Name (TEXT)
└── Description (TEXT)
```

### Sample Excel File
```
File: products.xlsx

| Product Name  | Description      | Image File    | Logo File    |
|---------------|------------------|---------------|--------------|
| Red Shoe      | Premium leather  | shoe_red.jpg  | logo_v1.png  |
| Blue Shoe     | Comfortable fit  | shoe_blue.jpg | logo_v1.png  |
| Green Shoe    | Eco-friendly     | shoe_green.jpg| logo_v2.png  |
```

### Sample Image Folders
```
/path/to/product_images/
├── shoe_red.jpg
├── shoe_blue.jpg
└── shoe_green.jpg

/path/to/brand_logos/
├── logo_v1.png
└── logo_v2.png
```

---

## Step 1: Upload PSD - Expected Console Output

```
[v0] ========== PSD UPLOAD: START ==========
[v0] Picking PSD file
[v0] PSD file selected: /Users/john/documents/shoes_design.psd
[v0] PSD file name: shoes_design.psd
[v0] Opening PSD in Photoshop...
[v0] PSD opened successfully
[v0] Extracting all layers...
[v0] Total layers extracted: 5
[v0] All layers: [
  {"id":1,"name":"Background","kind":"pixel","visible":true},
  {"id":2,"name":"Product Image","kind":"smartObject","visible":true},
  {"id":3,"name":"Brand Logo","kind":"raster","visible":true},
  {"id":4,"name":"Product Name","kind":"type","visible":true},
  {"id":5,"name":"Description","kind":"type","visible":true}
]
[v0] ===== AUTO-DETECTING IMAGE LAYERS =====
[v0] IMAGE DETECTOR: START
[v0] Detecting image layers...
[v0] Active document found: shoes_design.psd
[v0] Inside executeAsModal, starting layer walk...
[v0] Walking layer set at depth 0, prefix: "", layer count: 5
[v0] Processing layer: "Background", kind: pixel, id: 1
[v0] Processing layer: "Product Image", kind: smartObject, id: 2
[v0] IMAGE LAYER DETECTED: {"id":2,"name":"Product Image","kind":"smartObject","depth":0,"visible":true,"opacity":100,"locked":false}
[v0] Processing layer: "Brand Logo", kind: raster, id: 3
[v0] IMAGE LAYER DETECTED: {"id":3,"name":"Brand Logo","kind":"raster","depth":0,"visible":true,"opacity":100,"locked":false}
[v0] Processing layer: "Product Name", kind: type, id: 4
[v0] Processing layer: "Description", kind: type, id: 5
[v0] Layer walk completed
[v0] TOTAL IMAGE LAYERS DETECTED: 2
[v0] All detected layers: [
  {"id":2,"name":"Product Image","kind":"smartObject","depth":0,"visible":true,"opacity":100,"locked":false},
  {"id":3,"name":"Brand Logo","kind":"raster","depth":0,"visible":true,"opacity":100,"locked":false}
]
[v0] IMAGE DETECTION COMPLETE
[v0] Project state updated with layers and image layers
[v0] ========== PSD UPLOAD: END ==========
```

**✅ What to Check:** TOTAL IMAGE LAYERS DETECTED should be 2

---

## Step 2: Select Folders for Images - Expected Output

### Select Folder for "Product Image"
```
[v0] ===== IMAGE FOLDER SELECTION: START =====
[v0] Picking folder for image layer
[v0] Image Layer ID: 2
[v0] Layer Name: Product Image
[v0] Image layer folder selected
[v0] Folder path: /Users/john/images/product_images
[v0] Folder name: product_images
[v0] Updating imageFolderSelections for ID: 2
[v0] New selection: {"path":"/Users/john/images/product_images","folderObject":{...}}
[v0] Updated imageFolderSelections: {
  "2": {"path":"/Users/john/images/product_images","folderObject":{...}}
}
[v0] ===== IMAGE FOLDER SELECTION: END =====
```

### Select Folder for "Brand Logo"
```
[v0] ===== IMAGE FOLDER SELECTION: START =====
[v0] Picking folder for image layer
[v0] Image Layer ID: 3
[v0] Layer Name: Brand Logo
[v0] Image layer folder selected
[v0] Folder path: /Users/john/images/brand_logos
[v0] Folder name: brand_logos
[v0] Updating imageFolderSelections for ID: 3
[v0] New selection: {"path":"/Users/john/images/brand_logos","folderObject":{...}}
[v0] Updated imageFolderSelections: {
  "2": {"path":"/Users/john/images/product_images","folderObject":{...}},
  "3": {"path":"/Users/john/images/brand_logos","folderObject":{...}}
}
[v0] ===== IMAGE FOLDER SELECTION: END =====
```

**✅ What to Check:** Both layers should show folder selections

---

## Step 3: Upload Excel - Expected Output

```
[v0] ========== EXCEL UPLOAD: START ==========
[v0] Picking Excel file
[v0] Excel file selected: /Users/john/documents/products.xlsx
[v0] File name: products.xlsx
[v0] Reading file as binary...
[v0] File read successfully, size: 5432 bytes
[v0] Parsing Excel workbook...
[v0] Workbook sheets: ["Sheet1"]
[v0] Using sheet: Sheet1
[v0] ===== EXCEL COMPLETE DATA =====
[v0] Total rows: 3
[v0] Columns: ["Product Name","Description","Image File","Logo File"]
[v0] FULL EXCEL DATA: [
  {
    "Product Name": "Red Shoe",
    "Description": "Premium leather",
    "Image File": "shoe_red.jpg",
    "Logo File": "logo_v1.png"
  },
  {
    "Product Name": "Blue Shoe",
    "Description": "Comfortable fit",
    "Image File": "shoe_blue.jpg",
    "Logo File": "logo_v1.png"
  },
  {
    "Product Name": "Green Shoe",
    "Description": "Eco-friendly",
    "Image File": "shoe_green.jpg",
    "Logo File": "logo_v2.png"
  }
]
[v0] ===== END EXCEL DATA =====
[v0] ========== EXCEL UPLOAD: END ==========
```

**✅ What to Check:** 
- Total rows: 3
- All column names present
- All data values visible and correct

---

## Step 4: Create Image Mappings - Expected Output

### Mapping 1: Product Images
```
[v0] ===== ADD IMAGE MAPPING: START =====
[v0] Selected Layer: {"id":2,"name":"Product Image","kind":"smartObject","depth":0,"visible":true,"opacity":100,"locked":false}
[v0] Selected Folder: "product_images"
[v0] Selected Column: "Image File"
[v0] Mapping object created: {"layerId":2,"layerName":"Product Image","folderName":"product_images","columnName":"Image File"}
[v0] Local layer mappings updated: {
  "2": {"layerId":2,"layerName":"Product Image","folderName":"product_images","columnName":"Image File"}
}
[v0] Saving to project state...
[v0] Project state updated
[v0] Current imageMappingRules: {
  "2": {"folderName":"product_images","columnName":"Image File"}
}
[v0] Form reset
[v0] ===== ADD IMAGE MAPPING: END =====
```

### Mapping 2: Logo Images
```
[v0] ===== ADD IMAGE MAPPING: START =====
[v0] Selected Layer: {"id":3,"name":"Brand Logo","kind":"raster","depth":0,"visible":true,"opacity":100,"locked":false}
[v0] Selected Folder: "brand_logos"
[v0] Selected Column: "Logo File"
[v0] Mapping object created: {"layerId":3,"layerName":"Brand Logo","folderName":"brand_logos","columnName":"Logo File"}
[v0] Local layer mappings updated: {
  "2": {"layerId":2,"layerName":"Product Image","folderName":"product_images","columnName":"Image File"},
  "3": {"layerId":3,"layerName":"Brand Logo","folderName":"brand_logos","columnName":"Logo File"}
}
[v0] Saving to project state...
[v0] Project state updated
[v0] Current imageMappingRules: {
  "2": {"folderName":"product_images","columnName":"Image File"},
  "3": {"folderName":"brand_logos","columnName":"Logo File"}
}
[v0] Form reset
[v0] ===== ADD IMAGE MAPPING: END =====
```

**✅ What to Check:**
- 2 mappings created
- Each has correct folder and column names
- IDs (2 and 3) match detected image layers

---

## Step 5: Create Text Mappings (Using Existing Mapping Tab)

```
[v0] Adding text mapping: "Product Name" → Layer 4
[v0] Adding text mapping: "Description" → Layer 5
```

**✅ What to Check:** Text mappings should be created for Product Name and Description columns

---

## Step 6: Execute Generation - Expected Output

### Row 1 Processing
```
[v0] ========== PROCESSING ROW ==========
[v0] Row 1/3
[v0] Row data: {"Product Name":"Red Shoe","Description":"Premium leather","Image File":"shoe_red.jpg","Logo File":"logo_v1.png"}
[v0] Starting text layer updates...
[v0] Excel column 'Product Name': Red Shoe
[v0] Text update prepared: {"layerId":4,"layerName":"Product Name","text":"Red Shoe"}
[v0] Excel column 'Description': Premium leather
[v0] Text update prepared: {"layerId":5,"layerName":"Description","text":"Premium leather"}
[v0] Applying 2 text updates for row 1
[v0] All updates: [
  {"layerId":4,"layerName":"Product Name","text":"Red Shoe"},
  {"layerId":5,"layerName":"Description","text":"Premium leather"}
]
[v0] Text update result: {"success":true,"updated":2,"errors":[]}
[v0] Checking for image mappings...
[v0] Image mapping rules: {
  "2": {"folderName":"product_images","columnName":"Image File"},
  "3": {"folderName":"brand_logos","columnName":"Logo File"}
}
[v0] ===== IMAGE INSERTION: Row 1 =====
[v0] Processing image for layer 2
[v0] Rule - Folder: product_images, Column: Image File
[v0] Filename from column 'Image File': shoe_red.jpg
[v0] Image path constructed: product_images/shoe_red.jpg
[v0] Looking for layer with ID: 2 | Found: YES
[v0] Image update prepared: {"layerId":"2","layerName":"Product Image","imagePath":"product_images/shoe_red.jpg","folderName":"product_images","filename":"shoe_red.jpg"}
[v0] Processing image for layer 3
[v0] Rule - Folder: brand_logos, Column: Logo File
[v0] Filename from column 'Logo File': logo_v1.png
[v0] Image path constructed: brand_logos/logo_v1.png
[v0] Looking for layer with ID: 3 | Found: YES
[v0] Image update prepared: {"layerId":"3","layerName":"Brand Logo","imagePath":"brand_logos/logo_v1.png","folderName":"brand_logos","filename":"logo_v1.png"}
[v0] Total image updates for row 1: 2
[v0] All image updates: [
  {"layerId":"2","layerName":"Product Image","imagePath":"product_images/shoe_red.jpg","folderName":"product_images","filename":"shoe_red.jpg"},
  {"layerId":"3","layerName":"Brand Logo","imagePath":"brand_logos/logo_v1.png","folderName":"brand_logos","filename":"logo_v1.png"}
]
[v0] Calling ImageInserter.insertImages()...
[v0] Image insertion completed for row 1
[v0] Image result: {"success":true,"inserted":2,"errors":[]}
[v0] ===== IMAGE INSERTION: END =====
[v0] Saving document after row 1
[v0] Document saved successfully
[v0] ===== EXPORT: Row 1 =====
[v0] Selected export formats: ["JPG","PNG"]
[v0] Export formats config: {"JPG":true,"PNG":true,"PSD":false}
[v0] Exporting to formats: JPG,PNG
[v0] Exports folder path: /Users/john/outputs
[v0] Export base name: design_Red_Shoe_1
[v0] Exporting JPG...
[v0] JPG export success
[v0] Exporting PNG...
[v0] PNG export success
[v0] ===== EXPORT: END =====
```

**✅ What to Check:**
- Text updates: 2 updates for Product Name and Description ✓
- Image updates: 2 updates for product image and logo ✓
- Filenames correctly extracted: shoe_red.jpg, logo_v1.png ✓
- Both images inserted successfully ✓
- Exports created in selected formats ✓

### Row 2 Processing
```
[v0] ========== PROCESSING ROW ==========
[v0] Row 2/3
[v0] Row data: {"Product Name":"Blue Shoe","Description":"Comfortable fit","Image File":"shoe_blue.jpg","Logo File":"logo_v1.png"}
[v0] Starting text layer updates...
[v0] Excel column 'Product Name': Blue Shoe
[v0] Text update prepared: {"layerId":4,"layerName":"Product Name","text":"Blue Shoe"}
[v0] Excel column 'Description': Comfortable fit
[v0] Text update prepared: {"layerId":5,"layerName":"Description","text":"Comfortable fit"}
[v0] Applying 2 text updates for row 2
[v0] All updates: [
  {"layerId":4,"layerName":"Product Name","text":"Blue Shoe"},
  {"layerId":5,"layerName":"Description","text":"Comfortable fit"}
]
[v0] Text update result: {"success":true,"updated":2,"errors":[]}
[v0] ===== IMAGE INSERTION: Row 2 =====
[v0] Total image updates for row 2: 2
[v0] All image updates: [
  {"layerId":"2","layerName":"Product Image","imagePath":"product_images/shoe_blue.jpg",...},
  {"layerId":"3","layerName":"Brand Logo","imagePath":"brand_logos/logo_v1.png",...}
]
[v0] Image insertion completed for row 2
[v0] Image result: {"success":true,"inserted":2,"errors":[]}
[v0] ===== IMAGE INSERTION: END =====
[v0] ===== EXPORT: Row 2 =====
[v0] Exporting to formats: JPG,PNG
[v0] JPG export success
[v0] PNG export success
[v0] ===== EXPORT: END =====
```

### Row 3 Processing
```
[v0] ========== PROCESSING ROW ==========
[v0] Row 3/3
[v0] Row data: {"Product Name":"Green Shoe","Description":"Eco-friendly","Image File":"shoe_green.jpg","Logo File":"logo_v2.png"}
[v0] Starting text layer updates...
[v0] Excel column 'Product Name': Green Shoe
[v0] Text update prepared: {"layerId":4,"layerName":"Product Name","text":"Green Shoe"}
[v0] Excel column 'Description': Eco-friendly
[v0] Text update prepared: {"layerId":5,"layerName":"Description","text":"Eco-friendly"}
[v0] Applying 2 text updates for row 3
[v0] All updates: [
  {"layerId":4,"layerName":"Product Name","text":"Green Shoe"},
  {"layerId":5,"layerName":"Description","text":"Eco-friendly"}
]
[v0] Text update result: {"success":true,"updated":2,"errors":[]}
[v0] ===== IMAGE INSERTION: Row 3 =====
[v0] Total image updates for row 3: 2
[v0] All image updates: [
  {"layerId":"2","layerName":"Product Image","imagePath":"product_images/shoe_green.jpg",...},
  {"layerId":"3","layerName":"Brand Logo","imagePath":"brand_logos/logo_v2.png",...}
]
[v0] Image insertion completed for row 3
[v0] Image result: {"success":true,"inserted":2,"errors":[]}
[v0] ===== IMAGE INSERTION: END =====
[v0] ===== EXPORT: Row 3 =====
[v0] Exporting to formats: JPG,PNG
[v0] JPG export success
[v0] PNG export success
[v0] ===== EXPORT: END =====

[v0] ========== BATCH GENERATION COMPLETE ==========
[v0] Total designs generated: 3
[v0] Successful: 3
[v0] Failed: 0
```

---

## Final Result

### Generated Files
```
/Users/john/outputs/
├── design_Red_Shoe_1.jpg
├── design_Red_Shoe_1.png
├── design_Blue_Shoe_2.jpg
├── design_Blue_Shoe_2.png
├── design_Green_Shoe_3.jpg
└── design_Green_Shoe_3.png
```

### Design Contents
```
design_Red_Shoe_1.jpg contains:
- Product Name: "Red Shoe"
- Description: "Premium leather"
- Product Image: shoe_red.jpg
- Brand Logo: logo_v1.png

design_Blue_Shoe_2.jpg contains:
- Product Name: "Blue Shoe"
- Description: "Comfortable fit"
- Product Image: shoe_blue.jpg
- Brand Logo: logo_v1.png

design_Green_Shoe_3.jpg contains:
- Product Name: "Green Shoe"
- Description: "Eco-friendly"
- Product Image: shoe_green.jpg
- Brand Logo: logo_v2.png
```

---

## Quick Success Checklist

If your output matches this example, everything is working correctly:

✅ PSD Upload detects 2 image layers
✅ Excel upload shows 3 rows with all columns
✅ Image folders selected for both layers
✅ Image mappings created for both layers
✅ Row 1-3 each show:
  - 2 text updates applied
  - 2 image updates applied
  - 2 files exported (JPG + PNG)
✅ 6 final files created (3 rows × 2 formats)

**If any step shows errors or missing values, refer to DEBUG_LOG_GUIDE.md for troubleshooting.**
