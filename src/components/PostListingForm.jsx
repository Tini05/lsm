import React from 'react';
import { motion as Motion } from "framer-motion";
import { MK_CITIES } from "../mkCities";
import { categories, currencyOptions, priceMap } from "../constants";

const PostListingForm = ({
  t,
  user,
  form,
  setForm,
  onClose,
  showMessage,
  stripDangerous,
  validatePhone,
  formatOfferPrice,
  handleImageUpload,
  accountPhone,
  setSelectedTab,
  handleSubmit,
  plan,
  setPlan,
  loading,
  paymentModalOpen,
  onShowMapPicker
}) => {
  // If user not verified (should be handled by parent, but extra safety)
  if (!user || !user.emailVerified) return null;

  return (
    <Motion.aside
      className="modal post-form-drawer"
      onClick={(e) => e.stopPropagation()}
      initial={{ x: "100%", opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      exit={{ x: "100%", opacity: 0 }}
      transition={{ type: "tween", duration: 0.3 }}
    >
      <div className="modal-header">
        <h3 className="modal-title">📝 {t("submitListing")}</h3>
        <button
          className="icon-btn"
          onClick={onClose}
        >
          ✕
        </button>
      </div>

      <div className="modal-body" style={{ maxHeight: "80vh", overflowY: "auto" }}>
        <section className="card form-section">
          <h2 className="section-title">📝 {t("submitListing")}</h2>

          {/* Step indicators */}
          <div className="plan-grid" style={{ marginBottom: 12 }}>
            {[1, 2, 3].map((s) => (
              <div
                key={s}
                className={`plan-option ${form.step === s ? "selected" : ""}`}
                style={{ cursor: "default" }}
              >
                <div className="plan-content">
                  <div className="plan-duration">
                    {s === 1
                      ? t("stepBasic")
                      : s === 2
                      ? t("stepDetails")
                      : t("stepPlanPreview")}
                  </div>
                </div>
              </div>
            ))}
          </div>

          {/* Step 1 */}
          {form.step === 1 && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                if (!form.name || !form.category || !form.locationCity)
                  return showMessage(t("fillAllFields"), "error");
                setForm({ ...form, step: 2 });
              }}
            >
              <input
                className="input"
                placeholder={t("name")}
                value={form.name}
                onChange={(e) =>
                  setForm({
                    ...form,
                    name: stripDangerous(e.target.value).slice(0, 100),
                  })
                }
                maxLength="100"
                required
              />

              <select
                className="select category-dropdown"
                value={form.category}
                onChange={(e) => setForm({ ...form, category: e.target.value })}
                required
              >
                <option value="">{t("selectCategory")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(cat)}
                  </option>
                ))}
              </select>

              {/* Location picker with map modal */}
              <div className="location-picker">
                {/* City selector from MK_CITIES */}
                <select
                  className="select city-dropdown"
                  value={form.locationCity}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      locationCity: e.target.value || "",
                    })
                  }
                  required
                >
                  <option value="">{t("selectCity") || "Select city"}</option>
                  {MK_CITIES.map((city) => (
                    <option key={city} value={city}>
                      {city}
                    </option>
                  ))}
                </select>

                {/* Optional extra details: town / village / neighborhood etc. */}
                <input
                  className="input"
                  placeholder={
                    t("locationExtra") || "Town / village / neighborhood (optional)"
                  }
                  maxLength="100"
                  value={form.locationExtra}
                  onChange={(e) => {
                    const extra = stripDangerous(e.target.value).slice(0, 100);
                    setForm({
                      ...form,
                      locationExtra: extra,
                    });
                  }}
                />

                <button
                  type="button"
                  className="btn btn-ghost small"
                  style={{ marginTop: 6 }}
                  onClick={onShowMapPicker}
                >
                  {t("chooseOnMap") || "Choose on map"}
                </button>
              </div>

              <div className="modal-actions" style={{ padding: 0, marginTop: 8 }}>
                <button type="submit" className="btn">
                  {t("continue")}
                </button>
              </div>
            </form>
          )}

          {/* Step 2 */}
          {form.step === 2 && (
            <form
              className="form"
              onSubmit={(e) => {
                e.preventDefault();
                const phoneForListing = accountPhone || form.contact;
                if (!form.description || !phoneForListing)
                  return showMessage(t("addPhoneInAccount") || t("fillAllFields"), "error");
                if (!validatePhone(phoneForListing))
                  return showMessage(t("enterValidPhone"), "error");
                setForm({ ...form, contact: phoneForListing, step: 3 });
              }}
            >
              <textarea
                className="textarea"
                placeholder={t("description")}
                value={form.description}
                onChange={(e) =>
                  setForm({
                    ...form,
                    description: stripDangerous(e.target.value).slice(0, 1000),
                  })
                }
                maxLength="1000"
                required
              />

              <div className="contact-summary">
                <div className="contact-summary-main">
                  <span className="field-label">{t("contact")}</span>
                  <p className="contact-number">
                    {accountPhone || t("addPhoneInAccount") || "Add a phone number in your account"}
                  </p>
                  <p className="contact-hint">
                    {t("contactAutofill") || "We use your account phone for trust and safety."}
                  </p>
                </div>
                <div className="contact-summary-actions">
                  <button
                    type="button"
                    className="btn btn-ghost small"
                    onClick={() => {
                      if (accountPhone) {
                        setForm((f) => ({ ...f, contact: accountPhone }));
                        showMessage(t("phoneSynced") || "Using your account phone number.", "success");
                      } else {
                        setSelectedTab("account");
                        showMessage(t("addPhoneInAccount") || "Add your phone in account settings first.", "error");
                      }
                    }}
                  >
                    {accountPhone ? t("useAccountPhone") || "Use account phone" : t("goToAccount") || "Go to account"}
                  </button>
                </div>
              </div>

              {/* Offer price range + currency */}
              <div className="offer-price-range">
                <label className="field-label">{t("offerPriceLabel")}</label>
                <div className="offer-range-row">
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder={t("minPrice")}
                    value={form.offerMin}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d.,]/g, "");
                      const updated = { ...form, offerMin: val };
                      updated.offerprice = formatOfferPrice(
                        updated.offerMin,
                        updated.offerMax,
                        updated.offerCurrency
                      );
                      setForm(updated);
                    }}
                  />
                  <span>—</span>
                  <input
                    className="input"
                    type="number"
                    min="0"
                    placeholder={t("maxPrice")}
                    value={form.offerMax}
                    onChange={(e) => {
                      const val = e.target.value.replace(/[^\d.,]/g, "");
                      const updated = { ...form, offerMax: val };
                      updated.offerprice = formatOfferPrice(
                        updated.offerMin,
                        updated.offerMax,
                        updated.offerCurrency
                      );
                      setForm(updated);
                    }}
                  />
                  <select
                    className="select"
                    value={form.offerCurrency}
                    onChange={(e) => {
                      const updated = { ...form, offerCurrency: e.target.value };
                      updated.offerprice = formatOfferPrice(
                        updated.offerMin,
                        updated.offerMax,
                        updated.offerCurrency
                      );
                      setForm(updated);
                    }}
                  >
                    {currencyOptions.map((cur) => (
                      <option key={cur} value={cur}>
                        {cur}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <input
                className="input"
                placeholder={t("tagsPlaceholder")}
                value={form.tags}
                onChange={(e) =>
                  setForm({
                    ...form,
                    tags: stripDangerous(e.target.value).slice(0, 64),
                  })
                }
                maxLength="64"
              />

              <input
                className="input"
                placeholder={t("socialPlaceholder")}
                value={form.socialLink}
                onChange={(e) =>
                  setForm({
                    ...form,
                    socialLink: stripDangerous(e.target.value).slice(0, 200),
                  })
                }
                maxLength="200"
              />

              <input
                className="input"
                type="file"
                accept="image/*"
                onChange={handleImageUpload}
              />

              {form.imagePreview && (
                <img
                  src={form.imagePreview}
                  alt="preview"
                  style={{
                    width: "100%",
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    marginTop: 8,
                  }}
                />
              )}

              <div className="modal-actions" style={{ padding: 0, marginTop: 8 }}>
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setForm({ ...form, step: 1 })}
                >
                  {t("back")}
                </button>
                <button type="submit" className="btn">
                  {t("continue")}
                </button>
              </div>
            </form>
          )}

          {/* Step 3 */}
          {form.step === 3 && (
            <form className="form" onSubmit={handleSubmit}>
              <div className="plan-selector">
                <label className="plan-label">{t("selectDuration")}</label>
                <div className="plan-grid">
                  {Object.keys(priceMap).map((months) => (
                    <label
                      key={months}
                      className={`plan-option ${
                        plan === months ? "selected" : ""
                      }`}
                    >
                      <input
                        type="radio"
                        name="plan"
                        value={months}
                        checked={plan === months}
                        onChange={(e) => setPlan(e.target.value)}
                      />
                      <div className="plan-content">
                        <div className="plan-duration">
                          {months === "1"
                            ? t("oneMonth")
                            : months === "3"
                            ? t("threeMonths")
                            : months === "6"
                            ? t("sixMonths")
                            : t("twelveMonths")}
                        </div>
                        <div className="plan-price">
                          {priceMap[months]} {t("eur")}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {/* Live Preview */}
              <div className="card" style={{ marginTop: 8 }}>
                <div className="listing-header">
                  <h3 className="listing-title">
                    {form.name || t("previewTitlePlaceholder")}
                  </h3>
                  <span className="badge verified">✓ {t("verified")}</span>
                </div>

                <div className="listing-meta">
                  {t(form.category) || form.category || "—"} •{" "}
                  {/* Note: previewLocation is not passed directly, but we can compute it if needed or just use form data */}
                  {form.locationCity || "—"}
                </div>

                {form.imagePreview && (
                  <img
                    src={form.imagePreview}
                    alt="preview"
                    style={{
                      width: "100%",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      margin: "10px 0",
                    }}
                  />
                )}

                <p className="listing-description">
                  {form.description || t("previewDescriptionPlaceholder")}
                </p>

                <div className="listing-meta" style={{ marginTop: 8 }}>
                  {form.offerprice && (
                    <>
                      💶 <strong>{form.offerprice}</strong>&nbsp;&nbsp;
                    </>
                  )}
                  {form.tags && <>🏷️ {form.tags}</>}
                </div>
              </div>

              <button
                type="submit"
                className="btn submit"
                disabled={loading || paymentModalOpen}
              >
                {loading
                  ? `⏳ ${t("loading")}`
                  : `${t("createAndPay")} (${priceMap[plan]} ${t("eur")})`}
              </button>
            </form>
          )}

          <section
            className="card trust-section"
            style={{ marginTop: "5%", height: "fit-content" }}
          >
            <h2 className="section-title">
              {t("whyTrustUs")}
            </h2>
            <ul className="trust-list">
              <li>
                ✅{" "}
                {t("trustPoint1")}
              </li>
              <li>
                ✅{" "}
                {t("trustPoint2")}
              </li>
              <li>
                ✅{" "}
                {t("trustPoint3")}
              </li>
              <li>
                ✅{" "}
                {t("trustPoint4")}
              </li>
            </ul>
          </section>
        </section>
      </div>
    </Motion.aside>
  );
};

export default PostListingForm;
