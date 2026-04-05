# Learnings - PDM Site Urban Hills Refactoring

## 1. Firebase Firestore Real-time Updates
- **Problem:** Using `getDocs` in loops or nested promises led to UI hangs ("Chargement..." never disappearing) and console errors when data was missing or delayed.
- **Solution:** Switched to `onSnapshot`. This provides real-time updates and handles the initial data fetch more gracefully. It also simplifies the logic by removing the need for manual refresh triggers.

## 2. Code Centralization (common.js)
- **Problem:** Duplicate logic for user badges, theme management, and XSS protection across multiple pages.
- **Solution:** Created `js/common.js` to house shared utilities. This ensures a consistent UI (the "Dark Luxury" badge) and centralized security/theme logic.

## 3. Sub-collection Handling
- **Problem:** Managing members within partnerships was clunky.
- **Solution:** Implemented nested `onSnapshot` listeners for the `membres` sub-collection within each partnership document. This ensures that adding/removing members updates the UI instantly without reloading the entire partnership list.

## 4. UI/UX Consistency
- **Observation:** The "Dark Luxury" theme (Gold/Black) was inconsistent across pages.
- **Action:** Standardized the use of `#d4af37` (Gold) and `#1a1a1a` (Dark) gradients and badges across all refactored pages.

## 5. Security
- **Observation:** Direct injection of Firestore data into HTML (`innerHTML`).
- **Action:** Implemented a simple XSS filter in `common.js` to escape HTML entities before rendering user-generated content.
