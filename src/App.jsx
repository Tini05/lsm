// src/App.jsx
const API_BASE = "https://lsm-wozo.onrender.com" || "http://localhost:5000";

import logo from "./assets/logo.png";
import React, { useEffect, useMemo, useState } from "react";
import { auth, db, createRecaptcha } from "./firebase";
import { ref as dbRef, set, update, onValue, remove } from "firebase/database";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  signOut,
  signInWithPhoneNumber,
  sendEmailVerification,
  updateEmail,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  PhoneAuthProvider,
  linkWithPhoneNumber,
  linkWithCredential,
} from "firebase/auth";

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AnimatePresence, motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import NorthMacedoniaMap from "./NorthMacedoniaMap";
import "./App.css";
import Sidebar from "./Sidebar";
import { TRANSLATIONS } from "./translations";
import { MK_CITIES } from "./mkCities";

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";

/* Data */
const categories = [
  "food",
  "car",
  "electronics",
  "homeRepair",
  "clothing",
  "health",
  "education",
  "beauty",
  "events",
  "other",
];

const plans = [
  { id: "1", days: 30, label: "1 month", price: 5 },
  { id: "3", days: 90, label: "3 months", price: 9 },
  { id: "6", days: 180, label: "6 months", price: 15 },
  { id: "12", days: 365, label: "12 months", price: 20 },
];

const categoryIcons = {
  food: "🍽️",
  car: "🚗",
  electronics: "💻",
  homeRepair: "🔧",
  clothing: "👕",
  health: "⚕️",
  education: "📚",
  beauty: "💅",
  events: "🎉",
  other: "📌",
};

function tKey(lang, key) {
  return TRANSLATIONS[lang] && TRANSLATIONS[lang][key]
    ? TRANSLATIONS[lang][key]
    : TRANSLATIONS["en"][key] || key;
}

function formatDateTime(ts) {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function normalizePhoneForStorage(phone) {
  if (!phone) return "";
  const digits = phone.replace(/\D/g, "");
  if (digits.startsWith("389")) return "+" + digits;
  if (digits.startsWith("0")) return "+389" + digits.slice(1);
  return "+" + digits;
}

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validatePhone(phone) {
  return /^\+?\d{7,15}$/.test(phone.replace(/\s/g, ""));
}

function listingIsActive(listing) {
  if (!listing || !listing.expiry) return false;
  const now = Date.now();
  return now < listing.expiry;
}

function getStatusBadge(listing, now = Date.now()) {
  if (!listingIsActive(listing)) return "expired";
  const remaining = listing.expiry - now;
  const daysLeft = remaining / (1000 * 60 * 60 * 24);
  if (daysLeft <= 3) return "expiringSoon";
  if (listing.featured) return "featured";
  return "active";
}

const PhoneCountryOptions = [
  { code: "+389", label: "+389 (MK)" },
  { code: "+355", label: "+355 (AL)" },
  { code: "+381", label: "+381 (RS)" },
];

const initialOptions = {
  paypal: {
    "client-id": PAYPAL_CLIENT_ID,
    currency: "EUR",
    intent: "capture",
  },
};

function App() {
  const [lang, setLang] = useState("sq");
  const t = (key) => tKey(lang, key);

  const [message, setMessage] = useState({ text: "", type: "info" });
  const [listings, setListings] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [initialListingId, setInitialListingId] = useState(null);

  /* Dashboard/UI */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTab, setSelectedTab] = useState("main"); // myListings | account | allListings
  const [showPostForm, setShowPostForm] = useState(false);

  /* Editing */
  const [editingListing, setEditingListing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  /* Extend flow */
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendPlan, setExtendPlan] = useState("1");

  /* Auth modal */
  const [showAuthModal, setShowAuthModal] = useState(false);
  // OLD: const [authTab, setAuthTab] = useState("email");
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [authTab, setAuthTab] = useState("email"); // "email" | "phone" (login method)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("+389");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  // Signup flow: email + password + phone
  // const [signupPhoneConfirmation, setSignupPhoneConfirmation] = useState(null);

  // For signup phone verification
  // const [signupPhoneLoading, setSignupPhoneLoading] = useState(false);
  const [emailForm, setEmailForm] = useState({
    newEmail: "",
    currentPassword: "",
  });
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    repeatNewPassword: "",
  });

  const [savingEmail, setSavingEmail] = useState(false);
  const [savingPassword, setSavingPassword] = useState(false);

  /* Filters */
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("active");
  const [mySort, setMySort] = useState("expiryAsc");
  const [allSort, setAllSort] = useState("recent");

  const [initialOptionsState, setInitialOptionsState] =
    useState(initialOptions);

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((u) => {
      setUser(u);
      if (!u) {
        setSelectedTab("main");
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!user) {
      setSidebarOpen(false);
      return;
    }
    const userListingsRef = dbRef(db, "listings");
    const unsub = onValue(userListingsRef, (snapshot) => {
      const data = snapshot.val() || {};
      const arr = Object.entries(data).map(([id, value]) => ({
        id,
        ...value,
      }));
      setListings(arr);
    });
    return () => unsub();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listingId = params.get("listing");
    if (listingId) {
      setInitialListingId(listingId);
    }
  }, []);

  const showMessage = (text, type = "info") => {
    setMessage({ text, type });
    if (text) {
      setTimeout(
        () =>
          setMessage((prev) =>
            prev.text === text ? { text: "", type: "info" } : prev
          ),
        4000
      );
    }
  };

  useEffect(() => {
    if (initialListingId && listings.length > 0) {
      const found = listings.find((l) => l.id === initialListingId);
      if (found) {
        setSelectedListing(found);
        setSelectedTab("allListings");
      }
      setInitialListingId(null);
    }
  }, [initialListingId, listings]);

  const filteredMyListings = useMemo(() => {
    if (!user) return [];
    const now = Date.now();
    let result = listings.filter((l) => l.ownerUid === user.uid);

    result = result.filter((l) => {
      const isActive = listingIsActive(l);
      const badge = getStatusBadge(l, now);
      if (statusFilter === "all") return true;
      if (statusFilter === "active") return isActive;
      if (statusFilter === "expired") return !isActive;
      if (statusFilter === "featured") return badge === "featured";
      if (statusFilter === "expiringSoon") return badge === "expiringSoon";
      return true;
    });

    if (categoryFilter !== "all") {
      result = result.filter((l) => l.category === categoryFilter);
    }
    if (cityFilter !== "all") {
      result = result.filter((l) => l.city === cityFilter);
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(lower) ||
          (l.description || "").toLowerCase().includes(lower) ||
          (l.address || "").toLowerCase().includes(lower)
      );
    }

    result.sort((a, b) => {
      if (mySort === "expiryAsc") {
        return (a.expiry || 0) - (b.expiry || 0);
      }
      if (mySort === "expiryDesc") {
        return (b.expiry || 0) - (a.expiry || 0);
      }
      if (mySort === "createdDesc") {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (mySort === "createdAsc") {
        return (a.createdAt || 0) - (b.createdAt || 0);
      }
      return 0;
    });

    return result;
  }, [
    user,
    listings,
    categoryFilter,
    cityFilter,
    searchTerm,
    statusFilter,
    mySort,
  ]);

  const filteredAllListings = useMemo(() => {
    const now = Date.now();
    let result = listings.filter((l) => listingIsActive(l));

    if (categoryFilter !== "all") {
      result = result.filter((l) => l.category === categoryFilter);
    }
    if (cityFilter !== "all") {
      result = result.filter((l) => l.city === cityFilter);
    }
    if (searchTerm.trim()) {
      const lower = searchTerm.toLowerCase();
      result = result.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(lower) ||
          (l.description || "").toLowerCase().includes(lower) ||
          (l.address || "").toLowerCase().includes(lower)
      );
    }

    result.sort((a, b) => {
      if (allSort === "recent") {
        return (b.createdAt || 0) - (a.createdAt || 0);
      }
      if (allSort === "priceAsc") {
        return (a.price || 0) - (b.price || 0);
      }
      if (allSort === "priceDesc") {
        return (b.price || 0) - (a.price || 0);
      }
      if (allSort === "expirySoon") {
        return (a.expiry || 0) - (b.expiry || 0);
      }
      return 0;
    });

    return result;
  }, [
    listings,
    categoryFilter,
    cityFilter,
    searchTerm,
    allSort,
  ]);

  const handleLogout = async () => {
    try {
      await signOut(auth);
      showMessage(t("logoutSuccess") || "Logged out successfully", "success");
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const resetFilters = () => {
    setCategoryFilter("all");
    setCityFilter("all");
    setSearchTerm("");
    setStatusFilter("active");
    setMySort("expiryAsc");
    setAllSort("recent");
  };

  const handleCreateListing = async (e) => {
    e.preventDefault();
    if (!user) return showMessage(t("loginRequired"), "error");

    const form = Object.fromEntries(new FormData(e.target));
    const {
      name,
      category,
      city,
      price,
      description,
      phone,
      address,
      days,
      featured,
    } = form;

    if (!name || !category || category === "none" || !city || !description) {
      return showMessage(t("fillRequiredFields"), "error");
    }

    const numericPrice = parseFloat(price.replace(",", ".") || "0");
    const numericDays = parseInt(days, 10) || 30;
    const now = Date.now();
    const expiry = now + numericDays * 24 * 60 * 60 * 1000;

    const newListingRef = dbRef(db, "listings").push();
    const listingId = newListingRef.key;

    const newListing = {
      name,
      category,
      city,
      price: numericPrice,
      description,
      phone,
      address,
      createdAt: now,
      expiry,
      ownerUid: user.uid,
      featured: featured === "on",
      planDays: numericDays,
      planLabel: plans.find((p) => p.days === numericDays)?.label || "",
    };

    try {
      await set(newListingRef, newListing);
      showMessage(t("listingCreated"), "success");
      setShowPostForm(false);
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const handleDeleteListing = async (listingId) => {
    if (!user) return showMessage(t("loginRequired"), "error");
    if (!window.confirm(t("confirmDeleteListing") || "Delete this listing?"))
      return;
    try {
      await remove(dbRef(db, `listings/${listingId}`));
      showMessage(t("listingDeleted"), "success");
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const handleEditListing = (listing) => {
    setEditingListing(listing);
    setEditForm({ ...listing });
  };

  const handleSaveEditListing = async (e) => {
    e.preventDefault();
    if (!user || !editingListing || !editForm)
      return showMessage(t("loginRequired"), "error");

    const listingId = editingListing.id;
    const updates = {
      name: editForm.name,
      category: editForm.category,
      city: editForm.city,
      price: parseFloat(editForm.price || 0),
      description: editForm.description,
      phone: editForm.phone,
      address: editForm.address,
      featured: !!editForm.featured,
    };
    try {
      await update(dbRef(db, `listings/${listingId}`), updates);
      showMessage(t("listingUpdated"), "success");
      setEditingListing(null);
      setEditForm(null);
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const handleExtendListing = (listing) => {
    setExtendTarget(listing);
    setExtendPlan("1");
  };

  const handleExtendSuccess = async (details, data) => {
    if (!extendTarget) return;
    const planObj = plans.find((p) => p.id === extendPlan);
    if (!planObj) return;

    const now = Date.now();
    const currentExpiry =
      extendTarget.expiry && extendTarget.expiry > now
        ? extendTarget.expiry
        : now;
    const newExpiry =
      currentExpiry + planObj.days * 24 * 60 * 60 * 1000;

    try {
      await update(dbRef(db, `listings/${extendTarget.id}`), {
        expiry: newExpiry,
        planDays: planObj.days,
        planLabel: planObj.label,
      });
      showMessage(t("listingExtended"), "success");
      setExtendTarget(null);
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!validateEmail(email)) {
      return showMessage(t("enterValidEmail"), "error");
    }
    if (!password) {
      return showMessage(t("enterPassword"), "error");
    }

    try {
      const cred = await signInWithEmailAndPassword(auth, email, password);
      if (!cred.user.emailVerified) {
        showMessage(
          t("emailNotVerified") || "Email not verified. Please check your inbox.",
          "warning"
        );
      } else {
        showMessage(t("loginSuccess") || "Logged in successfully", "success");
      }
      setShowAuthModal(false);
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    if (!user) return showMessage(t("loginRequired"), "error");

    if (!validateEmail(emailForm.newEmail)) {
      showMessage(t("enterValidEmail"), "error");
      return;
    }
    if (!emailForm.currentPassword) {
      showMessage(t("enterCurrentPassword"), "error");
      return;
    }
    if (!user.email) {
      showMessage(t("emailChangeNotAvailable"), "error");
      return;
    }

    try {
      setSavingEmail(true);
      const credential = EmailAuthProvider.credential(
        user.email,
        emailForm.currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updateEmail(user, emailForm.newEmail);
      showMessage(t("emailUpdated"), "success");
      setEmailForm({ newEmail: "", currentPassword: "" });
    } catch (err) {
      console.error(err);
      if (err.code === "auth/wrong-password") {
        showMessage(t("wrongPassword"), "error");
      } else {
        showMessage(err.message, "error");
      }
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    if (!user) return showMessage(t("loginRequired"), "error");

    const { currentPassword, newPassword, repeatNewPassword } = passwordForm;

    if (!currentPassword || !newPassword || !repeatNewPassword) {
      showMessage(t("fillAllFields"), "error");
      return;
    }
    if (newPassword.length < 6) {
      showMessage(t("passwordTooShort"), "error");
      return;
    }
    if (newPassword !== repeatNewPassword) {
      showMessage(t("passwordsDontMatch"), "error");
      return;
    }

    try {
      setSavingPassword(true);
      if (!user.email) {
        showMessage(t("passwordChangeNotAvailable"), "error");
        return;
      }

      const credential = EmailAuthProvider.credential(
        user.email,
        currentPassword
      );
      await reauthenticateWithCredential(user, credential);
      await updatePassword(user, newPassword);
      showMessage(t("passwordUpdated"), "success");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        repeatNewPassword: "",
      });
    } catch (err) {
      console.error(err);
      if (err.code === "auth/wrong-password") {
        showMessage(t("wrongPassword"), "error");
      } else {
        showMessage(err.message, "error");
      }
    } finally {
      setSavingPassword(false);
    }
  };

  useEffect(() => {
    const url = window.location.href;
    if (isSignInWithEmailLink(auth, url)) {
      let storedEmail = window.localStorage.getItem("emailForSignIn");
      if (!storedEmail) {
        storedEmail = window.prompt("Please provide your email");
      }
      if (storedEmail) {
        signInWithEmailLink(auth, storedEmail, url)
          .then((result) => {
            window.localStorage.removeItem("emailForSignIn");
            showMessage("Signed in successfully with magic link", "success");
          })
          .catch((error) => {
            console.error(error);
            showMessage(error.message, "error");
          });
      }
    }
  }, []);

  const handleSendMagicLink = async () => {
    if (!validateEmail(email)) {
      return showMessage(t("enterValidEmail"), "error");
    }
    const actionCodeSettings = {
      url: window.location.href,
      handleCodeInApp: true,
    };
    try {
      await sendSignInLinkToEmail(auth, email, actionCodeSettings);
      window.localStorage.setItem("emailForSignIn", email);
      showMessage(t("magicLinkSent"), "success");
    } catch (err) {
      console.error(err);
      showMessage(err.message, "error");
    }
  };

  const [showFullDescription, setShowFullDescription] = useState({});
  const toggleDescription = (id) => {
    setShowFullDescription((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const renderStatusBadge = (listing) => {
    const badge = getStatusBadge(listing);
    const statusLabels = {
      active: t("statusActive") || "Active",
      expired: t("statusExpired") || "Expired",
      featured: t("statusFeatured") || "Featured",
      expiringSoon: t("statusExpiringSoon") || "Expiring soon",
    };
    return (
      <span className={`status-badge status-${badge}`}>
        {statusLabels[badge] || badge}
      </span>
    );
  };

  const handleShareListing = (listing) => {
    const url = `${window.location.origin}?listing=${listing.id}`;
    if (navigator.share) {
      navigator
        .share({
          title: listing.name,
          text: listing.description,
          url,
        })
        .catch((err) => console.error("Share cancelled or failed:", err));
    } else {
      navigator.clipboard
        .writeText(url)
        .then(() => showMessage(t("linkCopied") || "Link copied!", "success"))
        .catch((err) => {
          console.error(err);
          showMessage(t("copyFailed") || "Failed to copy link", "error");
        });
    }
  };

  useEffect(() => {
    const newOptions = {
      ...initialOptionsState,
      paypal: {
        ...initialOptionsState.paypal,
        "client-id": PAYPAL_CLIENT_ID,
      },
    };
    setInitialOptionsState(newOptions);
  }, []);

  return (
    <PayPalScriptProvider options={initialOptionsState}>
      <div className="app-container">
        <Sidebar
          lang={lang}
          setLang={setLang}
          user={user}
          onLoginClick={() => {
            setAuthMode("login");
            setAuthTab("email");
            setShowAuthModal(true);
          }}
          onSignupClick={() => {
            setAuthMode("signup");
            setAuthTab("email");
            setShowAuthModal(true);
          }}
          selectedTab={selectedTab}
          setSelectedTab={setSelectedTab}
          sidebarOpen={sidebarOpen}
          setSidebarOpen={setSidebarOpen}
          onLogout={handleLogout}
          t={t}
        />

        <main className="main-content">
          <header className="header">
            <div className="header-left">
              <img src={logo} alt="Logo" className="logo" />
              <div className="header-text">
                <h1 className="app-title">BizCall</h1>
                <p className="app-subtitle">{t("appSubtitle")}</p>
              </div>
            </div>

            <div className="header-right">
              <button
                className="btn secondary"
                onClick={() => setSelectedTab("allListings")}
              >
                {t("exploreBusinesses")}
              </button>

              {user ? (
                <button
                  className="btn primary"
                  onClick={() => {
                    setShowPostForm(true);
                    setSelectedTab("myListings");
                  }}
                >
                  {t("postListing")}
                </button>
              ) : (
                <button
                  className="btn primary"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthTab("email");
                    setShowAuthModal(true);
                  }}
                >
                  {t("getStarted")}
                </button>
              )}
            </div>
          </header>

          {message.text && (
            <div className={`message-banner message-${message.type}`}>
              {message.text}
            </div>
          )}

          <section className="hero-section">
            <motion.div
              className="hero-card"
              initial={{ y: 15, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              transition={{ duration: 0.4 }}
            >
              <h2>{t("heroTitle")}</h2>
              <p>{t("heroSubtitle")}</p>
              <div className="hero-actions">
                <button
                  className="btn primary"
                  onClick={() => {
                    if (!user) {
                      setAuthMode("signup");
                      setAuthTab("email");
                      setShowAuthModal(true);
                    } else {
                      setShowPostForm(true);
                      setSelectedTab("myListings");
                    }
                  }}
                >
                  {t("heroPrimaryButton")}
                </button>
                <button
                  className="btn ghost"
                  onClick={() => setSelectedTab("allListings")}
                >
                  {t("heroSecondaryButton")}
                </button>
              </div>
            </motion.div>

            <motion.div
              className="hero-map-card"
              initial={{ x: 20, opacity: 0 }}
              animate={{ x: 0, opacity: 1 }}
              transition={{ duration: 0.5, delay: 0.1 }}
            >
              <h3>{t("mapTitle")}</h3>
              <p className="map-subtitle">{t("mapSubtitle")}</p>
              <div className="map-wrapper">
                <NorthMacedoniaMap
                  listings={listings}
                  onCityClick={(cityCode) => {
                    setCityFilter(cityCode);
                    setSelectedTab("allListings");
                  }}
                  cityNames={MK_CITIES}
                />
              </div>
            </motion.div>
          </section>

          <section className="filters-section">
            <div className="filter-group">
              <label>{t("category")}</label>
              <select
                className="select"
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <option value="all">{t("allCategories")}</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>
                    {t(`cat_${cat}`)}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group">
              <label>{t("city")}</label>
              <select
                className="select"
                value={cityFilter}
                onChange={(e) => setCityFilter(e.target.value)}
              >
                <option value="all">{t("allCities")}</option>
                {Object.entries(MK_CITIES).map(([code, name]) => (
                  <option key={code} value={code}>
                    {name}
                  </option>
                ))}
              </select>
            </div>

            <div className="filter-group search-group">
              <label>{t("search")}</label>
              <input
                type="text"
                className="input"
                placeholder={t("searchPlaceholder")}
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            <div className="filter-group">
              <label>{t("status")}</label>
              <select
                className="select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <option value="active">{t("statusActive")}</option>
                <option value="expired">{t("statusExpired")}</option>
                <option value="featured">{t("statusFeatured")}</option>
                <option value="expiringSoon">{t("statusExpiringSoon")}</option>
                <option value="all">{t("statusAll")}</option>
              </select>
            </div>

            <div className="filter-group sort-group">
              <label>
                {selectedTab === "myListings"
                  ? t("sortMyListings")
                  : t("sortAllListings")}
              </label>
              <select
                className="select"
                value={selectedTab === "myListings" ? mySort : allSort}
                onChange={(e) =>
                  selectedTab === "myListings"
                    ? setMySort(e.target.value)
                    : setAllSort(e.target.value)
                }
              >
                {selectedTab === "myListings" ? (
                  <>
                    <option value="expiryAsc">{t("sortSoonestExpiry")}</option>
                    <option value="expiryDesc">{t("sortLatestExpiry")}</option>
                    <option value="createdDesc">{t("sortNewest")}</option>
                    <option value="createdAsc">{t("sortOldest")}</option>
                  </>
                ) : (
                  <>
                    <option value="recent">{t("sortNewest")}</option>
                    <option value="priceAsc">{t("sortPriceLowHigh")}</option>
                    <option value="priceDesc">{t("sortPriceHighLow")}</option>
                    <option value="expirySoon">
                      {t("sortSoonestExpiry")}
                    </option>
                  </>
                )}
              </select>
            </div>

            <div className="filter-group reset-group">
              <button className="btn ghost small" onClick={resetFilters}>
                {t("resetFilters")}
              </button>
            </div>
          </section>

          <section className="content-section">
            <div className="content-tabs">
              <button
                className={`content-tab ${
                  selectedTab === "allListings" ? "active" : ""
                }`}
                onClick={() => setSelectedTab("allListings")}
              >
                {t("allListingsTab")}
              </button>
              {user && (
                <button
                  className={`content-tab ${
                    selectedTab === "myListings" ? "active" : ""
                  }`}
                  onClick={() => setSelectedTab("myListings")}
                >
                  {t("myListingsTab")}
                </button>
              )}
              {user && (
                <button
                  className={`content-tab ${
                    selectedTab === "account" ? "active" : ""
                  }`}
                  onClick={() => setSelectedTab("account")}
                >
                  {t("accountTab")}
                </button>
              )}
            </div>

            {selectedTab === "allListings" && (
              <div className="listings-grid">
                {filteredAllListings.length === 0 ? (
                  <div className="empty-state">
                    <p>{t("noListingsFound")}</p>
                  </div>
                ) : (
                  filteredAllListings.map((listing) => (
                    <motion.div
                      key={listing.id}
                      className="listing-card"
                      initial={{ y: 10, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                    >
                      <div className="listing-header">
                        <div className="listing-title-group">
                          <span className="category-icon">
                            {categoryIcons[listing.category] || "🏷️"}
                          </span>
                          <h3>{listing.name}</h3>
                        </div>
                        {renderStatusBadge(listing)}
                      </div>

                      <p className="listing-description">
                        {showFullDescription[listing.id]
                          ? listing.description
                          : (listing.description || "").length > 140
                          ? (listing.description || "").slice(0, 140) + "..."
                          : listing.description}
                        {(listing.description || "").length > 140 && (
                          <button
                            className="link-button"
                            onClick={() => toggleDescription(listing.id)}
                          >
                            {showFullDescription[listing.id]
                              ? t("showLess")
                              : t("showMore")}
                          </button>
                        )}
                      </p>

                      <div className="listing-meta">
                        <span>
                          {t("category")}: {t(`cat_${listing.category}`)}
                        </span>
                        <span>
                          {t("city")}:{" "}
                          {MK_CITIES[listing.city] || listing.city}
                        </span>
                        <span>
                          {t("price")}: {listing.price || 0} €
                        </span>
                      </div>

                      <div className="listing-footer">
                        <button
                          className="btn small"
                          onClick={() => setSelectedListing(listing)}
                        >
                          {t("viewDetails")}
                        </button>
                        <button
                          className="btn ghost small"
                          onClick={() => handleShareListing(listing)}
                        >
                          {t("share")}
                        </button>
                      </div>
                    </motion.div>
                  ))
                )}
              </div>
            )}

            {selectedTab === "myListings" && user && (
              <div className="my-listings-section">
                <div className="my-listings-header">
                  <h2>{t("myListingsHeading")}</h2>
                  <button
                    className="btn small primary"
                    onClick={() => setShowPostForm(true)}
                  >
                    {t("postNewListing")}
                  </button>
                </div>

                {filteredMyListings.length === 0 ? (
                  <div className="empty-state">
                    <p>{t("noMyListings")}</p>
                  </div>
                ) : (
                  <div className="listings-grid">
                    {filteredMyListings.map((listing) => (
                      <motion.div
                        key={listing.id}
                        className="listing-card my-listing"
                        initial={{ y: 10, opacity: 0 }}
                        animate={{ y: 0, opacity: 1 }}
                      >
                        <div className="listing-header">
                          <div className="listing-title-group">
                            <span className="category-icon">
                              {categoryIcons[listing.category] || "🏷️"}
                            </span>
                            <h3>{listing.name}</h3>
                          </div>
                          {renderStatusBadge(listing)}
                        </div>

                        <p className="listing-description">
                          {showFullDescription[listing.id]
                            ? listing.description
                            : (listing.description || "").length > 140
                            ? (listing.description || "").slice(0, 140) + "..."
                            : listing.description}
                          {(listing.description || "").length > 140 && (
                            <button
                              className="link-button"
                              onClick={() => toggleDescription(listing.id)}
                            >
                              {showFullDescription[listing.id]
                                ? t("showLess")
                                : t("showMore")}
                            </button>
                          )}
                        </p>

                        <div className="listing-meta">
                          <span>
                            {t("category")}: {t(`cat_${listing.category}`)}
                          </span>
                          <span>
                            {t("city")}:{" "}
                            {MK_CITIES[listing.city] || listing.city}
                          </span>
                          <span>
                            {t("price")}: {listing.price || 0} €
                          </span>
                          <span>
                            {t("expires")}: {formatDateTime(listing.expiry)}
                          </span>
                        </div>

                        <div className="listing-footer">
                          <button
                            className="btn small"
                            onClick={() => handleEditListing(listing)}
                          >
                            {t("edit")}
                          </button>
                          <button
                            className="btn small secondary"
                            onClick={() => handleExtendListing(listing)}
                          >
                            {t("extend")}
                          </button>
                          <button
                            className="btn small danger"
                            onClick={() => handleDeleteListing(listing.id)}
                          >
                            {t("delete")}
                          </button>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}

                {showPostForm && (
                  <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setShowPostForm(false)}
                  >
                    <motion.div
                      className="modal listing-modal"
                      onClick={(e) => e.stopPropagation()}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                    >
                      <div className="modal-header">
                        <h3>{t("createListingTitle")}</h3>
                        <button
                          className="icon-btn"
                          onClick={() => setShowPostForm(false)}
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={handleCreateListing}>
                        <div className="form-grid">
                          <div className="form-group">
                            <label>{t("businessName")}</label>
                            <input
                              name="name"
                              className="input"
                              type="text"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("category")}</label>
                            <select
                              name="category"
                              className="select"
                              defaultValue="none"
                              required
                            >
                              <option value="none" disabled>
                                {t("selectCategory")}
                              </option>
                              {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {t(`cat_${cat}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>{t("city")}</label>
                            <select
                              name="city"
                              className="select"
                              defaultValue=""
                              required
                            >
                              <option value="" disabled>
                                {t("selectCity")}
                              </option>
                              {Object.entries(MK_CITIES).map(
                                ([code, name]) => (
                                  <option key={code} value={code}>
                                    {name}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>{t("price")}</label>
                            <input
                              name="price"
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              required
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("phoneNumber")}</label>
                            <input
                              name="phone"
                              className="input"
                              type="text"
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("address")}</label>
                            <input
                              name="address"
                              className="input"
                              type="text"
                            />
                          </div>
                          <div className="form-group form-group-full">
                            <label>{t("description")}</label>
                            <textarea
                              name="description"
                              className="textarea"
                              rows="4"
                              required
                            ></textarea>
                          </div>
                          <div className="form-group">
                            <label>{t("planDuration")}</label>
                            <select
                              name="days"
                              className="select"
                              defaultValue="30"
                            >
                              {plans.map((p) => (
                                <option key={p.id} value={p.days}>
                                  {p.label} ({p.price} €)
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label className="checkbox-label">
                              <input
                                name="featured"
                                type="checkbox"
                                className="checkbox"
                              />
                              <span>{t("markAsFeatured")}</span>
                            </label>
                          </div>
                        </div>

                        <div className="modal-footer">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => setShowPostForm(false)}
                          >
                            {t("cancel")}
                          </button>
                          <button type="submit" className="btn primary">
                            {t("publishListing")}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </motion.div>
                )}

                {editingListing && editForm && (
                  <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => {
                      setEditingListing(null);
                      setEditForm(null);
                    }}
                  >
                    <motion.div
                      className="modal listing-modal"
                      onClick={(e) => e.stopPropagation()}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                    >
                      <div className="modal-header">
                        <h3>{t("editListingTitle")}</h3>
                        <button
                          className="icon-btn"
                          onClick={() => {
                            setEditingListing(null);
                            setEditForm(null);
                          }}
                        >
                          ✕
                        </button>
                      </div>
                      <form onSubmit={handleSaveEditListing}>
                        <div className="form-grid">
                          <div className="form-group">
                            <label>{t("businessName")}</label>
                            <input
                              className="input"
                              type="text"
                              value={editForm.name}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  name: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("category")}</label>
                            <select
                              className="select"
                              value={editForm.category}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  category: e.target.value,
                                }))
                              }
                            >
                              {categories.map((cat) => (
                                <option key={cat} value={cat}>
                                  {t(`cat_${cat}`)}
                                </option>
                              ))}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>{t("city")}</label>
                            <select
                              className="select"
                              value={editForm.city}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  city: e.target.value,
                                }))
                              }
                            >
                              {Object.entries(MK_CITIES).map(
                                ([code, name]) => (
                                  <option key={code} value={code}>
                                    {name}
                                  </option>
                                )
                              )}
                            </select>
                          </div>
                          <div className="form-group">
                            <label>{t("price")}</label>
                            <input
                              className="input"
                              type="number"
                              min="0"
                              step="0.01"
                              value={editForm.price}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  price: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("phoneNumber")}</label>
                            <input
                              className="input"
                              type="text"
                              value={editForm.phone}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  phone: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group">
                            <label>{t("address")}</label>
                            <input
                              className="input"
                              type="text"
                              value={editForm.address}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  address: e.target.value,
                                }))
                              }
                            />
                          </div>
                          <div className="form-group form-group-full">
                            <label>{t("description")}</label>
                            <textarea
                              className="textarea"
                              rows="4"
                              value={editForm.description}
                              onChange={(e) =>
                                setEditForm((prev) => ({
                                  ...prev,
                                  description: e.target.value,
                                }))
                              }
                            ></textarea>
                          </div>
                          <div className="form-group">
                            <label className="checkbox-label">
                              <input
                                type="checkbox"
                                className="checkbox"
                                checked={!!editForm.featured}
                                onChange={(e) =>
                                  setEditForm((prev) => ({
                                    ...prev,
                                    featured: e.target.checked,
                                  }))
                                }
                              />
                              <span>{t("markAsFeatured")}</span>
                            </label>
                          </div>
                        </div>

                        <div className="modal-footer">
                          <button
                            type="button"
                            className="btn ghost"
                            onClick={() => {
                              setEditingListing(null);
                              setEditForm(null);
                            }}
                          >
                            {t("cancel")}
                          </button>
                          <button type="submit" className="btn primary">
                            {t("saveChanges")}
                          </button>
                        </div>
                      </form>
                    </motion.div>
                  </motion.div>
                )}

                {extendTarget && (
                  <motion.div
                    className="modal-overlay"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    onClick={() => setExtendTarget(null)}
                  >
                    <motion.div
                      className="modal listing-modal"
                      onClick={(e) => e.stopPropagation()}
                      initial={{ y: 20, opacity: 0 }}
                      animate={{ y: 0, opacity: 1 }}
                      exit={{ y: 20, opacity: 0 }}
                    >
                      <div className="modal-header">
                        <h3>{t("extendListingTitle")}</h3>
                        <button
                          className="icon-btn"
                          onClick={() => setExtendTarget(null)}
                        >
                          ✕
                        </button>
                      </div>

                      <div className="extend-info">
                        <p>
                          {t("extendingListing")}: <b>{extendTarget.name}</b>
                        </p>
                        <p>
                          {t("currentExpiry")}:{" "}
                          <b>{formatDateTime(extendTarget.expiry)}</b>
                        </p>
                      </div>

                      <div className="extend-plans">
                        {plans.map((plan) => (
                          <label
                            key={plan.id}
                            className={`extend-plan ${
                              extendPlan === plan.id ? "selected" : ""
                            }`}
                          >
                            <input
                              type="radio"
                              name="plan"
                              value={plan.id}
                              checked={extendPlan === plan.id}
                              onChange={(e) => setExtendPlan(e.target.value)}
                            />
                            <div className="extend-plan-content">
                              <span className="extend-plan-label">
                                {plan.label}
                              </span>
                              <span className="extend-plan-price">
                                {plan.price} €
                              </span>
                            </div>
                          </label>
                        ))}
                      </div>

                      <div className="modal-footer">
                        <button
                          className="btn ghost"
                          onClick={() => setExtendTarget(null)}
                        >
                          {t("cancel")}
                        </button>

                        <PayPalButtons
                          style={{ layout: "horizontal" }}
                          createOrder={(data, actions) => {
                            const chosenPlan = plans.find(
                              (p) => p.id === extendPlan
                            );
                            if (!chosenPlan) return;

                            return actions.order.create({
                              purchase_units: [
                                {
                                  amount: {
                                    value: chosenPlan.price.toString(),
                                  },
                                  description: `Extend listing ${extendTarget.name} for ${chosenPlan.label}`,
                                },
                              ],
                            });
                          }}
                          onApprove={(data, actions) => {
                            return actions.order
                              .capture()
                              .then((details) =>
                                handleExtendSuccess(details, data)
                              );
                          }}
                          onError={(err) => {
                            console.error(err);
                            showMessage(err.message, "error");
                          }}
                        />
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </div>
            )}

            {selectedTab === "account" && user && (
              <section className="account-section">
                <h2>{t("accountSettings")}</h2>
                <div className="account-grid">
                  <div className="account-card">
                    <h3>{t("basicInfo")}</h3>
                    <p>
                      <strong>{t("email")}:</strong>{" "}
                      {user.email || t("noEmail")}
                    </p>
                    <p>
                      <strong>{t("emailVerified")}:</strong>{" "}
                      {user.emailVerified ? t("yes") : t("no")}
                    </p>
                    <p>
                      <strong>{t("uid")}:</strong> {user.uid}
                    </p>
                  </div>

                  <div className="account-card">
                    <h3>{t("changeEmail")}</h3>
                    <form onSubmit={handleChangeEmail}>
                      <div className="form-group">
                        <label>{t("newEmail")}</label>
                        <input
                          type="email"
                          className="input"
                          value={emailForm.newEmail}
                          onChange={(e) =>
                            setEmailForm((prev) => ({
                              ...prev,
                              newEmail: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t("currentPassword")}</label>
                        <input
                          type="password"
                          className="input"
                          value={emailForm.currentPassword}
                          onChange={(e) =>
                            setEmailForm((prev) => ({
                              ...prev,
                              currentPassword: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={savingEmail}
                      >
                        {savingEmail ? t("saving") : t("saveChanges")}
                      </button>
                    </form>
                  </div>

                  <div className="account-card">
                    <h3>{t("changePassword")}</h3>
                    <form onSubmit={handleChangePassword}>
                      <div className="form-group">
                        <label>{t("currentPassword")}</label>
                        <input
                          type="password"
                          className="input"
                          value={passwordForm.currentPassword}
                          onChange={(e) =>
                            setPasswordForm((prev) => ({
                              ...prev,
                              currentPassword: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t("newPassword")}</label>
                        <input
                          type="password"
                          className="input"
                          value={passwordForm.newPassword}
                          onChange={(e) =>
                            setPasswordForm((prev) => ({
                              ...prev,
                              newPassword: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <div className="form-group">
                        <label>{t("repeatNewPassword")}</label>
                        <input
                          type="password"
                          className="input"
                          value={passwordForm.repeatNewPassword}
                          onChange={(e) =>
                            setPasswordForm((prev) => ({
                              ...prev,
                              repeatNewPassword: e.target.value,
                            }))
                          }
                          required
                        />
                      </div>
                      <button
                        type="submit"
                        className="btn primary"
                        disabled={savingPassword}
                      >
                        {savingPassword ? t("saving") : t("saveChanges")}
                      </button>
                    </form>
                  </div>
                </div>
              </section>
            )}
          </section>

          {/* ===== AUTH MODAL (login + signup, email + phone) ===== */}
          <AnimatePresence>
            {showAuthModal && (
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => setShowAuthModal(false)}
              >
                <motion.div
                  className="modal auth-modal"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ y: 20, opacity: 0 }}
                  animate={{ y: 0, opacity: 1 }}
                  exit={{ y: 20, opacity: 0 }}
                >
                  <div className="modal-header">
                    <h3>
                      {authMode === "signup"
                        ? t("createAccount") || "Create your BizCall account"
                        : authTab === "email"
                        ? t("emailLoginSignup")
                        : t("verifyPhone")}
                    </h3>
                    <button
                      className="icon-btn"
                      onClick={() => setShowAuthModal(false)}
                    >
                      ✕
                    </button>
                  </div>

                  {/* Mode tabs: Login / Register */}
                  <div className="auth-mode-tabs">
                    <button
                      className={`auth-mode-tab ${
                        authMode === "login" ? "active" : ""
                      }`}
                      onClick={() => {
                        setAuthMode("login");
                        setAuthTab("email");
                        setConfirmationResult(null);
                        setVerificationCode("");
                      }}
                    >
                      {t("login")}
                    </button>
                    <button
                      className={`auth-mode-tab ${
                        authMode === "signup" ? "active" : ""
                      }`}
                      onClick={() => {
                        setAuthMode("signup");
                        setAuthTab("email");
                        setConfirmationResult(null);
                        setVerificationCode("");
                      }}
                    >
                      {t("signup")}
                    </button>
                  </div>

                  {/* Auth content */}
                  <div className="auth-content">
                    {authMode === "login" && (
                      <>
                        <div className="auth-tab-toggle">
                          <button
                            className={`auth-tab-btn ${
                              authTab === "email" ? "active" : ""
                            }`}
                            onClick={() => {
                              setAuthTab("email");
                              setConfirmationResult(null);
                              setVerificationCode("");
                            }}
                          >
                            {t("loginWithEmail")}
                          </button>
                          <button
                            className={`auth-tab-btn ${
                              authTab === "phone" ? "active" : ""
                            }`}
                            onClick={() => {
                              setAuthTab("phone");
                              setConfirmationResult(null);
                              setVerificationCode("");
                            }}
                          >
                            {t("loginWithPhone")}
                          </button>
                        </div>

                        {authTab === "email" && (
                          <form onSubmit={handleEmailAuth} className="auth-form">
                            <div className="auth-field-group">
                              <span className="field-label">
                                {t("emailAddress")}
                              </span>
                              <input
                                className="input"
                                type="email"
                                placeholder={t("emailPlaceholder")}
                                value={email}
                                onChange={(e) => setEmail(e.target.value)}
                              />
                            </div>
                            <div className="auth-field-group">
                              <span className="field-label">
                                {t("password")}
                              </span>
                              <input
                                className="input"
                                type="password"
                                placeholder={t("password")}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                              />
                            </div>
                            <div className="auth-actions">
                              <button type="submit" className="btn full-width">
                                {t("login")}
                              </button>
                              <button
                                type="button"
                                className="btn ghost full-width"
                                onClick={handleSendMagicLink}
                              >
                                {t("sendMagicLink")}
                              </button>
                            </div>
                          </form>
                        )}

                        {authTab === "phone" && (
                          <div className="auth-form">
                            <div className="auth-field-group">
                              <span className="field-label">
                                {t("phoneNumber")}
                              </span>
                              <div className="phone-input-group">
                                <select
                                  className="select phone-country"
                                  value={countryCode}
                                  onChange={(e) =>
                                    setCountryCode(e.target.value)
                                  }
                                >
                                  {PhoneCountryOptions.map((opt) => (
                                    <option key={opt.code} value={opt.code}>
                                      {opt.label}
                                    </option>
                                  ))}
                                </select>
                                <input
                                  className="input"
                                  type="tel"
                                  placeholder={t("phonePlaceholder")}
                                  value={phoneNumber}
                                  onChange={(e) =>
                                    setPhoneNumber(e.target.value)
                                  }
                                />
                              </div>
                            </div>

                            <div className="auth-field-group">
                              <button
                                className="btn full-width"
                                onClick={async () => {
                                  const raw = (phoneNumber || "").replace(
                                    /\D/g,
                                    ""
                                  );
                                  if (!raw || raw.length < 5 || raw.length > 12)
                                    return showMessage(
                                      t("enterValidPhone"),
                                      "error"
                                    );

                                  const fullPhone = countryCode + raw;
                                  if (!validatePhone(fullPhone))
                                    return showMessage(
                                      t("enterValidPhone"),
                                      "error"
                                    );

                                  setPhoneLoading(true);
                                  try {
                                    if (!window.recaptchaVerifier)
                                      createRecaptcha("recaptcha-container");
                                    const result = await signInWithPhoneNumber(
                                      auth,
                                      fullPhone,
                                      window.recaptchaVerifier
                                    );
                                    setConfirmationResult(result);
                                    showMessage(
                                      t("codeSent"),
                                      "success"
                                    );
                                  } catch (err) {
                                    console.error(err);
                                    showMessage(err.message, "error");
                                  } finally {
                                    setPhoneLoading(false);
                                  }
                                }}
                                disabled={phoneLoading}
                              >
                                {phoneLoading
                                  ? t("sending")
                                  : t("sendCode")}
                              </button>
                            </div>

                            {confirmationResult && (
                              <div className="auth-field-group">
                                <span className="field-label">
                                  {t("enterCode")}
                                </span>
                                <input
                                  className="input"
                                  type="text"
                                  placeholder={t("enterCode")}
                                  value={verificationCode}
                                  onChange={(e) =>
                                    setVerificationCode(
                                      e.target.value.replace(/\D/g, "")
                                    )
                                  }
                                  maxLength="6"
                                  inputMode="numeric"
                                />
                                <button
                                  className="btn full-width"
                                  onClick={async () => {
                                    if (!verificationCode.trim())
                                      return showMessage(
                                        t("enterCode"),
                                        "error"
                                      );
                                    if (
                                      !/^\d{6}$/.test(verificationCode.trim())
                                    )
                                      return showMessage(
                                        t("invalidCode"),
                                        "error"
                                      );

                                    setPhoneLoading(true);
                                    try {
                                      await confirmationResult.confirm(
                                        verificationCode
                                      );
                                      showMessage(
                                        t("signedIn"),
                                        "success"
                                      );
                                      setShowAuthModal(false);
                                      setPhoneNumber("");
                                      setVerificationCode("");
                                      setConfirmationResult(null);
                                    } catch (err) {
                                      console.error(err);
                                      showMessage(err.message, "error");
                                    } finally {
                                      setPhoneLoading(false);
                                    }
                                  }}
                                  disabled={phoneLoading}
                                >
                                  {phoneLoading
                                    ? t("verifying")
                                    : t("verifyAndLogin")}
                                </button>
                              </div>
                            )}

                            <div id="recaptcha-container" className="recaptcha"></div>
                          </div>
                        )}
                      </>
                    )}

                    {authMode === "signup" && (
                      <div className="auth-form">
                        <div className="auth-field-group">
                          <span className="field-label">
                            {t("emailAddress")}
                          </span>
                          <input
                            className="input"
                            type="email"
                            placeholder={t("emailPlaceholder")}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>

                        <div className="auth-field-group">
                          <span className="field-label">{t("password")}</span>
                          <input
                            className="input"
                            type="password"
                            placeholder={t("password")}
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                          />
                        </div>

                        <div className="auth-field-group">
                          <span className="field-label">
                            {t("repeatNewPassword")}
                          </span>
                          <input
                            className="input"
                            type="password"
                            placeholder={t("repeatNewPassword")}
                            value={passwordForm.repeatNewPassword}
                            onChange={(e) =>
                              setPasswordForm((prev) => ({
                                ...prev,
                                repeatNewPassword: e.target.value,
                              }))
                            }
                          />
                        </div>

                        <div className="auth-field-group">
                          <span className="field-label">
                            {t("phoneNumber")}
                          </span>
                          <div className="phone-input-group">
                            <select
                              className="select phone-country"
                              value={countryCode}
                              onChange={(e) => setCountryCode(e.target.value)}
                            >
                              {PhoneCountryOptions.map((opt) => (
                                <option key={opt.code} value={opt.code}>
                                  {opt.label}
                                </option>
                              ))}
                            </select>
                            <input
                              className="input"
                              type="tel"
                              placeholder={t("phonePlaceholder")}
                              value={phoneNumber}
                              onChange={(e) =>
                                setPhoneNumber(e.target.value)
                              }
                            />
                          </div>
                        </div>

                        <div className="auth-actions">
                          <button
                            className="btn full-width"
                            onClick={async () => {
                              if (!validateEmail(email))
                                return showMessage(
                                  t("enterValidEmail"),
                                  "error"
                                );

                              if (!password || password.length < 6)
                                return showMessage(
                                  t("passwordTooShort") ||
                                    "Password must be at least 6 characters",
                                  "error"
                                );

                              if (
                                !passwordForm.repeatNewPassword ||
                                passwordForm.repeatNewPassword !== password
                              )
                                return showMessage(
                                  t("passwordsDontMatch") ||
                                    "Passwords don't match",
                                  "error"
                                );

                              const raw = (phoneNumber || "").replace(
                                /\D/g,
                                ""
                              );
                              if (!raw || raw.length < 5 || raw.length > 12)
                                return showMessage(
                                  t("enterValidPhone"),
                                  "error"
                                );

                              const fullPhone = countryCode + raw;
                              if (!validatePhone(fullPhone))
                                return showMessage(
                                  t("enterValidPhone"),
                                  "error"
                                );

                              try {
                                const cred =
                                  await createUserWithEmailAndPassword(
                                    auth,
                                    email,
                                    password
                                  );
                                const user = cred.user;

                                try {
                                  await sendEmailVerification(user);
                                } catch {
                                  // ignore
                                }

                                // 4) Prepare reCAPTCHA for signup phone link
                                setPhoneLoading(true);

                                if (!window.recaptchaVerifierSignup) {
                                  // reuse your helper, but separate ID from login recaptcha
                                  createRecaptcha("recaptcha-signup");
                                  window.recaptchaVerifierSignup =
                                    window.recaptchaVerifier;
                                }

                                // 5) Use PhoneAuthProvider to send SMS & get verificationId
                                const provider = new PhoneAuthProvider(auth);
                                const verificationId =
                                  await provider.verifyPhoneNumber(
                                    fullPhone,
                                    window.recaptchaVerifierSignup
                                  );

                                // 6) Save verificationId so user can enter the code
                                setConfirmationResult(verificationId);
                                showMessage(
                                  t("codeSent") ||
                                    "Verification code sent via SMS",
                                  "success"
                                );
                              } catch (err) {
                                console.error(err);
                                showMessage(err.message, "error");
                              } finally {
                                setPhoneLoading(false);
                              }
                            }}
                            disabled={phoneLoading}
                          >
                            {phoneLoading
                              ? "..."
                              : t("createAccount") || "Create account"}
                          </button>
                        </div>

                        {/* SIGNUP SMS CODE STEP (PHONE LINKING) */}
                        {confirmationResult && (
                          <div
                            className="auth-field-group"
                            style={{ marginTop: "14px" }}
                          >
                            <span className="field-label">
                              {t("enterCode")}
                            </span>

                            <input
                              className="input"
                              type="text"
                              placeholder={t("enterCode")}
                              value={verificationCode}
                              onChange={(e) =>
                                setVerificationCode(
                                  e.target.value.replace(/\D/g, "")
                                )
                              }
                              maxLength="6"
                              inputMode="numeric"
                            />

                            <button
                              className="btn full-width"
                              style={{ marginTop: "10px" }}
                              onClick={async () => {
                                // Basic validation
                                if (!verificationCode.trim())
                                  return showMessage(
                                    t("enterCode"),
                                    "error"
                                  );

                                if (
                                  !/^\d{6}$/.test(verificationCode.trim())
                                )
                                  return showMessage(
                                    t("invalidCode"),
                                    "error"
                                  );

                                try {
                                  setPhoneLoading(true);

                                  // Use verificationId (confirmationResult) to build credential
                                  const verificationId = confirmationResult;
                                  const credential =
                                    PhoneAuthProvider.credential(
                                      verificationId,
                                      verificationCode.trim()
                                    );

                                  const currentUser = auth.currentUser;
                                  const linkResult =
                                    await linkWithCredential(
                                      currentUser,
                                      credential
                                    );

                                  const user =
                                    linkResult.user || currentUser;

                                  // Save profile to DB
                                  if (user) {
                                    await set(
                                      dbRef(db, `users/${user.uid}`),
                                      {
                                        email: user.email || email,
                                        phone: normalizePhoneForStorage(
                                          countryCode + phoneNumber
                                        ),
                                        createdAt: Date.now(),
                                      }
                                    );
                                  }

                                  showMessage(
                                    t("signupSuccess") ||
                                      "Account created, phone linked, and verification email sent.",
                                    "success"
                                  );

                                  // Cleanup UI
                                  setShowAuthModal(false);
                                  setEmail("");
                                  setPassword("");
                                  setPasswordForm({
                                    repeatNewPassword: "",
                                  });
                                  setPhoneNumber("");
                                  setVerificationCode("");
                                  setConfirmationResult(null);
                                } catch (err) {
                                  console.error(err);
                                  showMessage(err.message, "error");
                                } finally {
                                  setPhoneLoading(false);
                                }
                              }}
                              disabled={phoneLoading}
                            >
                              {phoneLoading
                                ? t("verifying") || "Verifying..."
                                : t("verifyPhone") ||
                                  "Verify & Finish Signup"}
                            </button>

                            {/* Add reCAPTCHA for signup */}
                            <div
                              id="recaptcha-signup"
                              className="recaptcha"
                            />
                          </div>
                        )}

                        <div
                          id="recaptcha-container"
                          className="recaptcha"
                        ></div>
                      </div>
                    )}
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* LISTING DETAILS MODAL */}
          <AnimatePresence>
            {selectedListing && (
              <motion.div
                className="modal-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={() => {
                  setSelectedListing(null);
                  const url = new URL(window.location.href);
                  url.searchParams.delete("listing");
                  window.history.replaceState({}, "", url.toString());
                }}
              >
                <motion.div
                  className="modal listing-details-modal"
                  onClick={(e) => e.stopPropagation()}
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.9, opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <div
                    className="modal-header category-banner"
                    style={{
                      background:
                        "linear-gradient(135deg, #2563eb, #3b82f6)",
                      color: "#fff",
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span
                        className="category-icon"
                        style={{ fontSize: "1.5rem" }}
                      >
                        {categoryIcons[selectedListing.category] ||
                          "🏷️"}
                      </span>
                      <h3 className="modal-title">
                        {selectedListing.name}
                      </h3>
                    </div>
                    <button
                      className="icon-btn light"
                      onClick={() => {
                        setSelectedListing(null);
                        const url = new URL(window.location.href);
                        url.searchParams.delete("listing");
                        window.history.replaceState(
                          {},
                          "",
                          url.toString()
                        );
                      }}
                    >
                      ✕
                    </button>
                  </div>

                  <div className="modal-body listing-details-body">
                    <div className="listing-details-main">
                      <div className="listing-details-section">
                        <h4>{t("businessOverview")}</h4>
                        <p>{selectedListing.description}</p>
                      </div>

                      <div className="listing-details-section">
                        <h4>{t("contactInfo")}</h4>
                        <div className="details-grid">
                          {selectedListing.phone && (
                            <div className="detail-row">
                              <span className="detail-label">
                                {t("phoneNumber")}
                              </span>
                              <a
                                href={`tel:${selectedListing.phone}`}
                                className="detail-value link"
                              >
                                {selectedListing.phone}
                              </a>
                            </div>
                          )}
                          {selectedListing.address && (
                            <div className="detail-row">
                              <span className="detail-label">
                                {t("address")}
                              </span>
                              <span className="detail-value">
                                {selectedListing.address}
                              </span>
                            </div>
                          )}
                          <div className="detail-row">
                            <span className="detail-label">
                              {t("city")}
                            </span>
                            <span className="detail-value">
                              {MK_CITIES[selectedListing.city] ||
                                selectedListing.city}
                            </span>
                          </div>
                          <div className="detail-row">
                            <span className="detail-label">
                              {t("price")}
                            </span>
                            <span className="detail-value">
                              {(selectedListing.price || 0) + " €"}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <div className="listing-details-sidebar">
                      <div className="listing-details-card">
                        <h4>{t("listingStatus")}</h4>
                        <div className="status-row">
                          {renderStatusBadge(selectedListing)}
                        </div>
                        <div className="status-row">
                          <span className="detail-label">
                            {t("postedOn")}
                          </span>
                          <span className="detail-value">
                            {formatDateTime(selectedListing.createdAt)}
                          </span>
                        </div>
                        <div className="status-row">
                          <span className="detail-label">
                            {t("expires")}
                          </span>
                          <span className="detail-value">
                            {formatDateTime(selectedListing.expiry)}
                          </span>
                        </div>
                      </div>

                      <div className="listing-details-card actions-card">
                        <h4>{t("actions")}</h4>
                        <button
                          className="btn full-width primary"
                          onClick={() => handleShareListing(selectedListing)}
                        >
                          {t("shareListing")}
                        </button>
                        {user && user.uid === selectedListing.ownerUid && (
                          <>
                            <button
                              className="btn full-width secondary"
                              onClick={() => {
                                handleEditListing(selectedListing);
                                setSelectedListing(null);
                              }}
                            >
                              {t("editListing")}
                            </button>
                            <button
                              className="btn full-width secondary"
                              onClick={() => {
                                handleExtendListing(selectedListing);
                                setSelectedListing(null);
                              }}
                            >
                              {t("extendListing")}
                            </button>
                            <button
                              className="btn full-width danger"
                              onClick={() => {
                                handleDeleteListing(selectedListing.id);
                                setSelectedListing(null);
                              }}
                            >
                              {t("deleteListing")}
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </PayPalScriptProvider>
  );
}

export default App;
