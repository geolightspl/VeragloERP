/* Veraglo ERP — Theme Preview Component */
(function (VG) {

  function ThemePreview({ themeId, lightMode = true }) {
    const THEME_TEMPLATES = VG.THEME_TEMPLATES || {};
    const theme = THEME_TEMPLATES[themeId] || THEME_TEMPLATES.classicEnterprise || { name: "", description: "", light: {}, dark: {} };
  const colors = lightMode ? theme.light : theme.dark;

  return (
    <div style={{
      background: colors.background,
      color: colors.text,
      padding: '24px',
      borderRadius: '8px',
      fontFamily: 'Inter, sans-serif',
      minHeight: '500px',
      border: `1px solid ${colors.border}`,
    }}>
      <div style={{ marginBottom: '20px' }}>
        <h3 style={{
          fontSize: '16px',
          fontWeight: '600',
          marginBottom: '12px',
          color: colors.text,
        }}>
          {theme.name} Preview
        </h3>
        <p style={{
          fontSize: '12px',
          color: colors.mutedText,
          marginBottom: '16px',
        }}>
          {theme.description}
        </p>
      </div>

      {/* Sidebar & Header */}
      <div style={{
        display: 'flex',
        gap: '16px',
        marginBottom: '20px',
        background: colors.surface,
        borderRadius: '4px',
        overflow: 'hidden',
        height: '200px',
        border: `1px solid ${colors.border}`,
      }}>
        {/* Sidebar */}
        <div style={{
          width: '160px',
          background: colors.sidebar,
          padding: '12px',
          color: '#ffffff',
          fontSize: '12px',
          borderRight: `1px solid ${colors.divider}`,
        }}>
          <div style={{ marginBottom: '16px', fontWeight: '600', fontSize: '13px' }}>SELECT MODULE</div>
          <div style={{ marginBottom: '8px', padding: '6px 8px', background: colors.accent, borderRadius: '4px', fontSize: '11px' }}>Sales & CRM</div>
          <div style={{ marginBottom: '6px', padding: '6px 8px', opacity: 0.7 }}>Dashboard</div>
          <div style={{ marginBottom: '6px', padding: '6px 8px', opacity: 0.7 }}>Customers</div>
          <div style={{ marginBottom: '6px', padding: '6px 8px', opacity: 0.7 }}>Enquiries</div>
          <div style={{ marginBottom: '6px', padding: '6px 8px', opacity: 0.7 }}>Reports</div>
        </div>

        {/* Main Content */}
        <div style={{ flex: 1, padding: '12px', display: 'flex', flexDirection: 'column' }}>
          {/* Top Bar */}
          <div style={{
            background: colors.topbar,
            padding: '8px 12px',
            borderRadius: '4px',
            marginBottom: '12px',
            fontSize: '12px',
            fontWeight: '600',
            color: colors.text,
            borderBottom: `2px solid ${colors.accent}`,
          }}>
            Sales & CRM Dashboard
          </div>

          {/* Quick Content */}
          <div style={{ fontSize: '12px', color: colors.mutedText }}>
            <div style={{ marginBottom: '6px' }}>Total Enquiries: <span style={{ fontWeight: '600', color: colors.text }}>24</span></div>
            <div style={{ marginBottom: '6px' }}>Pending Quotations: <span style={{ fontWeight: '600', color: colors.warning }}>5</span></div>
            <div>Active Leads: <span style={{ fontWeight: '600', color: colors.success }}>12</span></div>
          </div>
        </div>
      </div>

      {/* Dashboard Card Example */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '12px',
          color: colors.text,
        }}>Dashboard Card</div>
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '12px',
        }}>
          <div style={{
            background: colors.formBg,
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            borderLeft: `4px solid ${colors.primary}`,
          }}>
            <div style={{ color: colors.mutedText, marginBottom: '4px' }}>Total Sales</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: colors.primary }}>$45,230</div>
          </div>
          <div style={{
            background: colors.formBg,
            padding: '12px',
            borderRadius: '4px',
            fontSize: '12px',
            borderLeft: `4px solid ${colors.success}`,
          }}>
            <div style={{ color: colors.mutedText, marginBottom: '4px' }}>Completed Orders</div>
            <div style={{ fontSize: '18px', fontWeight: '700', color: colors.success }}>123</div>
          </div>
        </div>
      </div>

      {/* Form Field Example */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        padding: '16px',
        marginBottom: '16px',
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '12px',
          color: colors.text,
        }}>Form Field</div>
        <div style={{ marginBottom: '12px' }}>
          <label style={{
            fontSize: '12px',
            fontWeight: '500',
            color: colors.text,
            marginBottom: '6px',
            display: 'block',
          }}>
            Customer Name <span style={{ color: colors.error }}>*</span>
          </label>
          <input
            type="text"
            placeholder="Enter customer name"
            style={{
              width: '100%',
              padding: '8px 12px',
              border: `1px solid ${colors.fieldBorder}`,
              borderRadius: '4px',
              fontSize: '12px',
              background: colors.formBg,
              color: colors.text,
              boxSizing: 'border-box',
            }}
          />
        </div>
      </div>

      {/* Buttons & Status */}
      <div style={{
        background: colors.surface,
        border: `1px solid ${colors.border}`,
        borderRadius: '6px',
        padding: '16px',
      }}>
        <div style={{
          fontSize: '13px',
          fontWeight: '600',
          marginBottom: '12px',
          color: colors.text,
        }}>Buttons & Status Badges</div>
        <div style={{
          display: 'flex',
          gap: '8px',
          flexWrap: 'wrap',
          marginBottom: '12px',
        }}>
          <button style={{
            padding: '6px 12px',
            background: colors.primary,
            color: '#ffffff',
            border: 'none',
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}>
            Save
          </button>
          <button style={{
            padding: '6px 12px',
            background: colors.formBg,
            color: colors.text,
            border: `1px solid ${colors.fieldBorder}`,
            borderRadius: '4px',
            fontSize: '12px',
            fontWeight: '500',
            cursor: 'pointer',
          }}>
            Cancel
          </button>
          <span style={{
            padding: '6px 12px',
            background: colors.success,
            color: '#ffffff',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
          }}>
            ✓ Active
          </span>
          <span style={{
            padding: '6px 12px',
            background: colors.warning,
            color: '#ffffff',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
          }}>
            ⚠ Pending
          </span>
          <span style={{
            padding: '6px 12px',
            background: colors.error,
            color: '#ffffff',
            borderRadius: '12px',
            fontSize: '11px',
            fontWeight: '600',
          }}>
            ✕ Rejected
          </span>
        </div>
      </div>
    </div>
    );
  }

  VG.ThemePreview = ThemePreview;
})(window.VG);
