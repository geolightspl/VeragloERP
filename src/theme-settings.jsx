/* Veraglo ERP — Theme Settings Page */
(function (VG) {
  const { useState, useMemo } = React;

  function ThemeSettingsPage() {
    const THEME_TEMPLATES = VG.THEME_TEMPLATES || {};
    const MODULE_ACCENT_COLORS = VG.MODULE_ACCENT_COLORS || {};
    const getAllThemes = VG.getAllThemes || (() => Object.values(THEME_TEMPLATES));
    const ThemePreview = VG.ThemePreview || (() => null);
    const [selectedTheme, setSelectedTheme] = useState('classicEnterprise');
  const [lightMode, setLightMode] = useState(true);
  const [darkModeEnabled, setDarkModeEnabled] = useState(true);
  const [allowUserSwitch, setAllowUserSwitch] = useState(true);
  const [defaultMode, setDefaultMode] = useState('light');
  const [previewMode, setPreviewMode] = useState(true);
  const [customThemes, setCustomThemes] = useState([]);
  const [showCreateCustom, setShowCreateCustom] = useState(false);
  const [newCustomName, setNewCustomName] = useState('');
  const [activeTab, setActiveTab] = useState('templates');

  React.useEffect(() => {
    if (!VG.store) return;
    const ts = (VG.store.settings() || {}).themeSettings || (VG.defaultThemeSettings ? VG.defaultThemeSettings() : null);
    if (!ts) return;
    setSelectedTheme(ts.theme || 'classicEnterprise');
    setLightMode(ts.lightModeEnabled !== false);
    setDarkModeEnabled(ts.darkModeEnabled !== false);
    setAllowUserSwitch(ts.allowUserSwitch !== false);
    setDefaultMode(ts.defaultMode || 'light');
    const customs = VG.store.settings().customThemes || [];
    if (customs.length) setCustomThemes(customs);
  }, []);

  const allThemes = useMemo(() => getAllThemes(), []);
  const categories = useMemo(() => {
    const cats = {};
    allThemes.forEach(t => {
      if (!cats[t.category]) cats[t.category] = [];
      cats[t.category].push(t);
    });
    return cats;
  }, [allThemes]);

  const currentTheme = (VG.resolveThemeDefinition
    ? VG.resolveThemeDefinition(selectedTheme, customThemes)
    : null) || THEME_TEMPLATES[selectedTheme] || THEME_TEMPLATES.classicEnterprise;

  function handleApplyTheme() {
    const settings = {
      theme: selectedTheme,
      lightModeEnabled: lightMode,
      darkModeEnabled,
      allowUserSwitch,
      defaultMode,
      appliedAt: new Date().toISOString(),
    };
    const mode = settings.defaultMode || "light";

    try {
      let applied = null;
      if (VG.applyOrganizationTheme) {
        applied = VG.applyOrganizationTheme(settings, { mode, customThemes });
      }
      if (VG && VG.store && VG.store.saveAdminSettings) {
        VG.store.saveAdminSettings({
          themeSettings: settings,
          theme: {
            ...(VG.store.settings().theme || {}),
            accent: (applied && applied.accent) || (VG.store.settings().theme || {}).accent,
            defaultMode: mode,
          },
        }, "admin");
      }
      if (VG && VG.onOrganizationThemeApplied) VG.onOrganizationThemeApplied(mode);
      if (VG && VG.toast) VG.toast(`Theme "${currentTheme.name}" applied globally`);
      else alert(`Theme "${currentTheme.name}" applied successfully!`);
    } catch (e) {
      console.error("Theme apply failed", e);
      alert("Failed to apply theme: " + e.message);
    }
  }

  function handleDuplicateTheme(themeId) {
    const source = THEME_TEMPLATES[themeId];
    if (source) {
      const newId = `custom_${Date.now()}`;
      const newTheme = JSON.parse(JSON.stringify(source));
      newTheme.id = newId;
      newTheme.name = `${source.name} (Copy)`;
      newTheme.isCustom = true;
      setCustomThemes([...customThemes, newTheme]);
      setSelectedTheme(newId);
    }
  }

  function handleDeleteCustom(themeId) {
    setCustomThemes(customThemes.filter(t => t.id !== themeId));
    if (selectedTheme === themeId) {
      setSelectedTheme('classicEnterprise');
    }
  }

  return (
    <div style={{
      padding: '0',
      background: 'transparent',
      minHeight: 'auto',
      fontFamily: 'var(--vg-font-family, Inter, sans-serif)',
    }}>
      <div style={{ maxWidth: '1400px', margin: '0 auto' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '28px',
            fontWeight: '700',
            marginBottom: '8px',
            color: 'var(--vg-heading)',
          }}>Theme Settings</h1>
          <p style={{
            fontSize: '14px',
            color: 'var(--vg-text-muted)',
            maxWidth: '600px',
          }}>
            Customize the visual appearance of your ERP system with professional themes. Choose from preloaded templates or create custom themes to match your organization's branding and preferences.
          </p>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex',
          gap: '8px',
          marginBottom: '24px',
          borderBottom: '1px solid #e2e8f0',
          paddingBottom: '16px',
        }}>
          <button
            onClick={() => setActiveTab('templates')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'templates' ? '#1e40af' : 'transparent',
              color: activeTab === 'templates' ? '#ffffff' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Preloaded Themes
          </button>
          <button
            onClick={() => setActiveTab('custom')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'custom' ? '#1e40af' : 'transparent',
              color: activeTab === 'custom' ? '#ffffff' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Custom Themes ({customThemes.length})
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            style={{
              padding: '8px 16px',
              background: activeTab === 'settings' ? '#1e40af' : 'transparent',
              color: activeTab === 'settings' ? '#ffffff' : '#64748b',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontSize: '14px',
              fontWeight: '500',
            }}
          >
            Display Settings
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '24px' }}>
          {/* Theme Selector */}
          <div>
            {activeTab === 'templates' && (
              <div style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '20px',
              }}>
                <h2 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '16px',
                  color: '#1e293b',
                }}>Preloaded Themes</h2>

                {Object.entries(categories).map(([category, themes]) => (
                  <div key={category} style={{ marginBottom: '20px' }}>
                    <h3 style={{
                      fontSize: '12px',
                      fontWeight: '600',
                      textTransform: 'uppercase',
                      color: '#64748b',
                      marginBottom: '12px',
                      letterSpacing: '0.5px',
                    }}>{category}</h3>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {themes.map(theme => (
                        <div
                          key={theme.id}
                          onClick={() => setSelectedTheme(theme.id)}
                          style={{
                            padding: '12px',
                            background: selectedTheme === theme.id ? '#ede9fe' : '#f8fafc',
                            border: `2px solid ${selectedTheme === theme.id ? '#6366f1' : '#e2e8f0'}`,
                            borderRadius: '6px',
                            cursor: 'pointer',
                            transition: 'all 0.2s',
                          }}
                        >
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#1e293b',
                            marginBottom: '4px',
                          }}>
                            {theme.name}
                          </div>
                          <div style={{
                            fontSize: '12px',
                            color: '#64748b',
                            marginBottom: '8px',
                          }}>
                            {theme.description}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: '4px',
                            marginTop: '8px',
                          }}>
                            {[
                              theme.light.primary,
                              theme.light.accent,
                              theme.light.success,
                              theme.light.warning,
                              theme.light.error,
                            ].map((color, idx) => (
                              <div
                                key={idx}
                                style={{
                                  width: '24px',
                                  height: '24px',
                                  background: color,
                                  borderRadius: '3px',
                                  border: '1px solid #e2e8f0',
                                }}
                              />
                            ))}
                          </div>
                          <div style={{
                            display: 'flex',
                            gap: '8px',
                            marginTop: '12px',
                          }}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDuplicateTheme(theme.id);
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 12px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: '500',
                              }}
                            >
                              Duplicate
                            </button>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPreviewMode(!previewMode);
                              }}
                              style={{
                                flex: 1,
                                padding: '6px 12px',
                                background: '#f1f5f9',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                fontSize: '12px',
                                cursor: 'pointer',
                                fontWeight: '500',
                              }}
                            >
                              {previewMode ? 'Hide' : 'Show'} Preview
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            {activeTab === 'custom' && (
              <div style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '20px',
              }}>
                <div style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '16px',
                }}>
                  <h2 style={{
                    fontSize: '16px',
                    fontWeight: '600',
                    color: '#1e293b',
                  }}>Custom Themes</h2>
                  <button
                    onClick={() => setShowCreateCustom(!showCreateCustom)}
                    style={{
                      padding: '6px 12px',
                      background: '#1e40af',
                      color: '#ffffff',
                      border: 'none',
                      borderRadius: '4px',
                      cursor: 'pointer',
                      fontSize: '12px',
                      fontWeight: '500',
                    }}
                  >
                    + New Theme
                  </button>
                </div>

                {showCreateCustom && (
                  <div style={{
                    background: '#f8fafc',
                    padding: '16px',
                    borderRadius: '6px',
                    marginBottom: '16px',
                    border: '1px solid #e2e8f0',
                  }}>
                    <input
                      type="text"
                      placeholder="Enter theme name..."
                      value={newCustomName}
                      onChange={(e) => setNewCustomName(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        marginBottom: '12px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                      }}
                    />
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: '#1e40af',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Create from Scratch
                      </button>
                      <button
                        onClick={() => setShowCreateCustom(false)}
                        style={{
                          flex: 1,
                          padding: '8px 12px',
                          background: '#f1f5f9',
                          color: '#1e293b',
                          border: '1px solid #cbd5e1',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '12px',
                          fontWeight: '500',
                        }}
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}

                {customThemes.length === 0 ? (
                  <div style={{
                    padding: '32px 16px',
                    textAlign: 'center',
                    color: '#64748b',
                  }}>
                    <p style={{ fontSize: '13px', marginBottom: '12px' }}>No custom themes yet.</p>
                    <p style={{ fontSize: '12px' }}>Duplicate a preloaded theme or create a new one to get started.</p>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {customThemes.map(theme => (
                      <div
                        key={theme.id}
                        onClick={() => setSelectedTheme(theme.id)}
                        style={{
                          padding: '12px',
                          background: selectedTheme === theme.id ? '#ede9fe' : '#f8fafc',
                          border: `2px solid ${selectedTheme === theme.id ? '#6366f1' : '#e2e8f0'}`,
                          borderRadius: '6px',
                          cursor: 'pointer',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{
                            fontSize: '13px',
                            fontWeight: '600',
                            color: '#1e293b',
                          }}>
                            {theme.name}
                          </div>
                        </div>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteCustom(theme.id);
                          }}
                          style={{
                            padding: '4px 8px',
                            background: '#fee2e2',
                            color: '#dc2626',
                            border: 'none',
                            borderRadius: '3px',
                            cursor: 'pointer',
                            fontSize: '11px',
                            fontWeight: '500',
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {activeTab === 'settings' && (
              <div style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                padding: '20px',
              }}>
                <h2 style={{
                  fontSize: '16px',
                  fontWeight: '600',
                  marginBottom: '20px',
                  color: '#1e293b',
                }}>Display Settings</h2>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                  {/* Light/Dark Mode */}
                  <div>
                    <label style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '12px',
                      display: 'block',
                    }}>Light Mode</label>
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                    }}>
                      <input
                        type="checkbox"
                        checked={lightMode}
                        onChange={(e) => setLightMode(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Enable light mode</span>
                    </div>
                  </div>

                  <div>
                    <label style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '12px',
                      display: 'block',
                    }}>Dark Mode</label>
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                    }}>
                      <input
                        type="checkbox"
                        checked={darkModeEnabled}
                        onChange={(e) => setDarkModeEnabled(e.target.checked)}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Enable dark mode</span>
                    </div>
                  </div>

                  <div>
                    <label style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '12px',
                      display: 'block',
                    }}>User Switch</label>
                    <div style={{
                      display: 'flex',
                      gap: '12px',
                      alignItems: 'center',
                    }}>
                      <input
                        type="checkbox"
                        checked={allowUserSwitch}
                        onChange={(e) => setAllowUserSwitch(e.target.checked)}
                        disabled={!darkModeEnabled && !lightMode}
                        style={{ width: '16px', height: '16px', cursor: 'pointer' }}
                      />
                      <span style={{ fontSize: '12px', color: '#64748b' }}>Allow users to switch between light and dark modes</span>
                    </div>
                  </div>

                  <div>
                    <label style={{
                      fontSize: '13px',
                      fontWeight: '600',
                      color: '#1e293b',
                      marginBottom: '12px',
                      display: 'block',
                    }}>Default Mode</label>
                    <select
                      value={defaultMode}
                      onChange={(e) => setDefaultMode(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px 12px',
                        border: '1px solid #cbd5e1',
                        borderRadius: '4px',
                        fontSize: '12px',
                        boxSizing: 'border-box',
                      }}
                    >
                      {lightMode && <option value="light">Light Mode</option>}
                      {darkModeEnabled && <option value="dark">Dark Mode</option>}
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Preview */}
          <div>
            {previewMode && (
              <div style={{
                background: '#ffffff',
                borderRadius: '8px',
                border: '1px solid #e2e8f0',
                overflow: 'hidden',
              }}>
                <ThemePreview themeId={selectedTheme} lightMode={lightMode} />
              </div>
            )}

            {/* Action Buttons */}
            <div style={{
              background: '#ffffff',
              borderRadius: '8px',
              border: '1px solid #e2e8f0',
              padding: '20px',
              marginTop: '16px',
              display: 'flex',
              gap: '12px',
            }}>
              <button
                onClick={handleApplyTheme}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: '#1e40af',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Apply Theme
              </button>
              <button
                onClick={handleApplyTheme}
                style={{
                  flex: 1,
                  padding: '12px 20px',
                  background: '#f1f5f9',
                  color: '#1e293b',
                  border: '1px solid #cbd5e1',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontSize: '13px',
                  fontWeight: '600',
                }}
              >
                Save as Default
              </button>
            </div>

            {/* Info Box */}
            <div style={{
              background: '#ede9fe',
              border: '1px solid #c7d2fe',
              borderRadius: '6px',
              padding: '16px',
              marginTop: '16px',
              fontSize: '12px',
              color: '#4338ca',
            }}>
              <div style={{ fontWeight: '600', marginBottom: '8px' }}>💡 Tip</div>
              <div>The selected theme will be applied globally across all modules, dashboards, forms, and pages. Users can optionally choose their own theme if allowed in settings.</div>
            </div>
          </div>
        </div>

        {/* Module Accent Colors */}
        <div style={{
          background: '#ffffff',
          borderRadius: '8px',
          border: '1px solid #e2e8f0',
          padding: '20px',
          marginTop: '24px',
        }}>
          <h2 style={{
            fontSize: '16px',
            fontWeight: '600',
            marginBottom: '16px',
            color: '#1e293b',
          }}>Module Accent Colors</h2>
          <p style={{
            fontSize: '12px',
            color: '#64748b',
            marginBottom: '16px',
          }}>Each module has a distinctive accent color to help users visually identify modules while maintaining the overall theme consistency.</p>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: '16px',
          }}>
            {Object.entries(MODULE_ACCENT_COLORS).map(([module, color]) => (
              <div
                key={module}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  padding: '12px',
                  background: '#f8fafc',
                  borderRadius: '6px',
                  border: '1px solid #e2e8f0',
                }}
              >
                <div
                  style={{
                    width: '40px',
                    height: '40px',
                    background: color,
                    borderRadius: '4px',
                    border: '1px solid #cbd5e1',
                  }}
                />
                <div>
                  <div style={{
                    fontSize: '12px',
                    fontWeight: '600',
                    color: '#1e293b',
                    textTransform: 'capitalize',
                  }}>
                    {module.replace(/([A-Z])/g, ' $1').trim()}
                  </div>
                  <div style={{
                    fontSize: '11px',
                    color: '#64748b',
                    fontFamily: 'monospace',
                  }}>
                    {color}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
    );
  }

  VG.ThemeSettingsPage = ThemeSettingsPage;
})(window.VG);
