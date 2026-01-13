# GitHub Static Exporter - Complete Implementation Guide

A production-ready integration of the GitHub Static Exporter with your static site management system.

## 📁 File Structure

```
/assets/
├── css/
│   ├── github-exporter.css              # Core exporter styles
│   └── static-page-enhancements.css     # Page integration styles
└── js/
    └── github-static-exporter.js        # Exporter script

/app/themes/your-theme/
└── views/
    ├── partials/
    │   └── create_link_modals.php       # Updated modal
    └── link/
        └── static.php                    # Updated page editor
```

## 🚀 Installation Steps

### Step 1: Add CSS Files

Place these files in `/assets/css/`:
- `github-exporter.css` - Core exporter styles
- `static-page-enhancements.css` - Integration styles

### Step 2: Add JavaScript File

Place this file in `/assets/js/`:
- `github-static-exporter.js` - Core exporter functionality

### Step 3: Include in Layout

Add to your main layout file (typically `head.php` or before `</body>`):

```php
<!-- GitHub Static Exporter - Complete Integration -->
<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>
<link rel="stylesheet" href="<?= ASSETS_FULL_URL ?>css/github-exporter.css">
<link rel="stylesheet" href="<?= ASSETS_FULL_URL ?>css/static-page-enhancements.css">
<script src="<?= ASSETS_FULL_URL ?>js/github-static-exporter.js"></script>
```

### Step 4: Update Templates

Replace the following files with the enhanced versions:

1. **Create Static Modal** (`create_link_modals.php`)
   - Updated file upload section
   - GitHub icon indicator
   - Enhanced styling

2. **Static Page Editor** (`static.php`)
   - Enhanced file upload area
   - Visual feedback on file selection
   - Loading states

## 🎨 Design System

### Color Tokens (OKLCH)

**Light Theme:**
- Surface: `oklch(100% 0 0)` - Pure white
- Background: `oklch(96% 0 0)` - Light gray
- Border: `oklch(88% 0 0)` - Medium gray
- Text: `oklch(10% 0 0)` - Near black

**Dark Theme:**
- Surface: `oklch(20% 0 0)` - Dark surface
- Background: `oklch(15% 0 0)` - Darker background
- Border: `oklch(28% 0 0)` - Medium dark
- Text: `oklch(96% 0 0)` - Near white

### Spacing (4px Grid)

- `--static-space-2`: 8px
- `--static-space-3`: 12px
- `--static-space-4`: 16px
- `--static-space-5`: 20px
- `--static-space-6`: 24px

## ✨ Features

### 1. Enhanced File Upload Section

```php
<div class="static-file-upload-section">
    <!-- Elevated container with subtle border and hover effects -->
</div>
```

**Features:**
- Dashed border for file input
- Smooth hover transitions
- Focus ring on interaction
- Loading state during upload
- Success state when file attached

### 2. GitHub Integration Badge

```php
<div class="static-github-icon">
    <i class="fab fa-github"></i>
    <span>Export directly from GitHub repositories</span>
</div>
```

**Features:**
- Subtle background color
- GitHub icon
- Informative text
- Changes color when file attached

### 3. Visual States

**Default State:**
- Dashed border
- Neutral colors
- GitHub badge shown

**Hover State:**
- Border becomes solid
- Subtle shadow appears
- Background lightens

**Has File State:**
- Green accent border
- Success-colored badge
- Confirmation visual

**Loading State:**
- Reduced opacity
- Pointer events disabled
- Processing indicator

## 🎯 Usage

### For Users

1. Navigate to static site editor
2. Click on file input or "Select from GitHub" button
3. Choose export method:
   - **Public Repo**: Enter GitHub URL
   - **Private Repo**: Authenticate with PAT
4. Select repository and branch
5. Files automatically export and attach
6. Submit form to deploy

### For Developers

**Triggering the Exporter:**

```html
<!-- Inline Button Pattern -->
<input type="file" data-gh-export>

<!-- Floating Action Button Pattern -->
<input type="file" data-gh-export-fab>
```

**File Change Detection:**

```javascript
$('#file').on('change', function() {
    if(this.files && this.files.length > 0) {
        $('.static-file-input-wrapper').addClass('has-file');
    } else {
        $('.static-file-input-wrapper').removeClass('has-file');
    }
});
```

## 📱 Responsive Behavior

### Mobile (<640px)
- Button text hidden (icon only)
- Reduced padding
- Touch-optimized (44px min-height)

### Tablet (640px - 768px)
- Full button with text
- Comfortable spacing

### Desktop (>768px)
- All features visible
- Hover effects enabled
- Optimal spacing

## 🔧 Customization

### Changing Colors

Override CSS variables in your theme:

```css
:root {
    --static-interactive: oklch(50% 0.2 260); /* Purple accent */
    --static-border: oklch(85% 0 0); /* Lighter border */
}
```

### Adjusting Spacing

```css
.static-file-upload-section {
    padding: var(--static-space-8); /* Larger padding */
}
```

### Custom Success Color

```css
.static-file-input-wrapper.has-file input[type="file"] {
    border-color: oklch(55% 0.15 200); /* Custom blue */
}
```

## 🧪 Testing Checklist

- [ ] File input accepts ZIP files
- [ ] "Select from GitHub" button appears
- [ ] Modal opens when clicking button
- [ ] Public repo export works
- [ ] Private repo export works (with PAT)
- [ ] File attaches to input after export
- [ ] Visual feedback shows file attached
- [ ] Form submission includes exported file
- [ ] Loading states display correctly
- [ ] Success states display correctly
- [ ] Mobile responsive (< 640px)
- [ ] Tablet responsive (640-768px)
- [ ] Desktop responsive (> 768px)
- [ ] Dark mode styling works
- [ ] Accessibility (keyboard navigation)

## 🐛 Troubleshooting

### Button Not Appearing
**Check:** JSZip and exporter script are loaded
```javascript
console.log(typeof JSZip); // Should not be 'undefined'
console.log(typeof window.ghExporter); // Should not be 'undefined'
```

### Styles Not Applied
**Check:** CSS files are loaded in correct order
1. github-exporter.css
2. static-page-enhancements.css

### File Not Attaching
**Check:** Browser console for errors
```javascript
// Should see exporter initialization
console.log('✓ GitHub Static Exporter v3.0.0');
```

## 📊 Browser Support

| Browser | Version | Status |
|---------|---------|--------|
| Chrome  | 90+     | ✓ Full |
| Safari  | 14+     | ✓ Full |
| Firefox | 88+     | ✓ Full |
| Edge    | 90+     | ✓ Full |

## 🔐 Security Notes

- Tokens stored in localStorage only
- Never sent to third-party servers
- Only communicates with GitHub API
- Client-side ZIP generation
- No backend modifications needed

## 📝 License

MIT License - See LICENSE file for details

## 🆘 Support

For issues or questions:
1. Check browser console for errors
2. Verify all files are loaded
3. Test with a simple public repository first
4. Enable verbose logging in developer tools

---

**Version:** 3.0.0  
**Last Updated:** 2025  
**Compatibility:** Bootstrap 4+, jQuery 3+
