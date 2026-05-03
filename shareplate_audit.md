# SharePlate Project Audit Report

## 1. What Has Been Implemented
**Current Functional State:**
*   **Authentication:** JWT-based login and registration are implemented.
*   **Role-Based Access:** Users can register as `donor`, `recipient`, or `volunteer`.
*   **Donor Workflow:** Donors can post food donations (quantity, expiry, address), view active inventory, and track the status of their claims via the `DonorDashboard`.
*   **Recipient (NGO) Workflow:** Recipients can view a live feed of donations, filter them by urgency/freshness, and claim them. They can also post donations via a "Donate mode" switch.
*   **Volunteer Workflow:** Volunteers have a dispatch board to claim open deliveries and update milestones (Assigned -> Picked Up -> Delivering -> Delivered).
*   **Live Tracking (Simulated):** A map UI tracks delivery progress. However, it currently relies on simulated linear interpolation between points rather than real GPS streams.
*   **API & Backend:** A Django REST Framework backend handles requests, updates, and includes a basic geocoding endpoint utilizing `Nominatim`.

**Status Summary:**
*   *Complete:* Basic CRUD for donations, role-based dashboards, authentication.
*   *Partially Implemented:* Real-time tracking (currently relies on heavy 4s API polling and simulated coordinates), Geocoding (synchronous, prone to failure).
*   *Missing:* Admin verification, NGO feedback loop, chat/coordination, cancellation workflows.

---

## 2. Critical Problems (HIGH PRIORITY)
*   **Zero Verification / Trust System:** The prompt specifies "Admin verifies donors, NGOs, and volunteers to ensure trust", but this is completely absent from the codebase. Anyone can register and immediately interact with the platform, making it highly unsafe.
*   **Race Conditions on Claiming:** The `RequestListCreateView` checks if `item.is_available` and then updates it, but it does NOT use database locking (`select_for_update`). Two recipients clicking "Claim" at the same exact millisecond will result in duplicate requests for a single food item.
*   **Synchronous Third-Party API Calls:** Geocoding via Nominatim occurs synchronously inside the `Item` model's `save()` method. If the geocoding service is slow or rate-limits you, the entire `createDonation` API call will hang and crash.
*   **DDoS via Polling:** The frontend aggressively polls the backend every 4 seconds (`refetchInterval: 4000`) for multiple endpoints (`/donations`, `/requests`). At even a modest scale, this will DDOS your Django backend and crash the database.

---

## 3. UX/UI Issues
*   **Amateur / "AI-Generated" Tone:** The copywriting feels disconnected from a charity app. Phrases like "Networked donation ops", "Live network pulse", and "Donor control room" sound like military logistics software, not a community food-sharing platform. It lacks human warmth.
*   **Confusing Terminology:** The requirements call them "NGOs", but the codebase and UI hardcode the role as "Recipients".
*   **Poor Error Handling for Maps:** If geocoding fails, the map either breaks or silently falls back. Users have no way to manually drop a pin if their address isn't recognized by Nominatim.
*   **Unclear Empty States:** "Publish a donation to start the workflow" is fine, but it doesn't guide users on what makes a *good* donation or how the process works for first-timers.
*   **Missing Skeletons:** Using `disabled={isPending}` is okay, but full-page loading states or skeleton loaders during the 4s refetches makes the UI feel jittery.

---

## 4. Functional Gaps
*   **Missing Feedback/Rating Loop:** NGOs cannot leave feedback after completion. There is no API or UI for rating volunteers or donors.
*   **No Cancellation Workflow:** What happens if a volunteer's car breaks down? What happens if a donor realizes the food is spoiled? There are no "Cancel", "Report Issue", or "No-Show" buttons. Deliveries will get stuck in "Assigned" purgatory forever.
*   **No Communication:** There is no in-app chat, and phone numbers are not exposed on the dashboard cards. The donor, NGO, and volunteer cannot coordinate if someone gets lost or is running late.
*   **No Admin Dashboard:** There is no UI for an admin to view platform health, ban bad actors, or verify users.

---

## 5. Real-World Practical Issues
*   **Coordination Delays:** Drivers will get lost. Without a "Call Donor" or "Call Volunteer" button, the food will sit rotting while they try to find the address.
*   **Food Safety Liability:** Without a disclaimer or safety checklist before posting/claiming, the platform assumes massive liability if someone gets sick from spoiled food.
*   **Geocoding Inaccuracy:** `Nominatim` open-source geocoding is notoriously inaccurate for unstructured addresses, especially outside major Western cities. Volunteers will be sent to the wrong locations.
*   **Fake Users:** Trolls can create accounts, claim all available food, and never pick it up, starving actual NGOs and wasting donor food.

---

## 6. Trust & Safety Issues
*   **Privacy Leaks:** The exact address of a donor is exposed to *all* recipients before a claim is even made. This is a severe safety risk. Addresses should be obfuscated (e.g., "Sector 4, City") until a claim is verified and accepted.
*   **Predatory Behavior Risks:** Because there is zero background checking or identity verification, bad actors can register as volunteers and use the platform to find vulnerable people or target specific homes.
*   **No Reporting:** Users cannot report abusive behavior, fake listings, or inappropriate conduct.

---

## 7. Performance & Technical Issues
*   **Architecture Flaw (Polling):** Polling 3 different endpoints every 4-10 seconds per active user is unscalable. You must implement WebSockets (e.g., Django Channels) for real-time tracking.
*   **Simulated Tracking is Deceptive:** The `_simulate_progress_coordinates` function literally fakes the volunteer's movement. If an investor or tech lead checks the network tab and sees faked GPS data, they will instantly reject the project.
*   **Missing DB Indexes:** The database models lack proper indexing on frequently queried fields like `status`, `delivery_status`, and `role`, which will cause slow table scans as data grows.

---

## 8. Brutal First Impression
If I saw this as a recruiter, tech lead, or investor:
*   **What feels weak?** The over-reliance on 4-second polling and simulated GPS data screams "junior developer who couldn't figure out WebSockets".
*   **What feels amateur?** The "sci-fi" copywriting on the dashboard. It feels like an AI was prompted to "make it sound cool" rather than designing for the actual target audience (charity workers and volunteers).
*   **What would make me reject it?** The complete lack of verification and missing core requirements (NGO feedback). You promised a secure, admin-verified platform, but delivered an open, unsafe, easily-exploited sandbox. The lack of database transaction locks (`select_for_update`) on claims shows a lack of backend maturity.

---

## 9. Prioritized Fix List (Top 10)
1.  **Implement DB Transaction Locks:** Wrap the claiming logic in `transaction.atomic()` and use `select_for_update()` to prevent concurrent double-claiming of food.
2.  **Build the Admin Verification Gate:** Add an `is_verified` boolean to the `UserProfile`. Block donors/NGOs/volunteers from posting or claiming until an Admin approves them.
3.  **Replace Polling with WebSockets:** Remove the 4-second frontend polling. Implement Django Channels to push state changes to the UI efficiently.
4.  **Add Communication Tools:** Expose masked phone numbers or build a simple in-app chat so the triad (Donor, NGO, Volunteer) can coordinate pickups.
5.  **Implement the Feedback Loop:** Build the missing feature for NGOs to rate/review the food quality and volunteer promptness after a delivery is completed.
6.  **Build Cancellation Workflows:** Allow users to cancel a request or report a no-show, freeing the food back up into the live network.
7.  **Fix Synchronous Geocoding:** Move Nominatim geocoding to an asynchronous Celery task or have the frontend Google Maps/Mapbox API pass the exact coordinates to the backend directly.
8.  **Obfuscate Pre-Claim Addresses:** Only show exact addresses to the assigned volunteer and the specific claiming NGO. Show a generalized area to the rest of the network.
9.  **Rewrite UI Copy:** Change the aggressive, over-engineered text (e.g., "Networked donation ops") to empathetic, user-friendly language (e.g., "Your active donations").
10. **Add Manual Pin Drops:** Allow users to place a pin on a map during donation creation, bypassing the inaccurate text-to-coordinate geocoding entirely.
