# QUICK START - NEW ICON REPLACEMENTS

## Copy-Paste Icon Imports
```jsx
import {
  Settings,           // Setup tab
  Link as LinkIcon,   // Text Mapping tab
  MapPin,            // Image Mapping tab
  ImageIcon,         // Images tab
  Play,              // Execute tab
  BarChart3,         // Analytics tab
  FileJson,          // Excel files
  FolderOpen,        // Folder selection
  FileImage,         // PSD files
  Download,          // Export
  CheckCircle2,      // Success
  XCircle,           // Error
  AlertCircle,       // Warning
  Plus,              // Add new
  Trash2,            // Delete
  Edit2,             // Edit
  ChevronDown,       // Dropdown
} from 'lucide-react';
```

## Before & After Patterns

### BEFORE (Old Code)
```jsx
<h2>📋 Select Files</h2>
<label>📊 Excel File</label>
<button>{projectState.excelPath ? '✅ Excel Selected' : '📁 Select Excel'}</button>
```

### AFTER (New Code)
```jsx
<div style={{ display: 'flex', alignItems: 'center', gap: 'var(--spacing-md)' }}>
  <FileJson size={24} />
  <h2>Select Files</h2>
</div>
<label>Excel File</label>
<button className="btn btn-primary">
  <FolderOpen size={16} />
  {projectState.excelPath ? 'Change' : 'Select'} Excel
</button>
```

## CSS Variable Reference

### Quick Colors
```css
var(--color-primary)          /* Blue #2563eb */
var(--color-success)          /* Green #10b981 */
var(--color-warning)          /* Yellow #f59e0b */
var(--color-danger)           /* Red #ef4444 */
var(--color-text-primary)     /* Light text #f1f5f9 */
var(--color-bg-secondary)     /* Dark bg #1e293b */
var(--color-border)           /* Border #334155 */
```

### Quick Spacing
```css
var(--spacing-sm)   /* 8px */
var(--spacing-md)   /* 12px */
var(--spacing-lg)   /* 16px */
var(--spacing-xl)   /* 24px */
```

## Panel Redesign Checklist

- [ ] Import lucide icons at top
- [ ] Replace all emoji with icons (size={16} or size={24})
- [ ] Add className="btn btn-primary" to buttons
- [ ] Change `style={{}}` inline styling to use CSS variables
- [ ] Wrap sections in div with className="card"
- [ ] Use gap-md for spacing between elements
- [ ] Replace emojis in text with proper labels
- [ ] Test that all functionality still works
- [ ] Check hover states on buttons

## Icon Size Guidelines
- **In buttons:** `size={16}`
- **In headers:** `size={24}`
- **In lists:** `size={16}`
- **In badges:** `size={14}`

## Status Badge Usage
```jsx
// Success
<div className="status-success">
  <CheckCircle2 size={16} />
  Operation completed
</div>

// Error
<div className="status-error">
  <XCircle size={16} />
  Something went wrong
</div>

// Warning
<div className="status-warning">
  <AlertCircle size={16} />
  Please review
</div>
```

## Done! You have:
✅ Professional design system
✅ Lucide icons ready
✅ CSS framework ready
✅ All functionality preserved
✅ Ready to scale to all panels
