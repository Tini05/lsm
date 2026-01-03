import React from "react";
import logo from "../assets/logo.png";
import { Link, useLocation } from "react-router-dom";

const Navbar = ({ t, user, setSidebarOpen, setShowAuthModal, setAuthMode, theme, toggleTheme }) => {
  const location = useLocation();

  const isActive = (path) => {
    return location.pathname === path ? "active" : "";
  };

  return (
    <header className="header">
      <div className="header-inner">
        <button
          className="icon-btn mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label={t("menu") || "Menu"}
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <Link to="/" className="brand">
          <div className="brand-mark">
            <div className="brand-logo-wrap">
              <img src={logo} alt="BizCall logo" className="brand-logo" />
            </div>
          </div>
          <div className="brand-text">
            <h1 className="brand-title">BizCall</h1>
            <p className="brand-tagline">
              {t("community") || "Trusted local services"}
            </p>
          </div>
        </Link>

        <div className="header-actions">
            <button 
                className="btn btn-ghost small theme-toggle" 
                onClick={toggleTheme}
                title={theme === "light" ? t("darkMode") : t("lightMode")}
            >
                {theme === "light" ? "🌙" : "☀️"}
            </button>
            {!user && (
                <button 
                    className="btn btn-ghost small"
                    onClick={() => {
                        setShowAuthModal(true);
                        setAuthMode("login");
                    }}
                >
                    {t("login")}
                </button>
            )}
        </div>
      </div>
    </header>
  );
};

export default Navbar;
