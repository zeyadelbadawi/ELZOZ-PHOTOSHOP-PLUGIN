# PSD Template Requirements for Elzoz

## Overview
Your PSD template must contain **TEXT LAYERS** to work with Elzoz's batch processing. Only text layers can be automatically updated with Excel data.

---

## What Layer Types Can Be Used?

### ✅ TEXT LAYERS (Supported)
- Regular text layers in Photoshop
- Can be mapped to Excel columns
- Text content is automatically replaced during batch processing
- **These are required for the plugin to work**

```
Example:
- "Product Name" (text layer) → Maps to Excel column "Product Name"
- "Price" (text layer) → Maps to Excel column "Price"
```

### ❌ SMART OBJECTS (Not Supported for Text)
- Smart Objects cannot be updated with text via UXP API
- *Future feature: Image insertion support coming in Phase 3*

### ❌ GROUPS (Not Supported)
- Groups are containers, not editable layers
- Cannot have their content updated

### ❌ PIXEL/RASTER LAYERS (Not Supported)
- Raster images cannot be updated with text
- Would require image replacement (coming soon)

---

## How to Fix Your Template

### Step 1: Identify Where You Need Text
Look at your PSD and decide:
- Where should product names appear?
- Where should prices appear?
- Where should descriptions appear?

### Step 2: Add Text Layers
1. Create a new **TEXT LAYER** for each field you want to populate
2. Use **placeholder text** so you can see where it will appear
3. **Name each layer clearly** (e.g., "Product Name", "Price", "Description")

### Step 3: Position and Style
- Position text layers where you want data to appear
- Apply fonts, sizes, colors as needed
- The plugin will preserve all formatting

### Step 4: Test with Elzoz
1. Go to Setup tab → Select your updated PSD
2. Go to Mapping tab → You should now see your text layers
3. Map Excel columns to text layers
4. Run batch processing

---

## Template Structure Example

### Business Card Template
```
Business Card (Group)
├── "Company Name" (TEXT LAYER) ✅
├── "Contact Person" (TEXT LAYER) ✅
├── "Email" (TEXT LAYER) ✅
├── "Phone" (TEXT LAYER) ✅
├── "Logo" (Smart Object - for future image support)
└── "Background" (Pixel Layer)
```

### Product Label Template
```
Label (Group)
├── "Product Name" (TEXT LAYER) ✅
├── "Price" (TEXT LAYER) ✅
├── "Description" (TEXT LAYER) ✅
├── "Product Image" (Smart Object - for future image support)
└── "Border" (Shape Layer)
```

---

## Limitations & Future Roadmap

### Current (Phase 3)
- ✅ TEXT layer content updates
- ✅ Multiple text fields per template
- ✅ Batch processing
- ✅ Price formatting (coming soon)

### Coming Soon (Phase 3+)
- 🔜 Smart Object image replacement
- 🔜 Image auto-fit to bounds
- 🔜 File export (JPG, PNG, PSD)
- 🔜 Advanced text effects

---

## Troubleshooting

### "No Text Layers Found"
**Problem:** Your PSD doesn't contain any TEXT layers
**Solution:** 
1. Open PSD in Photoshop
2. Create new text layers for your data fields
3. Re-import in Elzoz

### Error: "Layer is not a text layer (group/smartObject)"
**Problem:** You mapped an Excel column to a non-text layer
**Solution:**
1. Go to Mapping tab
2. Only select layers marked as "Text Layer ✓"
3. Remove mappings to non-text layers

### Text not updating
**Problem:** Layer exists but content doesn't change
**Solution:**
1. Check that layer is a TEXT layer (not shape, pixel, or group)
2. Verify Excel data isn't empty
3. Ensure mapping is correct
4. Check Photoshop console for error messages

---

## Need Smart Object Support?

If your template uses smart objects for images (instead of text fields), we're building image replacement support in Phase 3. Stay tuned for:
- Automatic product image insertion
- Smart object replacement
- Image scaling and fitting
- Batch image processing

Contact us for early access or custom solutions.
