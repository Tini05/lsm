const Sidebar = ({ t, selected, onSelect, onLogout, onLogin, onClose, user }) => {
  const navItems = [
    { id: "main", label: t("homepage") || "Home", icon: "🏠" },
    ...(user ? [
      { id: "myListings", label: t("myListings") || "My Listings", icon: "📂" },
      { id: "account", label: t("account") || "Account", icon: "👤" },
    ] : []),
    { id: "allListings", label: t("explore") || "Explore", icon: "🧭" },
  ];

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header">
        <div className="sidebar-header-top">
          <div className="sidebar-header-content">
            <h3 className="sidebar-title">{t("dashboard") || "Menu"}</h3>
            <p className="sidebar-subtitle">{t("manageListings") || "Navigate your dashboard"}</p>
          </div>
          <button className="sidebar-close-btn" onClick={onClose} aria-label="Close menu">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="18" y1="6" x2="6" y2="18"></line>
              <line x1="6" y1="6" x2="18" y2="18"></line>
            </svg>
          </button>
        </div>
      </div>

      <div className="sidebar-nav">
        {navItems.map((item) => (
          <button
            key={item.id}
            className={`sidebar-btn ${selected === item.id ? "active" : ""}`}
            onClick={() => onSelect(item.id)}
          >
            <span className="sidebar-icon">{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
            {selected === item.id && (
              <span className="sidebar-active-indicator">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12"></polyline>
                </svg>
              </span>
            )}
          </button>
        ))}
      </div>

      <div className="sidebar-footer">
        {user ? (
          <button className="sidebar-logout" onClick={onLogout}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path>
              <polyline points="16 17 21 12 16 7"></polyline>
              <line x1="21" y1="12" x2="9" y2="12"></line>
            </svg>
            <span>{t("logout") || "Logout"}</span>
          </button>
        ) : (
          <button className="sidebar-login" onClick={onLogin}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"></path>
              <polyline points="10 17 15 12 10 7"></polyline>
              <line x1="15" y1="12" x2="3" y2="12"></line>
            </svg>
            <span>{t("login") || "Login"}</span>
          </button>
        )}
      </div>
    </div>
  );
};
export default Sidebar;
