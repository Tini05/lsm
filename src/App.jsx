// src/App.jsx

import logo from "./assets/logo.png";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { auth, db, createRecaptcha } from "./firebase";
import { ref as dbRef, set, update, onValue, remove, push } from "firebase/database";
import {
  signInWithEmailAndPassword,
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
  RecaptchaVerifier,
  linkWithCredential,
} from "firebase/auth";

import { PayPalScriptProvider, PayPalButtons } from "@paypal/react-paypal-js";
import { AnimatePresence, motion as Motion } from "framer-motion";
import "leaflet/dist/leaflet.css";
import NorthMacedoniaMap from "./NorthMacedoniaMap";
import "./App.css";
import Sidebar from "./Sidebar";
import { TRANSLATIONS } from "./translations";
import { MK_CITIES } from "./mkCities";

const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://lsm-wozo.onrender.com");

const PAYPAL_CLIENT_ID = import.meta.env.VITE_PAYPAL_CLIENT_ID || "";

/* Data */
const categories = [
  "food", "car", "electronics", "homeRepair", "health",
  "education", "clothing", "pets", "services",
  "tech", "entertainment", "events", "other"
];

const categoryIcons = {
  food: "🍔",
  car: "🚗",
  electronics: "💡",
  homeRepair: "🧰",
  health: "💅",
  education: "🎓",
  clothing: "👕",
  pets: "🐾",
  services: "💼",
  tech: "💻",
  entertainment: "🎮",
  events: "🎟️",
  other: "✨",
};

const countryCodes = [
  { name: "MK", code: "+389" },
  { name: "AL", code: "+355" },
  { name: "KS", code: "+383" },
  { name: "SR", code: "+381" },
  { name: "GR", code: "+30" },
  { name: "BG", code: "+359" },
  { name: "TR", code: "+90" },
  { name: "DE", code: "+49" },
  { name: "US", code: "+1" },
];

const currencyOptions = ["EUR", "MKD"];

const mkSpotlightCities = [
  "Skopje",
  "Tetovë",
  "Gostivar",
  "Ohër",
  "Kumanovë",
  "Manastir",
  "Prilep",
  "Kërçovë",
];

const featuredCategories = ["tech", "services", "homeRepair", "food", "electronics", "car"];
const FEATURED_SLIDE_SIZE = 3;
const FEATURED_MAX_ITEMS = FEATURED_SLIDE_SIZE * 3;

/* Helper: strip obvious garbage like tags */
const stripDangerous = (v = "") => v.replace(/[<>]/g, "");

/* Helper: format offer price range */
const formatOfferPrice = (min, max, currency) => {
  const cleanMin = (min || "").trim();
  const cleanMax = (max || "").trim();
  const cur = currency || "EUR";

  if (!cleanMin && !cleanMax) return "";
  if (cleanMin && cleanMax) return `${cleanMin} - ${cleanMax} ${cur}`;
  if (cleanMin) return `from ${cleanMin} ${cur}`;
  if (cleanMax) return `up to ${cleanMax} ${cur}`;
  return "";
};

/* Helper: build final location string from city + extra */
const buildLocationString = (city, extra) => {
  const c = (city || "").trim();
  const e = (extra || "").trim();
  if (!c && !e) return "";
  if (c && e) return `${c} - ${e}`;
  return c || e;
};

const chunkArray = (items = [], size = 1) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const getDescriptionPreview = (text = "", limit = 160) => {
  const clean = stripDangerous(text || "").trim();
  if (!clean) return "";
  return clean.length > limit ? `${clean.slice(0, limit).trim()}…` : clean;
};

/* Helper: normalize phone numbers before storing */
const normalizePhoneForStorage = (raw) => {
  if (!raw) return raw;
  const trimmed = raw.trim();
  if (trimmed.startsWith("+")) return trimmed.replace(/\s+/g, "");
  const cleaned = trimmed.replace(/\D/g, "");
  if (cleaned === "") return trimmed;
  if (cleaned.length > 8 && cleaned.startsWith("00")) return "+" + cleaned.replace(/^0{2}/, "");
  const known = countryCodes.map((c) => c.code.replace("+", ""));
  for (const pre of known) if (cleaned.startsWith(pre)) return "+" + cleaned;
  return "+389" + cleaned;
};

const TabBar = ({ items = [], value, onChange, className = "", size = "default", fullWidth = false }) => (
  <div
    className={[
      "tabs",
      size === "compact" ? "tabs-compact" : "",
      fullWidth ? "tabs-full" : "",
      className,
    ].filter(Boolean).join(" ")}
  >
    {items.map((item) => (
      <button
        key={item.id}
        type="button"
        className={`tab ${value === item.id ? "active" : ""}`}
        onClick={() => onChange?.(item.id)}
      >
        {item.icon && <span className="tab-icon">{item.icon}</span>}
        <span className="tab-label">{item.label}</span>
        {item.badge !== undefined && (
          <span className="tab-badge">{item.badge}</span>
        )}
      </button>
    ))}
  </div>
);

export default function App() {
  /* i18n */
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "sq");
  const t = useCallback(
    (k) => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.sq?.[k] ?? k,
    [lang]
  );
  useEffect(() => localStorage.setItem("lang", lang), [lang]);

  /* Core state */
  const [form, setForm] = useState({
    step: 1,
    name: "",
    category: "",
    locationCity: "",
    locationExtra: "",
    locationData: null, // { city, area, lat, lng, mapsUrl } if you want later
    description: "",
    contact: "",
    offerMin: "",
    offerMax: "",
    offerCurrency: "EUR",
    offerprice: "",   // preformatted price string, saved in DB
    tags: "",
    socialLink: "",
    imagePreview: null, // local-only preview
  });
  const [plan, setPlan] = useState("1");
  const priceMap = { "1": 0.1, "3": 10, "6": 16, "12": 25 }; // plan price (listing duration)

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "info" });
  const [listings, setListings] = useState([]);
  const [user, setUser] = useState(null);
  const [selectedListing, setSelectedListing] = useState(null);
  const [initialListingId, setInitialListingId] = useState(null);
  const [userProfile, setUserProfile] = useState(null);

  /* Dashboard/UI */
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [selectedTab, setSelectedTabState] = useState("main"); // myListings | account | allListings
  const [viewMode, setViewMode] = useState("grid"); // "grid" | "list"
  const [showPostForm, setShowPostForm] = useState(false);

  // Wrapper to scroll to top when tab changes
  const setSelectedTab = useCallback((tab) => {
    setSelectedTabState(tab);
    // Scroll to top smoothly
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  /* Editing */
  const [editingListing, setEditingListing] = useState(null);
  const [editForm, setEditForm] = useState(null);

  /* Extend flow */
  const [extendTarget, setExtendTarget] = useState(null);
  const [extendPlan, setExtendPlan] = useState("1");

  const [showEditMapPicker, setShowEditMapPicker] = useState(false);

  /* Auth modal */
  const [showAuthModal, setShowAuthModal] = useState(false);
  // OLD: const [authTab, setAuthTab] = useState("email");
  const [authMode, setAuthMode] = useState("login"); // "login" | "signup"
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [resendBusy, setResendBusy] = useState(false);
  const [authTab, setAuthTab] = useState("email");   // "email" | "phone" (login method)
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [countryCode, setCountryCode] = useState("+389");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [confirmationResult, setConfirmationResult] = useState(null);
  const [phoneLoading, setPhoneLoading] = useState(false);
  // Signup flow: email + password + phone
  // const [signupPhoneConfirmation, setSignupPhoneConfirmation] = useState(null);

  const [postSignupVerifyOpen, setPostSignupVerifyOpen] = useState(false);
  
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

  /* Payment modal */
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [paymentIntent, setPaymentIntent] = useState(null); // { type: 'create'|'extend', orderID, amount, listingId }
  const [pendingOrder, setPendingOrder] = useState(null); // kept for create flow capture

  /* Filters / search */
  const [q, setQ] = useState("");
  const [catFilter, setCatFilter] = useState("");
  const [locFilter, setLocFilter] = useState("");
  const [sortBy, setSortBy] = useState("topRated");
  const [showMapPicker, setShowMapPicker] = useState(false);
  
  /* My Listings filters */
  const [myListingsStatusFilter, setMyListingsStatusFilter] = useState("all"); // "all" | "verified" | "pending"
  const [myListingsExpiryFilter, setMyListingsExpiryFilter] = useState("all"); // "all" | "expiring" | "expired" | "active"
  const [myListingsSort, setMyListingsSort] = useState("newest"); // "newest" | "oldest" | "expiring" | "az"
  const [myListingsSearch, setMyListingsSearch] = useState("");

  /* Favorites */
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("favorites") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => localStorage.setItem("favorites", JSON.stringify(favorites)), [favorites]);

  const listingLocationLabel = useMemo(() => {
    if (!selectedListing) return "";
    return (
      buildLocationString(
        selectedListing.locationData?.city || selectedListing.location,
        selectedListing.locationData?.area || selectedListing.locationExtra
      ) || t("unspecified") || "Unspecified"
    );
  }, [selectedListing, t]);

  const listingPriceLabel = useMemo(() => {
    if (!selectedListing) return "";
    return selectedListing.offerprice || t("unspecified") || "Unspecified";
  }, [selectedListing, t]);

  const listingContactAvailable = !!selectedListing?.contact;

  /* Feedback per listing (rating + comments) */
  const [feedbackStore, setFeedbackStore] = useState({});
  const [feedbackDraft, setFeedbackDraft] = useState({ rating: 4, comment: "" });
  const [feedbackSaving, setFeedbackSaving] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false); // Start closed, user can toggle

  /* Featured carousel */
  const [activeFeaturedCategory, setActiveFeaturedCategory] = useState(featuredCategories[0]);
  const [featuredSlide, setFeaturedSlide] = useState(0);

  /* Close sidebar with ESC */
  useEffect(() => {
    const onEsc = (e) => {
      if (e.key === "Escape") {
        setSidebarOpen(false);
        setShowAuthModal(false);
        setPaymentModalOpen(false);
        setShowMapPicker(false);
        if (editingListing) { setEditingListing(null); setEditForm(null); }
        if (selectedListing) setSelectedListing(null);
      }
    };
    window.addEventListener("keydown", onEsc);
    return () => window.removeEventListener("keydown", onEsc);
  }, [editingListing, selectedListing]);

  /* Lock body scroll when modals are open */
  useEffect(() => {
    const hasOpenModal = showAuthModal || showPostForm || selectedListing || editingListing || paymentModalOpen || showMapPicker || showEditMapPicker || filtersOpen;
    if (hasOpenModal) {
      const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
      document.body.style.overflow = 'hidden';
      document.body.style.paddingRight = `${scrollbarWidth}px`; // Prevent layout shift
    } else {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
    return () => {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    };
  }, [showAuthModal, showPostForm, selectedListing, editingListing, paymentModalOpen, showMapPicker, showEditMapPicker, filtersOpen]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const listingId = params.get("listing");
    if (listingId) {
      setInitialListingId(listingId);
    }
  }, []);

  useEffect(() => {
    if (!initialListingId || !listings.length) return;
  
    const target = listings.find((l) => l.id === initialListingId);
  
    if (target && target.status === "verified") {
      setSelectedListing(target);
      // prevent reopening on every listings change
      setInitialListingId(null);
    }
  }, [initialListingId, listings]);
  
  /* Auth state & DB subscription */
  useEffect(() => auth.onAuthStateChanged((u) => setUser(u)), []);
  useEffect(() => {
    if (!user) {
      setUserProfile(null);
      return undefined;
    }

    const profileRef = dbRef(db, `users/${user.uid}`);
    const unsubscribe = onValue(profileRef, (snapshot) => {
      setUserProfile(snapshot.val() || null);
    });

    return () => unsubscribe();
  }, [user]);
  useEffect(() => {
    const listingsRef = dbRef(db, "listings");
    onValue(listingsRef, (snapshot) => {
      const val = snapshot.val() || {};
      const arr = Object.keys(val).map((k) => ({ id: k, ...val[k] }));
      const valid = arr.filter((i) => !i.expiresAt || i.expiresAt > Date.now());
      setListings(valid);
    });
  }, []);

  useEffect(() => {
    const feedbackRef = dbRef(db, "feedback");
    const unsubscribe = onValue(feedbackRef, (snapshot) => {
      const val = snapshot.val() || {};
      const normalized = {};

      Object.entries(val).forEach(([listingId, entriesObj]) => {
        const entries = Object.values(entriesObj || {})
          .map((entry) => ({
            rating: Number(entry.rating) || 0,
            comment: entry.comment || "",
            createdAt: entry.createdAt || 0,
            userId: entry.userId || null,
            author: entry.author || null,
          }))
          .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))
          .slice(0, 50);

        normalized[listingId] = { entries };
      });

      setFeedbackStore(normalized);
    });

    return () => unsubscribe();
  }, []);

  /* Email-link sign-in (preserved) */
  useEffect(() => {
    if (isSignInWithEmailLink(auth, window.location.href)) {
      let emailForSignIn = window.localStorage.getItem("emailForSignIn");
      if (!emailForSignIn) emailForSignIn = window.prompt(t("enterEmail"));
      if (emailForSignIn) {
        signInWithEmailLink(auth, emailForSignIn, window.location.href)
          .then(() => {
            window.localStorage.removeItem("emailForSignIn");
            showMessage(t("signedIn"), "success");
            setShowAuthModal(false);
          })
          .catch((err) => showMessage(t("error") + " " + err.message, "error"));
      }
    }
    // eslint-disable-next-line
  }, []);

  const handleChangeEmail = async (e) => {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) {
      showMessage(t("loginRequired"), "error");
      return;
    }

    if (!emailForm.newEmail || !validateEmail(emailForm.newEmail)) {
      showMessage(t("enterValidEmail"), "error");
      return;
    }
    
    if (!emailForm.currentPassword) {
      showMessage(t("enterCurrentPassword"), "error");
      return;
    }
    
    if (!currentUser.email) {
      showMessage(t("emailChangeNotAvailable"), "error");
      return;
    }

    // Check if email is different
    if (emailForm.newEmail === currentUser.email) {
      showMessage(t("enterValidEmail") || "Please enter a different email address", "error");
      return;
    }

    // Check if current email is verified (some Firebase projects require this)
    if (!currentUser.emailVerified) {
      showMessage(t("verifyYourEmail") || "Please verify your current email address before changing it.", "error");
      return;
    }

    setSavingEmail(true);
    try {
      // Reauthenticate user
      const cred = EmailAuthProvider.credential(
        currentUser.email,
        emailForm.currentPassword
      );
      await reauthenticateWithCredential(currentUser, cred);
      
      // Try to update email in Firebase Auth
      try {
        await updateEmail(currentUser, emailForm.newEmail);
        
        // Send verification email for the new email
        try {
          await sendEmailVerification(currentUser);
        } catch (verifyErr) {
          console.warn("Verification email send failed:", verifyErr);
          // Not critical if verification email fails, email is still changed
        }
        
        // Update user profile in database
        await update(dbRef(db, `users/${currentUser.uid}`), { 
          email: emailForm.newEmail 
        });
        
        // Reload user to get updated email
        await currentUser.reload();
        
        // Update user state
        const updatedUser = auth.currentUser;
        setUser(updatedUser);
        
        showMessage(t("emailUpdateSuccess") || "Email updated successfully! Please check your new email for verification.", "success");
        setEmailForm({ newEmail: "", currentPassword: "" });
      } catch (updateErr) {
        // If updateEmail fails with operation-not-allowed, it's a Firebase Auth restriction
        // The error message "Please verify the new email before changing email" is misleading
        // This typically means email changes are restricted at the project level
        if (updateErr.code === "auth/operation-not-allowed") {
          // Still update the database with the new email as a reference
          // The user will need to use the new email for future logins, but Firebase Auth won't reflect it
          try {
            await update(dbRef(db, `users/${currentUser.uid}`), { 
              email: emailForm.newEmail,
              previousEmail: currentUser.email,
              emailChangeRequestedAt: Date.now()
            });
            
            showMessage(
              "⚠️ Email change is restricted by Firebase. Your new email has been saved in your profile, but you'll need to sign out and sign in with your new email address. Alternatively, contact support to enable email changes in Firebase Console.",
              "error"
            );
          } catch (dbErr) {
            console.error("Database update failed:", dbErr);
            showMessage(
              "Email change failed. Firebase has restricted email changes. Please contact support or check Firebase Console > Authentication > Settings.",
              "error"
            );
          }
          setEmailForm({ newEmail: "", currentPassword: "" });
          return;
        }
        throw updateErr;
      }
    } catch (err) {
      console.error("Email update error:", err);
      let errorMessage = err.message || t("emailUpdateError");
      
      // Provide more helpful error messages
      if (err.code === "auth/wrong-password" || err.code === "auth/invalid-credential") {
        errorMessage = t("enterCurrentPassword") || "Incorrect password. Please try again.";
      } else if (err.code === "auth/email-already-in-use") {
        errorMessage = "This email is already in use by another account.";
      } else if (err.code === "auth/requires-recent-login") {
        errorMessage = "Please log out and log back in before changing your email.";
      } else if (err.code === "auth/operation-not-allowed") {
        errorMessage = "Email changes are blocked by 'Email Enumeration Protection' in Firebase. To fix: Install Google Cloud SDK, then run: gcloud identity-platform settings update --project=YOUR_PROJECT_ID --disable-email-enum. Or check Firebase Console > Authentication > Settings for email enumeration protection settings.";
      }
      
      showMessage(errorMessage, "error");
    } finally {
      setSavingEmail(false);
    }
  };

  const handleChangePassword = async (e) => {
    e.preventDefault();
    const currentUser = auth.currentUser;
    if (!currentUser) return showMessage(t("loginRequired"), "error");

    const { currentPassword, newPassword, repeatNewPassword } = passwordForm;

    if (!currentPassword) {
      showMessage(t("enterCurrentPassword"), "error");
      return;
    }
    if (!newPassword || newPassword.length < 6) {
      showMessage(t("passwordTooShort"), "error");
      return;
    }
    if (newPassword !== repeatNewPassword) {
      showMessage(t("passwordsDontMatch"), "error");
      return;
    }
    if (!currentUser.email) {
      showMessage(t("passwordChangeNotAvailable"), "error");
      return;
    }

    setSavingPassword(true);
    try {
      const cred = EmailAuthProvider.credential(currentUser.email, currentPassword);
      await reauthenticateWithCredential(currentUser, cred);
      await updatePassword(currentUser, newPassword);
      await currentUser.reload();
      setUser(auth.currentUser);
      showMessage(t("passwordUpdateSuccess"), "success");
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        repeatNewPassword: "",
      });
    } catch (err) {
      showMessage(t("passwordUpdateError") + " " + err.message, "error");
    } finally {
      setSavingPassword(false);
    }
  };

  const getSignupRecaptcha = () => {
    if (window.signupRecaptchaVerifier) return window.signupRecaptchaVerifier;
  
    window.signupRecaptchaVerifier = new RecaptchaVerifier(
      auth,
      "recaptcha-signup",
      { size: "invisible" }
    );
  
    return window.signupRecaptchaVerifier;
  };

  
  /* Helpers */
  const showMessage = (text, type = "info") => {
    setMessage({ text, type });
    setTimeout(() => setMessage({ text: "", type: "info" }), 5000);
  };
  const validateEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
  const validatePhone = (s) => !!s && s.replace(/\D/g, "").length >= 8 && s.replace(/\D/g, "").length <= 16;

  const accountPhone = useMemo(
    () => normalizePhoneForStorage(user?.phoneNumber || userProfile?.phone || ""),
    [user?.phoneNumber, userProfile]
  );

  useEffect(() => {
    if (!accountPhone) return;
    setForm((f) => ({ ...f, contact: accountPhone }));
  }, [accountPhone]);

  const handleImageUpload = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setForm((f) => ({ ...f, imagePreview: ev.target?.result || null }));
    reader.readAsDataURL(file);
  };

  async function createListingInFirebase(obj) {
    const listingId = obj.id || "lst_" + Date.now();
    const listingData = {
      ...obj,
      id: listingId,
      userId: user?.uid || null,
      userEmail: user?.email || null,
      createdAt: Date.now(),
      expiresAt: Date.now() + parseInt(obj.plan) * 30 * 24 * 60 * 60 * 1000,
    };
    await set(dbRef(db, `listings/${listingId}`), listingData);
    return listingId;
  }

  async function fetchListing(listingId) {
    return new Promise((resolve) => {
      const ref = dbRef(db, `listings/${listingId}`);
      onValue(ref, (snapshot) => resolve(snapshot.val()), { onlyOnce: true });
    });
  }
  async function deleteListing(listingId) {
    try {
      await remove(dbRef(db, `listings/${listingId}`));
    } catch (error) {
      console.error("Error deleting listing:", error);
    }
  }
  async function checkPaymentStatus(listingId) {
    setTimeout(async () => {
      const snapshot = await fetchListing(listingId);
      if (!snapshot) return;
      if (snapshot.status === "pending_payment") {
        await update(dbRef(db, `listings/${listingId}`), { status: "expired" });
        await deleteListing(listingId);
      }
    }, 60000);
  }

  /* Create listing + open payment modal */
  async function handleSubmit(e) {
    e.preventDefault();
    if (!user) { setShowAuthModal(true); showMessage(t("loginRequired"), "error"); return; }
    if (!user.emailVerified) { showMessage(t("verifyEmailFirst"), "error"); return; }

    const finalLocation = buildLocationString(form.locationCity, form.locationExtra);

    // basic validation across all steps
    const phoneForListing = accountPhone || form.contact;
    const requiredOk = form.name && form.category && finalLocation && form.description && phoneForListing;
    if (!requiredOk) return showMessage(t("fillAllFields"), "error");

    if (!phoneForListing) {
      return showMessage(t("addPhoneInAccount") || "Please add your phone number in your account first.", "error");
    }

    const normalizedContact = normalizePhoneForStorage(phoneForListing);
    if (!validatePhone(normalizedContact)) return showMessage(t("enterValidPhone"), "error");

    // refresh offerprice string from range fields
    const offerpriceStr = formatOfferPrice(form.offerMin, form.offerMax, form.offerCurrency);

    setLoading(true);
    setMessage({ text: "", type: "info" });
    const listingId = "lst_" + Date.now();

    try {
      // create pending listing
      await createListingInFirebase({
        ...form,
        id: listingId,
        category: categories.find(c => t(c) === form.category) ? categories.find(c => t(c) === form.category) : form.category,
        contact: normalizedContact,
        location: finalLocation,
        locationCity: form.locationCity,
        locationExtra: form.locationExtra,
        plan,
        offerprice: offerpriceStr || "",   // business offer price (range)
        status: "pending_payment",
        pricePaid: 0,
        price: priceMap[plan],              // plan price (duration)
      });

      // create order on your server
      const createRes = await fetch(`${API_BASE}/api/paypal/create-order`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ listingId, amount: priceMap[plan], action: "create_listing" }),
      });
      const createData = await createRes.json();
      if (!createData.orderID) throw new Error("Failed to create PayPal order");

      setPendingOrder({ listingId, orderID: createData.orderID });
      setPaymentIntent({ type: "create", orderID: createData.orderID, amount: priceMap[plan], listingId });
      setPaymentModalOpen(true);

      showMessage(t("orderCreated"), "success");
      checkPaymentStatus(listingId);
    } catch (err) {
      console.error(err);
      showMessage(t("error") + " " + err.message, "error");
      await deleteListing(listingId);
    } finally {
      setLoading(false);
    }
  }

  /* Capture create flow */
  async function handleServerCapture(orderID, listingId) {
    try {
      const resp = await fetch(`${API_BASE}/api/paypal/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderID, listingId, action: "create_listing" }),
      });
      const json = await resp.json();
      if (json.ok) {
        const normalizedContact = normalizePhoneForStorage(accountPhone || form.contact);
        const offerpriceStr = formatOfferPrice(form.offerMin, form.offerMax, form.offerCurrency);
        const finalLocation = buildLocationString(form.locationCity, form.locationExtra);

        await update(dbRef(db, `listings/${listingId}`), {
          ...form,
          status: "verified",
          pricePaid: priceMap[plan],
          contact: normalizedContact,
          offerprice: offerpriceStr || "",
          location: finalLocation,
          locationCity: form.locationCity,
          locationExtra: form.locationExtra,
          plan,
          price: priceMap[plan],
          id: listingId,
          userId: user?.uid || null,
          userEmail: user?.email || null,
          createdAt: Date.now(),
          expiresAt: Date.now() + parseInt(plan) * 30 * 24 * 60 * 60 * 1000,
        });
        showMessage(t("paymentComplete"), "success");
        setPendingOrder(null);
        setPaymentModalOpen(false);
        setPaymentIntent(null);
        setForm({
          step: 1,
          name: "",
          category: "",
          locationCity: "",
          locationExtra: "",
          locationData: null,
          description: "",
          contact: "",
          offerMin: "",
          offerMax: "",
          offerCurrency: "EUR",
          offerprice: "",
          tags: "",
          socialLink: "",
          imagePreview: null,
        });
      } else {
        showMessage(t("paymentFailed") + " " + JSON.stringify(json.error), "error");
      }
    } catch (err) {
      console.error(err);
      showMessage(t("error") + " " + err.message, "error");
    }
  }

  /* Extend flow */
  async function startExtendFlow(listing) {
    if (!user) {
      setShowAuthModal(true);
      showMessage(t("loginRequired"), "error");
      return;
    }

    if (listing.userId !== user.uid) {
      showMessage(t("notOwner") || "You are not owner of this listing.", "error");
      return;
    }

    // Use the listing's original plan as default (fallback 1 month)
    const planKey = String(listing.plan || "1");
    const amount = priceMap[planKey] ?? listing.price ?? 0;

    setExtendTarget(listing);
    setExtendPlan(planKey);
    setPaymentIntent({
      type: "extend",
      listingId: listing.id,
      amount,
    });
    setPaymentModalOpen(true);
  }

  async function handleServerCaptureForExtend(orderID, listingId, planKeyFromUI) {
    try {
      const resp = await fetch(`${API_BASE}/api/paypal/capture`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orderID, listingId, action: "extend" }),
      });
      const json = await resp.json();

      if (json.ok) {
        const snapshot = await fetchListing(listingId);
        const currentExpiry = snapshot?.expiresAt || Date.now();

        // Use the plan chosen in the modal; fallback to listing.plan or 1
        const effectivePlanKey =
          planKeyFromUI || String(snapshot?.plan || "1");
        const planMonths = parseInt(effectivePlanKey, 10) || 1;

        const base = Math.max(Date.now(), currentExpiry);
        const newExpiry =
          base + planMonths * 30 * 24 * 60 * 60 * 1000; // months * 30 days

        await update(dbRef(db, `listings/${listingId}`), {
          expiresAt: newExpiry,
          // optional: track last extension choice
          lastExtendPlan: effectivePlanKey,
        });

        showMessage(t("extendSuccess") || "Listing extended successfully ✅", "success");
        setExtendTarget(null);
        setPaymentModalOpen(false);
        setPaymentIntent(null);
      } else {
        showMessage(
          (t("extendFailed") || "Extend payment failed:") +
            " " +
            JSON.stringify(json.error),
          "error"
        );
      }
    } catch (err) {
      console.error(err);
      showMessage(t("error") + " " + err.message, "error");
    }
  }


  /* Editing helpers (restored) */
  const openEdit = (listing) => {
    const rawLocation = (listing.location || "").trim();
    const guessedCity =
      listing.locationCity || MK_CITIES.find((city) => rawLocation.startsWith(city)) || "";
    const guessedExtra =
      listing.locationExtra ||
      (guessedCity ? rawLocation.replace(guessedCity, "").replace(/^\s*-\s*/, "").trim() : "");

    const lockedContact = normalizePhoneForStorage(
      listing.contact || accountPhone || userProfile?.phone || ""
    );

    setEditingListing(listing);
    setEditForm({
      name: listing.name || "",
      category: listing.category || "",
      locationCity: guessedCity,
      locationExtra: guessedExtra,
      locationData: listing.locationData || null,
      description: listing.description || "",
      contact: lockedContact,
      plan: listing.plan || "1",
      price: listing.price || priceMap[listing.plan] || "",         // plan price
      offerprice: listing.offerprice || "",                         // business offer price (already formatted)
      tags: listing.tags || "",
      socialLink: listing.socialLink || "",
      imagePreview: listing.imagePreview || null,
    });
  };
  const saveEdit = async () => {
    if (!editingListing || !editForm) return;

    const finalLocation = buildLocationString(editForm.locationCity, editForm.locationExtra);
    const phoneForListing = editForm.contact || accountPhone || editingListing.contact;

    if (!phoneForListing) return showMessage(t("addPhoneInAccount") || t("fillAllFields"), "error");

    if (!editForm.name || !editForm.category || !editForm.locationCity || !editForm.description)
      return showMessage(t("fillAllFields"), "error");

    const normalizedContact = normalizePhoneForStorage(phoneForListing);
    if (!validatePhone(normalizedContact)) return showMessage(t("enterValidPhone"), "error");

    const updates = {
      name: stripDangerous(editForm.name),
      category: editForm.category,
      location: finalLocation,
      locationCity: editForm.locationCity,
      locationExtra: editForm.locationExtra,
      locationData: editForm.locationData || null,
      description: stripDangerous(editForm.description),
      contact: normalizedContact,
      offerprice: editForm.offerprice || "",   // update only business price string
      tags: stripDangerous(editForm.tags || ""),
      socialLink: stripDangerous(editForm.socialLink || ""),
      imagePreview: editForm.imagePreview || null,
    };
    await update(dbRef(db, `listings/${editingListing.id}`), updates);
    showMessage(t("save") + " ✅", "success");
    setEditingListing(null); setEditForm(null);
  };

  const confirmDelete = async (id) => {
    if (!window.confirm("Delete this listing?")) return;
    await deleteListing(id);
    showMessage("Listing deleted", "success");
  };

  /* Derived data */
  const verifiedListings = useMemo(() => listings.filter((l) => l.status === "verified"), [listings]);
  const allLocations = useMemo(
    () => Array.from(new Set(verifiedListings.map((l) => (l.location || "").trim()).filter(Boolean))),
    [verifiedListings]
  );
  const feedbackAverages = useMemo(() => {
    const map = {};

    Object.entries(feedbackStore).forEach(([listingId, data]) => {
      const entries = data?.entries || [];
      const total = entries.reduce((sum, e) => sum + (Number(e.rating) || 0), 0);
      const count = entries.length;
      map[listingId] = { count, avg: count ? Number((total / count).toFixed(1)) : null };
    });

    return map;
  }, [feedbackStore]);
  const filtered = useMemo(() => {
    let arr = [...verifiedListings];
    if (q.trim()) {
      const term = q.trim().toLowerCase();
      arr = arr.filter(
        (l) =>
          (l.name || "").toLowerCase().includes(term) ||
          (l.description || "").toLowerCase().includes(term)
      );
    }
    if (catFilter) arr = arr.filter((l) => (t(l.category) || l.category) === catFilter);
    if (locFilter) arr = arr.filter((l) => l.location === locFilter);
    if (sortBy === "topRated") {
      arr.sort((a, b) => {
        const aStats = feedbackAverages[a.id] || {};
        const bStats = feedbackAverages[b.id] || {};
        const bAvg = bStats.avg ?? -1;
        const aAvg = aStats.avg ?? -1;
        if (bAvg !== aAvg) return bAvg - aAvg;
        const bCount = bStats.count || 0;
        const aCount = aStats.count || 0;
        if (bCount !== aCount) return bCount - aCount;
        return (b.createdAt || 0) - (a.createdAt || 0);
      });
    }
    if (sortBy === "newest") arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (sortBy === "expiring") arr.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
    if (sortBy === "az") arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [verifiedListings, q, catFilter, locFilter, sortBy, feedbackAverages, t]);

  // Helper function to calculate days until expiration
  const getDaysUntilExpiry = (expiresAt) => {
    if (!expiresAt) return null;
    const now = Date.now();
    const diff = expiresAt - now;
    const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
    return days;
  };

  const myListingsRaw = useMemo(() => listings.filter((l) => l.userId === user?.uid), [listings, user]);
  
  const myListings = useMemo(() => {
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
  
  const myVerifiedCount = useMemo(
    () => myListingsRaw.filter((l) => l.status === "verified").length,
    [myListingsRaw]
  );
  const myPendingCount = useMemo(
    () => myListingsRaw.filter((l) => l.status !== "verified").length,
    [myListingsRaw]
  );

  const getFeedbackForListing = useCallback(
    (listingId) => feedbackStore[listingId]?.entries || [],
    [feedbackStore]
  );

  const getAverageRating = useCallback(
    (listingId) => {
      const entries = getFeedbackForListing(listingId);
      if (!entries.length) return null;
      const total = entries.reduce((sum, entry) => sum + (Number(entry.rating) || 0), 0);
      return Number((total / entries.length).toFixed(1));
    },
    [getFeedbackForListing]
  );

  const getListingStats = useCallback(
    (listing) => {
      const stats = feedbackAverages[listing.id] || {};
      const feedbackCount = listing.feedbackCount ?? stats.count ?? 0;
      const avgRating = listing.avgRating ?? stats.avg ?? 0;
      const engagement = feedbackCount + (favorites.includes(listing.id) ? 1 : 0);

      return { feedbackCount, avgRating, engagement };
    },
    [favorites, feedbackAverages]
  );

  const featuredByCategory = useMemo(() => {
    const verified = listings.filter((l) => l.status === "verified");
    const map = {};

    categories.forEach((category) => {
      const top = verified
        .filter((l) => l.category === category)
        .map((listing) => {
          const stats = feedbackAverages[listing.id] || {};
          return {
            ...listing,
            avgRating: stats.avg ?? getAverageRating(listing.id) ?? 0,
            feedbackCount: stats.count || 0,
          };
        })
        .sort((a, b) => {
          if ((b.avgRating || 0) !== (a.avgRating || 0)) return (b.avgRating || 0) - (a.avgRating || 0);
          return (b.createdAt || 0) - (a.createdAt || 0);
        })
        .slice(0, FEATURED_MAX_ITEMS);

      if (top.length) map[category] = top;
    });

    return map;
  }, [feedbackAverages, getAverageRating, listings]);

  const featuredCategoryOrder = useMemo(
    () => featuredCategories.filter((cat) => featuredByCategory[cat]?.length),
    [featuredByCategory]
  );

  const featuredSlides = useMemo(() => {
    const slides = {};
    Object.entries(featuredByCategory).forEach(([cat, items]) => {
      slides[cat] = chunkArray(items, FEATURED_SLIDE_SIZE);
    });
    return slides;
  }, [featuredByCategory]);

  const changeFeaturedSlide = useCallback(
    (delta) => {
      const total = featuredSlides[activeFeaturedCategory]?.length || 1;
      setFeaturedSlide((current) => {
        const normalizedTotal = total || 1;
        const next = (current + delta) % normalizedTotal;
        return next < 0 ? normalizedTotal + next : next;
      });
    },
    [activeFeaturedCategory, featuredSlides]
  );

  const toggleFav = (id) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const feedbackStats = useMemo(() => {
    if (!selectedListing) return { entries: [], avg: null, count: 0 };
    const entries = getFeedbackForListing(selectedListing.id);
    const stats = feedbackAverages[selectedListing.id];
    return { entries, avg: stats?.avg ?? null, count: stats?.count ?? 0 };
  }, [feedbackAverages, selectedListing, getFeedbackForListing]);

  useEffect(() => {
    if (!selectedListing) return;
    const lastRating = getFeedbackForListing(selectedListing.id)[0]?.rating || 4;
    setFeedbackDraft({ rating: lastRating, comment: "" });
  }, [getFeedbackForListing, selectedListing]);

  useEffect(() => {
    if (!featuredCategoryOrder.length) return;
    if (!featuredCategoryOrder.includes(activeFeaturedCategory)) {
      setActiveFeaturedCategory(featuredCategoryOrder[0]);
    }
  }, [activeFeaturedCategory, featuredCategoryOrder]);

  useEffect(() => {
    const slides = featuredSlides[activeFeaturedCategory] || [];
    if (!slides.length) {
      setFeaturedSlide(0);
      return;
    }

    setFeaturedSlide((prev) => (prev >= slides.length ? 0 : prev));
  }, [activeFeaturedCategory, featuredSlides]);

  useEffect(() => {
    if (featuredCategoryOrder.length <= 1) return undefined;

    const id = setInterval(() => {
      setActiveFeaturedCategory((current) => {
        const idx = featuredCategoryOrder.indexOf(current);
        const next = featuredCategoryOrder[(idx + 1) % featuredCategoryOrder.length];
        return next || featuredCategoryOrder[0];
      });
    }, 6000);

    return () => clearInterval(id);
  }, [featuredCategoryOrder]);

  useEffect(() => {
    const slides = featuredSlides[activeFeaturedCategory] || [];
    if (slides.length <= 1) return undefined;

    const id = setInterval(() => {
      setFeaturedSlide((current) => (current + 1) % slides.length);
    }, 5000);

    return () => clearInterval(id);
  }, [activeFeaturedCategory, featuredSlides]);

  const handleFeedbackSubmit = async (listingId) => {
    if (!listingId) return;
    const rating = Math.min(Math.max(Number(feedbackDraft.rating) || 0, 1), 5);
    const comment = (feedbackDraft.comment || "").trim();

    if (!comment) {
      showMessage(t("commentEmptyError"), "error");
      return;
    }

    const entry = {
      rating,
      comment,
      createdAt: Date.now(),
      userId: user?.uid || null,
      author: user?.email || user?.phoneNumber || null,
    };

    setFeedbackSaving(true);
    try {
      await push(dbRef(db, `feedback/${listingId}`), entry);
      setFeedbackDraft((d) => ({ ...d, comment: "" }));
      showMessage(t("feedbackSaved"), "success");
    } catch (error) {
      console.error(error);
      showMessage(t("feedbackSaveError"), "error");
    } finally {
      setFeedbackSaving(false);
    }
  };

  const handleShareListing = (listing) => {
    const url = `${window.location.origin}?listing=${encodeURIComponent(listing.id)}`;
    const text = `${listing.name || ""} • ${listing.location || ""} – ${
      t("shareText")
    }`;

    if (navigator.share) {
      navigator
        .share({
          title: listing.name || t("appName"),
          text,
          url,
        })
        .catch(() => {
          // user canceled or share failed silently; no need to spam them
        });
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(url);
      showMessage(
        t("shareCopied") || "Linku i listimit u kopjua në clipboard ✅",
        "success"
      );
    } else {
      showMessage(
        t("shareNotSupported") || "Ky pajisje nuk e përkrah ndarjen direkt.",
        "error"
      );
    }
  };
  
  /* Header */
  const Header = () => (
    <header className="header">
      <div className="header-inner">
        <button
          className="icon-btn mobile-menu-btn"
          onClick={() => setSidebarOpen(true)}
          aria-label={t("menu") || "Menu"}
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <line x1="3" y1="6" x2="21" y2="6"></line>
            <line x1="3" y1="12" x2="21" y2="12"></line>
            <line x1="3" y1="18" x2="21" y2="18"></line>
          </svg>
        </button>

        <button onClick={() => setSelectedTab("main")} className="brand">
          <div className="brand-mark">
            <div className="brand-logo-wrap">
              <img
                src={logo}
                alt="BizCall logo"
                className="brand-logo"
              />
            </div>
          </div>
          <div className="brand-text">
            <h1 className="brand-title">BizCall</h1>
            <p className="brand-tagline">{t("community") || "Trusted local services"}</p>
          </div>
        </button>

        <nav className="header-nav desktop-nav" aria-label="Primary navigation">
          {primaryNav.map((item) => (
            <button
              key={item.id}
              style={{color: "#000"}}
              className={`nav-chip ${selectedTab === item.id ? "active" : ""}`}
              onClick={() => setSelectedTab(item.id)}
            >
              <span className="nav-chip-label">{item.icon} {item.label}</span>
              {item.badge !== undefined && <span className="nav-chip-badge">{item.badge}</span>}
            </button>
          ))}
        </nav>

        <div className="header-actions">
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="sq">🇦🇱 SQ</option>
            <option value="mk">🇲🇰 MK</option>
            <option value="en">🇬🇧 EN</option>
          </select>

          {user ? (
            <>
              <button className="btn btn-ghost desktop-only" onClick={async () => { await signOut(auth); showMessage(t("signedOut"), "success"); }}>
                {t("logout")}
              </button>
            </>
          ) : (
            <button
              className="btn desktop-only"
              onClick={() => {
                setShowAuthModal(true);
                setMessage({ text: "", type: "info" });
              }}
            >
              {t("login")}
            </button>
          )}
        </div>
      </div>
    </header>
  );

  const previewLocation = buildLocationString(form.locationCity, form.locationExtra);
  const editLocationPreview = editForm
    ? buildLocationString(editForm.locationCity, editForm.locationExtra)
    : "";

  const activeListingCount = listings.length;
  const verifiedListingCount = listings.filter((l) => l.isVerified).length;
  const phoneVerifiedCount = listings.filter((l) => l.phoneVerified).length;
  const featuredSlidesForActive = featuredSlides[activeFeaturedCategory] || [];
  const featuredSlideCount = featuredSlidesForActive.length || 1;
  const featuredItemsForSlide =
    featuredSlidesForActive[featuredSlide] || featuredSlidesForActive[0] || [];

  const homeActionCards = useMemo(
    () => [
      {
        id: "post",
        title: t("submitListing") || "Post a listing",
        description:
          t("heroPanelSubtitle") ||
          "Publish a service in minutes with contact verification and a mobile-first preview.",
        icon: "🚀",
        cta: t("submitListing") || "Start now",
        onClick: () => {
          setShowPostForm(true);
          setForm((f) => ({ ...f, step: 1 }));
        },
      },
      {
        id: "explore",
        title: t("explore") || "Explore listings",
        description:
          t("allListingsHint") ||
          "Filter by category, city, and tags without endless scrolling or reloads.",
        icon: "🧭",
        cta: t("explore") || "Browse",
        onClick: () => setSelectedTab("allListings"),
      },
      {
        id: "verify",
        title: t("verified") || "Stay verified",
        description:
          t("heroPointTwo") ||
          "Keep trust high with verified phone or email and clearly stated price ranges.",
        icon: "🛡️",
        cta: t("verifyYourEmail") || "Verify now",
        onClick: () => setShowAuthModal(true),
      },
    ],
    [t]
  );

  const homeGrowthSteps = useMemo(
    () => [
      {
        title: t("growthStepPost") || "Post today",
        description:
          t("growthStepPostDesc") ||
          "Launch a verified offer with city tags and a clear price window.",
        stat: `${activeListingCount} ${t("listingsLabel") || "listings"}`,
      },
      {
        title: t("growthStepShare") || "Share fast",
        description:
          t("shareHint") ||
          "Send your link to neighbours or socials and collect fresh feedback.",
        stat: `${favorites.length} ${t("favorites") || "favorites"}`,
      },
      {
        title: t("growthStepRespond") || "Respond anywhere",
        description:
          t("growthStepRespondDesc") ||
          "Tap-friendly actions keep replies quick on any screen size.",
        stat: `${verifiedListingCount} ${t("verified") || "verified"}`,
      },
    ],
    [t, activeListingCount, favorites.length, verifiedListingCount]
  );

  const trafficIdeas = useMemo(
    () => [
      {
        icon: "📈",
        title: t("trafficIdeasTrending") || "Trending carousel",
        text:
          t("spotlightHint") ||
          "Keep one listing refreshed weekly to stay in the featured rail.",
      },
      {
        icon: "💬",
        title: t("trafficIdeasFeedback") || "Collect replies",
        text:
          t("trafficIdeasFeedbackDesc") ||
          "Highlight reviews and phone verification to boost trust.",
      },
      {
        icon: "🗺️",
        title: t("trafficIdeasLocal") || "Local focus",
        text:
          t("trafficIdeasLocalDesc") ||
          "Target nearby cities with chips and map-ready contact options.",
      },
    ],
    [t]
  );

  const mobileHighlights = useMemo(
    () => [
      {
        title: t("quickStart") || "Built for speed",
        description:
          t("exploreHeroSubtitle") ||
          "Actions and stats sit side-by-side so the mobile layout stays within thumb reach.",
        badge: `${activeListingCount} ${t("listingsLabel") || "listings"}`,
      },
      {
        title: t("verified") || "Trust signals",
        description:
          t("heroPanelSubtitle") ||
          "Badges, chips, and plan details stay visible even when cards stack on smaller screens.",
        badge: `${phoneVerifiedCount} ${t("phoneVerified") || "phone verified"}`,
      },
      {
        title: t("cityShortcuts") || "Local focus",
        description:
          t("mkRibbonSubtitle") ||
          "City shortcuts, spotlight rails, and action tiles make it easy to hop between towns.",
        badge: `${mkSpotlightCities.length} ${t("cities") || "cities"}`,
      },
    ],
    [t, activeListingCount, phoneVerifiedCount]
  );

  const primaryNav = useMemo(
    () => [
      { id: "main", label: t("homepage") || "Home", icon: "🏠" },
      { id: "allListings", label: t("explore") || "Explore", icon: "🧭", badge: listings.length },
      ...(user
        ? [
            { id: "myListings", label: t("myListings") || "My listings", icon: "📂", badge: myListingsRaw.length },
            { id: "account", label: t("account") || "Account", icon: "👤" },
          ]
        : []),
    ],
    [t, listings.length, myListingsRaw.length, user]
  );

  const currentSectionLabel = useMemo(() => {
    if (selectedTab === "myListings") return t("myListings") || "My listings";
    if (selectedTab === "account") return t("account") || "Account";
    if (selectedTab === "allListings") return t("explore") || "Explore";
    return t("dashboard") || "Dashboard";
  }, [selectedTab, t]);

  const sortLabelMap = useMemo(
    () => ({
      topRated: t("sortTopRated") || "Highest rated",
      newest: t("sortNewest"),
      expiring: t("sortExpiring"),
      az: t("sortAZ"),
    }),
    [t]
  );

  const authModeTabs = useMemo(
    () => [
      { id: "login", label: t("login") || "Login" },
      { id: "signup", label: t("signup") || "Register" },
    ],
    [t]
  );

  const authMethodTabs = useMemo(
    () => [
      { id: "email", label: t("emailTab") || "Email", icon: "✉️" },
      { id: "phone", label: t("signInWithPhone") || "Phone", icon: "📱" },
    ],
    [t]
  );

  const handleAuthModeChange = (mode) => {
    setAuthMode(mode);
    setConfirmationResult(null);
    if (mode === "login") setAuthTab("email");
  };

  const handleAuthTabChange = (tab) => {
    setAuthTab(tab);
    setConfirmationResult(null);
  };

  return (
    <PayPalScriptProvider options={{ "client-id": PAYPAL_CLIENT_ID, currency: "EUR", locale: "en_MK" }}>
      {message.text && <div className={`notification ${message.type}`}>{message.text}</div>}

      <div className="app">
        <Header />

        {selectedTab === "main" && (
          <div className="app-main-content">
            {/* HERO SECTION */}
            <section className="home-hero-simple">
              <h1 className="hero-simple-title">{t("homeSimpleTitle")}</h1>
              <p className="hero-simple-subtitle">{t("homeSimpleSubtitle")}</p>
              <div className="hero-simple-ctas">
                <button className="btn btn-primary" onClick={() => { setShowPostForm(true); setForm((f) => ({ ...f, step: 1 })); }}>
                  📝 {t("homeSimpleCtaPost")}
                </button>
                <button className="btn btn-outline" onClick={() => setSelectedTab("allListings")}>
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
                      onClick={() => { setCatFilter(t(cat)); setSelectedTab("allListings"); }}
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
                      onClick={() => { setLocFilter(city); setSelectedTab("allListings"); }}
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
                      <p style={{ fontSize: "0.85rem", margin: "8px 0", color: "#475569", lineHeight: "1.4" }}>
                        {step === 1 ? t("homeHowItWorksStep1") : step === 2 ? t("homeHowItWorksStep2") : t("homeHowItWorksStep3")}
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
                <div className="stat-item">
                  <p className="stat-value blue">{activeListingCount}</p>
                  <p className="stat-label">{t("listingsLabel") || "Active"}</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value green">{verifiedListingCount}</p>
                  <p className="stat-label">{t("verified") || "Verified"}</p>
                </div>
                <div className="stat-item">
                  <p className="stat-value purple">{mkSpotlightCities.length}</p>
                  <p className="stat-label">{t("cities") || "Cities"}</p>
                </div>
              </div>
            </section>
          </div>
        )}

        {/* SIDEBAR (overlay closes on click; ESC handled globally) */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <Motion.div
                className="sidebar-overlay"
                onClick={() => setSidebarOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <Motion.aside
                className="sidebar mobile-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.3 }}
                style={{ touchAction: "none", WebkitOverflowScrolling: "touch" }}
              >
                <Sidebar
                  t={t}
                  selected={selectedTab}
                  onSelect={(tab) => {
                    setSelectedTab(tab);
                    setSidebarOpen(false);
                  }}
                  onLogout={async () => {
                    await signOut(auth);
                    showMessage(t("signedOut"), "success");
                    setSidebarOpen(false);
                  }}
                  onLogin={() => {
                    setShowAuthModal(true);
                    setSidebarOpen(false);
                  }}
                  onClose={() => setSidebarOpen(false)}
                  user={user}
                />
              </Motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content container */}
        <div className="container">
          {/* Routes */}
          {selectedTab !== "main" ? (
            <div className="dashboard">
              {/* Dashboard content */}
              <main className="dashboard-content">
                <div className="panel">
                  <div className="dashboard-topbar">
                    <div className="dashboard-meta">
                      <p className="eyebrow subtle">{t("dashboard")}</p>
                      <h2 className="dashboard-heading">{t("manageListings") || "Manage everything in one place"}</h2>
                    </div>
                    <div className="topbar-tabs">
                      <span className="pill current-view">{currentSectionLabel}</span>
                      {selectedTab !== "allListings" && (
                        <button
                          className="btn btn-ghost small"
                          type="button"
                          onClick={() => setSelectedTab("allListings")}
                        >
                          🌍 {t("explore") || "Explore"}
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="tab-panel unified-panel">
                    {selectedTab === "myListings" && (
                      <div className="section my-listings-section">
                        <div className="section-header-row stacked-mobile">
                          <div>
                            <h2 className="section-title-inner">📁 {t("myListings")}</h2>
                            <p className="section-subtitle-small">
                              {t("myListingsHint") || "Review, edit and extend your listings in one place."}
                            </p>
                          </div>
                          <div className="pill-row">
                            <span className="badge count">
                              {myListings.length} {(myListings.length === 1 ? t("listing") || "listing" : t("listingsLabel") || "listings")}
                            </span>
                            {myVerifiedCount > 0 && (
                              <span className="badge success">
                                ✅ {myVerifiedCount} {t("verified")}
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="my-listings-toolbar">
                          <div className="my-listings-stats">
                            <div className="stat-chip positive">
                              <span className="stat-label">✅ {t("verified")}</span>
                              <span className="stat-value">{myVerifiedCount}</span>
                            </div>
                            {myPendingCount > 0 && (
                              <div className="stat-chip subtle">
                                <span className="stat-label">⏳ {t("pending")}</span>
                                <span className="stat-value">{myPendingCount}</span>
                              </div>
                            )}
                            {(() => {
                              const expiringSoon = myListingsRaw.filter(l => {
                                const days = getDaysUntilExpiry(l.expiresAt);
                                return days !== null && days > 0 && days <= 7;
                              }).length;
                              return expiringSoon > 0 ? (
                                <div className="stat-chip warning">
                                  <span className="stat-label">⚠️ {t("expiringSoon") || "Expiring soon"}</span>
                                  <span className="stat-value">{expiringSoon}</span>
                                </div>
                              ) : null;
                            })()}
                            {(() => {
                              const totalReviews = myListingsRaw.reduce((sum, l) => {
                                const stats = getListingStats(l);
                                return sum + (stats.feedbackCount || 0);
                              }, 0);
                              return totalReviews > 0 ? (
                                <div className="stat-chip info">
                                  <span className="stat-label">💬 {t("reviews") || "Reviews"}</span>
                                  <span className="stat-value">{totalReviews}</span>
                                </div>
                              ) : null;
                            })()}
                          </div>
                          <div className="my-listings-actions">
                            <button
                              className="btn btn-ghost small"
                              onClick={() => setSelectedTab("allListings")}
                              type="button"
                            >
                              🔍 {t("explore") || "Browse listings"}
                            </button>
                            <button
                              className="btn small"
                              onClick={() => {
                                setSelectedTab("myListings");
                                setShowPostForm(true);
                              }}
                              type="button"
                            >
                              ➕ {t("submitListing") || "Create listing"}
                            </button>
                          </div>
                        </div>

                        {/* My Listings Filters & Sort */}
                        {myListingsRaw.length > 0 && (
                          <div className="my-listings-filters-bar">
                            <div className="my-listings-filters-left">
                              <input
                                type="search"
                                className="input my-listings-search-input"
                                placeholder={t("searchPlaceholder") || "Search your listings..."}
                                value={myListingsSearch}
                                onChange={(e) => setMyListingsSearch(e.target.value)}
                              />
                              <select
                                className="select my-listings-filter-select"
                                value={myListingsStatusFilter}
                                onChange={(e) => setMyListingsStatusFilter(e.target.value)}
                              >
                                <option value="all">{t("allStatuses") || "All statuses"}</option>
                                <option value="verified">{t("verified")}</option>
                                <option value="pending">{t("pending")}</option>
                              </select>
                              <select
                                className="select my-listings-filter-select"
                                value={myListingsExpiryFilter}
                                onChange={(e) => setMyListingsExpiryFilter(e.target.value)}
                              >
                                <option value="all">{t("allExpiry") || "All"}</option>
                                <option value="expiring">{t("expiringSoon") || "Expiring soon"}</option>
                                <option value="active">{t("active") || "Active"}</option>
                                <option value="expired">{t("expired") || "Expired"}</option>
                              </select>
                            </div>
                            <div className="my-listings-filters-right">
                              <select
                                className="select my-listings-sort-select"
                                value={myListingsSort}
                                onChange={(e) => setMyListingsSort(e.target.value)}
                              >
                                <option value="newest">{t("sortNewest")}</option>
                                <option value="oldest">{t("sortOldest") || "Oldest first"}</option>
                                <option value="expiring">{t("sortExpiring")}</option>
                                <option value="az">{t("sortAZ")}</option>
                              </select>
                              {(myListingsSearch || myListingsStatusFilter !== "all" || myListingsExpiryFilter !== "all") && (
                                <button
                                  className="btn btn-ghost small"
                                  onClick={() => {
                                    setMyListingsSearch("");
                                    setMyListingsStatusFilter("all");
                                    setMyListingsExpiryFilter("all");
                                  }}
                                  type="button"
                                >
                                  {t("clearAll") || "Clear all"}
                                </button>
                              )}
                            </div>
                          </div>
                        )}

                        {myListings.length === 0 ? (
                          <div className="empty my-listings-empty">
                            <div className="empty-icon">📭</div>
                            <p className="empty-text">
                              {myListingsRaw.length === 0 
                                ? t("noListingsYet")
                                : (myListingsSearch || myListingsStatusFilter !== "all" || myListingsExpiryFilter !== "all")
                                  ? t("noListingsMatchFilters") || "No listings match your filters. Try adjusting your search."
                                  : t("noListingsYet")
                              }
                            </p>
                            {myListingsRaw.length > 0 && (myListingsSearch || myListingsStatusFilter !== "all" || myListingsExpiryFilter !== "all") && (
                              <button
                                className="btn small"
                                onClick={() => {
                                  setMyListingsSearch("");
                                  setMyListingsStatusFilter("all");
                                  setMyListingsExpiryFilter("all");
                                }}
                                type="button"
                              >
                                {t("clearFilters") || "Clear filters"}
                              </button>
                            )}
                          </div>
                        ) : (
                          <div className="listing-grid my-listings-grid responsive-grid">
                            {myListings.map((l) => (
                              <article key={l.id} className="listing-card my-listing-card elevated">
                                <header className="listing-header my-listing-header rich-header">
                                  <div className="listing-icon-bubble">{categoryIcons[l.category] || "🏷️"}</div>
                                  <div className="listing-header-main">
                                    <div className="listing-title-row spaced">
                                      <h3 className="listing-title">{l.name}</h3>
                                      <span
                                        className={`status-chip ${l.status === "verified" ? "status-chip-verified" : "status-chip-pending"}`}
                                      >
                                        {l.status === "verified" ? `✅ ${t("verified")}` : `⏳ ${t("pending")}`}
                                      </span>
                                    </div>
                                    <div className="listing-meta-row pill-row-tight">
                                      <span className="pill pill-category">
                                        {categoryIcons[l.category] || "🏷️"} {t(l.category) || l.category}
                                      </span>
                                      {l.location && (
                                        <span className="pill pill-location">
                                          📍 {l.location}
                                        </span>
                                      )}
                                      {l.createdAt && (
                                        <span className="pill pill-soft pill-date">
                                          📅 {new Date(l.createdAt).toLocaleDateString()}
                                        </span>
                                      )}
                                    </div>
                                    {(() => {
                                      const days = getDaysUntilExpiry(l.expiresAt);
                                      const isExpiringSoon = days !== null && days > 0 && days <= 7;
                                      const isExpired = days !== null && days <= 0;
                                      return (
                                        <div className={`listing-expiry-info ${isExpiringSoon ? "expiring-soon" : ""} ${isExpired ? "expired" : ""}`}>
                                          {l.expiresAt ? (
                                            <>
                                              <span className="expiry-label">{t("expires")}:</span>
                                              <span className="expiry-date">{new Date(l.expiresAt).toLocaleDateString()}</span>
                                              {days !== null && (
                                                <span className={`expiry-days ${isExpiringSoon ? "warning" : ""} ${isExpired ? "expired-text" : ""}`}>
                                                  {isExpired 
                                                    ? ` ⚠️ ${t("expired") || "Expired"}`
                                                    : isExpiringSoon 
                                                      ? ` ⏰ ${days} ${days === 1 ? t("day") || "day" : t("days") || "days"} ${t("remaining") || "left"}`
                                                      : ` (${days} ${days === 1 ? t("day") || "day" : t("days") || "days"})`
                                                  }
                                                </span>
                                              )}
                                            </>
                                          ) : (
                                            <span className="expiry-date">{t("noExpiry") || "No expiration"}</span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                  {(() => {
                                    const stats = getListingStats(l);
                                    return (
                                      <div className="listing-score-pill">
                                        <span className="score-main">⭐ {Number(stats.avgRating || 0).toFixed(1)}</span>
                                        <span className="score-sub">{stats.feedbackCount} {t("reviews") || "reviews"}</span>
                                      </div>
                                    );
                                  })()}
                                </header>

                                <div className="listing-card-body-enhanced">
                                  <p className="listing-description clamp-3 enhanced-copy">
                                    {getDescriptionPreview(l.description, 120)}
                                  </p>

                                  {(() => {
                                    const stats = getListingStats(l);
                                    return (
                                      <div className="listing-stats ribboned">
                                        <span className="stat-chip rating">⭐ {Number(stats.avgRating || 0).toFixed(1)}</span>
                                        <span className="stat-chip">💬 {stats.feedbackCount}</span>
                                        <span className="stat-chip subtle">🔥 {stats.engagement}</span>
                                        {l.offerprice && (
                                          <span className="pill pill-price subtle-pill">💶 {l.offerprice}</span>
                                        )}
                                      </div>
                                    );
                                  })()}

                                  {(l.tags || l.contact) && (
                                    <div className="my-listing-highlights rich-highlights">
                                      {l.tags && (
                                        <span className="pill pill-tags">🏷️ {l.tags.split(",")[0]?.trim() || l.tags}</span>
                                      )}
                                      {l.contact && (
                                        <span className="pill pill-contact">📞 {l.contact}</span>
                                      )}
                                    </div>
                                  )}
                                </div>

                                <div className="my-listing-footer framed-footer">
                                  <div className="listing-actions-primary">
                                    <button
                                      className="btn btn-primary small"
                                      onClick={() => {
                                        setSelectedListing(l);
                                        const url = new URL(window.location.href);
                                        url.searchParams.set("listing", l.id);
                                        window.history.replaceState({}, "", url.toString());
                                      }}
                                    >
                                      👁️ {t("view") || "View"}
                                    </button>
                                    <button
                                      className="btn small"
                                      onClick={() => openEdit(l)}
                                    >
                                      ✏️ {t("edit")}
                                    </button>
                                    <button
                                      className="btn small btn-extend"
                                      onClick={() => startExtendFlow(l)}
                                    >
                                      ⏰ {t("extend")}
                                    </button>
                                  </div>
                                  <div className="listing-actions-secondary">
                                    <button
                                      className="btn btn-ghost small icon-only"
                                      onClick={() => window.open(`tel:${l.contact}`)}
                                      title={t("call")}
                                    >
                                      📞
                                    </button>
                                    <button
                                      className="btn btn-ghost small icon-only"
                                      onClick={() =>
                                        window.open(
                                          `mailto:${l.userEmail || ""}?subject=Regarding%20${encodeURIComponent(
                                            l.name || ""
                                          )}`
                                        )
                                      }
                                      title={t("emailAction")}
                                    >
                                      ✉️
                                    </button>
                                    <button
                                      className="btn btn-ghost small icon-only"
                                      onClick={() => {
                                        navigator.clipboard?.writeText(l.contact || "");
                                        showMessage(t("copied"), "success");
                                      }}
                                      title={t("copy")}
                                    >
                                      📋
                                    </button>
                                    <button
                                      className="btn btn-ghost small icon-only"
                                      type="button"
                                      onClick={() => handleShareListing(l)}
                                      title={t("share")}
                                    >
                                      🔗
                                    </button>
                                    <button
                                      className="btn btn-ghost small icon-only btn-delete"
                                      onClick={() => confirmDelete(l.id)}
                                      title={t("del")}
                                    >
                                      🗑️
                                    </button>
                                  </div>
                                </div>
                              </article>
                            ))}
                          </div>
                        )}
                      </div>
                    )}


                    {selectedTab === "account" && (
                      <div className="section account-shell">
                        {/* Account Header */}
                        <div className="account-header-section">
                          <div className="account-header-content">
                            <h2 className="account-page-title">👤 {t("account")}</h2>
                            <p className="account-page-subtitle">
                              {t("accountSubtitle")}
                            </p>
                          </div>
                          <div className="account-header-actions">
                            <button className="btn btn-ghost small" onClick={() => setSelectedTab("allListings")}>
                              🧭 {t("explore")}
                            </button>
                            <button className="btn small" onClick={() => setShowPostForm(true)}>
                              ➕ {t("submitListing")}
                            </button>
                          </div>
                        </div>

                        {/* Quick Stats */}
                        <div className="account-quick-stats">
                          {[
                              { 
                                icon: "📁", 
                                label: t("myListings"), 
                                value: myListingsRaw.length, 
                                hint: `${myVerifiedCount} ${t("verified")}`,
                                color: "blue"
                              },
                              { 
                                icon: "⭐", 
                                label: t("favorites"), 
                                value: favorites.length, 
                                hint: t("reputation"),
                                color: "yellow"
                              },
                              { 
                                icon: "📅", 
                                label: t("memberSince"), 
                                value: user?.metadata?.creationTime
                                  ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })
                                  : "—",
                                hint: t("accountSince"),
                                color: "purple"
                              },
                            ].map((stat) => (
                              <div key={stat.label} className={`account-stat-card-enhanced stat-${stat.color}`}>
                                <div className="stat-icon">{stat.icon}</div>
                                <div className="stat-content">
                                  <p className="stat-label">{stat.label}</p>
                                  <p className="stat-value">{stat.value}</p>
                                  {stat.hint && <p className="stat-note">{stat.hint}</p>}
                                </div>
                              </div>
                            ))}
                        </div>

                        <div className="account-panels">
                          <div className="account-column">
                            {/* Profile Information Card */}
                            <div className="card account-card-enhanced">
                              <div className="account-card-header">
                                <h3 className="account-card-title">📋 {t("profileInfo")}</h3>
                                <p className="account-card-subtitle">{t("accountDetails")}</p>
                              </div>
                              
                              <div className="account-info-list">
                                <div className="account-info-item">
                                  <div className="account-info-item-icon">✉️</div>
                                  <div className="account-info-item-content">
                                    <p className="account-info-label">{t("emailLabel")}</p>
                                    <p className="account-info-value">{user?.email || "—"}</p>
                                    {user?.emailVerified ? (
                                      <span className="account-info-badge verified">✅ {t("verified")}</span>
                                    ) : (
                                      <span className="account-info-badge not-verified">⏳ {t("pendingVerification")}</span>
                                    )}
                                  </div>
                                </div>
                                
                                <div className="account-info-item">
                                  <div className="account-info-item-icon">📞</div>
                                  <div className="account-info-item-content">
                                    <p className="account-info-label">{t("phoneNumber")}</p>
                                    <p className="account-info-value">
                                      {accountPhone || (
                                        <span className="account-info-placeholder">{t("addPhoneNumber")}</span>
                                      )}
                                    </p>
                                  </div>
                                </div>
                                
                                <div className="account-info-item">
                                  <div className="account-info-item-icon">📅</div>
                                  <div className="account-info-item-content">
                                    <p className="account-info-label">{t("accountSince")}</p>
                                    <p className="account-info-value">
                                      {user?.metadata?.creationTime
                                        ? new Date(user.metadata.creationTime).toLocaleDateString('en-US', { 
                                            year: 'numeric', 
                                            month: 'long', 
                                            day: 'numeric' 
                                          })
                                        : "—"}
                                    </p>
                                  </div>
                                </div>
                              </div>

                              {!user?.emailVerified && (
                                <div className="account-alert-enhanced">
                                  <div className="account-alert-icon">⚠️</div>
                                  <div className="account-alert-content">
                                    <p className="account-alert-title">{t("verifyYourEmail")}</p>
                                    <p className="account-alert-sub">{t("verifyEmailHint")}</p>
                                    <div className="account-alert-actions">
                                      <button
                                        className="btn btn-ghost small"
                                        onClick={async () => {
                                          try {
                                            if (user) {
                                              await sendEmailVerification(user);
                                              showMessage(t("verificationSent"), "success");
                                            }
                                          } catch (err) {
                                            showMessage(t("verificationError") + " " + err.message, "error");
                                          }
                                        }}
                                      >
                                        {t("resendVerificationEmail")}
                                      </button>
                                      <button
                                        className="btn small"
                                        onClick={() => {
                                          setAuthMode("verify");
                                          setShowAuthModal(true);
                                        }}
                                      >
                                        {t("iVerified")}
                                      </button>
                                    </div>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Quick Links Card */}
                            <div className="card account-card-enhanced account-quick-links">
                              <div className="account-card-header">
                                <h3 className="account-card-title">⚡ {t("quickActions")}</h3>
                              </div>
                              <div className="account-quick-links-list">
                                <button 
                                  className="account-quick-link-item"
                                  onClick={() => setSelectedTab("myListings")}
                                >
                                  <span className="quick-link-icon">📁</span>
                                  <div className="quick-link-content">
                                    <p className="quick-link-title">{t("myListings")}</p>
                                    <p className="quick-link-subtitle">{myListingsRaw.length} {t("listingsLabel")}</p>
                                  </div>
                                  <span className="quick-link-arrow">→</span>
                                </button>
                                <button 
                                  className="account-quick-link-item"
                                  onClick={() => setSelectedTab("allListings")}
                                >
                                  <span className="quick-link-icon">🔍</span>
                                  <div className="quick-link-content">
                                    <p className="quick-link-title">{t("explore")}</p>
                                    <p className="quick-link-subtitle">{t("browseListingsHint")}</p>
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
                    )}

                    {selectedTab === "allListings" && (
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
                          {/* FILTER BOTTOM SHEET - COMPLETELY DIFFERENT APPROACH */}
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
                                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ minWidth: "24" }}>
                                        <line x1="18" y1="6" x2="6" y2="18"></line>
                                        <line x1="6" y1="6" x2="18" y2="18"></line>
                                      </svg>
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
                                          <svg className="filter-search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ minWidth: "24" }}>
                                            <circle cx="11" cy="11" r="8"></circle>
                                            <path d="m21 21-4.35-4.35"></path>
                                          </svg>
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
                                              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ minWidth: "24" }}>
                                                <line x1="18" y1="6" x2="6" y2="18"></line>
                                                <line x1="6" y1="6" x2="18" y2="18"></line>
                                              </svg>
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
                                                  <div className="filter-option-check">
                                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" style={{ minWidth: "24" }}>
                                                      <polyline points="20 6 9 17 4 12"></polyline>
                                                    </svg>
                                                  </div>
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
                                          <svg className="filter-select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                          </svg>
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
                                          <svg className="filter-select-arrow" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                                            <polyline points="6 9 12 15 18 9"></polyline>
                                          </svg>
                                        </div>
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </>
                          )}

                          <div className="explore-results-area">
                            {filtered.length > 0 ? (
                              <div className={`listing-grid-${viewMode}`}>
                              {filtered.map((l) => (
                                <article
                                  key={l.id}
                                  className="listing-card explore-card-modern"
                                  onClick={() => {
                                    setSelectedListing(l);
                                    const url = new URL(window.location.href);
                                    url.searchParams.set("listing", l.id);
                                    window.history.replaceState({}, "", url.toString());
                                  }}
                                >
                                  <header className="listing-header listing-header-dense">
                                    <div className="listing-title-wrap">
                                      <div className="listing-title-row">
                                        <span className="listing-icon-bubble">
                                          {categoryIcons[l.category] || "🏷️"}
                                        </span>
                                        <div>
                                          <h3 className="listing-title">{l.name}</h3>
                                          <div className="listing-meta pill-row-tight">
                                            <span className="pill pill-category">{t(l.category) || l.category}</span>
                                            <span className="pill pill-location">📍 {l.location}</span>
                                            {l.expiresAt && (
                                              <span className="pill pill-ghost subtle-pill">
                                                ⏱️ {new Date(l.expiresAt).toLocaleDateString()}
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    </div>

                                    <div className="listing-badges dense-badges">
                                      {l.offerprice && <span className="pill pill-price">{l.offerprice}</span>}
                                      <span className="badge verified">✓ {t("verified")}</span>
                                    </div>
                                  </header>

                                  <div className="listing-card-body">
                                    <p className="listing-description listing-description-clamp listing-description-preview">
                                      {getDescriptionPreview(l.description, 180)}
                                    </p>

                                    {(() => {
                                      const stats = getListingStats(l);
                                      return (
                                        <div className="listing-stats spaced">
                                          <span className="stat-chip rating">⭐ {Number(stats.avgRating || 0).toFixed(1)}</span>
                                          <span className="stat-chip">💬 {stats.feedbackCount}</span>
                                          <span className="stat-chip subtle">🔥 {stats.engagement}</span>
                                          {l.tags && (
                                            <span className="pill pill-tags">
                                              {l.tags.split(",")[0]?.trim()}
                                              {l.tags.split(",").length > 1 ? " +" : ""}
                                            </span>
                                          )}
                                        </div>
                                      );
                                    })()}
                                  </div>

                                  <div
                                    className="listing-footer-row"
                                    onClick={(e) => e.stopPropagation()}
                                  >
                                    <div className="listing-footer-left">
                                      {l.contact && (
                                        <span className="pill pill-contact ghost-pill">
                                          📞 {l.contact}
                                        </span>
                                      )}
                                      {l.socialLink && (
                                        <span className="pill pill-ghost subtle-pill">
                                          🔗 {t("websiteLabel")}
                                        </span>
                                      )}
                                    </div>

                                    <div className="listing-actions compact">
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={() => window.open(`tel:${l.contact}`)}
                                      >
                                        📞
                                      </button>
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={() =>
                                          window.open(
                                            `mailto:${l.userEmail || ""}?subject=Regarding%20${encodeURIComponent(
                                              l.name || ""
                                            )}`
                                          )
                                        }
                                      >
                                        ✉️
                                      </button>
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard?.writeText(l.contact || "");
                                          showMessage(t("copied"), "success");
                                        }}
                                      >
                                        📋
                                      </button>
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={() => handleShareListing(l)}
                                      >
                                        🔗
                                      </button>
                                      <button
                                        className="icon-btn"
                                        type="button"
                                        onClick={() => toggleFav(l.id)}
                                      >
                                        {favorites.includes(l.id) ? "★" : "☆"}
                                      </button>
                                    </div>
                                  </div>
                                </article>
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
                    )}
                  </div>
                </div>
              </main>
            </div>
          ) : (
            /* Home (Submit + Quick Browse) */
            <div className="main-grid">
              {/* ====== SUBMIT SECTION ====== */}
              {user && user.emailVerified && !showPostForm && (
                <button
                  type="button"
                  className="floating-post-btn"
                  onClick={() => {
                    setShowPostForm(true);
                    setForm((f) => ({ ...f, step: 1 }));
                  }}
                >
                  ➕ {t("submitListing")}
                </button>
               )}

              {user && !user.emailVerified && (
                <div className="verify-banner">
                  <div>
                    <strong>{t("verifyYourEmail")}</strong>
                    <div className="verify-banner-sub">{t("verifyEmailHint")}</div>
                  </div>
                  <button
                    className="btn btn-ghost small"
                    onClick={() => {
                      setShowAuthModal(true);
                      setAuthMode("verify");
                    }}
                  >
                    {t("verifyYourEmail")}
                  </button>
                </div>
              )}

              {/* ====== MOMENTUM SECTION ====== */}
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
                    <button className="btn" onClick={() => setSelectedTab("allListings")}>
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

                <div className="card feature-card">
                  <div className="feature-card__head">
                    <p className="eyebrow subtle">{t("verified")}</p>
                    <h3 className="section-title-small">🔒 {t("trustSafetyLane")}</h3>
                    <p className="section-subtitle-small">
                      {t("trustSafetyLaneDesc")}
                    </p>
                  </div>
                  <ul className="feature-list">
                    <li>✔️ {t("phoneVerified")}: {phoneVerifiedCount}</li>
                    <li>✔️ {t("listingsLabel")}: {activeListingCount}</li>
                    <li>✔️ {t("categorySpotlight")}: {featuredCategoryOrder.slice(0, 3).map((cat) => t(cat)).join(", ")}</li>
                  </ul>
                  <div className="feature-badges">
                    <span className="pill pill-soft">📬 {t("homeDigest")}</span>
                    <span className="pill pill-soft">📍 {mkSpotlightCities[0]}</span>
                  </div>
                </div>

                <div className="card feature-card">
                  <div className="feature-card__head">
                    <p className="eyebrow subtle">{t("featured")}</p>
                    <h3 className="section-title-small">🧭 {t("localMissions")}</h3>
                    <p className="section-subtitle-small">
                      {t("localMissionsDesc")}
                    </p>
                  </div>
                  <div className="mission-list">
                    <div className="mission-item">
                      <span className="mission-icon">🌟</span>
                      <div>
                        <h4>{t("updateListing")}</h4>
                        <p>{t("updateListingHint")}</p>
                      </div>
                    </div>
                    <div className="mission-item">
                      <span className="mission-icon">🤝</span>
                      <div>
                        <h4>{t("share")}</h4>
                        <p>{t("shareLinkHint")}</p>
                      </div>
                    </div>
                    <div className="mission-item">
                      <span className="mission-icon">🎯</span>
                      <div>
                        <h4>{t("categorySpotlight")}</h4>
                        <p>{t("pickCityChip")}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showPostForm && user && user.emailVerified && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPostForm(false)}
            >
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
                    onClick={() => setShowPostForm(false)}
                  >
                    ✕
                  </button>
                </div>
        
                <div className="modal-body" style={{ maxHeight: "80vh", overflowY: "auto" }}>
                {user && user.emailVerified ? (
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
                            onClick={() => setShowMapPicker(true)}
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
                            {previewLocation || "—"}
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
                ) : (
                  <section className="card trust-section" style={{ height: "fit-content" }}>
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
                )}
                </div>
              </Motion.aside>
            </Motion.div>
          )}
        </AnimatePresence>
    
        {/* MAP PICKER MODAL */}
        <AnimatePresence>
          {showMapPicker && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMapPicker(false)}
            >
              <Motion.div
                className="modal map-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">
                    {t("chooseOnMap")}
                  </h3>
                  <button
                    className="icon-btn"
                    onClick={() => setShowMapPicker(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body" style={{ maxHeight: "70vh", overflow: "hidden" }}>
                  <NorthMacedoniaMap
                    selectedCity={form.locationCity}
                    onSelectCity={(cityName) => {
                      setForm((f) => ({ ...f, locationCity: cityName }));
                      showMessage(
                        `${t("locationSetTo")} ${cityName}`,
                        "success"
                      );
                      setShowMapPicker(false);
                    }}
                  />
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {showEditMapPicker && editForm && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{zIndex: 55 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowEditMapPicker(false)}
            >
              <Motion.div
                className="modal map-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">
                    {t("chooseOnMap")}
                  </h3>
                  <button
                    className="icon-btn"
                    onClick={() => setShowEditMapPicker(false)}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body" style={{ maxHeight: "70vh", overflow: "hidden" }}>
                  <NorthMacedoniaMap
                    selectedCity={editForm.locationCity}
                    onSelectCity={(cityName) => {
                      setEditForm((f) => ({ ...f, locationCity: cityName }));
                      showMessage(
                        `${t("locationSetTo")} ${cityName}`,
                        "success"
                      );
                      setShowEditMapPicker(false);
                    }}
                  />
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        {/* ===== EDIT MODAL (restored, resized) ===== */}
        <AnimatePresence>
          {editingListing && editForm && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => {
                setEditingListing(null);
                setEditForm(null);
                setShowEditMapPicker(false);
              }}
            >
              <Motion.div
                className="modal edit-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">{t("edit")}</h3>
                  <button
                    className="icon-btn"
                    onClick={() => {
                      setEditingListing(null);
                      setEditForm(null);
                      setShowEditMapPicker(false);
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body edit-modal-body">
                  <div className="edit-summary-banner">
                    <div>
                      <p className="eyebrow subtle">{t("preview") || "Preview"}</p>
                      <h4 className="edit-summary-title">{editForm.name || t("name")}</h4>
                      <p className="edit-summary-sub">
                        {(t(editForm.category) || editForm.category || t("category"))} • {editLocationPreview || t("location")}
                      </p>
                    </div>
                    <div className="pill-row">
                      <span className="pill pill-soft">⏱️ {editForm.plan || plan} {t("months")}</span>
                      {editForm.offerprice && <span className="pill pill-price">{editForm.offerprice}</span>}
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">{t("name")}</label>
                    <input
                      className="input"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          name: stripDangerous(e.target.value).slice(0, 100),
                        })
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">{t("category")}</label>
                    <select
                      className="select"
                      value={editForm.category}
                      onChange={(e) =>
                        setEditForm({ ...editForm, category: e.target.value })
                      }
                    >
                      {categories.map((cat) => (
                        <option key={cat} value={cat}>
                          {t(cat)}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="field-row-2">
                    <div className="field-group">
                      <label className="field-label">{t("location")}</label>
                      <select
                        className="select"
                        value={editForm.locationCity}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            locationCity: e.target.value,
                          })
                        }
                      >
                        <option value="">{t("selectCity")}</option>
                        {MK_CITIES.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>

                      <input
                        className="input"
                        placeholder={t("locationExtra")}
                        value={editForm.locationExtra || ""}
                        onChange={(e) => {
                          const extra = stripDangerous(e.target.value).slice(0, 100);
                          setEditForm({
                            ...editForm,
                            locationExtra: extra,
                          });
                        }}
                      />

                      <button
                        type="button"
                        className="btn btn-ghost small"
                        onClick={() => setShowEditMapPicker(true)}
                        style={{ marginTop: 6 }}
                      >
                        {t("chooseOnMap")}
                      </button>

                      <p className="field-hint">
                        📍 {editLocationPreview || t("selectCity")}
                      </p>
                    </div>

                    <div className="field-group">
                      <label className="field-label">{t("contact")}</label>
                      <input
                        className="input"
                        type="tel"
                        value={editForm.contact || ""}
                        disabled
                        readOnly
                      />
                      <p className="field-hint">
                        {t("contactEditLocked") || "Update your phone number in Account settings."}
                      </p>
                      <button
                        type="button"
                        className="btn btn-ghost small"
                        onClick={() => setSelectedTab("account")}
                      >
                        {t("goToAccount") || "Go to account"}
                      </button>
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">{t("description")}</label>
                    <textarea
                      className="textarea"
                      rows={4}
                      value={editForm.description}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          description: stripDangerous(e.target.value).slice(0, 1000),
                        })
                      }
                    />
                  </div>

                  <div className="field-row-2">
                    <div className="field-group">
                      <label className="field-label">
                        {t("priceRangeLabel") || "Price range"}
                      </label>
                      <input
                        className="input"
                        placeholder="e.g. 500 - 800 MKD"
                        value={editForm.offerprice}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            offerprice: stripDangerous(e.target.value),
                          })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">
                        {t("tagsFieldLabel") || "Tags"}
                      </label>
                      <input
                        className="input"
                        placeholder={t("tagsPlaceholder") || "Tags (optional)"}
                        value={editForm.tags}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            tags: stripDangerous(e.target.value).slice(0, 64),
                          })
                        }
                      />
                    </div>
                  </div>

                  <div className="field-group">
                    <label className="field-label">
                      {t("websiteFieldLabel") || "Social / Website"}
                    </label>
                    <input
                      className="input"
                      placeholder={t("websitePlaceholder") || "Link (optional)"}
                      value={editForm.socialLink}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          socialLink: stripDangerous(e.target.value).slice(0, 200),
                        })
                      }
                    />
                  </div>

                  <div className="field-group">
                    <label className="field-label">
                      {t("coverImage") || "Cover image (local only)"}
                    </label>
                    <div className="edit-image-row">
                      <label className="btn btn-ghost small" htmlFor="edit-image">
                        {t("uploadCoverLocal") || "Upload cover"}
                      </label>
                      <input
                        id="edit-image"
                        style={{ display: "none" }}
                        type="file"
                        accept="image/*"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const reader = new FileReader();
                          reader.onload = (ev) =>
                            setEditForm((f) => ({
                              ...f,
                              imagePreview: ev.target?.result || null,
                            }));
                          reader.readAsDataURL(file);
                        }}
                      />
                    </div>
                    {editForm.imagePreview && (
                      <img
                        src={editForm.imagePreview}
                        alt="preview"
                        className="edit-image-preview"
                      />
                    )}
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn" onClick={saveEdit}>
                    {t("save")}
                  </button>
                  <button
                    className="btn btn-ghost"
                    onClick={() => {
                      setEditingListing(null);
                      setEditForm(null);
                      setShowEditMapPicker(false);
                    }}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>


        {/* ===== PAYMENT MODAL (restored) ===== */}
        <AnimatePresence>
          {paymentModalOpen && paymentIntent && (
            <Motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setPaymentModalOpen(false); setPaymentIntent(null); }}>
              <Motion.div className="modal payment-modal" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}>
                <div className="modal-header">
                  <h3 className="modal-title">
                    {paymentIntent.type === "extend" ? `${t("extend")} • ${extendTarget?.name || ""}` : t("paypalCheckout")}
                  </h3>
                  <button className="icon-btn" onClick={() => { setPaymentModalOpen(false); setPaymentIntent(null); }}>✕</button>
                </div>

                <div className="modal-body" style={{ maxHeight: "60vh", overflowY: "auto" }}>
                  <div className="payment-summary">
                    <div className="payment-row">
                      <span>{t("totalAmount")}</span>
                      <span className="amount">{paymentIntent.amount?.toFixed(2)} EUR</span>
                    </div>
                    <div className="payment-row">
                      <span>{t("payingWith")}</span>
                      <span>PayPal</span>
                    </div>
                  </div>

                  {/* Plan selector only for EXTEND */}
                  {paymentIntent.type === "extend" && (
                    <div className="plan-selector" style={{ marginTop: 12 }}>
                      <label className="plan-label">
                        {t("selectExtendDuration") || t("selectDuration") || "Select extension duration"}
                      </label>
                      <div className="plan-grid">
                        {Object.keys(priceMap).map((months) => (
                          <label
                            key={months}
                            className={`plan-option ${extendPlan === months ? "selected" : ""}`}
                          >
                            <input
                              type="radio"
                              name="extendPlan"
                              value={months}
                              checked={extendPlan === months}
                              onChange={(e) => {
                                const newPlan = e.target.value;
                                setExtendPlan(newPlan);
                                setPaymentIntent((prev) =>
                                  prev && prev.type === "extend"
                                    ? { ...prev, amount: priceMap[newPlan] }
                                    : prev
                                );
                              }}
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
                  )}

                  <div className="payment-buttons">
                    <PayPalButtons
                      style={{ layout: "vertical", color: "gold", shape: "pill", label: "paypal" }}
                      createOrder={(data, actions) =>
                        actions.order.create({
                          intent: "CAPTURE",
                          purchase_units: [
                            {
                              amount: {
                                currency_code: "EUR",
                                value: paymentIntent.amount?.toString() || "0.00",
                              },
                            },
                          ],
                          application_context: {
                            shipping_preference: "NO_SHIPPING",
                            user_action: "PAY_NOW",
                            return_url: window.location.origin + "/paypal-success",
                            cancel_url: window.location.origin + "/paypal-cancel",
                          },
                        })
                      }
                      onApprove={async (data) => {
                        const orderId = data.orderID;
                        try {
                          if (paymentIntent.type === "extend") {
                            await handleServerCaptureForExtend(orderId, paymentIntent.listingId, extendPlan);
                          } else {
                            await handleServerCapture(orderId, pendingOrder.listingId);
                          }
                          showMessage(t("thankYou"), "success");
                        } catch (err) {
                          console.error("PayPal approval error:", err);
                          showMessage((t("paypalError") || "PayPal error:") + " " + String(err), "error");
                        }
                      }}
                      onError={(err) =>
                        showMessage((t("paypalError") || "PayPal error:") + " " + String(err), "error")
                      }
                    />
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn btn-ghost" onClick={() => { setPaymentModalOpen(false); setPaymentIntent(null); }}>
                    {t("cancel")}
                  </button>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        {/* ===== AUTH MODAL (login + signup, email + phone) ===== */}
        <AnimatePresence>
          {showAuthModal && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowAuthModal(false)}
            >
              <Motion.div
                className="modal auth-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
              >
                {/* Header */}
                <div className="modal-header">
                  <h3 className="modal-title">
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
                <TabBar
                  items={authModeTabs}
                  value={authMode}
                  onChange={handleAuthModeChange}
                  className="auth-mode-tabs"
                  size="compact"
                  fullWidth
                />

                {/* =================== LOGIN MODE =================== */}
                {authMode === "login" && (
                  <>
                    {/* Login method tabs: Email / Phone */}
                    <TabBar
                      items={authMethodTabs}
                      value={authTab}
                      onChange={handleAuthTabChange}
                      className="auth-tabs"
                      size="compact"
                      fullWidth
                    />

                    {/* EMAIL LOGIN */}
                    {authTab === "email" ? (
                      <div className="modal-body auth-body auth-body-card">
                        <p className="auth-subtitle">
                          {t("loginSubtitle") ||
                            "Log in with your email and password to manage your listings."}
                        </p>
        
                        {/* Email */}
                        <div className="auth-field-group">
                          <span className="field-label">{t("email")}</span>
                          <input
                            className="input"
                            type="email"
                            placeholder={t("email")}
                            value={email}
                            onChange={(e) => setEmail(e.target.value)}
                          />
                        </div>
        
                        {/* Password */}
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
        
                        <div className="auth-actions">
                          <button
                            className="btn full-width"
                            onClick={async () => {
                              if (!validateEmail(email))
                                return showMessage(t("enterValidEmail"), "error");
                              try {
                                await signInWithEmailAndPassword(auth, email, password);
                                showMessage(t("signedIn"), "success");
                                setShowAuthModal(false);
                                setEmail("");
                                setPassword("");
                              } catch (e) {
                                showMessage(e.message, "error");
                              }
                            }}
                          >
                            {t("login")}
                          </button>
                        </div>
                      </div>
                    ) : (
                      /* PHONE LOGIN */
                      <div className="modal-body auth-body auth-body-card">
                        <p className="auth-subtitle">
                          {t("phoneLoginSubtitle") ||
                            "Log in quickly with an SMS code on your phone."}
                        </p>
        
                        <div className="auth-field-group">
                          <span className="field-label">{t("phoneNumber")}</span>
                          <div className="phone-input-group">
                            <select
                              className="select phone-country"
                              value={countryCode}
                              onChange={(e) => setCountryCode(e.target.value)}
                            >
                              {countryCodes.map((c) => (
                                <option key={c.code} value={c.code}>
                                  {c.name} ({c.code})
                                </option>
                              ))}
                            </select>
                            <input
                              className="input phone-number"
                              type="tel"
                              placeholder={t("phoneNumber")}
                              value={phoneNumber}
                              onChange={(e) =>
                                setPhoneNumber(e.target.value.replace(/\D/g, ""))
                              }
                              maxLength="12"
                              inputMode="numeric"
                            />
                          </div>
                        </div>
        
                        {!confirmationResult ? (
                          <div className="auth-actions">
                            <button
                              className="btn full-width"
                              onClick={async () => {
                                const rest = (phoneNumber || "").replace(/\D/g, "");
                                if (!rest || rest.length < 5 || rest.length > 12)
                                  return showMessage(t("enterValidPhone"), "error");
        
                                const fullPhone = countryCode + rest;
                                if (!validatePhone(fullPhone))
                                  return showMessage(t("enterValidPhone"), "error");
        
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
                                  showMessage(t("codeSent"), "success");
                                } catch (err) {
                                  console.error(err);
                                  showMessage(err.message, "error");
                                  if (window.recaptchaVerifier) {
                                    window.recaptchaVerifier.clear();
                                    window.recaptchaVerifier = null;
                                  }
                                } finally {
                                  setPhoneLoading(false);
                                }
                              }}
                              disabled={phoneLoading}
                            >
                              {phoneLoading ? "Sending..." : t("sendLink")}
                            </button>
                          </div>
                        ) : (
                          <div className="auth-actions">
                            <div className="auth-field-group">
                              <span className="field-label">{t("enterCode")}</span>
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
                            </div>
        
                            <button
                              className="btn full-width"
                              onClick={async () => {
                                if (!confirmationResult || !verificationCode.trim())
                                  return showMessage(t("enterCode"), "error");
                                if (!/^\d{6}$/.test(verificationCode.trim()))
                                  return showMessage(t("invalidCode"), "error");
        
                                setPhoneLoading(true);
                                try {
                                  await confirmationResult.confirm(verificationCode);
                                  showMessage(t("signedIn"), "success");
                                  setShowAuthModal(false);
                                  setPhoneNumber("");
                                  setVerificationCode("");
                                  setConfirmationResult(null);
                                } catch (err) {
                                  showMessage(err.message, "error");
                                } finally {
                                  setPhoneLoading(false);
                                }
                              }}
                              disabled={phoneLoading}
                            >
                              {phoneLoading ? "Verifying..." : t("verifyPhone")}
                            </button>
                          </div>
                        )}
        
                        {/* <div id="recaptcha-container" className="recaptcha"></div> */}
                      </div>
                    )}
                  </>
                )}
        
                {authMode === "signup" && (
                  <div className="modal-body auth-body auth-body-card">
                    <p className="auth-subtitle">
                      {t("signupSubtitle") ||
                        "Create a BizCall account to post and manage your listings."}
                    </p>
                
                    {/* EMAIL */}
                    <div className="auth-field-group">
                      <span className="field-label">{t("email")}</span>
                      <input
                        className="input"
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                
                    {/* PASSWORD */}
                    <div className="auth-field-group">
                      <span className="field-label">{t("password")}</span>
                      <input
                        className="input"
                        type="password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                      />
                    </div>
                
                    {/* REPEAT PASSWORD */}
                    <div className="auth-field-group">
                      <span className="field-label">
                        {t("repeatNewPassword") || "Repeat password"}
                      </span>
                      <input
                        className="input"
                        type="password"
                        value={passwordForm.repeatNewPassword}
                        onChange={(e) =>
                          setPasswordForm({ repeatNewPassword: e.target.value })
                        }
                      />
                    </div>
                
                    {/* PHONE (MANDATORY) */}
                    <div className="auth-field-group">
                      <span className="field-label">{t("phoneNumber")}</span>
                      <div className="phone-input-group">
                        <select
                          className="select phone-country"
                          value={countryCode}
                          onChange={(e) => setCountryCode(e.target.value)}
                        >
                          {countryCodes.map((c) => (
                            <option key={c.code} value={c.code}>
                              {c.name} ({c.code})
                            </option>
                          ))}
                        </select>
                        <input
                          className="input phone-number"
                          type="tel"
                          value={phoneNumber}
                          onChange={(e) =>
                            setPhoneNumber(e.target.value.replace(/\D/g, ""))
                          }
                          maxLength="12"
                          inputMode="numeric"
                        />
                      </div>
                    </div>
                
                    {/* STEP 1: SEND SMS */}
                    {!confirmationResult && (
                      <button
                        className="btn full-width"
                        disabled={phoneLoading}
                        onClick={async () => {
                          if (!validateEmail(email))
                            return showMessage(t("enterValidEmail"), "error");
                
                          if (password.length < 6)
                            return showMessage(t("passwordTooShort"), "error");
                
                          if (passwordForm.repeatNewPassword !== password)
                            return showMessage(t("passwordsDontMatch"), "error");
                
                          const raw = phoneNumber.replace(/\D/g, "");
                          if (!raw || raw.length < 5)
                            return showMessage(t("enterValidPhone"), "error");
                
                          const fullPhone = countryCode + raw;
                          if (!validatePhone(fullPhone))
                            return showMessage(t("enterValidPhone"), "error");
                
                          setPhoneLoading(true);
                          try {
                            const verifier = getSignupRecaptcha();
                            const confirmation = await signInWithPhoneNumber(
                              auth,
                              fullPhone,
                              verifier
                            );
                            setConfirmationResult(confirmation);
                            showMessage(t("codeSent"), "success");
                          } catch (err) {
                            console.error(err);
                            window.signupRecaptchaVerifier?.clear?.();
                            window.signupRecaptchaVerifier = null;
                            showMessage(err.message, "error");
                          } finally {
                            setPhoneLoading(false);
                          }
                        }}
                      >
                        {t("createAccount") || "Create account"}
                      </button>
                    )}
                
                    {/* STEP 2: VERIFY CODE + LINK EMAIL */}
                    {confirmationResult && (
                      <>
                        <div className="auth-field-group" style={{ marginTop: 12 }}>
                          <span className="field-label">{t("enterCode")}</span>
                          <input
                            className="input"
                            value={verificationCode}
                            onChange={(e) =>
                              setVerificationCode(e.target.value.replace(/\D/g, ""))
                            }
                            maxLength="6"
                          />
                        </div>
                
                        <button
                          className="btn full-width"
                          disabled={phoneLoading}
                          onClick={async () => {
                            if (!/^\d{6}$/.test(verificationCode))
                              return showMessage(t("invalidCode"), "error");
                
                            setPhoneLoading(true);
                            try {
                              const result = await confirmationResult.confirm(
                                verificationCode
                              );
                              const user = result.user;
                
                              const emailCred = EmailAuthProvider.credential(
                                email,
                                password
                              );
                              await linkWithCredential(user, emailCred);
                
                              await sendEmailVerification(user);
                
                              await set(dbRef(db, `users/${user.uid}`), {
                                email: user.email,
                                phone: normalizePhoneForStorage(countryCode + phoneNumber),
                                createdAt: Date.now(),
                              });
                
                              showMessage(t("signupSuccess"), "success");
                
                              setAuthMode("verify");
                              setConfirmationResult(null);
                              setVerificationCode("");
                            } catch (err) {
                              console.error(err);
                              showMessage(err.message, "error");
                            } finally {
                              setPhoneLoading(false);
                            }
                          }}
                        >
                          {t("verifyPhone") || "Verify & finish signup"}
                        </button>
                      </>
                    )}
                
                    {/* <div id="recaptcha-signup" className="recaptcha" /> */}
                  </div>
                )}

                {/* =================== VERIFY MODE =================== */}
                {authMode === "verify" && (
                  <div className="modal-body auth-body auth-body-card">
                    <p className="auth-subtitle">
                      {t("verifyEmailHint")}
                    </p>
                
                    <div className="auth-verify-box">
                      <div className="auth-verify-row">
                        <span className="auth-verify-label">{t("email")}</span>
                        <span className="auth-verify-value">{auth.currentUser?.email || email}</span>
                      </div>
                      <p className="auth-verify-footnote">{t("verifyFootnote")}</p>
                    </div>
                
                    <div className="auth-actions">
                      <button
                        className="btn btn-ghost full-width"
                        disabled={resendBusy}
                        onClick={async () => {
                          if (!auth.currentUser) return showMessage(t("paypalError") || "Error", "error");
                          setResendBusy(true);
                          try {
                            await sendEmailVerification(auth.currentUser);
                            showMessage(t("emailLinkSent") || "Verification email sent.", "success");
                          } catch (err) {
                            showMessage(String(err?.message || err), "error");
                          } finally {
                            setResendBusy(false);
                          }
                        }}
                      >
                        {t("resendEmail")}
                      </button>
                
                      <button
                        className="btn full-width"
                        disabled={verifyBusy}
                        onClick={async () => {
                          if (!auth.currentUser) return showMessage(t("paypalError") || "Error", "error");
                          setVerifyBusy(true);
                          try {
                            await auth.currentUser.reload();
                            if (auth.currentUser.emailVerified) {
                              showMessage(t("emailVerified"), "success");
                              setShowAuthModal(false);
                              setAuthMode("login");
                            } else {
                              showMessage(t("notVerifiedYet"), "error");
                            }
                          } catch (err) {
                            showMessage(String(err?.message || err), "error");
                          } finally {
                            setVerifyBusy(false);
                          }
                        }}
                      >
                        {verifyBusy ? t("verifying") : t("iVerified")}
                      </button>
                
                      <button
                        className="btn btn-ghost full-width"
                        onClick={() => {
                          // skippable, but posting remains blocked by your existing checks
                          showMessage(t("verifyLater"), "success");
                          setShowAuthModal(false);
                          setAuthMode("login");
                        }}
                      >
                        {t("verifyLater")}
                      </button>
                    </div>
                  </div>
                )}
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {postSignupVerifyOpen && (
            <Motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPostSignupVerifyOpen(false)}
            >
              <Motion.div
                className="modal verify-email-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">{t("verifyYourEmail")}</h3>
                  <button className="icon-btn" onClick={() => setPostSignupVerifyOpen(false)}>
                    ✕
                  </button>
                </div>
        
                <div className="modal-body">
                  <p className="auth-subtitle">
                    {t("verifyEmailHint")}
                  </p>
        
                  <div className="verify-actions">
                    <button
                      className="btn full-width"
                      onClick={async () => {
                        try {
                          const u = auth.currentUser;
                          if (!u) return showMessage("Not signed in.", "error");
                          await sendEmailVerification(u);
                          showMessage(t("emailLinkSent"), "success");
                        } catch (err) {
                          showMessage(err.message, "error");
                        }
                      }}
                    >
                      {t("resendEmail")}
                    </button>
        
                    <button
                      className="btn btn-ghost full-width"
                      onClick={async () => {
                        try {
                          // Force-refresh the user object to reflect verification
                          await auth.currentUser?.reload();
                          if (auth.currentUser?.emailVerified) {
                            showMessage(t("emailVerified"), "success");
                            setPostSignupVerifyOpen(false);
                          } else {
                            showMessage(
                              t("notVerifiedYet"),
                              "error"
                            );
                          }
                        } catch (err) {
                          showMessage(err.message, "error");
                        }
                      }}
                    >
                      {t("iVerified")}
                    </button>
        
                    <button
                      className="btn btn-ghost full-width"
                      onClick={() => setPostSignupVerifyOpen(false)}
                    >
                      {t("verifyLater")}
                    </button>
                  </div>
        
                  <div className="verify-footnote">
                    {t("verifyFootnote")}
                  </div>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>
        
        {/* LISTING DETAILS MODAL */}
        <AnimatePresence>
          {selectedListing && (
            <Motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => {
                setSelectedListing(null);
                const url = new URL(window.location.href);
                url.searchParams.delete("listing");
                window.history.replaceState({}, "", url.toString());
              }}
            >
              <Motion.div className="modal listing-details-modal" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.3 }}>
                <div className="modal-header category-banner" style={{ background: "linear-gradient(135deg, #2563eb, #3b82f6)", color: "#fff" }}>
                  <div className="flex items-center gap-2">
                    <span className="category-icon" style={{ fontSize: "1.5rem" }}>
                      {categoryIcons[selectedListing.category] || "🏷️"}
                    </span>
                    <h3 className="modal-title">{selectedListing.name}</h3>
                  </div>
                  <button className="icon-btn text-white"
                    onClick={() => {
                      setSelectedListing(null);
                      const url = new URL(window.location.href);
                      url.searchParams.delete("listing");
                      window.history.replaceState({}, "", url.toString());
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body listing-details-body">
                  <div className="listing-layout">
                    <div className="listing-main">
                      <div className="listing-hero">
                        <div className="hero-left">
                          <div className="hero-icon-bubble">{categoryIcons[selectedListing.category] || "🏷️"}</div>
                          <div>
                            <p className="eyebrow">{t("listing") || "Listing"}</p>
                            <h3 className="hero-title">{selectedListing.name}</h3>
                            <div className="chip-row">
                              <span className="pill">{t(selectedListing.category) || selectedListing.category}</span>
                              <span className="pill pill-soft">{selectedListing.location || (t("unspecified") || "Unspecified")}</span>
                            </div>
                          </div>
                        </div>
                        <div className="status-stack">
                          <span className={`status-pill ${selectedListing.status === "verified" ? "is-verified" : "is-pending"}`}>
                            {selectedListing.status === "verified" ? "✅ " + t("verified") : "⏳ " + t("pending")}
                          </span>
                          {selectedListing.expiresAt && (
                            <span className="small-muted">{t("expires")}: {new Date(selectedListing.expiresAt).toLocaleDateString()}</span>
                          )}
                          <span className="rating-chip">
                            ⭐ {feedbackStats.avg ?? "–"} / 5
                          </span>
                        </div>
                      </div>

                      <div className="mobile-cta-bar">
                        <div className="mobile-cta-meta">
                          <span className="pill pill-soft">{listingLocationLabel}</span>
                          <span className="pill">{listingPriceLabel}</span>
                        </div>
                        <div className="mobile-cta-actions">
                          <button className="quick-action-btn" disabled={!listingContactAvailable} onClick={() => listingContactAvailable && window.open(`tel:${selectedListing.contact}`)}>
                            📞 {t("call")}
                          </button>
                          <button className="quick-action-btn" onClick={() => window.open(`mailto:${selectedListing.userEmail || ""}?subject=Regarding%20${encodeURIComponent(selectedListing.name)}`)}>
                            ✉️ {t("emailAction")}
                          </button>
                          <button className="quick-action-btn ghost" disabled={!listingContactAvailable} onClick={() => {
                            if (!listingContactAvailable) return;
                            navigator.clipboard.writeText(selectedListing.contact);
                            showMessage(t("copied"), "success");
                          }}>
                            📋 {t("copy")}
                          </button>
                          <button className="quick-action-btn ghost" onClick={() => handleShareListing(selectedListing)}>
                            🔗 {t("share") || "Share"}
                          </button>
                        </div>
                      </div>

                      <div className="listing-highlight-grid">
                        <div className="highlight-card">
                          <p className="highlight-label">{t("status")}</p>
                          <p className="highlight-value">{selectedListing.status === "verified" ? t("verified") : t("pendingVerification")}</p>
                        </div>
                        <div className="highlight-card">
                          <p className="highlight-label">{t("listedOn") || t("postedOn") || "Posted on"}</p>
                          <p className="highlight-value">{selectedListing.createdAt ? new Date(selectedListing.createdAt).toLocaleDateString() : t("unspecified") || "Unspecified"}</p>
                        </div>
                        <div className="highlight-card">
                          <p className="highlight-label">{t("priceRangeLabel") || t("priceLabel")}</p>
                          <p className="highlight-value">{listingPriceLabel}</p>
                        </div>
                        <div className="highlight-card">
                          <p className="highlight-label">{t("locationDetails") || "Location"}</p>
                          <p className="highlight-value">{listingLocationLabel}</p>
                          {selectedListing.locationData?.mapsUrl && (
                            <a className="map-link" href={selectedListing.locationData.mapsUrl} target="_blank" rel="noreferrer">{t("openInMaps") || "Open in Maps"}</a>
                          )}
                        </div>
                        <div className="highlight-card">
                          <p className="highlight-label">{t("reputation") || "Reputation"}</p>
                          <p className="highlight-value">{feedbackStats.avg != null ? `${feedbackStats.avg}/5` : t("noFeedback") || "No feedback yet"}</p>
                          <p className="small-muted">{t("recentFeedback") || "Recent notes"}: {feedbackStats.count}</p>
                        </div>
                      </div>

                      {selectedListing.imagePreview && <img src={selectedListing.imagePreview} alt="preview" className="listing-hero-image" />}

                      <div className="listing-section">
                        <div className="section-heading">
                          <h4>{t("aboutListing") || "About this listing"}</h4>
                          <span className="pill muted">{t("category")}: {t(selectedListing.category) || selectedListing.category}</span>
                        </div>
                        <p className="listing-description-full">{selectedListing.description}</p>
                        <div className="soft-grid">
                          <div>
                            <p className="highlight-label">{t("pricing") || t("priceLabel")}</p>
                            <p className="highlight-value">{listingPriceLabel}</p>
                          </div>
                          <div>
                            <p className="highlight-label">{t("contactEmail") || "Email"}</p>
                            <p className="highlight-value">{selectedListing.userEmail || t("unspecified") || "Unspecified"}</p>
                          </div>
                        </div>
                        {selectedListing.tags && (
                          <div className="tag-chip-row">
                            {(selectedListing.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean).map((tag) => (
                              <span className="tag-chip" key={tag}>{tag}</span>
                            ))}
                          </div>
                        )}
                        {selectedListing.socialLink && (
                          <a className="link-badge" href={selectedListing.socialLink} target="_blank" rel="noreferrer">{t("websiteLabel")}: {selectedListing.socialLink}</a>
                        )}
                      </div>

                      <div className="contact-panel">
                        <div>
                          <p className="panel-title">{t("contact")}</p>
                          <p className="panel-subtitle">{selectedListing.contact || (t("unspecified") || "Unspecified")}</p>
                          <p className="panel-hint">{t("contactAutofill") || "We use your account phone for trust and safety."}</p>
                        </div>
                        <div className="quick-actions">
                          <div className="quick-actions-header">
                            <p className="highlight-label">{t("quickActions") || "Quick actions"}</p>
                            <p className="small-muted">{t("postingReadyHint") || "Listings reuse your saved phone number and location for faster posting."}</p>
                          </div>
                          <div className="quick-action-buttons">
                            <button className="quick-action-btn" disabled={!listingContactAvailable} onClick={() => listingContactAvailable && window.open(`tel:${selectedListing.contact}`)}>📞 {t("call")}</button>
                            <button className="quick-action-btn" onClick={() => window.open(`mailto:${selectedListing.userEmail || ""}?subject=Regarding%20${encodeURIComponent(selectedListing.name)}`)}>✉️ {t("emailAction")}</button>
                            <button className="quick-action-btn ghost" disabled={!listingContactAvailable} onClick={() => {
                              if (!listingContactAvailable) return;
                              navigator.clipboard.writeText(selectedListing.contact);
                              showMessage(t("copied"), "success");
                            }}>📋 {t("copy")}</button>
                            <button className="quick-action-btn ghost" onClick={() => handleShareListing(selectedListing)}>🔗 {t("share") || "Share"}</button>
                          </div>
                        </div>
                      </div>

                    </div>

                    <aside className="listing-sidebar">
                      <div className="sidebar-card">
                        <p className="sidebar-title">{t("quickFacts") || "Quick facts"}</p>
                        <ul className="fact-list">
                          <li><span>{t("statusLabel") || t("status") || "Status"}</span><strong>{selectedListing.status === "verified" ? t("verified") : t("pendingVerification")}</strong></li>
                          <li><span>{t("listedOn") || t("postedOn") || "Listed"}</span><strong>{selectedListing.createdAt ? new Date(selectedListing.createdAt).toLocaleDateString() : t("unspecified") || "Unspecified"}</strong></li>
                          <li><span>{t("locationLabelFull") || t("location") || "Location"}</span><strong>{selectedListing.location || t("unspecified") || "Unspecified"}</strong></li>
                          <li><span>{t("pricing") || t("priceLabel") || "Price"}</span><strong>{selectedListing.offerprice || t("unspecified") || "Unspecified"}</strong></li>
                        </ul>
                      </div>

                      <div className="sidebar-card">
                        <p className="sidebar-title">{t("shareListing") || t("share") || "Share"}</p>
                        <div className="sidebar-actions">
                          <button className="quick-action-btn" onClick={() => handleShareListing(selectedListing)}>🔗 {t("share") || "Share"}</button>
                          <button className="quick-action-btn ghost" onClick={() => toggleFav(selectedListing.id)}>
                            {favorites.includes(selectedListing.id) ? "★" : "☆"} {t("favorite") || "Favorite"}
                          </button>
                          {selectedListing.locationData?.mapsUrl && (
                            <button className="quick-action-btn ghost" onClick={() => window.open(selectedListing.locationData.mapsUrl, "_blank")}>🗺️ {t("openInMaps") || "Open in Maps"}</button>
                          )}
                        </div>
                      </div>

                      <div className="sidebar-card muted-card">
                        <p className="sidebar-title">{t("cloudFeedbackNote") || "Shared feedback"}</p>
                        <p className="small-muted">{t("feedbackSidebarBlurb") || "Ratings and notes help everyone see the most trusted listings."}</p>
                      </div>
                    </aside>
                  </div>

                  <div className="feedback-section">
                    <div className="feedback-header">
                      <div>
                        <p className="eyebrow">{t("reputation")}</p>
                        <h4>{t("communityFeedback")}</h4>
                        <p className="small-muted">{t("cloudFeedbackNote")}</p>
                      </div>
                      <div className="feedback-summary">
                        <div className="score-circle">{feedbackStats.avg ?? "–"}</div>
                        <div>
                          <p className="summary-label">{feedbackStats.count || 0} {t("reviews")}</p>
                          <p className="small-muted">{t("averageRating")}</p>
                        </div>
                      </div>
                    </div>

                    <div className="feedback-grid">
                      <div className="feedback-form-card">
                        <div className="rating-input-row">
                          <label>{t("ratingLabel")}</label>
                          <input
                            type="range"
                            min="1"
                            max="5"
                            step="1"
                            value={feedbackDraft.rating}
                            onChange={(e) => setFeedbackDraft((d) => ({ ...d, rating: Number(e.target.value) }))}
                          />
                          <span className="rating-value">{feedbackDraft.rating}/5</span>
                        </div>
                        <textarea
                          className="feedback-textarea"
                          rows={3}
                          value={feedbackDraft.comment}
                          placeholder={t("commentPlaceholderDetailed")}
                          onChange={(e) => setFeedbackDraft((d) => ({ ...d, comment: e.target.value }))}
                        />
                        <div className="feedback-form-actions">
                          <button
                            className="btn"
                            onClick={() => handleFeedbackSubmit(selectedListing.id)}
                            disabled={feedbackSaving}
                          >
                            {feedbackSaving
                              ? `⏳ ${t("saving")}`
                              : `💾 ${t("saveFeedback")}`}
                          </button>
                          <span className="small-muted">{t("recentFeedback")}: {feedbackStats.count}</span>
                        </div>
                      </div>

                      <div className="feedback-list-card">
                        <div className="feedback-list-header">
                          <p className="sidebar-title">{t("recentFeedback")}</p>
                          <span className="pill pill-soft">⭐ {feedbackStats.avg ?? "–"} / 5</span>
                        </div>
                        <div className="feedback-scroll">
                          {feedbackStats.entries.length === 0 ? (
                            <p className="small-muted">{t("noFeedback")}</p>
                          ) : (
                            feedbackStats.entries.map((entry, idx) => (
                              <div className="feedback-item" key={idx}>
                                <div className="feedback-meta">
                                  <span className="pill pill-soft">{entry.rating}/5</span>
                                  <span className="small-muted">{new Date(entry.createdAt).toLocaleDateString()}</span>
                                </div>
                                {entry.comment && <p className="feedback-comment">{entry.comment}</p>}
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </Motion.div>
            </Motion.div>
          )}
        </AnimatePresence>

        {/* FOOTER */}
        <footer className="footer">
          <p>© 2024 {t("appName")} • {t("bizCall")}</p>
        </footer>
        <div id="recaptcha-signup" style={{ display: "none" }} />
        <div id="recaptcha-container" style={{ display: "none" }} />
      </div>
    </PayPalScriptProvider>
  );
}
