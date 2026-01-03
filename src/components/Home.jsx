import React from "react";
import { Link } from "react-router-dom";
import { Helmet } from "react-helmet-async";

const Home = ({
  t,
  user,
  setShowPostForm,
  setForm,
  setShowAuthModal,
  phoneVerifiedCount,
  activeListingCount,
  featuredCategoryOrder,
  mkSpotlightCities,
  featuredCategories,
  categoryIcons,
  setCatFilter,
  setLocFilter,
  navigate,
}) => {
  return (
    <>
      <Helmet>
        <title>{t("appName") || "BizCall"} - {t("homeTitle") || "Local Services Marketplace"}</title>
        <meta name="description" content={t("homeDescription") || "Find trusted local services in North Macedonia. Verified listings, reviews, and easy contact."} />
      </Helmet>
      
      <div className="app-main-content">
        {/* HERO SECTION */}
        <section className="home-hero-simple">
          <h1 className="hero-simple-title">{t("homeSimpleTitle")}</h1>
          <p className="hero-simple-subtitle">{t("homeSimpleSubtitle")}</p>
          <div className="hero-simple-ctas">
            <button
              className="btn btn-primary"
              onClick={() => {
                setShowPostForm(true);
                setForm((f) => ({ ...f, step: 1 }));
              }}
            >
              📝 {t("homeSimpleCtaPost")}
            </button>
            <button
              className="btn btn-outline"
              onClick={() => navigate("/explore")}
            >
              🔍 {t("homeSimpleCtaBrowse")}
            </button>
          </div>
          <p style={{ marginTop: "12px", fontSize: "0.85rem", opacity: 0.9 }}>
            💡 {t("homeSimpleTrustLine")}
          </p>
        </section>

        {/* THREE CARDS */}
        <div className="home-main-grid">
          {/* CARD 1: POPULAR CATEGORIES */}
          <div className="simple-card">
            <h3>🎯 {t("homePopularCategoriesTitle")}</h3>
            <div className="simple-chip-row">
              {featuredCategories.slice(0, 6).map((cat) => (
                <button
                  key={cat}
                  className="simple-chip"
                  onClick={() => {
                    setCatFilter(t(cat));
                    navigate("/explore");
                  }}
                >
                  {categoryIcons[cat]} {t(cat)}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 2: POPULAR CITIES */}
          <div className="simple-card">
            <h3>📍 {t("homePopularCitiesTitle")}</h3>
            <div className="simple-chip-row">
              {mkSpotlightCities.slice(0, 6).map((city) => (
                <button
                  key={city}
                  className="simple-chip"
                  onClick={() => {
                    setLocFilter(city);
                    navigate("/explore");
                  }}
                >
                  📍 {city}
                </button>
              ))}
            </div>
          </div>

          {/* CARD 3: HOW IT WORKS */}
          <div className="simple-card">
            <h3>✨ {t("homeHowItWorksTitle")}</h3>
            <div className="how-it-works-steps">
              {[1, 2, 3].map((step) => (
                <div key={step} style={{ textAlign: "center" }}>
                  <div className="step-number">{step}</div>
                  <p
                    style={{
                      fontSize: "0.85rem",
                      margin: "8px 0",
                      color: "#475569",
                      lineHeight: "1.4",
                    }}
                  >
                    {step === 1
                      ? t("homeHowItWorksStep1")
                      : step === 2
                      ? t("homeHowItWorksStep2")
                      : t("homeHowItWorksStep3")}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* QUICK STATS */}
        <section className="stats-section">
          <h3>📊 {t("homeDigest") || "Live snapshot"}</h3>
          <div className="stats-grid">
            <div className="stat-card">
              <span className="stat-val">{activeListingCount}</span>
              <span className="stat-lbl">{t("listingsLabel")}</span>
            </div>
            <div className="stat-card">
              <span className="stat-val">{phoneVerifiedCount}</span>
              <span className="stat-lbl">{t("phoneVerified")}</span>
            </div>
            <div className="stat-card">
              <span className="stat-val">{mkSpotlightCities.length}</span>
              <span className="stat-lbl">{t("cities")}</span>
            </div>
          </div>
        </section>

        {/* MOMENTUM SECTION */}
        <section className="home-feature-grid">
          <div className="card feature-card feature-card--primary">
            <div className="feature-card__head">
              <p className="eyebrow subtle">{t("getStartedFast")}</p>
              <h2 className="section-title">✨ {t("heroTitle")}</h2>
              <p className="section-subtitle-small">
                {t("spotlightHintHero")}
              </p>
            </div>
            <div className="feature-points">
              <div className="feature-point">
                <div className="feature-icon">🚀</div>
                <div>
                  <h4>{t("submitListing")}</h4>
                  <p>{t("submitListingDesc")}</p>
                </div>
              </div>
              <div className="feature-point">
                <div className="feature-icon">🧭</div>
                <div>
                  <h4>{t("explore")}</h4>
                  <p>{t("exploreHint")}</p>
                </div>
              </div>
              <div className="feature-point">
                <div className="feature-icon">🛡️</div>
                <div>
                  <h4>{t("verified")}</h4>
                  <p>{t("verifiedHint")}</p>
                </div>
              </div>
            </div>
            <div className="feature-actions">
              <button
                className="btn"
                onClick={() => navigate("/explore")}
              >
                🔍 {t("browseMarketplace")}
              </button>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  setShowPostForm(true);
                  setForm((f) => ({ ...f, step: 1 }));
                }}
              >
                ➕ {t("postService")}
              </button>
            </div>
          </div>
        </section>

        {/* VERIFY BANNER */}
        {user && !user.emailVerified && (
          <div className="verify-banner" style={{ marginTop: "2rem" }}>
            <div>
              <strong>{t("verifyYourEmail")}</strong>
              <div className="verify-banner-sub">{t("verifyEmailHint")}</div>
            </div>
            <button
              className="btn btn-ghost small"
              onClick={() => {
                setShowAuthModal(true);
              }}
            >
              {t("verifyYourEmail")}
            </button>
          </div>
        )}
      </div>
    </>
  );
};

export default Home;
