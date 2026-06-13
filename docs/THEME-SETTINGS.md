# Theme Settings System — Complete Guide

## Overview

The Theme Settings system provides a comprehensive, professional theming solution for the Veraglo ERP application. It includes 14 preloaded professional themes and the ability to create custom themes with full control over colors, styling, and display modes.

## Features

### 1. **14 Preloaded Professional Themes**

Each theme is carefully designed for different industries and preferences:

| Theme | Category | Description |
|-------|----------|-------------|
| Classic Enterprise | Professional | Traditional navy and grey, suitable for formal business |
| Modern Blue | Contemporary | Vibrant blues and gradients, perfect for tech companies |
| Premium Graphite | Premium | Sleek greys with subtle accents for premium organizations |
| Fresh Sunlight | Vibrant | Bright yellows and warm tones, great for creative teams |
| Corporate Green | Professional | Calm greens, perfect for healthcare and finance |
| Manufacturing Steel | Industrial | Robust steel greys for manufacturing sectors |
| Minimal White | Minimalist | Clean white backgrounds for distraction-free work |
| Executive Dark | Premium | Premium dark theme for executive-level users |
| Soft Ivory | Comfortable | Warm ivories for extended working hours |
| Tech Indigo | Tech | Modern indigoes and purples for IT companies |
| Warm Office | Comfortable | Warm oranges and neutrals for collaborative spaces |
| Industrial Grey | Industrial | Professional grey with blues for industrial environments |
| Luxury Navy | Premium | Deep navy and gold accents for upscale organizations |
| High Contrast Accessibility | Accessibility | High contrast for accessibility requirements |

### 2. **Full Color Palette Support**

Each theme defines comprehensive colors:

- **Primary & Secondary Colors**: Main brand colors
- **Accent Color**: Highlights and focus states
- **Background Colors**: Page, surface, form backgrounds
- **Status Colors**: Success, warning, error, info
- **Semantic Colors**: Text, muted text, borders, dividers
- **Dark Mode Support**: Complete light and dark variants for every theme

### 3. **Theme Preview System**

Live preview component shows:
- Sidebar layout
- Header/topbar
- Dashboard cards with metrics
- Form fields with validation
- Buttons in different states
- Status badges
- Table styling
- Color palette samples

### 4. **Customization Options**

**Styling Controls:**
- Border radius
- Border thickness
- Card shadows
- Border colors
- Focus indicators

**Display Modes:**
- Light mode only
- Dark mode only
- Both modes with user switch
- Set default preference

**Module Accent Colors:**
- Sales & CRM: Blue
- Inventory: Green
- Production: Steel Grey
- Quality: Purple
- Dispatch: Orange
- Accounts: Navy
- HR: Teal
- Admin: Graphite

### 5. **Custom Theme Creation**

Admin can:
- Create themes from scratch
- Duplicate existing themes
- Rename themes
- Edit color palettes
- Delete custom themes
- Save as default

### 6. **Global Application**

Selected theme applies to:
- Login page
- Homepage
- Sidebar
- Dashboard
- Forms
- Tables
- Buttons
- Dropdowns
- Notifications
- Reports
- Admin panel
- All modules

## How to Use

### Accessing Theme Settings

1. Open **Admin Panel** (if you have admin access)
2. Navigate to **Settings** → **Theme**
3. You'll see the Theme Settings page with:
   - Preloaded Themes tab
   - Custom Themes tab
   - Display Settings tab

### Selecting a Theme

1. Click on any theme in the **Preloaded Themes** list
2. Click **"Show Preview"** to see how it looks
3. The preview updates live as you select different themes
4. Click **"Apply Theme"** to activate the theme

### Creating Custom Themes

1. Go to **Custom Themes** tab
2. Click **"+ New Theme"**
3. Enter a theme name
4. Choose to:
   - Create from scratch (opens color picker)
   - Duplicate an existing theme
5. Customize the color palette
6. Click **"Save Theme"**
7. Apply the custom theme

### Configuring Display Settings

1. Go to **Display Settings** tab
2. Configure:
   - **Light Mode**: Enable/disable light mode
   - **Dark Mode**: Enable/disable dark mode
   - **User Switch**: Allow users to toggle between modes
   - **Default Mode**: Set default light or dark

3. Click **"Apply Theme"** to save settings

### Module Accent Colors

The system includes predefined accent colors for each module:

```javascript
MODULE_ACCENT_COLORS = {
  sales: "#3b82f6",       // Blue
  enquiry: "#8b5cf6",     // Purple
  inventory: "#10b981",   // Green
  purchase: "#06b6c7",    // Cyan
  production: "#6b7684",  // Steel Grey
  quality: "#a855f7",     // Purple
  dispatch: "#f97316",    // Orange
  accounts: "#1e40af",    // Navy
  hr: "#14b8a6",         // Teal
  admin: "#64748b",      // Graphite
  reports: "#ec4899",    // Pink
  support: "#0ea5e9"     // Sky Blue
};
```

These colors help users visually identify modules while maintaining overall theme consistency.

## API Endpoints

### Get All Custom Themes
```
GET /api/themes
Response: { ok: true, themes: [...] }
```

### Get Current Theme Settings
```
GET /api/themes/current
Response: { 
  ok: true, 
  themeSettings: {
    theme: "classicEnterprise",
    lightModeEnabled: true,
    darkModeEnabled: true,
    allowUserSwitch: true,
    defaultMode: "light"
  }
}
```

### Apply Theme
```
POST /api/themes/apply
Body: {
  themeId: "modernBlue",
  lightModeEnabled: true,
  darkModeEnabled: true,
  allowUserSwitch: true,
  defaultMode: "light"
}
Response: { ok: true, message: "Theme applied successfully" }
```

### Create Custom Theme
```
POST /api/themes/custom
Body: {
  themeId: "custom_123",
  name: "My Custom Theme",
  lightColors: { primary: "#000000", ... },
  darkColors: { primary: "#ffffff", ... }
}
Response: { ok: true, theme: {...} }
```

### Delete Custom Theme
```
DELETE /api/themes/custom/custom_123
Response: { ok: true, message: "Theme deleted" }
```

## Theme Structure

### Theme Object
```javascript
{
  id: "classicEnterprise",
  name: "Classic Enterprise",
  category: "Professional",
  description: "Traditional corporate theme...",
  light: {
    primary: "#1e40af",
    secondary: "#475569",
    accent: "#3b82f6",
    background: "#f8fafc",
    surface: "#ffffff",
    sidebar: "#1e293b",
    topbar: "#ffffff",
    formBg: "#ffffff",
    fieldBorder: "#cbd5e1",
    fieldFocusBorder: "#3b82f6",
    buttonColor: "#1e40af",
    buttonHoverColor: "#1e3a8a",
    tableHeader: "#f1f5f9",
    tableRowHover: "#f8fafc",
    divider: "#e2e8f0",
    highlighter: "#fef3c7",
    success: "#16a34a",
    warning: "#ea580c",
    error: "#dc2626",
    info: "#0284c7",
    text: "#1e293b",
    mutedText: "#64748b",
    border: "#cbd5e1",
    shadowColor: "rgba(0, 0, 0, 0.1)",
    borderRadius: "0.5rem",
    borderThickness: "1px",
    cardShadow: "0 1px 3px rgba(0, 0, 0, 0.1)",
  },
  dark: {
    // Complete dark mode color set
    ...
  }
}
```

## Best Practices

1. **Test Before Applying**: Always preview a theme before applying it to ensure it fits your organization's needs

2. **Consistency**: Use the built-in module accent colors to maintain consistency across the application

3. **Accessibility**: Consider your team's working environment:
   - **Night Shift**: Use dark themes
   - **Long Hours**: Use softer, less eye-straining themes
   - **Accessibility**: Use High Contrast theme for vision-impaired users

4. **Branding**: Create custom themes that match your organization's branding and color scheme

5. **Testing**: After applying a new theme:
   - Check all modules load correctly
   - Verify text contrast and readability
   - Test forms and data entry
   - Confirm buttons are clearly visible
   - Check tables and lists display properly

## Examples

### Example 1: Tech Startup
Use **Modern Blue** for a contemporary, tech-forward appearance with vibrant blues and gradients.

### Example 2: Manufacturing Company
Use **Manufacturing Steel** for a robust, industrial aesthetic appropriate for factory environments.

### Example 3: Healthcare Organization
Use **Corporate Green** for trust and calm, appropriate for healthcare settings.

### Example 4: Custom Branding
Create a **Custom Theme** that matches your company colors and branding guidelines.

## Troubleshooting

**Theme not applying?**
- Clear browser cache (Ctrl+Shift+Delete)
- Hard refresh the page (Ctrl+Shift+R)
- Check browser console for errors

**Colors look wrong?**
- Verify color hex codes are correct
- Check light vs. dark mode is set correctly
- Test in different browsers

**Performance issues?**
- Themes are lightweight and shouldn't cause performance issues
- Check your network connection
- Restart the server if needed

## Future Enhancements

Potential future improvements:
- Theme import/export as JSON
- Theme marketplace/sharing
- Component-level theme overrides
- Animation and transition settings
- Accessibility audit per theme
- Theme analytics and usage tracking

## Support

For issues or feature requests, contact the development team or file an issue in the project repository.

---

**Last Updated**: June 2026
**Version**: 1.0
**Author**: Veraglo ERP Development Team
