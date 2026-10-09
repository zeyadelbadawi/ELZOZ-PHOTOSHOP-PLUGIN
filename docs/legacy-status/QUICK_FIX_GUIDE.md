# Quick Fix Guide - Get Elzoz Working Now

## Your Issue
Your business card template has **smart objects** (images/containers), but Elzoz needs **text layers** (editable text fields).

## Quick 3-Step Fix

### Step 1: Open Your PSD in Photoshop (5 minutes)
- Open: `Business_Card_Mockup_1.psd`
- Keep it open

### Step 2: Add Text Layers (10 minutes)
For each Excel column you want to populate, create a text layer:

1. **Select Text Tool** (keyboard: T)
2. **Click where you want text** (e.g., top-left for company name)
3. **Type a placeholder** (e.g., "COMPANY NAME")
4. **Right-click layer → Rename to match Excel column**
   - Excel column: "الشركة" → Layer name: "الشركة"
   - Excel column: "الهاتف" → Layer name: "الهاتف"
   - etc.

5. **Repeat for each Excel column** (probably 3 total in your case)

### Step 3: Save and Test (2 minutes)
1. **Save** the PSD (File → Save)
2. **In Elzoz**, go to Setup tab
3. **Re-select the same PSD file** (it will refresh and find new text layers)
4. **Go to Mapping tab** - You should now see your text layers!
5. **Run batch processing** - Should work perfectly now!

---

## What You're Adding

### Before
```
Business Card Mockup (Smart Object) ← Can't update this
├── Image layers
└── Layout elements
```

### After
```
Text Layers (NEW) ← Elzoz can update these!
├── "الشركة" (Text Layer)
├── "الهاتف" (Text Layer)
├── "البريد" (Text Layer)
└── Business Card Mockup (Smart Object) ← For background/images
```

---

## Example: Your Data

From your Excel file:
- Column 1: الشركة (Company)
- Column 2: الهاتف (Phone)
- Column 3: البريد الإلكتروني (Email)

Create 3 matching text layers with these names, and you're done!

---

## Common Questions

**Q: Will my formatting break?**
A: No. Text layers keep their fonts, colors, sizes - Elzoz only changes the text content.

**Q: Can I use the existing smart objects?**
A: Not yet (coming in Phase 4). For now, use text layers for data that changes.

**Q: Do I need special text?**
A: No, any text layer works. Just name them to match your Excel columns.

**Q: How many text layers can I have?**
A: As many as you need! One for each Excel column you want to populate.

---

## If You Get Stuck

1. Check that layer **IS a text layer** (not shape, group, smart object)
2. Check layer **name matches Excel column** exactly
3. Make sure you **saved the PSD** before re-importing
4. Refresh Elzoz by re-selecting the PSD in Setup tab

---

## Once It Works

You'll be able to:
- ✅ Map Excel data to text layers
- ✅ Generate 16 designs automatically (one per Excel row)
- ✅ Save results as PSD/JPG/PNG (coming soon)
- ✅ Run batches in seconds instead of hours

---

**Estimated time: 20 minutes to get fully working.**

Go create those text layers! 🚀
