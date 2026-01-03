import React, { useMemo } from "react";
import { Helmet } from "react-helmet-async";

const MyListings = ({
  t,
  myListingsRaw,
  myListingsStatusFilter,
  setMyListingsStatusFilter,
  myListingsExpiryFilter,
  setMyListingsExpiryFilter,
  myListingsSort,
  setMyListingsSort,
  myListingsSearch,
  setMyListingsSearch,
  handleShareListing,
  setExtendTarget,
  setExtendPlan,
  setPaymentModalOpen,
  setPaymentIntent,
  setEditingListing,
  setEditForm,
  deleteListing,
  myVerifiedCount,
  myPendingCount,
  priceMap,
  showMessage,
}) => {
  // Helper to calculate days until expiry
  const getDaysUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const diff = expiresAt - Date.now();
    return Math.ceil(diff / (1000 * 60 * 60 * 24));
  };

  const myListingsFiltered = useMemo(() => {
    let filtered = [...myListingsRaw];
    
    // Status filter
    if (myListingsStatusFilter === "verified") {
      filtered = filtered.filter((l) => l.status === "verified");
    } else if (myListingsStatusFilter === "pending") {
      filtered = filtered.filter((l) => l.status !== "verified");
    }
    
    // Expiry filter
    if (myListingsExpiryFilter === "expiring") {
      filtered = filtered.filter((l) => {
        const days = getDaysUntilExpiry(l.expiresAt);
        return days !== null && days > 0 && days <= 7;
      });
    } else if (myListingsExpiryFilter === "expired") {
      filtered = filtered.filter((l) => {
        const days = getDaysUntilExpiry(l.expiresAt);
        return days !== null && days <= 0;
      });
    } else if (myListingsExpiryFilter === "active") {
      filtered = filtered.filter((l) => {
        const days = getDaysUntilExpiry(l.expiresAt);
        return days === null || days > 7;
      });
    }
    
    // Search filter
    if (myListingsSearch.trim()) {
      const term = myListingsSearch.trim().toLowerCase();
      filtered = filtered.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(term) ||
          (l.description || "").toLowerCase().includes(term) ||
          (l.location || "").toLowerCase().includes(term) ||
          (l.category || "").toLowerCase().includes(term)
      );
    }
    
    // Sort
    if (myListingsSort === "newest") {
      filtered.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (myListingsSort === "oldest") {
      filtered.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    } else if (myListingsSort === "expiring") {
      filtered.sort((a, b) => {
        const aDays = getDaysUntilExpiry(a.expiresAt);
        const bDays = getDaysUntilExpiry(b.expiresAt);
        if (aDays === null && bDays === null) return 0;
        if (aDays === null) return 1;
        if (bDays === null) return -1;
        return aDays - bDays;
      });
    } else if (myListingsSort === "az") {
      filtered.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }
    
    return filtered;
  }, [myListingsRaw, myListingsStatusFilter, myListingsExpiryFilter, myListingsSort, myListingsSearch]);

  return (
    <>
      <Helmet>
        <title>{t("myListings")} - {t("appName")}</title>
      </Helmet>

      <div className="section my-listings-section">
        <header className="my-listings-header">
          <div className="my-listings-title-row">
            <h2 className="section-title">📂 {t("myListings")}</h2>
            <div className="my-listings-stats">
              <span className="stat-badge verified">
                ✅ {myVerifiedCount} {t("verified")}
              </span>
              <span className="stat-badge pending">
                ⏳ {myPendingCount} {t("pending")}
              </span>
            </div>
          </div>
          <p className="section-subtitle">
            {t("manageListingsHint") || "Manage your active listings, extensions, and edits."}
          </p>
        </header>

        {/* Dashboard Toolbar */}
        <div className="dashboard-toolbar">
          <div className="toolbar-row">
            <div className="toolbar-group">
              <input 
                type="search" 
                className="toolbar-search" 
                placeholder={t("searchPlaceholder") || "Search..."}
                value={myListingsSearch}
                onChange={(e) => setMyListingsSearch(e.target.value)}
              />
            </div>
            <div className="toolbar-group">
              <select 
                className="toolbar-select"
                value={myListingsStatusFilter}
                onChange={(e) => setMyListingsStatusFilter(e.target.value)}
              >
                <option value="all">{t("allStatuses") || "All Statuses"}</option>
                <option value="verified">✅ {t("verified")}</option>
                <option value="pending">⏳ {t("pending")}</option>
              </select>
              <select 
                className="toolbar-select"
                value={myListingsExpiryFilter}
                onChange={(e) => setMyListingsExpiryFilter(e.target.value)}
              >
                <option value="all">{t("allExpiries") || "All Expiries"}</option>
                <option value="active">🟢 {t("active") || "Active"}</option>
                <option value="expiring">🟠 {t("expiringSoon") || "Expiring Soon"}</option>
                <option value="expired">🔴 {t("expired") || "Expired"}</option>
              </select>
              <select 
                className="toolbar-select"
                value={myListingsSort}
                onChange={(e) => setMyListingsSort(e.target.value)}
              >
                <option value="newest">{t("sortNewest")}</option>
                <option value="oldest">{t("sortOldest") || "Oldest"}</option>
                <option value="expiring">{t("sortExpiring")}</option>
                <option value="az">{t("sortAZ")}</option>
              </select>
            </div>
          </div>
        </div>

        {myListingsFiltered.length === 0 ? (
          <div className="empty-dashboard-state">
            <div className="empty-icon">📂</div>
            <h3>{t("noListingsFound")}</h3>
            <p>{t("noListingsAvailable")}</p>
          </div>
        ) : (
          <div className="my-listings-grid">
            {myListingsFiltered.map((l) => {
              const daysLeft = getDaysUntilExpiry(l.expiresAt);
              const isExpired = daysLeft !== null && daysLeft <= 0;
              const isExpiringSoon = daysLeft !== null && daysLeft > 0 && daysLeft <= 7;

              return (
                <div key={l.id} className={`my-listing-card ${isExpired ? "expired" : ""}`}>
                  <div className="my-listing-header">
                    <div className="my-listing-title-group">
                      <h3 className="my-listing-title">{l.name}</h3>
                      <span className={`status-pill ${l.status === "verified" ? "is-verified" : "is-pending"}`}>
                        {l.status === "verified" ? "✅ " + t("verified") : "⏳ " + t("pending")}
                      </span>
                    </div>
                    {l.offerprice && <div className="my-listing-price">{l.offerprice}</div>}
                  </div>

                  <div className="my-listing-info">
                    <div className="info-row">
                      <span>📍 {l.location}</span>
                      <span>🏷️ {t(l.category) || l.category}</span>
                    </div>
                    <div className="info-row">
                      <span>📞 {l.contact}</span>
                      <span>👁️ {l.views || 0} {t("views") || "views"}</span>
                    </div>
                  </div>

                  {l.expiresAt && (
                    <div className={`expiry-alert ${isExpired ? "is-expired" : isExpiringSoon ? "is-warning" : "is-good"}`}>
                      {isExpired 
                        ? `🔴 ${t("expired")}` 
                        : isExpiringSoon 
                          ? `🟠 ${t("expiresIn")} ${daysLeft} ${t("days")}` 
                          : `🟢 ${t("expiresIn")} ${daysLeft} ${t("days")}`
                      }
                      <span className="expiry-date">({new Date(l.expiresAt).toLocaleDateString()})</span>
                    </div>
                  )}

                  <div className="my-listing-actions">
                    <button
                      className="action-btn btn-share"
                      onClick={() => handleShareListing(l)}
                      title={t("share")}
                    >
                      🔗 {t("share")}
                    </button>
                    <button
                      className="action-btn btn-edit"
                      onClick={() => {
                        setEditingListing(l);
                        setEditForm({ ...l });
                      }}
                      title={t("edit")}
                    >
                      ✏️ {t("edit")}
                    </button>
                    <button
                      className="action-btn btn-extend"
                      onClick={() => {
                        setExtendTarget(l);
                        setExtendPlan("1");
                        setPaymentModalOpen(true);
                        setPaymentIntent({
                          type: "extend",
                          orderID: null,
                          amount: priceMap["1"], // default
                          listingId: l.id,
                        });
                      }}
                      title={t("extend")}
                    >
                      📅 {t("extend")}
                    </button>
                    <button
                      className="action-btn btn-delete"
                      onClick={() => {
                        if (window.confirm(t("confirmDelete") || "Are you sure?")) {
                          deleteListing(l.id);
                          showMessage(t("listingDeleted") || "Listing deleted", "success");
                        }
                      }}
                      title={t("delete")}
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </>
  );
};

export default MyListings;
