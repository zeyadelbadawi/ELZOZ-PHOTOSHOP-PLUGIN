# Elzoz Architecture & Component Map

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                     PHOTOSHOP PLUGIN (UXP)                      │
│                                                                 │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                    AppContainer                          │   │
│  │  (Main wrapper with AccountProvider + ProjectProvider)  │   │
│  │                                                          │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │              Header Section                       │  │   │
│  │  │  - Logo + Title                                  │  │   │
│  │  │  - Subtitle                                      │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │         AccountManager Component                 │  │   │
│  │  │  - Current Account Display                       │  │   │
│  │  │  - Credits Badge                                 │  │   │
│  │  │  - Account Switcher Dropdown                     │  │   │
│  │  │  - New Account Button                            │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │         TabNavigation Component                  │  │   │
│  │  │  ┌─────────┬─────────┬─────────┬──────────┐     │  │   │
│  │  │  │ ⚙️Setup │🔗Mapping│▶️Execute│📊Analytics│     │  │   │
│  │  │  └─────────┴─────────┴─────────┴──────────┘     │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  │                                                          │   │
│  │  ┌───────────────────────────────────────────────────┐  │   │
│  │  │         Dynamic Tab Content (Flex 1)             │  │   │
│  │  │                                                   │  │   │
│  │  │  Setup Tab        Mapping Tab                    │  │   │
│  │  │  ─────────────────────────────                   │  │   │
│  │  │  ┌─────────────┐  ┌──────────────┐              │  │   │
│  │  │  │  SetupPanel │  │ MappingPanel │              │  │   │
│  │  │  │ ┌─────────┐ │  │ ┌──────────┐ │              │  │   │
│  │  │  │ │ Excel   │ │  │ │ Excel    │ │              │  │   │
│  │  │  │ │ Picker  │ │  │ │ Columns  │ │              │  │   │
│  │  │  │ ├─────────┤ │  │ └──────────┘ │              │  │   │
│  │  │  │ │ Image   │ │  │ ┌──────────┐ │              │  │   │
│  │  │  │ │ Picker  │ │  │ │ PSD      │ │              │  │   │
│  │  │  │ ├─────────┤ │  │ │ Layers   │ │              │  │   │
│  │  │  │ │ PSD     │ │  │ └──────────┘ │              │  │   │
│  │  │  │ │ Picker  │ │  │ ┌──────────┐ │              │  │   │
│  │  │  │ ├─────────┤ │  │ │ Mapping  │ │              │  │   │
│  │  │  │ │ Preview │ │  │ │ Controls │ │              │  │   │
│  │  │  │ │ Table   │ │  │ │ & List   │ │              │  │   │
│  │  │  │ └─────────┘ │  │ └──────────┘ │              │  │   │
│  │  │  └─────────────┘  └──────────────┘              │  │   │
│  │  │                                                   │  │   │
│  │  │  Execute Tab      Analytics Tab                  │  │   │
│  │  │  ────────────     ──────────────                 │  │   │
│  │  │  ┌────────────┐  ┌──────────────┐               │  │   │
│  │  │  │ExecutePanel│  │AnalyticsPanel│               │  │   │
│  │  │  │┌──────────┐│  │ ┌──────────┐ │               │  │   │
│  │  │  ││Summary   ││  │ │ Stats    │ │               │  │   │
│  │  │  │├──────────┤│  │ │ Grid     │ │               │  │   │
│  │  │  ││Export    ││  │ ├──────────┤ │               │  │   │
│  │  │  ││Options   ││  │ │ History  │ │               │  │   │
│  │  │  │├──────────┤│  │ │ Table    │ │               │  │   │
│  │  │  ││Progress  ││  │ ├──────────┤ │               │  │   │
│  │  │  ││Bar       ││  │ │ Account  │ │               │  │   │
│  │  │  │├──────────┤│  │ │ Info     │ │               │  │   │
│  │  │  ││RUN       ││  │ │ Card     │ │               │  │   │
│  │  │  ││Button    ││  │ └──────────┘ │               │  │   │
│  │  │  │└──────────┘│  └──────────────┘               │  │   │
│  │  │  └────────────┘                                  │  │   │
│  │  └───────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Context Provider Hierarchy

```
<AccountProvider>
  ├─ accounts: Account[]
  ├─ currentAccount: Account
  ├─ switchAccount(id)
  ├─ updateCredits(id, amount)
  ├─ addAccount(name)
  └─ logUsage(id, data)
  
  <ProjectProvider>
    ├─ excelFile: File
    ├─ excelData: Object[]
    ├─ excelColumns: string[]
    ├─ psdFile: File
    ├─ psdLayers: Layer[]
    ├─ mapping: { column: layerId }
    ├─ isProcessing: boolean
    ├─ progress: number (0-100)
    ├─ results: Object[]
    ├─ errors: Error[]
    ├─ updateProjectState(updates)
    ├─ setMapping(column, layerId)
    └─ clearProject()
    
    <AppContainer>
      ├─ <Header />
      ├─ <AccountManager />
      ├─ <TabNavigation />
      └─ <TabContent>
          ├─ <SetupPanel /> (uses ProjectContext)
          ├─ <MappingPanel /> (uses ProjectContext)
          ├─ <ExecutePanel /> (uses ProjectContext + AccountContext)
          └─ <AnalyticsPanel /> (uses AccountContext + ProjectContext)
    </AppContainer>
  </ProjectProvider>
</AccountProvider>
```

---

## Data Flow Diagram

### Setup Flow
```
User clicks "Select Excel"
        ↓
SetupPanel.handlePickExcel()
        ↓
window.pickExcelCommand() [from index.jsx]
        ↓
UXP storage.localFileSystem.getFileForOpening()
        ↓
Update ProjectContext:
  - excelPath
  - excelFile
  - excelData (parsed)
  - excelColumns
        ↓
SetupPanel re-renders with preview table
```

### Mapping Flow
```
User selects Column + Layer + "Add Mapping"
        ↓
MappingPanel.setMapping(column, layerId)
        ↓
ProjectContext.setMapping()
        ↓
Save to localStorage: 'elzoz_mapping'
        ↓
Update ProjectContext.mapping
        ↓
MappingPanel re-renders showing:
  - Green border on mapped columns
  - Blue highlight on mapped layers
  - Mapping summary list
```

### Execute Flow
```
User clicks RUN
        ↓
Check: files selected + mapping exists + enough credits
        ↓
For each row in excelData:
  - Update progress
  - Simulate batch process (500ms delay)
  - Add to results[]
        ↓
On completion:
  - AccountContext.updateCredits() ← Deduct credits
  - AccountContext.logUsage() ← Record in history
  - Update ExecutePanel progress to 100%
        ↓
User navigates to Analytics to see results
```

### Analytics Flow
```
User opens Analytics tab
        ↓
AnalyticsPanel mounts
        ↓
Read from:
  - currentAccount.credits (available)
  - currentAccount.usage[] (history)
  - projectState.results[] (last results)
  - projectState.errors[] (last errors)
        ↓
Calculate stats:
  - totalProcessed = sum of all usage[].itemsProcessed
  - totalCreditsUsed = sum of all usage[].creditsUsed
  - successRate = results.length / (results + errors)
        ↓
Render:
  - Stats grid
  - History table (last 5 jobs)
  - Account info card
```

---

## Component Responsibilities

### AppContainer
**Role**: Main wrapper, context setup, tab routing
**Props**: None
**State**: activeTab
**Children**: Header, AccountManager, TabNavigation, Dynamic tab content
**Context Used**: AccountProvider, ProjectProvider

### TabNavigation
**Role**: Clickable tab switcher
**Props**: activeTab, onTabChange
**State**: None
**Tabs**: Setup, Mapping, Execute, Analytics

### AccountManager
**Role**: Display/switch accounts, show credits
**Props**: None
**State**: showAddForm, newName
**Context Used**: AccountContext (read/write)

### SetupPanel
**Role**: File selection and data preview
**Props**: None
**State**: excelPreview
**File Pickers**: Excel, Folder, PSD
**Context Used**: ProjectContext (write)

### MappingPanel
**Role**: Visual layer-to-column mapping UI
**Props**: None
**State**: None
**Context Used**: ProjectContext (read/write)

### ExecutePanel
**Role**: Batch processing, progress, export options
**Props**: None
**State**: isRunning, exportFormats
**Context Used**: ProjectContext (read/write), AccountContext (write)

### AnalyticsPanel
**Role**: Statistics, history, account info
**Props**: None
**State**: None
**Context Used**: AccountContext (read), ProjectContext (read)

---

## Storage Strategy

### localStorage Keys

```
Key: 'elzoz_accounts'
Type: JSON string
Value: Array<Account>
{
  id: string,
  name: string,
  credits: number,
  createdAt: ISO string,
  usage: Array<UsageLog>
}

---

Key: 'elzoz_mapping'
Type: JSON string
Value: { [excelColumn]: psdhopLayerId }
Example: {
  "ProductName": "layer_12345",
  "Price": "layer_67890"
}
```

### Data Persistence

| Data | Where | Persists | When |
|------|-------|----------|------|
| Accounts | localStorage | ✅ Yes | On switch/create |
| Credits | localStorage | ✅ Yes | On deduction |
| Mapping | localStorage | ✅ Yes | After "Add Mapping" |
| Excel Data | Memory (RAM) | ❌ No | Lost on reload |
| Progress | Memory (RAM) | ❌ No | Lost on cancel |

---

## Error Handling

### File Selection
```
Error: User cancels file picker
→ Silently ignore, no change to state

Error: File not readable
→ Show toast error: "Failed to read file"

Error: Excel parsing failed
→ Show alert: "Excel file corrupted or invalid format"
```

### Credit Deduction
```
Error: Insufficient credits
→ Show alert before processing starts
→ Process cancelled

Error: Credit update fails
→ Warn user but don't block
→ Retry on next session
```

### Batch Processing
```
Error: Single item fails
→ Add to errors[]
→ Continue processing next item
→ Show summary at end

Error: Process cancelled mid-batch
→ Stop immediately
→ Show partial results
→ Don't deduct credits for failed items
```

---

## Performance Optimization

### Current
- ✅ Lazy component rendering (tabs only render when active)
- ✅ Context splitting (Account separate from Project)
- ✅ Progress updates throttled (every 500ms)
- ✅ Data preview limited (first 3 rows)

### Future Improvements
- [ ] Virtual scrolling for large mapping lists (1000+ columns)
- [ ] Web Workers for Excel parsing
- [ ] IndexedDB for large datasets
- [ ] Chunk-based batch processing
- [ ] Debounced mapping input

---

## Security Considerations

### Current (Phase 1)
- ✅ No external API calls
- ✅ No sensitive data transmission
- ✅ Local file access only
- ✅ localStorage isolated per domain

### Future (Phase 2+)
- [ ] Implement HTTPS for API calls
- [ ] Encrypt sensitive data
- [ ] Session token rotation
- [ ] Rate limiting on API
- [ ] Audit logging

---

## Testing Checklist

### Unit Tests Needed
- [ ] AccountContext: add/switch/update accounts
- [ ] ProjectContext: set mapping, update state
- [ ] SetupPanel: file selection flows
- [ ] MappingPanel: mapping CRUD operations
- [ ] ExecutePanel: batch processing simulation
- [ ] AnalyticsPanel: calculations and displays

### Integration Tests Needed
- [ ] Full workflow: Setup → Mapping → Execute → Analytics
- [ ] Account switching mid-process
- [ ] Credit deduction accuracy
- [ ] localStorage persistence across reloads
- [ ] Error recovery

### Manual Testing Checklist
- [ ] Excel file with 1, 10, 100, 1000 rows
- [ ] Different file sizes (1MB, 10MB, 100MB)
- [ ] Special characters in Excel (unicode, emojis)
- [ ] Missing files (file deleted after selection)
- [ ] Corrupted files (invalid Excel/PSD)
- [ ] Large image folders (100+ files)
- [ ] Account operations (create, switch, delete)

---

## Known Limitations

### Phase 1
- ⚠️ No actual Photoshop batch processing (simulation only)
- ⚠️ No image insertion into PSD layers
- ⚠️ No auto-export functionality
- ⚠️ No template saving/loading
- ⚠️ No pause/resume mid-batch
- ⚠️ Data lost if localStorage cleared
- ⚠️ Max ~5-10MB storage in browser

### To Be Fixed
- Phase 2: Real Photoshop integration
- Phase 3: Backend API + database
- Phase 4: Advanced features

---

## Deployment Checklist

### Pre-Release
- [ ] All console errors cleared
- [ ] Performance profiled
- [ ] 5000+ items batch tested
- [ ] All browsers tested (Safari, Firefox, Chrome)
- [ ] Accessibility audit (a11y)
- [ ] Security audit
- [ ] Documentation complete
- [ ] Example files provided
- [ ] Help/FAQ updated

### Release
- [ ] Version bumped in manifest.json
- [ ] CHANGELOG.md updated
- [ ] Git tag created
- [ ] Adobe Exchange submitted
- [ ] Release notes published

---

**Last Updated**: Feb 6, 2025
**Architecture Version**: 1.0 (Phase 1 Complete)
