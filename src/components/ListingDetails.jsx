import React, { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Helmet } from "react-helmet-async";
import { motion as Motion, AnimatePresence } from "framer-motion";
import { categoryIcons, countryCodes } from "../constants";
import NorthMacedoniaMap from "../NorthMacedoniaMap";

const ListingDetails = ({
  listings,
  t,
  user,
  feedbackStore,
  saveFeedback, // function from App to save feedback
  handleDelete, // function from App
  handleEdit,   // function from App
  showMessage,
  buildLocationString,
  listingLocationLabel, // helper or logic
  listingPriceLabel,    // helper or logic
  categoryIcons,
  stripDangerous
}) => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [listing, setListing] = useState(null);
  const [feedbackDraft, setFeedbackDraft] = useState({ rating: 4, comment: "" });
  const [isSavingFeedback, setIsSavingFeedback] = useState(false);

  useEffect(() => {
    if (listings && id) {
      const found = listings.find((l) => l.id === id);
      setListing(found);
    }
  }, [listings, id]);

  if (!listing) {
    return (
      <div className="container p-4 text-center">
        <Helmet>
          <title>{t("loading") || "Loading..."} - {t("appName") || "BizCall"}</title>
        </Helmet>
        <p>{t("loading") || "Loading..."}</p>
      </div>
    );
  }

  // Derived state
  const locationLabel = buildLocationString
    ? buildLocationString(listing.locationData?.city || listing.location, listing.locationData?.area || listing.locationExtra)
    : (listing.location || t("unspecified"));
    
  const priceLabel = listing.offerprice || t("unspecified");
  
  const listingFeedback = feedbackStore[listing.id] || { entries: [] };
  const feedbackList = listingFeedback.entries || [];
  const feedbackStats = feedbackList.reduce(
    (acc, curr) => {
      acc.sum += curr.rating;
      acc.count++;
      return acc;
    },
    { sum: 0, count: 0 }
  );
  feedbackStats.avg = feedbackStats.count
    ? (feedbackStats.sum / feedbackStats.count).toFixed(1)
    : null;

  const isOwner = user && user.uid === listing.userId;
  const listingContactAvailable = !!listing.contact;

  const handleFeedbackSubmit = async (e) => {
    e.preventDefault();
    if (!user) return showMessage(t("loginRequired"), "error");
    if (!feedbackDraft.comment.trim()) return showMessage(t("commentEmptyError"), "error");

    setIsSavingFeedback(true);
    try {
      await saveFeedback(listing.id, feedbackDraft);
      setFeedbackDraft({ rating: 4, comment: "" });
      showMessage(t("feedbackSaved"), "success");
    } catch (err) {
      showMessage(err.message, "error");
    } finally {
      setIsSavingFeedback(false);
    }
  };

  return (
    <Motion.div 
      className="page-container"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <Helmet>
        <title>{listing.name} - {t("appName") || "BizCall"}</title>
        <meta name="description" content={listing.description?.slice(0, 160) || "Listing details"} />
      </Helmet>

      <div className="container listing-details-page">
        {/* Header / Hero */}
        <div className="listing-hero-card" style={{ marginBottom: "2rem" }}>
           <div className="category-banner" style={{ 
             background: "linear-gradient(135deg, #2563eb, #3b82f6)", 
             color: "#fff",
             padding: "2rem",
             borderRadius: "12px 12px 0 0",
             display: "flex",
             alignItems: "center",
             gap: "1rem"
           }}>
             <span className="category-icon" style={{ fontSize: "2.5rem", background: "rgba(255,255,255,0.2)", padding: "0.5rem", borderRadius: "50%" }}>
               {categoryIcons[listing.category] || "🏷️"}
             </span>
             <div>
               <h1 className="hero-title" style={{ margin: 0, fontSize: "2rem" }}>{listing.name}</h1>
               <div className="chip-row" style={{ marginTop: "0.5rem", display: "flex", gap: "0.5rem" }}>
                 <span className="pill" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>{t(listing.category) || listing.category}</span>
                 <span className="pill" style={{ background: "rgba(255,255,255,0.2)", color: "white" }}>{locationLabel}</span>
                 {listing.status === "verified" && (
                    <span className="pill" style={{ background: "#10b981", color: "white" }}>✅ {t("verified")}</span>
                 )}
               </div>
             </div>
           </div>
           
           <div className="listing-content p-4 card" style={{ borderRadius: "0 0 12px 12px", borderTop: "none" }}>
             <div className="flex flex-wrap gap-4 justify-between items-start">
               <div className="flex-1 min-w-[300px]">
                 <div className="price-tag mb-4">
                   <span className="text-xl font-bold text-primary">{priceLabel}</span>
                 </div>
                 
                 <h3 className="section-title">{t("description")}</h3>
                 <p className="listing-description whitespace-pre-wrap mb-6">
                   {listing.description || t("noDescription")}
                 </p>
                 
                 {listing.tags && (
                   <div className="tags-container mb-6">
                     {listing.tags.split(",").map(tag => (
                       <span key={tag} className="tag-pill">#{tag.trim()}</span>
                     ))}
                   </div>
                 )}
               </div>
               
               <div className="sidebar w-full md:w-1/3 bg-gray-50 p-4 rounded-xl">
                  {listing.imagePreview && (
                    <div className="listing-image mb-4 rounded-xl overflow-hidden shadow-sm">
                      <img src={listing.imagePreview} alt={listing.name} className="w-full h-auto object-cover" />
                    </div>
                  )}
                  
                  <div className="contact-actions flex flex-col gap-2">
                    <button 
                      className="btn full-width" 
                      disabled={!listingContactAvailable} 
                      onClick={() => listingContactAvailable && window.open(`tel:${listing.contact}`)}
                    >
                      📞 {t("call")} {listing.contact}
                    </button>
                    
                    {listing.socialLink && (
                      <button 
                        className="btn btn-outline full-width"
                        onClick={() => window.open(listing.socialLink.startsWith("http") ? listing.socialLink : `https://${listing.socialLink}`, "_blank")}
                      >
                        🌐 {t("visitWebsite") || "Visit Website"}
                      </button>
                    )}
                    
                    <button 
                      className="btn btn-ghost full-width"
                      onClick={() => window.open(`mailto:${listing.userEmail || ""}?subject=Regarding%20${encodeURIComponent(listing.name)}`)}
                    >
                      ✉️ {t("emailAction")}
                    </button>
                  </div>
                  
                  {isOwner && (
                    <div className="owner-actions mt-6 pt-4 border-t border-gray-200">
                      <p className="text-sm text-gray-500 mb-2">{t("ownerActions") || "Owner Actions"}</p>
                      <div className="flex gap-2">
                        <button className="btn btn-sm btn-outline flex-1" onClick={() => handleEdit(listing)}>✏️ {t("edit")}</button>
                        <button className="btn btn-sm btn-danger flex-1" onClick={() => handleDelete(listing)}>🗑️ {t("delete")}</button>
                      </div>
                    </div>
                  )}
               </div>
             </div>
           </div>
        </div>

        {/* Location Map */}
        <div className="card mb-6">
          <h3 className="section-title mb-4">📍 {t("location")}</h3>
          <div className="map-wrapper rounded-xl overflow-hidden h-[300px]">
             {/* We can just show the map centered on the city if we don't have exact coords, or pass the city name to NorthMacedoniaMap to highlight it if supported */}
             <NorthMacedoniaMap /> 
          </div>
          <p className="mt-2 text-center text-gray-500">{locationLabel}</p>
        </div>

        {/* Reviews Section */}
        <div className="card reviews-section">
          <div className="flex justify-between items-center mb-6">
            <h3 className="section-title m-0">
              💬 {t("reviews")} ({feedbackStats.count})
            </h3>
            {feedbackStats.avg && (
              <div className="rating-badge text-xl font-bold text-yellow-500">
                ⭐ {feedbackStats.avg} / 5
              </div>
            )}
          </div>

          {/* Review Form */}
          {user ? (
             <form className="review-form mb-8 p-4 bg-gray-50 rounded-xl" onSubmit={handleFeedbackSubmit}>
               <h4 className="text-md font-semibold mb-3">{t("leaveReview") || "Leave a Review"}</h4>
               
               <div className="rating-select mb-3">
                 {[1, 2, 3, 4, 5].map((r) => (
                   <button
                     key={r}
                     type="button"
                     className={`star-btn ${feedbackDraft.rating >= r ? "active" : ""}`}
                     onClick={() => setFeedbackDraft({ ...feedbackDraft, rating: r })}
                     style={{ fontSize: "1.5rem", marginRight: "0.25rem", background: "none", border: "none", cursor: "pointer", opacity: feedbackDraft.rating >= r ? 1 : 0.3 }}
                   >
                     ⭐
                   </button>
                 ))}
               </div>
               
               <textarea
                 className="input mb-3"
                 placeholder={t("commentPlaceholder") || "Share your experience..."}
                 rows={3}
                 value={feedbackDraft.comment}
                 onChange={(e) => setFeedbackDraft({ ...feedbackDraft, comment: e.target.value })}
               />
               
               <button type="submit" className="btn btn-primary" disabled={isSavingFeedback}>
                 {isSavingFeedback ? t("saving") : (t("submitReview") || "Submit Review")}
               </button>
             </form>
          ) : (
            <div className="login-prompt p-4 bg-blue-50 text-blue-700 rounded-xl mb-6 text-center">
              {t("loginToReview") || "Please log in to leave a review."}
            </div>
          )}

          {/* Review List */}
          <div className="review-list space-y-4">
            {feedbackList.length > 0 ? (
              feedbackList.map((review, idx) => (
                <div key={idx} className="review-item p-4 border border-gray-100 rounded-xl hover:bg-gray-50 transition-colors">
                  <div className="flex justify-between items-start mb-2">
                    <div className="reviewer-info">
                      <span className="font-semibold">{review.author || t("anonymous")}</span>
                      <span className="text-gray-400 text-sm ml-2">{new Date(review.createdAt).toLocaleDateString()}</span>
                    </div>
                    <div className="review-rating text-yellow-500">
                      {"⭐".repeat(review.rating)}
                    </div>
                  </div>
                  <p className="review-text text-gray-700">{review.comment}</p>
                </div>
              ))
            ) : (
              <p className="text-gray-500 text-center py-8">{t("noReviewsYet") || "No reviews yet. Be the first!"}</p>
            )}
          </div>
        </div>
      </div>
    </Motion.div>
  );
};

export default ListingDetails;
