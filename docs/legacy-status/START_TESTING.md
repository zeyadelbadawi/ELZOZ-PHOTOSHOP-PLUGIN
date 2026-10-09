# Start Testing Phase 3 Now

## 5-Minute Setup

### 1. Have These Ready
- Photoshop 26.11.2 or later
- UXP Developer Tool (free download from Adobe)
- A sample Excel file (or create one with: Name, Price, SKU)
- A sample Photoshop template (.psd) with text layers

### 2. Terminal Commands
```bash
# Navigate to project folder
cd /path/to/elzoz-plugin

# Install dependencies (first time only)
npm install

# Start development server
npm run dev

# LEAVE THIS RUNNING - shows: "webpack compiled successfully"
```

### 3. Open Plugin in Photoshop
1. Launch **UXP Developer Tool**
2. Click **File → Open Plugin Project**
3. Select your elzoz-plugin folder
4. Click **Watch** (red button, will turn blue)
5. Your plugin loads into Photoshop automatically

### 4. See the Plugin
1. Open Photoshop
2. Go to **Plugins → Elzoz** (in menu bar)
3. Or find the panel on the right side: "🚀 Elzoz"

---

## Test the Three Main Tabs

### ✅ Tab 1: Setup
**What to do:**
1. Click "📁 Select Excel"
   - Pick any .xlsx or .csv file
   - Should show: "✓ filename.xlsx"
   - Should show data preview below

2. Click "📁 Select Folder"
   - Pick any folder with images
   - Should show: "✓ folder-name"

3. Click "🎨 Select PSD"
   - Pick any .psd template
   - Should show: "✓ template.psd (N layers)"
   - If error: Make sure PSD is open in Photoshop

**Success Indicators:**
- No red error messages
- All three files selected
- Preview table shows Excel data
- Console shows `  Excel file picked: ...`

---

### ✅ Tab 2: Mapping
**What to do:**
1. Create mappings:
   - Select column from left (e.g., "ProductName")
   - Select layer from right (e.g., "Title Layer")
   - Click "Add Mapping"
2. Create 2-3 mappings
3. See them appear in "Current Mappings" section

**Success Indicators:**
- Mappings create without errors
- Appear in the list with "Remove" button
- Console shows no errors

---

### ✅ Tab 3: Execute
**What to do:**
1. Review "Processing Summary"
   - Shows number of items
   - Shows credits required
2. Check export formats (JPG, PNG, PSD)
3. Click "🚀 RUN (Start Batch Processing)"
4. Watch progress bar increase
5. Look at Photoshop document - text should update!

**Success Indicators:**
- Progress bar fills to 100%
- No error messages
- Photoshop document updates (if text layers were mapped)
- Console shows: `  Starting batch processing...`
- Console shows: `  Batch processing complete`

---

## Console Debugging

### Open Console
**UXP Developer Tool Method:**
1. UXP Developer Tool window
2. Look for "Console" tab at bottom
3. Paste in: `document.body.textContent`
4. You'll see all console.log outputs

**Browser DevTools Method:**
1. In your terminal, webpack shows: `http://localhost:XXXX`
2. Open that URL in your browser
3. Press F12
4. Go to Console tab
5. Filter by: ` `

### Expected Logs
```
  Picking Excel file
  Excel file picked: products.xlsx
  Folder selected: /path/to/images
  PSD file picked: template.psd
  Found 12 layers
  Starting batch processing...
  Processing row 1/5
  Updating layer 3 with value: iPhone 14
  Batch processing complete
```

---

## What's Actually Happening

### File Operations (Real UXP)
✅ Your file picker calls = real UXP storage API
✅ Excel parsing = real XLSX library
✅ Folder listing = real file system access

### Photoshop Operations (Real API)
✅ Layer extraction = reads from active Photoshop document
✅ Text updates = actually changes text in Photoshop
✅ Document save = actually saves the PSD

---

## If Something Goes Wrong

### Error: "No active document"
**Fix**: Open the PSD file in Photoshop first, then try Setup

### Error: "Layer not found"
**Fix**: Pick the correct PSD in Setup tab, make sure it matches the document open in Photoshop

### Error: "Cannot read file"
**Fix**: Try a different Excel file or ensure it has column headers

### Error: "Plugin won't load"
**Fix**: 
- Restart UXP Developer Tool
- Click "Watch" again
- Check webpack is running (see "webpack compiled successfully")

### No console output
**Fix**:
- Make sure webpack dev server is running
- Check browser console (F12) not just UXP console
- Filter for ` ` messages

---

## Checklist for Phase 3 Completion

- [ ] npm install runs without errors
- [ ] npm run dev shows "webpack compiled successfully"
- [ ] Plugin loads in Photoshop (Plugins menu)
- [ ] Can select Excel file
- [ ] Can select folder
- [ ] Can select PSD and see layers
- [ ] Can create mappings
- [ ] Can click RUN and see progress
- [ ] Photoshop document updates with values
- [ ] Console shows   debug logs
- [ ] No red error messages anywhere

---

## Next Steps After Testing

1. **Check results**: Look at your Photoshop document - the text should have been updated with values from Excel
2. **Try with real data**: Use your actual product data Excel file
3. **Read PHASE3_SUMMARY.md**: Understand what's implemented
4. **Read UXP_TESTING_GUIDE.md**: Detailed testing reference

---

## Files You Need to Know

| File | Purpose |
|------|---------|
| `src/services/UXPBridge.js` | Core Photoshop integration |
| `src/panels/SetupPanel.jsx` | File selection UI |
| `src/panels/MappingPanel.jsx` | Layer mapping UI |
| `src/panels/ExecutePanel.jsx` | Batch processing UI |
| `plugin/manifest.json` | Plugin configuration |
| `UXP_TESTING_GUIDE.md` | Detailed testing reference |
| `PHASE3_SUMMARY.md` | What was built summary |

---

## Quick Troubleshoot Command

If webpack breaks:
```bash
# Kill any running processes
npm run dev:stop

# Clear cache and reinstall
rm -rf node_modules package-lock.json
npm install

# Start fresh
npm run dev
```

---

**You're ready! Start with the 5-Minute Setup and test the three tabs. Good luck! 🚀**

Questions? Check UXP_TESTING_GUIDE.md for detailed debugging info.
