const Sidebar = ({ t, selected, onSelect, onLogout }) => {
  const item = (tab, label) => (
    <button
      className={`sidebar-btn ${selected === tab ? "active" : ""}`}
      onClick={() => onSelect(tab)}
    >
      <span className="sidebar-icon">📁</span>
      {label}
    </button>
  );

  return (
    <div className="sidebar-panel">
      <div className="sidebar-header">
        <h3 className="sidebar-title">{t("dashboard")}</h3>
        <p className="sidebar-subtitle">{t("manageListings") || "Manage your listings"}</p>
      </div>

      <div className="sidebar-nav">
        {item("main", t("homepage") || "Home")}
        {item("myListings", t("myListings") || "My Listings")}
        {item("account", t("account") || "Account")}
        {item("allListings", t("explore") || "Explore")}
      </div>

      <div className="sidebar-footer">
        <button className="sidebar-logout" onClick={onLogout}>
          🔒 {t("logout")}
        </button>
      </div>
    </div>
  );
};
export default Sidebar;