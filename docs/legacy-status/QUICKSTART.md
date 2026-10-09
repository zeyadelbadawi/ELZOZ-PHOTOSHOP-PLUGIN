# 🚀 Elzoz Quick Start Guide

## First Time Setup

### 1. Build the Plugin
```bash
npm install          # Install dependencies
npm run build        # Build plugin
```

### 2. Load in Photoshop
```bash
npm run uxp:load     # Load into Photoshop
```

### 3. Open Plugin Panel
In Photoshop:
- Go to **Windows → UXP Plugins**
- Select **Elzoz**
- Panel opens with 4 tabs

---

## Using Elzoz

### 📋 Step 1: Setup Tab
1. Click **"📁 Select Excel"** - Choose your product data file
2. Click **"📁 Select Folder"** - Choose folder with product images
3. Click **"🎨 Select PSD"** - Choose your Photoshop template

You should see:
- ✅ File paths appear
- 📊 Data preview shows first 3 rows
- 📚 Layer count displays

### 🔗 Step 2: Mapping Tab
1. In left column, you see **Excel Columns** (ProductName, Price, Image, etc.)
2. In right column, you see **PSD Layers** (Title, PriceText, ProductImage, etc.)
3. Create mappings:
   - Select "ProductName" from dropdown
   - Select "Title" layer from dropdown
   - Click **"Add Mapping"**
4. Repeat for each column you need
5. View all mappings in the summary below

Example:
```
ProductName → Title
Price → PriceText
ImagePath → ProductImage
Description → DescText
```

### ▶️ Step 3: Execute Tab
1. Review **Items to Process** count
2. Review **Credits Required** (1 credit = 1 design)
3. Check **Export Formats** (JPG, PNG, PSD)
4. Click **"🚀 RUN"** to start batch processing

Watch:
- Progress bar fills 0→100%
- Real-time status updates
- Credits deducted automatically

### 📊 Step 4: Analytics Tab
View results:
- Total designs generated
- Credits used
- Available credits
- Processing history
- Success rate
- Account info

---

## Account Management

### View Current Account
- See account name and credits in **Account Manager** (top of plugin)

### Switch Accounts
1. Click dropdown in Account Manager
2. Select different account
3. Credits automatically update

### Create New Account
1. Click **"+ New Account"** button
2. Enter account name
3. New account starts with 1000 credits

### View Usage
Go to **Analytics tab** → **Processing History** to see:
- Date/time of each batch
- Items processed
- Credits used
- Export formats

---

## Example Workflow

### Scenario: Create 50 Product Flyers

**Excel File** (products.xlsx):
```
| ProductName      | Price | Category | ImageFile       |
|------------------|-------|----------|-----------------|
| MacBook Pro 16"  | 1299  | Laptops  | macbook.jpg     |
| iPhone 15 Pro    | 999   | Phones   | iphone.jpg      |
| AirPods Pro      | 249   | Audio    | airpods.jpg     |
```

**PSD Template** (flyer.psd):
- Layer "product_title" (text)
- Layer "price_display" (text)
- Layer "category_badge" (text)
- Layer "product_image" (smart object)

**Steps**:
1. ⚙️ Setup: Select Excel, Images folder, PSD template
2. 🔗 Mapping:
   - ProductName → product_title
   - Price → price_display
   - Category → category_badge
   - ImageFile → product_image
3. ▶️ Execute: Click RUN (50 items, 50 credits needed)
4. 📊 Analytics: See 50 designs created, 50 credits used

---

## Common Issues

### "File not found" Error
- Make sure file path is correct
- Try selecting file again
- Check file isn't moved/renamed

### Mapping appears empty
- Make sure PSD file was selected in Setup tab
- Refresh/reload plugin: Windows → UXP Plugins → Reload

### No progress during execute
- Wait 30 seconds for processing to start
- Check browser console for errors
- Try with smaller batch (5 items)

### Credits not deducting
- Make sure you have enough credits
- Check current account is active
- Create new account if corrupted

---

## Tips & Tricks

✅ **Best Practices**
- Start with small batch (5-10 items) to test mapping
- Use consistent file naming (product_001.jpg)
- Template layers should be clearly named
- Export PSD first if you want editable versions

⚡ **Speed Tips**
- Flatten layers before export to reduce file size
- Use JPEG for web, PNG for graphics
- Batch process at night (long jobs)
- Monitor credit usage in Analytics

🎯 **Quality Tips**
- Test with 1-2 items before full batch
- Check exported files before distribution
- Use consistent image sizes
- Name products clearly in Excel

---

## Keyboard Shortcuts

| Action | Shortcut |
|--------|----------|
| Switch Tab | `Ctrl+Number` (1-4) |
| Add Mapping | `Enter` |
| Start Batch | `Ctrl+Enter` |
| View Analytics | `Ctrl+A` |

---

## Storage & Data

### Where is my data stored?
- Browser localStorage (plugin panel)
- Max storage: ~5-10MB
- Persists between sessions
- Lost if cache is cleared

### How do I backup?
- Export mappings (coming soon)
- Screenshot of Analytics tab
- Save Excel file in version control

### Privacy
- No data sent to cloud (Phase 1)
- All processing local to your computer
- Phase 2+ will add optional cloud backup

---

## Need Help?

### Check These First
1. Are all 3 files selected in Setup? (Excel, Folder, PSD)
2. Do your PSD layers have unique names?
3. Is your Excel data formatted correctly?
4. Do you have enough credits?

### Debug Mode
1. Open browser DevTools: `F12`
2. Go to Console tab
3. Look for ` ` debug messages
4. Check for red errors

### Report Issues
- Screenshot of error
- Your Excel structure
- PSD layer names
- Credits available

---

## FAQ

**Q: How many items can I batch process?**
A: Unlimited! But start small. Plugin processes ~100 items/min.

**Q: Can I pause/cancel?**
A: Not in this version. Phase 2 will add pause/cancel.

**Q: Can I undo?**
A: Create backup folder before each batch.

**Q: How do I get more credits?**
A: Check Pricing page (Phase 2).

**Q: Can I use on multiple computers?**
A: Yes, each computer is independent (local storage).

**Q: Are my designs private?**
A: Yes, all processing local to your Photoshop. No upload.

**Q: Can I export to other formats?**
A: Phase 2 will add more formats (WEBP, TIFF, PDF).

---

## What's Next?

### Phase 2 (Coming Soon)
- ☑️ Template library & sharing
- ☑️ Advanced formatting rules
- ☑️ Conditional logic (if/then)
- ☑️ Pause/resume batches
- ☑️ More export formats

### Phase 3
- ☑️ Cloud storage integration
- ☑️ Subscription plans
- ☑️ Team accounts
- ☑️ Usage analytics dashboard

### Phase 4
- ☑️ AI image search
- ☑️ Auto description generation
- ☑️ Metadata injection

---

**Happy Designing! 🎨**

For detailed docs, see: [ELZOZ_IMPLEMENTATION.md](./ELZOZ_IMPLEMENTATION.md)
