# 🎨 Elzoz UI/UX Flows & Wireframes

## Main Panel Layout

```
┌────────────────────────────────────────────────────┐
│  🚀 Elzoz | Photoshop Batch Design Automation     │  ← Header
├────────────────────────────────────────────────────┤
│  Account: Default Account         💳 1000 Credits  │  ← Account Manager
├─────────┬──────────┬──────────┬──────────────────┤
│ ⚙️Setup │🔗Mapping│▶️Execute│📊Analytics│      │  ← Tab Navigation
├────────────────────────────────────────────────────┤
│                                                    │
│  [DYNAMIC TAB CONTENT - scrollable]               │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
│                                                    │
└────────────────────────────────────────────────────┘
        Typical Panel Size: 400x600px
```

---

## Tab 1: Setup Panel Layout

```
┌────────────────────────────────────────────────────┐
│  📋 Step 1: Select Files                           │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Excel File (Product Data)                    │ │
│  │  [📁 Select Excel]                           │ │
│  │  ✓ products.xlsx                             │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Images Folder                                │ │
│  │  [📁 Select Folder]                          │ │
│  │  ✓ /Users/designer/products/images           │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ┌──────────────────────────────────────────────┐ │
│  │ Photoshop Template (PSD)                     │ │
│  │  [🎨 Select PSD]                             │ │
│  │  ✓ template.psd (8 layers)                   │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ─────────────────────────────────────────────    │
│                                                    │
│  📊 Data Preview                                   │
│  ┌──────────────────────────────────────────────┐ │
│  │ ProductName │ Price  │ Category │ +3 more   │ │
│  ├──────────────────────────────────────────────┤ │
│  │ MacBook Pro │ 1299   │ Laptops  │           │ │
│  │ iPhone 15   │ 999    │ Phones   │           │ │
│  │ AirPods Pro │ 249    │ Audio    │           │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  📌 Next Steps:                                   │
│  • All 3 files are required to continue           │
│  • Excel should contain product data in columns   │
│  • PSD template should have text/image layers     │
│  • Go to Mapping tab to connect Excel → PSD      │
└────────────────────────────────────────────────────┘
```

---

## Tab 2: Mapping Panel Layout

```
┌────────────────────────────────────────────────────┐
│  🔗 Connect Excel Columns to PSD Layers            │
├────────────────────────────────────────────────────┤
│                                                    │
│  📋 Excel Columns    │    🎨 PSD Layers          │
│  ──────────────────────────────────────────────   │
│                                                    │
│  ┌──────────────────┐ │ ┌──────────────────────┐ │
│  │ ProductName      │ │ │ product_title        │ │
│  │ → Title          │ │ │ ← ProductName        │ │
│  └──────────────────┘ │ └──────────────────────┘ │
│                       │                          │
│  ┌──────────────────┐ │ ┌──────────────────────┐ │
│  │ Price            │ │ │ price_display        │ │
│  │ → price_display  │ │ │ ← Price              │ │
│  └──────────────────┘ │ └──────────────────────┘ │
│                       │                          │
│  ┌──────────────────┐ │ ┌──────────────────────┐ │
│  │ Category         │ │ │ category_badge       │ │
│  │ → category_badge │ │ │ ← Category           │ │
│  └──────────────────┘ │ └──────────────────────┘ │
│                       │                          │
│  ┌──────────────────┐ │ ┌──────────────────────┐ │
│  │ ImageFile        │ │ │ product_image        │ │
│  │ → product_image  │ │ │ ← ImageFile          │ │
│  └──────────────────┘ │ └──────────────────────┘ │
│                       │                          │
│  ───────────────────────────────────────────────  │
│                                                    │
│  Create Mapping:                                   │
│  ┌────────────────────────────────────────────┐  │
│  │ Select Column      │ Select Layer         │  │
│  │ [ProductName ▼]    │ [product_title ▼]    │  │
│  │               [+ Add Mapping]            │  │
│  └────────────────────────────────────────────┘  │
│                                                    │
│  Current Mappings (4):                             │
│  ┌────────────────────────────────────────────┐  │
│  │ ProductName → Title           [Remove]    │  │
│  │ Price → price_display         [Remove]    │  │
│  │ Category → category_badge     [Remove]    │  │
│  │ ImageFile → product_image     [Remove]    │  │
│  └────────────────────────────────────────────┘  │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Tab 3: Execute Panel Layout

```
┌────────────────────────────────────────────────────┐
│  ▶️ Execute Batch Processing                       │
├────────────────────────────────────────────────────┤
│                                                    │
│  📊 Processing Summary:                            │
│  ┌─────────────────┬──────────────────────────┐  │
│  │ Items to Process│ Credits Required         │  │
│  │      50         │        50                │  │
│  └─────────────────┴──────────────────────────┘  │
│                                                    │
│  💾 Export Formats:                                │
│  ┌──────────────────────────────────────────────┐ │
│  │ ☑ JPG (Quality: 85%)                        │ │
│  │ ☐ PNG (32-bit)                              │ │
│  │ ☑ PSD (Editable)                            │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ───────────────────────────────────────────────  │
│                                                    │
│  [AFTER PROCESSING STARTS]:                       │
│                                                    │
│  Processing Progress:                          45%│
│  ┌──────────────────────────────────────────────┐ │
│  │████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░   │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  Status: Processing item 22 of 50...             │
│                                                    │
│  ───────────────────────────────────────────────  │
│                                                    │
│  [             🚀 RUN (Start Batch)            ]  │
│                                                    │
│  OR (while running):                              │
│                                                    │
│  [        ⏳ Processing... [CANCEL]            ]  │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## Tab 4: Analytics Panel Layout

```
┌────────────────────────────────────────────────────┐
│  📊 Analytics Dashboard                            │
├────────────────────────────────────────────────────┤
│                                                    │
│  ┌───────────────────┬───────────────────────┐   │
│  │ Total Designs     │ Credits Used          │   │
│  │      150          │       150             │   │
│  └───────────────────┴───────────────────────┘   │
│                                                    │
│  ┌───────────────────┬───────────────────────┐   │
│  │ Current Credits   │ Success Rate          │   │
│  │      850          │       98%             │   │
│  └───────────────────┴───────────────────────┘   │
│                                                    │
│  ───────────────────────────────────────────────  │
│                                                    │
│  📈 Processing History:                            │
│  ┌──────────────────────────────────────────────┐ │
│  │ Batch: 50 items        -50 credits         │ │
│  │ Feb 6, 2025 - 2:30 PM                      │ │
│  │ [JPG] [PNG] [PSD]                          │ │
│  │                                             │ │
│  │ Batch: 30 items        -30 credits         │ │
│  │ Feb 6, 2025 - 1:15 PM                      │ │
│  │ [JPG] [PSD]                                │ │
│  │                                             │ │
│  │ Batch: 70 items        -70 credits         │ │
│  │ Feb 5, 2025 - 4:45 PM                      │ │
│  │ [JPG] [PNG]                                │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
│  ───────────────────────────────────────────────  │
│                                                    │
│  👤 Account Information:                           │
│  ┌──────────────────────────────────────────────┐ │
│  │ Account Name:    Default Account            │ │
│  │ Created:         Feb 1, 2025                │ │
│  │ Total Batches:   3                          │ │
│  └──────────────────────────────────────────────┘ │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

## User Interaction Flow

### New User First Time

```
LAUNCH PLUGIN
    ↓
[AUTO] Account created: "Default Account" (1000 credits)
    ↓
SETUP TAB OPENS
    ↓
User: Select Excel → preview shows ✅
    ↓
User: Select Images Folder → path shows ✅
    ↓
User: Select PSD → layers extracted ✅
    ↓
User: Click → Go to MAPPING TAB
    ↓
MAPPING TAB
    ↓
User: Selects columns from dropdowns
    ↓
User: Connects to PSD layers
    ↓
User: Views mapping summary ✅
    ↓
User: Click → Go to EXECUTE TAB
    ↓
EXECUTE TAB
    ↓
User: Reviews 50 items, 50 credits needed
    ↓
User: Selects export formats
    ↓
User: Clicks RUN
    ↓
[PROCESSING] Progress bar fills 0→100%
    ↓
[COMPLETE] 50 designs created! 950 credits left
    ↓
User: Click → Go to ANALYTICS TAB
    ↓
ANALYTICS TAB
    ↓
User: Sees 50 designs generated
    ↓
User: Sees 950 credits remaining
    ↓
User: Sees processing history entry
    ↓
✅ WORKFLOW COMPLETE
```

### Experienced User - Quick Rerun

```
PLUGIN ALREADY OPEN
    ↓
User: Click SETUP TAB
    ↓
[AUTO] Previous files remembered from localStorage
    ↓
User: Same Excel loaded, preview shown ✅
    ↓
User: Same Images folder remembered ✅
    ↓
User: Same PSD loaded ✅
    ↓
User: Click EXECUTE TAB
    ↓
[AUTO] Previous mapping still active ✅
    ↓
User: Clicks RUN
    ↓
[PROCESSING] Another 50 designs created
    ↓
Credits: 950 → 900
    ↓
ANALYTICS TAB shows both batches
    ↓
✅ REPEATED WORKFLOW (30 seconds total)
```

### Account Switching

```
PLUGIN RUNNING
    ↓
User: Click Account Manager "Switch Account" dropdown
    ↓
Shows: "Account1 (500 credits)"
Shows: "Account2 (1000 credits)"
Shows: "Account3 (0 credits)"
    ↓
User: Selects "Account2"
    ↓
[AUTO] currentAccount updates in AccountContext
    ↓
Header shows: "Account: Account2" with "💳 1000 Credits"
    ↓
All data persists for Account1 in localStorage
    ↓
Ready to process with Account2 credits ✅
```

---

## Component Interaction Diagram

```
SetupPanel
    ↓ [calls window.pickExcelCommand()]
    ↓ [receives file object]
    ↓ [calls updateProjectState()]
    ↓
ProjectContext ← stores excelData, excelColumns
    ↓
MappingPanel ← reads excelColumns
    ↓ [displays Excel columns on left]
    ↓ [displays PSD layers on right]
    ↓ [user creates mappings]
    ↓ [calls setMapping()]
    ↓
ProjectContext ← stores mapping {}
    ↓
ExecutePanel ← reads mapping
    ↓ [shows item count]
    ↓ [shows credits required]
    ↓ [user clicks RUN]
    ↓ [loops through excelData]
    ↓ [updates progress]
    ↓ [calls updateCredits()]
    ↓
AccountContext ← credits deducted
    ↓ [calls logUsage()]
    ↓
AccountContext ← usage history updated
    ↓
AnalyticsPanel ← reads currentAccount
    ↓ [displays stats]
    ↓ [displays history]
```

---

## Error States & Handling

### Error: Insufficient Credits
```
User on EXECUTE TAB
    ↓
Shows: "Need 50 credits, have 30 available"
    ↓
[RUN Button] disabled (grayed out)
    ↓
Alert: "❌ Insufficient credits. Need 50, have 30"
    ↓
Solution: Switch to account with more credits
           OR create new account (1000 credits)
```

### Error: Setup Incomplete
```
User on EXECUTE TAB without setup
    ↓
Shows alert: "⚠️ Setup incomplete"
    ↓
Message: "Please configure Setup and Mapping tabs first"
    ↓
[RUN Button] disabled
    ↓
Link to SETUP TAB
```

### Error: File Not Found
```
User selecting Excel in SETUP
    ↓
Clicks [📁 Select Excel]
    ↓
File picker appears
    ↓
User selects file.xlsx
    ↓
File read fails (corrupted/moved)
    ↓
Shows: "❌ Failed to read Excel file"
    ↓
Suggests: "Check file format, try again"
```

---

## Loading & Processing States

### Initial Load
```
Plugin Opens
    ↓
[LOADING] Read from localStorage (300ms)
    ↓
Account Manager shows current account ✅
    ↓
Default account with 1000 credits displayed
    ↓
All tabs accessible ✅
```

### Excel Parse
```
User selects Excel
    ↓
[LOADING] Reading file... (depends on size)
    ↓
  1MB file: ~100ms
  10MB file: ~500ms
  100MB file: ~2s
    ↓
[COMPLETE] Data loaded, preview shown
    ↓
Column count displayed: "12 columns"
    ↓
Row count displayed: "500 rows"
```

### Batch Processing
```
User clicks RUN
    ↓
[0%] Starting...
    ↓
[25%] Processing item 12 of 50
    ↓
[50%] Processing item 25 of 50
    ↓
[75%] Processing item 37 of 50
    ↓
[100%] Batch complete!
    ↓
Show summary:
  - 50 items processed ✅
  - 0 errors
  - 50 credits deducted
  - ~25 seconds elapsed
```

---

## Responsive Behavior

### Small Panel (300px wide)
```
┌──────────────────────────┐
│ 🚀 Elzoz                 │
├──────────────────────────┤
│ Account | 1000 Cr       │  ← Compact
├────┬────┬────┬──────┐
│⚙️│🔗│▶️│📊│  ← Wrapped
├──────────────────────────┤
│                          │
│ Setup Tab Content        │
│ (scrolls vertically)     │
│                          │
│                          │
└──────────────────────────┘
```

### Large Panel (600px wide)
```
┌──────────────────────────────────────────────────────┐
│ 🚀 Elzoz | Photoshop Batch Design Automation        │
├──────────────────────────────────────────────────────┤
│ Account: Default Account    💳 1000 Credits          │
├──────┬──────────┬──────────┬──────────────────────┤
│⚙️Setup│🔗Mapping│▶️Execute│📊Analytics│          │
├──────────────────────────────────────────────────────┤
│                                                      │
│  Full width content with better spacing             │
│                                                      │
│  [File Selection Buttons and Preview]              │
│                                                      │
│                                                      │
└──────────────────────────────────────────────────────┘
```

---

## Dark Theme Colors in UI

```
Component          Background         Text            Border
─────────────────────────────────────────────────────────────
Header             bg-secondary        text-primary    border
Account Manager    bg-secondary        text-primary    border
Tab Navigation     bg-primary          white           none
Tab (inactive)     bg-tertiary         text-secondary  border
Card               bg-secondary        text-primary    border
Input              bg-tertiary         text-primary    primary
Button (primary)   primary             white           none
Button (secondary) bg-tertiary         text-primary    border
Progress Bar       primary (gradient)  -               -
Success Alert      rgba(green, 0.1)   green           green
Error Alert        rgba(red, 0.1)     red             red
Badge              bg-tertiary         text-secondary  -
```

---

## Animation & Transitions

### Tab Switch Animation
```
User clicks different tab
    ↓
Current tab fades out (150ms)
    ↓
Tab button highlights blue
    ↓
New content fades in (150ms)
```

### Progress Bar Animation
```
Progress: 0% → 50%
    ↓
Width animates smoothly (300ms)
    ↓
Color gradient: blue → blue-light
    ↓
Percentage updates live
```

### Button Hover State
```
User hovers button
    ↓
Background darkens (80% opacity)
    ↓
Cursor changes to pointer
    ↓
Smooth transition (200ms)
```

### Mapping Highlight
```
User maps ProductName → Title
    ↓
ProductName card gets left blue border
    ↓
Title card gets blue background tint
    ↓
Smooth highlight transition (200ms)
```

---

## Accessibility Features

### Keyboard Navigation
- `Tab` - Navigate between elements
- `Enter` - Click button / Submit form
- `Escape` - Close dropdown / Modal
- `Space` - Check/uncheck checkbox
- `Ctrl+1-4` - Quick tab switch (future)

### Screen Reader Support
- All buttons have text labels
- Form fields have associated labels
- Status messages announce changes
- Table headers properly marked
- Cards use semantic structure

### Visual Contrast
- All text meets WCAG AA standards
- Color not sole indicator of state
- Icons paired with text labels
- Focus indicators visible (blue outline)

---

**UI/UX Design Complete**
*Ready for implementation in React components*
