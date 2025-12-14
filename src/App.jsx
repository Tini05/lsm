// src/App.jsx
const API_BASE =
  import.meta.env.VITE_API_BASE ||
  (typeof window !== "undefined" && window.location.hostname === "localhost"
    ? "http://localhost:5000"
    : "https://lsm-wozo.onrender.com");

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
  RecaptchaVerifier,
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

export default function App() {
  /* i18n */
  const [lang, setLang] = useState(() => localStorage.getItem("lang") || "sq");
  const t = (k) => TRANSLATIONS[lang]?.[k] ?? TRANSLATIONS.sq?.[k] ?? k;
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
  const [signupEmailSentAt, setSignupEmailSentAt] = useState(0);
  
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
  const [sortBy, setSortBy] = useState("newest");
  const [showMapPicker, setShowMapPicker] = useState(false);

  /* Favorites */
  const [favorites, setFavorites] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("favorites") || "[]");
    } catch {
      return [];
    }
  });
  useEffect(() => localStorage.setItem("favorites", JSON.stringify(favorites)), [favorites]);

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
    if (!currentUser) return showMessage(t("loginRequired"), "error");

    if (!validateEmail(emailForm.newEmail)) {
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

    setSavingEmail(true);
    try {
      const cred = EmailAuthProvider.credential(
        currentUser.email,
        emailForm.currentPassword
      );
      await reauthenticateWithCredential(currentUser, cred);
      await updateEmail(currentUser, emailForm.newEmail);
      try {
        await sendEmailVerification(currentUser);
      } catch {
        // not critical if verification email fails, email is still changed
      }
      await update(dbRef(db, `users/${currentUser.uid}`), { email: emailForm.newEmail });
      await currentUser.reload();
      setUser(auth.currentUser);
      showMessage(t("emailUpdateSuccess"), "success");
      setEmailForm({ newEmail: "", currentPassword: "" });
    } catch (err) {
      showMessage(t("emailUpdateError") + " " + err.message, "error");
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
    setEditingListing(listing);
    setEditForm({
      name: listing.name || "",
      category: listing.category || "",
      location: listing.location || "",
      locationData: listing.locationData || null,
      description: listing.description || "",
      contact: (listing.contact || "").replace(/\D/g, ""),
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
    if (!editForm.name || editForm.name.trim().length < 3) return showMessage(t("fillAllFields"), "error");
    if (!editForm.description || editForm.description.trim().length < 10) return showMessage(t("fillAllFields"), "error");
    const normalizedContact = normalizePhoneForStorage(editForm.contact);
    if (!validatePhone(normalizedContact)) return showMessage(t("enterValidPhone"), "error");
    const updates = {
      name: stripDangerous(editForm.name),
      category: editForm.category,
      location: stripDangerous(editForm.location),
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
    if (sortBy === "newest") arr.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    if (sortBy === "expiring") arr.sort((a, b) => (a.expiresAt || 0) - (b.expiresAt || 0));
    if (sortBy === "az") arr.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    return arr;
  }, [verifiedListings, q, catFilter, locFilter, sortBy]);

  const myListings = useMemo(() => listings.filter((l) => l.userId === user?.uid), [listings, user]);
  const toggleFav = (id) =>
    setFavorites((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const handleShareListing = (listing) => {
  const url = `${window.location.origin}?listing=${encodeURIComponent(listing.id)}`;
  const text = `${listing.name || ""} • ${listing.location || ""} – ${
    t("shareText") || BizCall || "Tregu Lokal i Ndihmës"
  }`;

  if (navigator.share) {
    navigator
      .share({
        title: listing.name || t("appName") || "Listing",
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
        <button onClick={() => setSelectedTab("main")} className="brand">
          {/* <span className="brand-emoji"> */}
            <img 
              src={logo} 
              alt="BizCall logo"
              className="brand-logo"
            />
          {/* </span> */}
          <h1 className="brand-title">BizCall</h1>
        </button>

        <div className="header-actions">
          <select className="lang-select" value={lang} onChange={(e) => setLang(e.target.value)}>
            <option value="sq">🇦🇱 SQ</option>
            <option value="mk">🇲🇰 MK</option>
            <option value="en">🇬🇧 EN</option>
          </select>

          {user ? (
            <>
              <button
                className="btn btn-ghost"
                onClick={() => {
                  // setSelectedTab("myListings");
                  setSidebarOpen(true);
                }}
              >
                ☰ {t("dashboard")}
              </button>
              <button className="btn btn-ghost" onClick={async () => { await signOut(auth); showMessage(t("signedOut"), "success"); }}>
                {t("logout")}
              </button>
            </>
          ) : (
            <button
              className="btn"
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

  return (
    <PayPalScriptProvider options={{ "client-id": PAYPAL_CLIENT_ID, currency: "EUR", locale: "en_MK" }}>
      {message.text && <div className={`notification ${message.type}`}>{message.text}</div>}

      <div className="app">
        <Header />

        {/* SIDEBAR (overlay closes on click; ESC handled globally) */}
        <AnimatePresence>
          {sidebarOpen && (
            <>
              <motion.div
                className="sidebar-overlay"
                onClick={() => setSidebarOpen(false)}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
              <motion.aside
                className="sidebar mobile-drawer"
                initial={{ x: "-100%" }}
                animate={{ x: 0 }}
                exit={{ x: "-100%" }}
                transition={{ type: "tween", duration: 0.3 }}
                style={{ touchAction: "none", WebkitOverflowScrolling: "touch" }}
              >
                <div className="drawer-header">
                  <span className="drawer-title">{t("dashboard")}</span>
                  <button className="icon-btn" onClick={() => setSidebarOpen(false)}>✕</button>
                </div>

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
                />
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        {/* Main content container */}
        <div className="container">
          {/* Routes */}
          {selectedTab !== "main" ? (
            <div className="dashboard">
              {/* Desktop sidebar */}
              <aside className="sidebar desktop-only">
                <Sidebar
                  t={t}
                  selected={selectedTab}
                  onSelect={(tab) => setSelectedTab(tab)}
                  onLogout={async () => { await signOut(auth); showMessage(t("signedOut"), "success"); }}
                />
              </aside>

              {/* Dashboard content */}
              <main className="dashboard-content">
                <div className="panel">
                  <div className="tab-panel">
                    {selectedTab === "myListings" && (
                      <div className="section my-listings-section">
                        <div className="section-header-row">
                          <div>
                            <h2 className="section-title-inner">{t("myListings")}</h2>
                            <p className="section-subtitle-small">
                              {t("myListingsHint") || "Review, edit and extend your listings in one place."}
                            </p>
                          </div>
                          <span className="badge count">
                            {myListings.length} {(t("listingsLabel") || "listings")}
                          </span>
                        </div>

                        {myListings.length === 0 ? (
                          <div className="empty">
                            <div className="empty-icon">📭</div>
                            <p className="empty-text">{t("noListingsYet")}</p>
                          </div>
                        ) : (
                          <div className="listing-grid my-listings-grid">
                            {myListings.map((l) => (
                              <article key={l.id} className="listing-card my-listing-card">
                                <header className="listing-header my-listing-header">
                                  <div className="listing-header-main">
                                    <h3 className="listing-title">{l.name}</h3>

                                    <div className="listing-meta-row">
                                      <span className="pill pill-category">
                                        {categoryIcons[l.category] || "🏷️"} {t(l.category) || l.category}
                                      </span>
                                      {l.location && (
                                        <span className="pill pill-location">
                                          📍 {l.location}
                                        </span>
                                      )}
                                    </div>
                                  </div>

                                  <div className="listing-header-side">
                                    <span
                                      className={`status-chip ${
                                        l.status === "verified" ? "status-chip-verified" : "status-chip-pending"
                                      }`}
                                    >
                                      {l.status === "verified" ? `✅ ${t("verified")}` : `⏳ ${t("pending")}`}
                                    </span>

                                    <div className="plan-expiry-row">
                                      <span className="plan-chip">
                                        {l.plan} {t("months")}
                                      </span>
                                      <span className="expiry-chip">
                                        {t("expires")}:{" "}
                                        {l.expiresAt ? new Date(l.expiresAt).toLocaleDateString() : "N/A"}
                                      </span>
                                    </div>
                                  </div>
                                </header>

                                <p className="listing-description clamp-3">
                                  {l.description}
                                </p>

                                <div className="my-listing-footer">
                                  <div className="my-listing-extra">
                                    {l.offerprice && (
                                      <span className="pill pill-offerprice">
                                        💶 {l.offerprice}
                                      </span>
                                    )}
                                    {l.tags && (
                                      <span className="pill pill-tags">
                                        🏷️ {l.tags}
                                      </span>
                                    )}
                                  </div>

                                  <div className="listing-actions listing-actions-compact">
                                    <button
                                      className="btn btn-ghost small"
                                      onClick={() => openEdit(l)}
                                    >
                                      {t("edit")}
                                    </button>
                                    <button
                                      className="btn btn-ghost small"
                                      onClick={() => confirmDelete(l.id)}
                                    >
                                      {t("del")}
                                    </button>
                                    <button
                                      className="btn small"
                                      onClick={() => startExtendFlow(l)}
                                    >
                                      {t("extend")}
                                    </button>
                                    <button
                                      className="btn small"
                                      onClick={() => window.open(`tel:${l.contact}`)}
                                    >
                                      📞 {t("call")}
                                    </button>
                                    <button
                                      className="btn small"
                                      onClick={() =>
                                        window.open(
                                          `mailto:${l.userEmail || ""}?subject=Regarding%20${encodeURIComponent(
                                            l.name || ""
                                          )}`
                                        )
                                      }
                                    >
                                      ✉️ {t("emailAction")}
                                    </button>
                                    <button
                                      className="btn btn-ghost small"
                                      onClick={() => {
                                        navigator.clipboard?.writeText(l.contact || "");
                                        showMessage(t("copied"), "success");
                                      }}
                                    >
                                      📋 {t("copy")}
                                    </button>
                                    <button
                                      className="btn btn-ghost small"
                                      type="button"
                                      onClick={() => handleShareListing(l)}
                                    >
                                      🔗 {t("share")}
                                    </button>
                                    <button
                                      className="btn btn-ghost small"
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
                        )}
                      </div>
                    )}


                    {selectedTab === "account" && (
                      <div className="section">
                        <div className="card account-card">
                          <h2 className="section-title">👤 {t("accountTitle")}</h2>
                          <p className="account-subtitle">
                            {t("accountSubtitle")}
                          </p>

                          <div className="account-main">
                            {/* LEFT: overview + stats */}
                            <div className="account-overview">
                              <div className="account-info">
                                <div className="account-row">
                                  <span className="account-label">{t("emailLabel")}</span>
                                  <span className="account-value">{user?.email || "—"}</span>
                                </div>

                                <div className="account-row">
                                  <span className="account-label">{t("phoneNumber")}</span>
                                  <span className="account-value">{accountPhone || t("addPhoneInAccount") || "—"}</span>
                                </div>

                                <div className="account-row">
                                  <span className="account-label">{t("verifiedLabel")}</span>
                                  <span className="account-value">
                                    {user?.emailVerified ? (
                                      <span className="badge verified">✅ {t("verified")}</span>
                                    ) : (
                                      <span className="badge not-verified">
                                        ⏳ {t("pendingVerification")}
                                      </span>
                                    )}
                                  </span>
                                </div>

                                <div className="account-row">
                                  <span className="account-label">{t("accountSince")}</span>
                                  <span className="account-value">
                                    {user?.metadata?.creationTime
                                      ? new Date(user.metadata.creationTime).toLocaleDateString()
                                      : "—"}
                                  </span>
                                </div>

                                {!user?.emailVerified && (
                                  <div className="account-row">
                                    <button
                                      className="btn small"
                                      onClick={async () => {
                                        try {
                                          if (user) {
                                            await sendEmailVerification(user);
                                            showMessage(t("verificationSent"), "success");
                                          }
                                        } catch (err) {
                                          showMessage(
                                            t("verificationError") + " " + err.message,
                                            "error"
                                          );
                                        }
                                      }}
                                    >
                                      {t("resendVerificationEmail")}
                                    </button>
                                  </div>
                                )}
                              </div>

                              <div className="account-stats">
                                <div className="stat-pill">
                                  <span className="stat-label">{t("myListings")}</span>
                                  <span className="stat-value">{myListings.length}</span>
                                </div>
                                <div className="stat-pill">
                                  <span className="stat-label">{t("favorites") || "Favorites"}</span>
                                  <span className="stat-value">{favorites.length}</span>
                                </div>
                                <div className="stat-pill">
                                  <span className="stat-label">{t("plan") || "Plan"}</span>
                                  <span className="stat-value">{plan} {t("months")}</span>
                                </div>
                              </div>

                              <div className="account-tips">
                                <div>
                                  <h4>{t("postingReady") || "Posting ready"}</h4>
                                  <p>{t("postingReadyHint") || "Listings reuse your saved phone number and location for faster posting."}</p>
                                </div>
                                <button className="btn small" onClick={() => setShowPostForm(true)}>
                                  {t("submitListing")}
                                </button>
                              </div>
                            </div>

                            {/* RIGHT: security / settings */}
                            <div className="account-security">
                              <h3 className="account-security-title">{t("securitySettings")}</h3>
                              <p className="account-security-text">{t("securitySettingsText")}</p>

                              {/* Change email */}
                              <form className="account-form" onSubmit={handleChangeEmail}>
                                <h4 className="account-form-title">{t("changeEmail")}</h4>
                                <div className="account-form-row">
                                  <label className="account-label">
                                    {t("newEmail")}
                                  </label>
                                  <input
                                    type="email"
                                    className="input"
                                    value={emailForm.newEmail}
                                    onChange={(e) =>
                                      setEmailForm((f) => ({ ...f, newEmail: e.target.value }))
                                    }
                                    placeholder={t("newEmailPlaceholder")}
                                  />
                                </div>
                                <div className="account-form-row">
                                  <label className="account-label">
                                    {t("currentPassword")}
                                  </label>
                                  <input
                                    type="password"
                                    className="input"
                                    value={emailForm.currentPassword}
                                    onChange={(e) =>
                                      setEmailForm((f) => ({
                                        ...f,
                                        currentPassword: e.target.value,
                                      }))
                                    }
                                    placeholder={t("currentPasswordPlaceholder")}
                                  />
                                </div>
                                <button
                                  type="submit"
                                  className="btn small"
                                  disabled={savingEmail}
                                >
                                  {savingEmail ? t("saving") : t("saveEmail")}
                                </button>
                              </form>

                              {/* Change password */}
                              <form className="account-form" onSubmit={handleChangePassword}>
                                <h4 className="account-form-title">{t("changePassword")}</h4>

                                <div className="account-form-row">
                                  <label className="account-label">
                                    {t("currentPassword")}
                                  </label>
                                  <input
                                    type="password"
                                    className="input"
                                    value={passwordForm.currentPassword}
                                    onChange={(e) =>
                                      setPasswordForm((f) => ({
                                        ...f,
                                        currentPassword: e.target.value,
                                      }))
                                    }
                                    placeholder={t("currentPasswordPlaceholder")}
                                  />
                                </div>

                                <div className="account-form-row">
                                  <label className="account-label">
                                    {t("newPassword")}
                                  </label>
                                  <input
                                    type="password"
                                    className="input"
                                    value={passwordForm.newPassword}
                                    onChange={(e) =>
                                      setPasswordForm((f) => ({
                                        ...f,
                                        newPassword: e.target.value,
                                      }))
                                    }
                                    placeholder={t("newPasswordPlaceholder")}
                                  />
                                </div>

                                <div className="account-form-row">
                                  <label className="account-label">
                                    {t("repeatNewPassword")}
                                  </label>
                                  <input
                                    type="password"
                                    className="input"
                                    value={passwordForm.repeatNewPassword}
                                    onChange={(e) =>
                                      setPasswordForm((f) => ({
                                        ...f,
                                        repeatNewPassword: e.target.value,
                                      }))
                                    }
                                    placeholder={t("repeatNewPasswordPlaceholder")}
                                  />
                                </div>

                                <button
                                  type="submit"
                                  className="btn small"
                                  disabled={savingPassword}
                                >
                                  {savingPassword ? t("saving") : t("savePassword")}
                                </button>
                              </form>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                    {selectedTab === "allListings" && (
                      <div className="section">
                        {/* Header with title + count */}
                        <div className="listings-header">
                          <div className="listings-header-text">
                            <h2 className="section-title">🏪 {t("browse")}</h2>
                            <p className="section-subtitle">
                              {t("allListingsHint") ||
                                "View and filter all verified listings from the platform."}
                            </p>
                          </div>
                          <div className="listings-count">
                            <span className="badge count">
                              {filtered.length} {t("resultsLabel") || "results"}
                            </span>
                            <span className="badge soft">
                              {verifiedListings.length}{" "}
                              {t("verified")?.toLowerCase?.() || "verified"}
                            </span>
                          </div>
                        </div>
                    
                        {/* Filters */}
                        <div className="filters filters-dashboard">
                          <div className="searchbar">
                            <input
                              className="input"
                              placeholder={t("searchPlaceholder") || "Search by name or description"}
                              value={q}
                              onChange={(e) => setQ(e.target.value)}
                              style={{ width: "90%" }}
                            />
                            {q && (
                              <button
                                className="btn btn-ghost small"
                                type="button"
                                onClick={() => setQ("")}
                              >
                                ✕
                              </button>
                            )}
                            <button className="btn btn-ghost" type="button">
                              {t("search")}
                            </button>
                          </div>
                    
                          <div className="filter-row">
                            <div className="filter-group">
                              <label className="filter-label">{t("category")}</label>
                              <select
                                className="select category-dropdown"
                                value={catFilter}
                                onChange={(e) => setCatFilter(e.target.value)}
                              >
                                <option value="">{t("allCategories")}</option>
                                {categories.map((cat) => (
                                  <option key={cat} value={t(cat)}>
                                    {t(cat)}
                                  </option>
                                ))}
                              </select>
                            </div>
                    
                            <div className="filter-group">
                              <label className="filter-label">{t("location")}</label>
                              <select
                                className="select"
                                value={locFilter}
                                onChange={(e) => setLocFilter(e.target.value)}
                              >
                                <option value="">{t("allLocations")}</option>
                                {allLocations.map((l) => (
                                  <option key={l} value={l}>
                                    {l}
                                  </option>
                                ))}
                              </select>
                            </div>
                    
                            <div className="filter-group">
                              <label className="filter-label">{t("sortBy")}</label>
                              <select
                                className="select"
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value)}
                              >
                                <option value="newest">{t("sortNewest")}</option>
                                <option value="expiring">{t("sortExpiring")}</option>
                                <option value="az">{t("sortAZ")}</option>
                              </select>
                            </div>
                          </div>
                        </div>
                    
                        {/* Listings grid */}
                        <div
                          className="listing-grid listing-grid-dashboard"
                          style={{ display: "block" }}
                        >
                          {filtered.map((l) => (
                            <article
                              key={l.id}
                              className="listing-card"
                              onClick={() => {
                                setSelectedListing(l);
                                const url = new URL(window.location.href);
                                url.searchParams.set("listing", l.id);
                                window.history.replaceState({}, "", url.toString());
                              }}

                              style={{marginBottom: "3%"}}
                            >
                              <header className="listing-header">
                                <div className="listing-title-wrap">
                                  <div className="listing-title-row">
                                    <span className="category-icon">
                                      {categoryIcons[l.category] || "🏷️"}
                                    </span>
                                    <h3 className="listing-title">{l.name}</h3>
                                  </div>
                                  <div className="listing-meta">
                                    {t(l.category) || l.category} • {l.location}
                                  </div>
                                </div>
                    
                                <div className="listing-badges">
                                  <span className="badge verified">✓ {t("verified")}</span>
                                </div>
                              </header>
                    
                              <p className="listing-description listing-description-clamp">
                                {l.description}
                              </p>
                    
                              <div
                                className="listing-footer-row"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <div className="listing-footer-left">
                                  {l.offerprice && (
                                    <span className="pill pill-price">{l.offerprice}</span>
                                  )}
                                  {l.tags && (
                                    <span className="pill pill-tags">
                                      {l.tags.split(",")[0]?.trim()}
                                      {l.tags.split(",").length > 1 ? " +" : ""}
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
                    
                          {filtered.length === 0 && (
                            <div className="empty">
                              <div className="empty-icon">📭</div>
                              <p className="empty-text">{t("noListingsYet")}</p>
                            </div>
                          )}
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

                {/* ====== BROWSE SECTION ====== */}
               <section className="card listings-section">
                <div className="listings-header">
                  <div>
                    <h2 className="section-title">🏪 {t("browse")}</h2>
                    <p className="section-subtitle-small">
                      {t("allListingsHint") || "Browse verified local businesses and services."}
                    </p>
                  </div>
                  <div className="listings-header-actions">
                    <span className="badge count">
                      {verifiedListings.length} {(t("verified") || "Verified").toLowerCase?.() || "verified"}
                    </span>
                  </div>
                </div>
                 
                <div className="category-chips">
                  {categories.map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      className={`chip ${catFilter === t(cat) ? "chip-active" : ""}`}
                      onClick={() =>
                        setCatFilter((prev) => (prev === t(cat) ? "" : t(cat)))
                      }
                    >
                      <span className="chip-icon">
                        {categoryIcons[cat] || "🏷️"}
                      </span>
                      <span className="chip-label">{t(cat)}</span>
                    </button>
                  ))}
                </div>
                
                <div className="quick-filters">
                  <div className="searchbar">
                    <input
                      className="input"
                      placeholder={t("searchPlaceholder") || "Search"}
                      value={q}
                      onChange={(e) => setQ(e.target.value)}
                    />
                  </div>

                  <div className="filter-row">
                    <select
                      className="select category-dropdown"
                      value={catFilter}
                      onChange={(e) => setCatFilter(e.target.value)}
                    >
                      <option value="">{t("allCategories")}</option>
                      {categories.map((cat) => (
                        <option key={cat} value={t(cat)}>
                          {t(cat)}
                        </option>
                      ))}
                    </select>

                    <select
                      className="select location-dropdown"
                      value={locFilter}
                      onChange={(e) => setLocFilter(e.target.value)}
                    >
                      <option value="">{t("allLocations")}</option>
                      {allLocations.map((city) => (
                        <option key={city} value={city}>
                          {city}
                        </option>
                      ))}
                    </select>

                    <select
                      className="select sort-dropdown"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value)}
                    >
                      <option value="newest">{t("sortNewest")}</option>
                      <option value="expiring">{t("sortExpiring")}</option>
                      <option value="az">{t("sortAZ")}</option>
                    </select>
                  </div>
                </div>

                <div className="listing-grid">
                  {filtered.length === 0 ? (
                    <div className="empty">
                      <div className="empty-icon">📭</div>
                      <p className="empty-text">{t("noListingsYet")}</p>
                    </div>
                  ) : (
                    filtered.map((l) => (
                      <article key={l.id} className="listing-card" 
                        onClick={() => {
                          setSelectedListing(l);
                          const url = new URL(window.location.href);
                          url.searchParams.set("listing", l.id);
                          window.history.replaceState({}, "", url.toString());
                        }}
                        style={{marginBottom: "3%"}}>
                        <header className="listing-header">
                          <h3 className="listing-title">{l.name}</h3>
                          {l.status === "verified" && <span className="badge verified">✓ {t("verified")}</span>}
                        </header>
                        <div className="listing-meta">{t(l.category) || l.category} • {l.location}</div>
                       <p className="listing-description listing-description-clamp">
                          {l.description}
                        </p>
                        
                        <div
                          className="listing-footer-row"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="listing-footer-left">
                            {l.offerprice && (
                              <span className="pill pill-price">{l.offerprice}</span>
                            )}
                            {l.tags && (
                              <span className="pill pill-tags">
                                {l.tags.split(",")[0]?.trim()}
                                {l.tags.split(",").length > 1 ? " +" : ""}
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
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </div>

        <AnimatePresence>
          {showPostForm && user && user.emailVerified && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowPostForm(false)}
            >
              <motion.aside
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
                        {t("whyTrustUs") || "Pse Tregu Lokal i Ndihmës?"}
                      </h2>
                      <ul className="trust-list">
                        <li>
                          ✅{" "}
                          {t("trustPoint1") ||
                            "Të gjitha listimet kontrollohen manualisht para se të verifikohen."}
                        </li>
                        <li>
                          ✅{" "}
                          {t("trustPoint2") ||
                            "Kontakt direkt me bizneset, pa komisione apo tarifa të fshehta."}
                        </li>
                        <li>
                          ✅{" "}
                          {t("trustPoint3") ||
                            "Ndërtuar për qytetet e Maqedonisë, me fokus në biznese lokale."}
                        </li>
                        <li>
                          ✅{" "}
                          {t("trustPoint4") ||
                            "Mundësi raportimi për listime të dyshimta dhe abuzime."}
                        </li>
                      </ul>
                    </section>
                  </section>
                ) : (
                  <section className="card trust-section" style={{ height: "fit-content" }}>
                    <h2 className="section-title">
                      {t("whyTrustUs") || "Pse Tregu Lokal i Ndihmës?"}
                    </h2>
                    <ul className="trust-list">
                      <li>
                        ✅{" "}
                        {t("trustPoint1") ||
                          "Të gjitha listimet kontrollohen manualisht para se të verifikohen."}
                      </li>
                      <li>
                        ✅{" "}
                        {t("trustPoint2") ||
                          "Kontakt direkt me bizneset, pa komisione apo tarifa të fshehta."}
                      </li>
                      <li>
                        ✅{" "}
                        {t("trustPoint3") ||
                          "Ndërtuar për qytetet e Maqedonisë, me fokus në biznese lokale."}
                      </li>
                      <li>
                        ✅{" "}
                        {t("trustPoint4") ||
                          "Mundësi raportimi për listime të dyshimta dhe abuzime."}
                      </li>
                    </ul>
                  </section>
                )}
                </div>
              </motion.aside>
            </motion.div>
          )}
        </AnimatePresence>
    
        {/* MAP PICKER MODAL */}
        <AnimatePresence>
          {showMapPicker && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowMapPicker(false)}
            >
              <motion.div
                className="modal map-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">
                    {t("chooseOnMap") || "Choose location on map"}
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
                        `${t("locationSetTo") || "Location set to"} ${cityName}`,
                        "success"
                      );
                      setShowMapPicker(false);
                    }}
                  />
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== EDIT MODAL (restored, resized) ===== */}
        <AnimatePresence>
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
                    }}
                  >
                    ✕
                  </button>
                </div>

                <div className="modal-body edit-modal-body">
                  <div className="field-group">
                    <label className="field-label">{t("name")}</label>
                    <input
                      className="input"
                      value={editForm.name}
                      onChange={(e) =>
                        setEditForm({
                          ...editForm,
                          name: stripDangerous(e.target.value),
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
                      <input
                        className="input"
                        value={editForm.location}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            location: stripDangerous(e.target.value),
                            locationData: null,
                          })
                        }
                      />
                    </div>
                    <div className="field-group">
                      <label className="field-label">{t("contact")}</label>
                      <input
                        className="input"
                        type="tel"
                        value={editForm.contact}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            contact: e.target.value.replace(/\D/g, ""),
                          })
                        }
                        maxLength="15"
                        inputMode="numeric"
                      />
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
                          description: stripDangerous(e.target.value),
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
                            tags: stripDangerous(e.target.value),
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
                          socialLink: stripDangerous(e.target.value),
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
                    }}
                  >
                    {t("cancel")}
                  </button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>


        {/* ===== PAYMENT MODAL (restored) ===== */}
        <AnimatePresence>
          {paymentModalOpen && paymentIntent && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => { setPaymentModalOpen(false); setPaymentIntent(null); }}>
              <motion.div className="modal payment-modal" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.98, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.98, opacity: 0 }}>
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
                      onApprove={async (data, actions) => {
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

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
                <div className="auth-mode-tabs">
                  <button
                    className={`tab ${authMode === "login" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("login");
                      setAuthTab("email");
                      setConfirmationResult(null);
                    }}
                  >
                    {t("login") || "Login"}
                  </button>
                  <button
                    className={`tab ${authMode === "signup" ? "active" : ""}`}
                    onClick={() => {
                      setAuthMode("signup");
                      setConfirmationResult(null);
                    }}
                  >
                    {t("signup") || "Register"}
                  </button>
                </div>
        
                {/* =================== LOGIN MODE =================== */}
                {authMode === "login" && (
                  <>
                    {/* Login method tabs: Email / Phone */}
                    <div className="auth-tabs">
                      <button
                        className={`tab ${authTab === "email" ? "active" : ""}`}
                        onClick={() => setAuthTab("email")}
                      >
                        {t("emailTab") || "Email"}
                      </button>
                      <button
                        className={`tab ${authTab === "phone" ? "active" : ""}`}
                        onClick={() => setAuthTab("phone")}
                      >
                        {t("signInWithPhone") || "Phone"}
                      </button>
                    </div>
        
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
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {postSignupVerifyOpen && (
            <motion.div
              className="modal-overlay"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setPostSignupVerifyOpen(false)}
            >
              <motion.div
                className="modal verify-email-modal"
                onClick={(e) => e.stopPropagation()}
                initial={{ y: 20, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 20, opacity: 0 }}
              >
                <div className="modal-header">
                  <h3 className="modal-title">{t("verifyYourEmail") || "Verify your email"}</h3>
                  <button className="icon-btn" onClick={() => setPostSignupVerifyOpen(false)}>
                    ✕
                  </button>
                </div>
        
                <div className="modal-body">
                  <p className="auth-subtitle">
                    {t("verifyEmailHint") ||
                      "We sent a verification link to your email. You can keep browsing, but you must verify before you can submit listings."}
                  </p>
        
                  <div className="verify-actions">
                    <button
                      className="btn full-width"
                      onClick={async () => {
                        try {
                          const u = auth.currentUser;
                          if (!u) return showMessage("Not signed in.", "error");
                          await sendEmailVerification(u);
                          setSignupEmailSentAt(Date.now());
                          showMessage(t("emailLinkSent") || "Verification email sent.", "success");
                        } catch (err) {
                          showMessage(err.message, "error");
                        }
                      }}
                    >
                      {t("resendEmail") || "Resend verification email"}
                    </button>
        
                    <button
                      className="btn btn-ghost full-width"
                      onClick={async () => {
                        try {
                          // Force-refresh the user object to reflect verification
                          await auth.currentUser?.reload();
                          if (auth.currentUser?.emailVerified) {
                            showMessage(t("emailVerified") || "Email verified!", "success");
                            setPostSignupVerifyOpen(false);
                          } else {
                            showMessage(
                              t("notVerifiedYet") || "Still not verified. Check your inbox/spam and click the link.",
                              "error"
                            );
                          }
                        } catch (err) {
                          showMessage(err.message, "error");
                        }
                      }}
                    >
                      {t("iVerified") || "I verified, refresh"}
                    </button>
        
                    <button
                      className="btn btn-ghost full-width"
                      onClick={() => setPostSignupVerifyOpen(false)}
                    >
                      {t("verifyLater") || "Verify later"}
                    </button>
                  </div>
        
                  <div className="verify-footnote">
                    {t("verifyFootnote") ||
                      "Tip: If you don’t see the email, check Spam/Promotions. The sender is Firebase."}
                  </div>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
        
        {/* LISTING DETAILS MODAL */}
        <AnimatePresence>
          {selectedListing && (
            <motion.div className="modal-overlay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} 
              onClick={() => {
                setSelectedListing(null);
                const url = new URL(window.location.href);
                url.searchParams.delete("listing");
                window.history.replaceState({}, "", url.toString());
              }}
            >
              <motion.div className="modal listing-details-modal" onClick={(e) => e.stopPropagation()} initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }} transition={{ duration: 0.3 }}>
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

                <div className="modal-body listing-details-body" style={{ maxHeight: "72vh", overflowY: "auto" }}>
                  <div className="listing-info-grid">
                    <div><strong>{t("category")}:</strong> {t(selectedListing.category) || selectedListing.category}</div>
                    <div><strong>{t("location")}:</strong> {selectedListing.location || (t("unspecified") || "Unspecified")}</div>
                    <div>
                      <strong>{t("status")}:</strong>{" "}
                      <span className={`status-badge ${selectedListing.status === "verified" ? "verified" : "pending"}`}>
                        {selectedListing.status === "verified" ? "✅ " + t("verified") : "⏳ " + t("pending")}
                      </span>
                    </div>
                    {selectedListing.expiresAt && <div><strong>{t("expires")}:</strong> {new Date(selectedListing.expiresAt).toLocaleDateString()}</div>}
                    {selectedListing.locationData && (
                      <>
                        <div>
                          <strong>{t("cityLabel")}:</strong> {selectedListing.locationData.city}
                        </div>
                        <div>
                          <strong>{t("areaLabel")}:</strong> {selectedListing.locationData.area}
                        </div>
                        <div>
                          <strong>{t("map")}:</strong>{" "}
                          {selectedListing.locationData.mapsUrl ? (
                            <a href={selectedListing.locationData.mapsUrl} target="_blank" rel="noreferrer">
                              {t("openInMaps") || "Open in Maps"}
                            </a>
                          ) : (
                            t("unspecified") || "Unspecified"
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {selectedListing.imagePreview && <img src={selectedListing.imagePreview} alt="preview" style={{ width: "100%", borderRadius: 12, border: "1px solid #e5e7eb", marginBottom: 10 }} />}

                  <p className="listing-description-full">{selectedListing.description}</p>

                  {selectedListing.contact && (
                    <div className="listing-contact-info">
                      <p><strong>{t("contact")}:</strong> {selectedListing.contact}</p>
                    </div>
                  )}

                  <div className="listing-contact-info" style={{ marginTop: 10 }}>
                    <p>
                      <strong>{t("priceLabel")}:</strong>{" "}
                      {selectedListing.offerprice || t("unspecified") || "Unspecified"}
                    </p>
                    <p>
                      <strong>{t("tagsLabel")}:</strong>{" "}
                      {selectedListing.tags || t("unspecified") || "Unspecified"}
                    </p>
                    <p>
                      <strong>{t("websiteLabel")}:</strong>{" "}
                      {selectedListing.socialLink ? (
                        <a href={selectedListing.socialLink} target="_blank" rel="noreferrer">
                          {selectedListing.socialLink}
                        </a>
                      ) : (
                        t("unspecified") || "Unspecified"
                      )}
                    </p>
                  </div>
                </div>

                <div className="modal-actions">
                  <button className="btn small" onClick={() => window.open(`tel:${selectedListing.contact}`)}>📞 {t("call")}</button>
                  <button className="btn small" onClick={() => window.open(`mailto:${selectedListing.userEmail || ""}?subject=Regarding%20${encodeURIComponent(selectedListing.name)}`)}>✉️ {t("emailAction")}</button>
                  <button className="btn btn-ghost small" onClick={() => { navigator.clipboard.writeText(selectedListing.contact); showMessage(t("copied"), "success"); }}>📋 {t("copy")}</button>
                  <button className="btn btn-ghost small" onClick={() => handleShareListing(selectedListing)}>🔗 {t("share") || "Share"}</button>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* FOOTER */}
        <footer className="footer">
          <p>© 2024 {t("appName")} • BizCall</p>
        </footer>
        <div id="recaptcha-signup" style={{ display: "none" }} />
        <div id="recaptcha-container" style={{ display: "none" }} />
      </div>
    </PayPalScriptProvider>
  );
}
