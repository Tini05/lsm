import React from "react";
import { Helmet } from "react-helmet-async";

const Account = ({
  t,
  user,
  userProfile,
  myListingsCount,
  handleChangeEmail,
  emailForm,
  setEmailForm,
  savingEmail,
  handleChangePassword,
  passwordForm,
  setPasswordForm,
  savingPassword,
  setShowPostForm,
  navigate,
}) => {
  return (
    <>
      <Helmet>
        <title>{t("account")} - {t("appName")}</title>
      </Helmet>
      
      <div className="section account-section-enhanced">
        <div className="account-container">
          <header className="account-header">
            <h2 className="account-title">
              <span className="account-title-icon">👤</span> {t("account")}
            </h2>
            <p className="account-subtitle">
              {t("manageProfile") || "Manage your profile, security, and listings."}
            </p>
          </header>

          <div className="account-grid">
            <div className="account-column">
              {/* Profile Card */}
              <div className="card account-card-enhanced account-profile-card">
                <div className="profile-header">
                  <div className="profile-avatar">
                    {(user.email || "U")[0].toUpperCase()}
                  </div>
                  <div className="profile-info">
                    <h3 className="profile-email">{user.email}</h3>
                    <p className="profile-meta">
                      {userProfile?.phone || t("noPhone") || "No phone linked"}
                    </p>
                    <span className="badge profile-badge">
                      {user.emailVerified ? `✅ ${t("verified")}` : `⚠️ ${t("notVerified")}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Quick Links */}
              <div className="card account-card-enhanced account-quick-links">
                <h3 className="account-card-title">⚡ {t("quickLinks")}</h3>
                <div className="quick-links-list">
                  <button
                    className="account-quick-link-item"
                    onClick={() => navigate("/my-listings")}
                  >
                    <span className="quick-link-icon">📂</span>
                    <div className="quick-link-content">
                      <p className="quick-link-title">{t("myListings")}</p>
                      <p className="quick-link-subtitle">
                        {myListingsCount} {t("activeListings")}
                      </p>
                    </div>
                    <span className="quick-link-arrow">→</span>
                  </button>
                  <button
                    className="account-quick-link-item"
                    onClick={() => setShowPostForm(true)}
                  >
                    <span className="quick-link-icon">➕</span>
                    <div className="quick-link-content">
                      <p className="quick-link-title">{t("submitListing")}</p>
                      <p className="quick-link-subtitle">{t("createListingHint")}</p>
                    </div>
                    <span className="quick-link-arrow">→</span>
                  </button>
                </div>
              </div>
            </div>

            <div className="account-column">
              {/* Security Settings Card */}
              <div className="card account-card-enhanced account-security-section">
                <div className="account-card-header">
                  <h3 className="account-card-title">🔒 {t("securitySettings")}</h3>
                  <p className="account-card-subtitle">{t("securitySettingsText")}</p>
                </div>

                {/* Change Email Form */}
                <div className="account-form-section">
                  <div className="account-form-section-header">
                    <h4 className="account-form-section-title">✉️ {t("changeEmail")}</h4>
                    <p className="account-form-section-desc">{t("updateEmailDesc")}</p>
                  </div>
                  <form className="account-form-enhanced" onSubmit={handleChangeEmail}>
                    <div className="account-form-field">
                      <label className="account-form-label">{t("newEmail")}</label>
                      <input
                        type="email"
                        className="input account-form-input"
                        value={emailForm.newEmail}
                        onChange={(e) => setEmailForm((f) => ({ ...f, newEmail: e.target.value }))}
                        placeholder={t("newEmailPlaceholder")}
                      />
                    </div>
                    <div className="account-form-field">
                      <label className="account-form-label">{t("currentPassword")}</label>
                      <input
                        type="password"
                        className="input account-form-input"
                        value={emailForm.currentPassword}
                        onChange={(e) => setEmailForm((f) => ({ ...f, currentPassword: e.target.value }))}
                        placeholder={t("currentPasswordPlaceholder")}
                      />
                    </div>
                    <div className="account-form-actions">
                      <button type="submit" className="btn small" disabled={savingEmail}>
                        {savingEmail ? t("saving") : t("saveEmail")}
                      </button>
                    </div>
                  </form>
                </div>

                {/* Divider */}
                <div className="account-form-divider"></div>

                {/* Change Password Form */}
                <div className="account-form-section">
                  <div className="account-form-section-header">
                    <h4 className="account-form-section-title">🔑 {t("changePassword")}</h4>
                    <p className="account-form-section-desc">{t("securitySettings") || "Update your password"}</p>
                  </div>
                  <form className="account-form-enhanced" onSubmit={handleChangePassword}>
                    <div className="account-form-field">
                      <label className="account-form-label">{t("currentPassword")}</label>
                      <input
                        type="password"
                        className="input account-form-input"
                        value={passwordForm.currentPassword}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, currentPassword: e.target.value }))
                        }
                        placeholder={t("currentPasswordPlaceholder")}
                      />
                    </div>
                    <div className="account-form-field">
                      <label className="account-form-label">{t("newPassword")}</label>
                      <input
                        type="password"
                        className="input account-form-input"
                        value={passwordForm.newPassword}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, newPassword: e.target.value }))
                        }
                        placeholder={t("newPasswordPlaceholder")}
                      />
                    </div>
                    <div className="account-form-field">
                      <label className="account-form-label">{t("repeatNewPassword")}</label>
                      <input
                        type="password"
                        className="input account-form-input"
                        value={passwordForm.repeatNewPassword}
                        onChange={(e) =>
                          setPasswordForm((f) => ({ ...f, repeatNewPassword: e.target.value }))
                        }
                        placeholder={t("repeatNewPasswordPlaceholder")}
                      />
                    </div>
                    <div className="account-form-actions">
                      <button type="submit" className="btn small" disabled={savingPassword}>
                        {savingPassword ? t("saving") : t("savePassword")}
                      </button>
                    </div>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default Account;
