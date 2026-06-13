/* Theme System - Color Reference & Palette Guide */

export const THEME_COLOR_REFERENCE = {
  classicEnterprise: {
    lightPrimary: "#1e40af",
    darkPrimary: "#60a5fa",
    visualIdentity: "Traditional corporate - Navy + Grey",
    bestFor: ["Financial Services", "Legal", "Government", "Enterprises"],
  },
  modernBlue: {
    lightPrimary: "#0066cc",
    darkPrimary: "#0099ff",
    visualIdentity: "Contemporary tech - Vibrant Blues",
    bestFor: ["Tech Companies", "Startups", "Innovation Labs", "SaaS"],
  },
  premiumGraphite: {
    lightPrimary: "#3d3d3d",
    darkPrimary: "#bb86fc",
    visualIdentity: "Sleek & sophisticated - Graphite + Purple",
    bestFor: ["Design Agencies", "Premium Brands", "Luxury Goods", "Consultancies"],
  },
  freshSunlight: {
    lightPrimary: "#f59e0b",
    darkPrimary: "#fbbf24",
    visualIdentity: "Bright & energetic - Sunny Yellows",
    bestFor: ["Creative Agencies", "Marketing", "Education", "Wellness"],
  },
  corporateGreen: {
    lightPrimary: "#059669",
    darkPrimary: "#10b981",
    visualIdentity: "Calm & trustworthy - Greens",
    bestFor: ["Healthcare", "Finance", "Environment", "Sustainability"],
  },
  manufacturingSteel: {
    lightPrimary: "#4b5563",
    darkPrimary: "#9ca3af",
    visualIdentity: "Robust industrial - Steel Greys + Blues",
    bestFor: ["Manufacturing", "Engineering", "Operations", "Logistics"],
  },
  minimalWhite: {
    lightPrimary: "#374151",
    darkPrimary: "#e5e7eb",
    visualIdentity: "Clean & minimal - White + Greys",
    bestFor: ["Focus Work", "Writing", "Analysis", "Administration"],
  },
  executiveDark: {
    lightPrimary: "#1e3a8a",
    darkPrimary: "#1e3a8a",
    visualIdentity: "Premium dark - Deep Navy",
    bestFor: ["Executive Teams", "Night Work", "Premium Environments"],
  },
  softIvory: {
    lightPrimary: "#8b6f47",
    darkPrimary: "#d4a574",
    visualIdentity: "Warm & comfortable - Ivories + Warm Greys",
    bestFor: ["Extended Work Sessions", "Warm Environments", "Comfort Focus"],
  },
  techIndigo: {
    lightPrimary: "#4f46e5",
    darkPrimary: "#818cf8",
    visualIdentity: "Modern tech - Indigoes + Purples",
    bestFor: ["Software Companies", "IT Departments", "Data Analytics"],
  },
  warmOffice: {
    lightPrimary: "#d97706",
    darkPrimary: "#fb923c",
    visualIdentity: "Warm & welcoming - Oranges + Warm Neutrals",
    bestFor: ["Collaborative Spaces", "Support Teams", "HR Departments"],
  },
  industrialGrey: {
    lightPrimary: "#4a5568",
    darkPrimary: "#a0aec0",
    visualIdentity: "Professional grey - Greys + Blues",
    bestFor: ["Industrial Facilities", "Operations", "Quality Control"],
  },
  luxuryNavy: {
    lightPrimary: "#001f3f",
    darkPrimary: "#5dade2",
    visualIdentity: "Premium luxury - Deep Navy + Gold",
    bestFor: ["Luxury Brands", "Finance", "Premium Services"],
  },
  highContrastAccessibility: {
    lightPrimary: "#000000",
    darkPrimary: "#ffffff",
    visualIdentity: "High contrast - Black + White + Bold Colors",
    bestFor: ["Accessibility Requirements", "Vision Impairment", "Clear Focus"],
  },
};

/* Color Usage Matrix */
export const COLOR_USAGE_GUIDE = {
  primary: "Buttons, main navigation, active states, key actions",
  secondary: "Alternative buttons, secondary information, less prominent elements",
  accent: "Highlights, focus indicators, alerts, important notifications",
  success: "Positive feedback, checkmarks, success messages, 'Go' actions",
  warning: "Cautions, pending states, 'Attention needed', orange alerts",
  error: "Errors, deletions, failures, 'Stop' actions, red alerts",
  info: "Information, hints, light blue alerts, helpful notifications",
  text: "Primary text content, headers, body text",
  mutedText: "Secondary text, helper text, descriptions, disabled text",
  background: "Page background, base layer",
  surface: "Cards, panels, form containers, interactive surfaces",
  sidebar: "Sidebar background, navigation areas",
  topbar: "Header/topbar areas, top navigation",
  formBg: "Form field backgrounds, input areas",
  border: "Borders, dividers, separators, edges",
  divider: "Section separators, list dividers",
  highlighter: "Highlighted/selected rows, emphasized content",
};

/* Accessibility Considerations */
export const ACCESSIBILITY_NOTES = {
  contrastRatio: {
    level_AA: "Minimum 4.5:1 for normal text",
    level_AAA: "Enhanced 7:1 for normal text",
    largeText: "Minimum 3:1 for large text (18pt+)",
  },
  colorBlindness: {
    protanopia: "Avoid red-green combinations",
    deuteranopia: "Avoid red-green combinations (more common)",
    tritanopia: "Avoid blue-yellow combinations",
    achromatopsia: "Avoid relying on color alone",
  },
  recommendations: [
    "Test with color blindness simulator before deploying",
    "Never use color as the only way to convey information",
    "Use patterns, icons, or text labels alongside colors",
    "Ensure focus indicators are clearly visible",
    "Use high contrast themes for users with low vision",
    "Support keyboard-only navigation",
  ],
};

/* Theme Selection Decision Matrix */
export const THEME_DECISION_MATRIX = {
  byIndustry: {
    "Technology/SaaS": ["modernBlue", "techIndigo"],
    "Finance/Banking": ["classicEnterprise", "luxuryNavy"],
    "Healthcare/Wellness": ["corporateGreen", "softIvory"],
    "Manufacturing": ["manufacturingSteel", "industrialGrey"],
    "Creative/Marketing": ["freshSunlight", "premiumGraphite"],
    "Logistics/Operations": ["manufacturingSteel", "warmOffice"],
    "Government": ["classicEnterprise", "highContrastAccessibility"],
    "Legal": ["classicEnterprise", "luxuryNavy"],
  },
  byWorkStyle: {
    "Night shift": ["executiveDark", "highContrastAccessibility"],
    "Long working hours": ["softIvory", "executiveDark"],
    "Focus/concentration": ["minimalWhite", "softIvory"],
    "Collaborative": ["warmOffice", "freshSunlight"],
    "High-stress": ["corporateGreen", "softIvory"],
    "Accessibility needs": ["highContrastAccessibility", "classicEnterprise"],
  },
  byTeamSize: {
    "Small startup": ["modernBlue", "techIndigo"],
    "Medium company": ["classicEnterprise", "corporateGreen"],
    "Large enterprise": ["premiumGraphite", "luxuryNavy"],
    "Global organization": ["classicEnterprise", "minimalWhite"],
  },
  byBranding: {
    "Blue brand": ["modernBlue", "classicEnterprise", "techIndigo"],
    "Green brand": ["corporateGreen", "freshSunlight"],
    "Red/Orange brand": ["freshSunlight", "warmOffice"],
    "Black/Grey brand": ["premiumGraphite", "manufacturingSteel", "industrialGrey"],
    "Multi-color brand": ["premiumGraphite", "minimalWhite"],
  },
};

/* Theme Performance Notes */
export const PERFORMANCE_CHARACTERISTICS = {
  lightModes: {
    eyeStrain: "Medium at night, low during day",
    batteryUsage: "Higher (more bright pixels)",
    readability: "Better in well-lit environments",
  },
  darkModes: {
    eyeStrain: "Low at night, medium during day",
    batteryUsage: "Lower on OLED screens",
    readability: "Better in low-light environments",
  },
};

/* Quick Theme Recommendations */
export const QUICK_RECOMMENDATIONS = {
  firstTime: "classicEnterprise - Professional, neutral, works in any context",
  modern: "modernBlue - Contemporary, tech-forward, vibrant",
  accessible: "highContrastAccessibility - Best for accessibility needs",
  comfortable: "softIvory - Easy on eyes for extended work",
  focus: "minimalWhite - Distraction-free, minimal aesthetic",
  luxury: "luxuryNavy - Premium, upscale, sophisticated",
  industrial: "manufacturingSteel - Robust, practical, professional",
  creative: "freshSunlight - Energetic, inspiring, positive",
};
