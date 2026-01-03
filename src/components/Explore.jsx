import React, { useState, useMemo } from "react";
import { Helmet } from "react-helmet-async";
import ListingCard from "./ListingCard";
import ListingsMap from "./ListingsMap";

const Explore = ({
  t,
  listings,
  categories,
  categoryIcons,
  q,
  setQ,
  catFilter,
  setCatFilter,
  locFilter,
  setLocFilter,
  sortBy,
  setSortBy,
  favorites,
  toggleFav,
  handleShareListing,
  getDescriptionPreview,
  getListingStats,
  onSelect,
  showMessage,
}) => {
  const [viewMode, setViewMode] = useState("grid");
  const [filtersOpen, setFiltersOpen] = useState(false);

  // Derive all unique locations for filter
  const allLocations = useMemo(() => {
    const s = new Set();
    listings.forEach((l) => {
      if (l.locationCity) s.add(l.locationCity);
      else if (l.location) s.add(l.location);
    });
    return Array.from(s).sort();
  }, [listings]);

  // Filter logic
  const filtered = useMemo(() => {
    let res = listings.filter((l) => l.status === "verified");

    if (q) {
      const term = q.toLowerCase();
      res = res.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(term) ||
          (l.description || "").toLowerCase().includes(term) ||
          (l.category || "").toLowerCase().includes(term) ||
          (l.location || "").toLowerCase().includes(term) ||
          (l.tags || "").toLowerCase().includes(term)
      );
    }

    if (catFilter) {
      // catFilter might be localized string or key. 
      // The app passes localized string in Home.jsx.
      // We should check if catFilter matches t(l.category) or l.category
      res = res.filter((l) => t(l.category) === catFilter || l.category === catFilter);
    }

    if (locFilter) {
      res = res.filter(
        (l) =>
          (l.locationCity || "").includes(locFilter) ||
          (l.location || "").includes(locFilter)
      );
    }

    // Sorting
    if (sortBy === "newest") {
      res.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } else if (sortBy === "topRated") {
      res.sort((a, b) => (b.avgRating || 0) - (a.avgRating || 0));
    } else if (sortBy === "expiring") {
      res.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
    } else if (sortBy === "az") {
      res.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    }

    return res;
  }, [listings, q, catFilter, locFilter, sortBy, t]);

  const toggleViewMode = () => {
    if (viewMode === "grid") setViewMode("list");
    else if (viewMode === "list") setViewMode("map");
    else setViewMode("grid");
  };

  const getViewIcon = () => {
    if (viewMode === "grid") return "☰";
    if (viewMode === "list") return "🗺️";
    return "⊞";
  };

  const getViewTitle = () => {
    if (viewMode === "grid") return t("switchToListView");
    if (viewMode === "list") return t("switchToMapView");
    return t("switchToGridView");
  };

  return (
    <>
      <Helmet>
        <title>{t("explore")} - {t("appName")}</title>
        <meta name="description" content={t("exploreDescription") || "Browse all local services and listings."} />
      </Helmet>

      <div className="section explore-section-new">
        {/* Simplified Header */}
        <div className="explore-top-bar">
          <div className="explore-header-content">
            <h2 className="explore-page-title">🔍 {t("explore")}</h2>
            <p className="explore-page-subtitle">
              {filtered.length === 0
                ? t("noListingsFound")
                : `${filtered.length} ${filtered.length === 1 ? t("listing") : t("listingsLabel")} ${t("resultsLabel") || "available"}`
              }
            </p>
          </div>
          <div className="explore-top-actions">
            <button
              type="button"
              className="btn btn-ghost view-toggle-btn"
              onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
              title={viewMode === "grid" ? t("switchToListView") : t("switchToGridView")}
            >
              {viewMode === "grid" ? "☰" : "⊞"}
            </button>
            <button
              type="button"
              className="btn btn-ghost filter-toggle-btn-desktop"
              onClick={() => setFiltersOpen((v) => !v)}
              aria-expanded={filtersOpen}
            >
              {filtersOpen ? "✕ " : "🔍 "}
              {t("filters")}
            </button>
          </div>
        </div>

        {/* Active Filters Bar */}
        {(q || catFilter || locFilter) && (
          <div className="active-filters-bar">
            <span className="active-filters-label">{t("activeFilters")}:</span>
            <div className="active-filters-chips">
              {q && (
                <span className="active-filter-chip">
                  {t("search")}: "{q}"
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setQ("")}
                    aria-label={t("removeFilter")}
                  >
                    ✕
                  </button>
                </span>
              )}
              {catFilter && (
                <span className="active-filter-chip">
                  {t("category")}: {catFilter}
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setCatFilter("")}
                    aria-label={t("removeFilter")}
                  >
                    ✕
                  </button>
                </span>
              )}
              {locFilter && (
                <span className="active-filter-chip">
                  {t("location")}: {locFilter}
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setLocFilter("")}
                    aria-label={t("removeFilter")}
                  >
                    ✕
                  </button>
                </span>
              )}
              <button
                type="button"
                className="btn-clear-all-filters"
                onClick={() => {
                  setQ("");
                  setCatFilter("");
                  setLocFilter("");
                  setSortBy("topRated");
                }}
              >
                {t("clearAll")}
              </button>
            </div>
          </div>
        )}

        {/* Mobile Toolbar */}
        <div className="explore-mobile-toolbar">
          <button
            type="button"
            className="btn btn-ghost filter-toggle-btn"
            onClick={() => setFiltersOpen((v) => !v)}
            aria-expanded={filtersOpen}
          >
            {filtersOpen ? "✕ " : "🔍 "}
            {filtersOpen ? t("hideFilters") : t("showFilters")}
          </button>
          <select
            className="select sort-select-mobile"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
          >
            <option value="topRated">{t("sortTopRated")}</option>
            <option value="newest">{t("sortNewest")}</option>
            <option value="expiring">{t("sortExpiring")}</option>
            <option value="az">{t("sortAZ")}</option>
          </select>
          <button
            type="button"
            className="btn btn-ghost view-toggle-btn"
            onClick={() => setViewMode(viewMode === "grid" ? "list" : "grid")}
          >
            {viewMode === "grid" ? "☰" : "⊞"}
          </button>
        </div>

        <div className={`explore-body-new ${filtersOpen ? "filters-open" : "filters-collapsed"}`}>
          {/* FILTER BOTTOM SHEET */}
          {filtersOpen && (
            <>
              <div
                className="filter-sheet-backdrop"
                onClick={() => setFiltersOpen(false)}
                aria-label={t("closeFilters")}
              />
              <div className="filter-sheet-wrapper">
                <div className="filter-sheet-handle" onClick={() => setFiltersOpen(false)}>
                  <div className="filter-sheet-handle-bar"></div>
                </div>
                <div className="filter-sheet-content">
                  <div className="filter-sheet-header">
                    <div className="filter-sheet-header-left">
                      <div className="filter-sheet-icon">🔍</div>
                      <div>
                        <h2 className="filter-sheet-title">{t("filters")}</h2>
                        <p className="filter-sheet-subtitle">{t("filterSubtitle")}</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="filter-sheet-close"
                      onClick={() => setFiltersOpen(false)}
                      aria-label={t("closeFilters")}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="filter-sheet-scroll">
                    <div className="filter-group">
                      <div className="filter-group-header">
                        <span className="filter-group-icon">🔎</span>
                        <span className="filter-group-title">{t("search")}</span>
                      </div>
                      <div className="filter-group-content">
                        <div className="filter-search-box">
                          <input
                            type="search"
                            className="filter-search-input"
                            placeholder={t("searchPlaceholder")}
                            value={q}
                            onChange={(e) => setQ(e.target.value)}
                          />
                          {q && (
                            <button
                              type="button"
                              className="filter-search-clear"
                              onClick={() => setQ("")}
                              aria-label={t("clearSearch")}
                            >
                              ✕
                            </button>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="filter-group">
                      <div className="filter-group-header">
                        <span className="filter-group-icon">📂</span>
                        <span className="filter-group-title">{t("category")}</span>
                      </div>
                      <div className="filter-group-content">
                        <div className="filter-options-grid">
                          {categories.map((cat) => {
                            const label = t(cat);
                            const active = catFilter === label;
                            return (
                              <button
                                key={cat}
                                type="button"
                                className={`filter-option-card ${active ? "is-selected" : ""}`}
                                onClick={() => setCatFilter(active ? "" : label)}
                              >
                                <div className="filter-option-icon">{categoryIcons[cat]}</div>
                                <div className="filter-option-label">{label}</div>
                                {active && (
                                  <div className="filter-option-check">✓</div>
                                )}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    </div>

                    <div className="filter-group">
                      <div className="filter-group-header">
                        <span className="filter-group-icon">📍</span>
                        <span className="filter-group-title">{t("location")}</span>
                      </div>
                      <div className="filter-group-content">
                        <div className="filter-select-wrapper">
                          <select
                            className="filter-select-field"
                            value={locFilter}
                            onChange={(e) => setLocFilter(e.target.value)}
                          >
                            <option value="">{t("allLocations")}</option>
                            {allLocations.map((l) => (
                              <option key={l} value={l}>{l}</option>
                            ))}
                          </select>
                        </div>
                      </div>
                    </div>

                    <div className="filter-group">
                      <div className="filter-group-header">
                        <span className="filter-group-icon">🔄</span>
                        <span className="filter-group-title">{t("sortBy")}</span>
                      </div>
                      <div className="filter-group-content">
                        <div className="filter-select-wrapper">
                          <select
                            className="filter-select-field"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value)}
                          >
                            <option value="topRated">⭐ {t("sortTopRated")}</option>
                            <option value="newest">🆕 {t("sortNewest")}</option>
                            <option value="expiring">⏰ {t("sortExpiring")}</option>
                            <option value="az">🔤 {t("sortAZ")}</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="explore-results-area">
            {viewMode === "map" ? (
               <ListingsMap listings={filtered} t={t} />
            ) : filtered.length > 0 ? (
              <div className={`listing-grid-${viewMode}`}>
                {filtered.map((l) => (
                  <ListingCard
                    key={l.id}
                    l={l}
                    t={t}
                    categoryIcons={categoryIcons}
                    favorites={favorites}
                    toggleFav={toggleFav}
                    handleShareListing={handleShareListing}
                    getDescriptionPreview={getDescriptionPreview}
                    getListingStats={getListingStats}
                    onSelect={onSelect}
                    viewMode={viewMode}
                    showMessage={showMessage}
                  />
                ))}
              </div>
            ) : (
              <div className="explore-empty-state">
                <div className="empty-state-icon">🔍</div>
                <h3 className="empty-state-title">{t("noListingsFound")}</h3>
                <p className="empty-state-text">
                  {q || catFilter || locFilter
                    ? t("tryDifferentFilters")
                    : t("noListingsAvailable")
                  }
                </p>
                {(q || catFilter || locFilter) && (
                  <button
                    className="btn btn-primary"
                    onClick={() => {
                      setQ("");
                      setCatFilter("");
                      setLocFilter("");
                    }}
                  >
                    {t("clearFilters")}
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default Explore;
