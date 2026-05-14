/**
 * Our Future Management — client-side app
 * Persists users, session, and summary metadata + file blobs (base64) in localStorage.
 * Open OurFutureManagement.html directly in the browser (no server required).
 */

(function () {
  "use strict";

  // ---------------------------------------------------------------------------
  // Storage keys — single place to avoid typos
  // ---------------------------------------------------------------------------
  const STORAGE_USERS = "studyshare_users";
  const STORAGE_SESSION = "studyshare_session_user_id";
  const STORAGE_SUMMARIES = "studyshare_summaries";
  /** User-added major names (shown after built-ins). */
  const STORAGE_CUSTOM_MAJORS = "ofm_custom_majors";

  /** Built-in majors = default folders (cannot be removed). */
  const BUILTIN_MAJORS = [
    "Engineering",
    "Information Technology (IT)",
    "Business & Economics",
    "Medicine & Health Sciences",
    "Law",
    "Natural Sciences",
    "Arts & Humanities",
    "Education",
    "General / Other",
  ];

  /** Years = folders inside each major. */
  const YEARS_LIST = ["Year 1", "Year 2", "Year 3", "Year 4", "Year 5+", "Graduate / Masters"];

  const DEFAULT_MAJOR = "General / Other";
  const DEFAULT_YEAR = "Year 1";

  // ---------------------------------------------------------------------------
  // Helpers: read/write JSON from localStorage safely
  // ---------------------------------------------------------------------------
  function loadJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  }

  function saveJson(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function getUsers() {
    return loadJson(STORAGE_USERS, []);
  }

  function saveUsers(users) {
    saveJson(STORAGE_USERS, users);
  }

  function getSummaries() {
    return loadJson(STORAGE_SUMMARIES, []);
  }

  function saveSummaries(list) {
    saveJson(STORAGE_SUMMARIES, list);
  }

  /** Add major/year for summaries saved before folders existed. */
  function migrateSummariesIfNeeded() {
    const list = loadJson(STORAGE_SUMMARIES, []);
    let changed = false;
    const out = list.map((s) => {
      if (!s.major || !s.yearLevel) {
        changed = true;
        return {
          ...s,
          major: s.major || DEFAULT_MAJOR,
          yearLevel: s.yearLevel || DEFAULT_YEAR,
        };
      }
      return s;
    });
    if (changed) saveSummaries(out);
  }

  function getCustomMajors() {
    const arr = loadJson(STORAGE_CUSTOM_MAJORS, []);
    if (!Array.isArray(arr)) return [];
    return arr.filter((s) => typeof s === "string" && s.trim()).map((s) => s.trim());
  }

  function saveCustomMajors(list) {
    saveJson(STORAGE_CUSTOM_MAJORS, list);
  }

  /** Built-in majors first, then user-added (no duplicate names, case-insensitive). */
  function getAllMajors() {
    const custom = getCustomMajors();
    const seen = new Set(BUILTIN_MAJORS.map((m) => m.toLowerCase()));
    const out = [...BUILTIN_MAJORS];
    custom.forEach((m) => {
      const k = m.toLowerCase();
      if (!seen.has(k)) {
        seen.add(k);
        out.push(m);
      }
    });
    return out;
  }

  function isCustomMajor(name) {
    return getCustomMajors().includes(name);
  }

  function addCustomMajor(raw) {
    const name = String(raw || "").trim();
    if (name.length < 2) return { ok: false, message: "Major name is too short (min 2 characters)." };
    if (name.length > 80) return { ok: false, message: "Major name is too long (max 80 characters)." };
    const lower = name.toLowerCase();
    if (getAllMajors().some((m) => m.toLowerCase() === lower)) {
      return { ok: false, message: "That major already exists." };
    }
    const list = getCustomMajors();
    list.push(name);
    saveCustomMajors(list);
    return { ok: true, major: name };
  }

  /** Remove a user-added major; summaries in that major move to “General / Other”. */
  function removeCustomMajor(name) {
    const before = getCustomMajors();
    const after = before.filter((m) => m !== name);
    if (after.length === before.length) {
      return { ok: false, message: "Only custom majors you added can be removed. Built-in folders stay." };
    }
    saveCustomMajors(after);
    const sums = getSummaries().map((s) => (s.major === name ? { ...s, major: DEFAULT_MAJOR } : s));
    saveSummaries(sums);
    return { ok: true };
  }

  function deleteSummaryById(id) {
    const list = getSummaries().filter((s) => s.id !== id);
    if (list.length === getSummaries().length) return false;
    saveSummaries(list);
    return true;
  }

  function getSessionUserId() {
    return localStorage.getItem(STORAGE_SESSION);
  }

  function setSessionUserId(id) {
    if (id) localStorage.setItem(STORAGE_SESSION, id);
    else localStorage.removeItem(STORAGE_SESSION);
  }

  function findUserById(id) {
    return getUsers().find((u) => u.id === id) || null;
  }

  function findUserByEmail(email) {
    const lower = email.trim().toLowerCase();
    return getUsers().find((u) => u.email.toLowerCase() === lower) || null;
  }

  /** Simple unique id for demo (not cryptographically secure). */
  function uid() {
    return "u_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  function summaryId() {
    return "s_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 9);
  }

  // ---------------------------------------------------------------------------
  // DOM references
  // ---------------------------------------------------------------------------
  const navToggle = document.getElementById("navToggle");
  const siteNav = document.getElementById("siteNav");
  const navGuest = document.getElementById("navGuest");
  const navUser = document.getElementById("navUser");
  const logoutBtn = document.getElementById("logoutBtn");

  const pages = {
    home: document.getElementById("page-home"),
    login: document.getElementById("page-login"),
    register: document.getElementById("page-register"),
    upload: document.getElementById("page-upload"),
    browse: document.getElementById("page-browse"),
    profile: document.getElementById("page-profile"),
  };

  const loginForm = document.getElementById("loginForm");
  const loginError = document.getElementById("loginError");
  const registerForm = document.getElementById("registerForm");
  const registerError = document.getElementById("registerError");
  const uploadForm = document.getElementById("uploadForm");
  const uploadError = document.getElementById("uploadError");
  const uploadSuccess = document.getElementById("uploadSuccess");
  const searchInput = document.getElementById("searchInput");
  const summaryList = document.getElementById("summaryList");
  const browseEmpty = document.getElementById("browseEmpty");
  const upFileInput = document.getElementById("upFile");
  const fileDropHint = document.getElementById("fileDropHint");
  const browseSort = document.getElementById("browseSort");
  const browseWeekOnly = document.getElementById("browseWeekOnly");
  const trendingList = document.getElementById("trendingList");
  const trendingEmpty = document.getElementById("trendingEmpty");
  const hotSubjectsList = document.getElementById("hotSubjectsList");
  const hotSubjectsEmpty = document.getElementById("hotSubjectsEmpty");
  const futureProgressFill = document.getElementById("futureProgressFill");
  const futureProgressTrack = document.getElementById("futureProgressTrack");
  const futureMilestoneLabel = document.getElementById("futureMilestoneLabel");
  const futureMilestoneCount = document.getElementById("futureMilestoneCount");
  const futureMilestoneTarget = document.getElementById("futureMilestoneTarget");
  const futureMilestoneSuffix = document.getElementById("futureMilestoneSuffix");

  const browseFolderPane = document.getElementById("browseFolderPane");
  const browseListPane = document.getElementById("browseListPane");
  const browseFolderGrid = document.getElementById("browseFolderGrid");
  const browseFolderPaneTitle = document.getElementById("browseFolderPaneTitle");
  const browseBreadcrumb = document.getElementById("browseBreadcrumb");
  const browseBackBtn = document.getElementById("browseBackBtn");
  const browseShowAllBtn = document.getElementById("browseShowAllBtn");

  /** Browse drill-down: major folder → year folder → list (or flat “all” mode). */
  let browseMajor = null;
  let browseYear = null;
  let browseFlatMode = false;
  let preserveBrowseNext = false;

  const profileView = document.getElementById("profileView");
  const profileEditForm = document.getElementById("profileEditForm");
  const editProfileBtn = document.getElementById("editProfileBtn");
  const cancelEditBtn = document.getElementById("cancelEditBtn");
  const profileError = document.getElementById("profileError");
  const pvName = document.getElementById("pvName");
  const pvEmail = document.getElementById("pvEmail");
  const pvRole = document.getElementById("pvRole");
  const pvCount = document.getElementById("pvCount");
  const pfName = document.getElementById("pfName");
  const pfEmail = document.getElementById("pfEmail");
  const pfPassword = document.getElementById("pfPassword");

  // ---------------------------------------------------------------------------
  // Navigation: show one section, update URL hash for bookmarking (optional)
  // ---------------------------------------------------------------------------
  function closeMobileNav() {
    if (!siteNav || !navToggle) return;
    siteNav.classList.remove("is-open");
    navToggle.setAttribute("aria-expanded", "false");
  }

  function showPage(name) {
    const preserveBrowse = preserveBrowseNext;
    preserveBrowseNext = false;
    Object.keys(pages).forEach((key) => {
      const el = pages[key];
      if (!el) return;
      if (key === name) {
        el.classList.remove("hidden");
        el.classList.add("page-active");
      } else {
        el.classList.add("hidden");
        el.classList.remove("page-active");
      }
    });
    closeMobileNav();
    if (name === "browse") {
      if (!preserveBrowse) {
        browseMajor = null;
        browseYear = null;
        browseFlatMode = false;
        if (searchInput) searchInput.value = "";
      }
      renderBrowsePage();
    }
    if (name === "profile") renderProfile();
    if (name === "home") renderFutureHub();
    window.location.hash = name;
  }

  function getCurrentUser() {
    const id = getSessionUserId();
    if (!id) return null;
    return findUserById(id);
  }

  /** Toggle header links for guest vs authenticated user. */
  function updateNavAuth() {
    const user = getCurrentUser();
    if (user) {
      navGuest.classList.add("hidden");
      navUser.classList.remove("hidden");
    } else {
      navGuest.classList.remove("hidden");
      navUser.classList.add("hidden");
    }
  }

  function requireAuth(pageIfFail) {
    if (!getCurrentUser()) {
      showPage(pageIfFail || "login");
      return false;
    }
    return true;
  }

  // ---------------------------------------------------------------------------
  // Auth: register, login, logout
  // Note: passwords stored in plain text for local demo only — never do this on a real server.
  // ---------------------------------------------------------------------------
  function registerUser(payload) {
    const users = getUsers();
    if (findUserByEmail(payload.email)) {
      return { ok: false, message: "An account with this email already exists." };
    }
    const user = {
      id: uid(),
      name: payload.name.trim(),
      email: payload.email.trim().toLowerCase(),
      password: payload.password,
      role: payload.role === "professor" ? "professor" : "student",
      createdAt: new Date().toISOString(),
    };
    users.push(user);
    saveUsers(users);
    setSessionUserId(user.id);
    return { ok: true, user };
  }

  function loginUser(email, password) {
    const user = findUserByEmail(email);
    if (!user || user.password !== password) {
      return { ok: false, message: "Invalid email or password." };
    }
    setSessionUserId(user.id);
    return { ok: true, user };
  }

  function logout() {
    setSessionUserId(null);
    updateNavAuth();
    showPage("home");
  }

  // ---------------------------------------------------------------------------
  // Summaries: count per user, add, list, filter, download
  // File body stored as data URL string (base64) — large files may exceed quota.
  // ---------------------------------------------------------------------------
  function countSummariesForUser(userId) {
    return getSummaries().filter((s) => s.uploaderId === userId).length;
  }

  function readFileAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(new Error("Could not read file."));
      reader.readAsDataURL(file);
    });
  }

  function allowedMime(file) {
    const name = (file.name || "").toLowerCase();
    const okExt = name.endsWith(".pdf") || name.endsWith(".docx") || name.endsWith(".doc");
    const type = file.type || "";
    const okType =
      type === "application/pdf" ||
      type === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      type === "application/msword";
    return okExt || okType;
  }

  function addSummary({ title, subject, description, fileName, mimeType, dataUrl, major, yearLevel }) {
    const user = getCurrentUser();
    if (!user) return { ok: false, message: "You must be logged in." };
    const list = getSummaries();
    list.unshift({
      id: summaryId(),
      title: title.trim(),
      subject: subject.trim(),
      description: (description || "").trim(),
      major: major || DEFAULT_MAJOR,
      yearLevel: yearLevel || DEFAULT_YEAR,
      fileName,
      mimeType,
      dataUrl,
      uploaderId: user.id,
      uploaderName: user.name,
      uploaderRole: user.role,
      uploadedAt: new Date().toISOString(),
    });
    saveSummaries(list);
    return { ok: true };
  }

  function filterSummaries(query) {
    const q = (query || "").trim().toLowerCase();
    const all = getSummaries();
    if (!q) return all;
    return all.filter((s) => {
      const sub = (s.subject || "").toLowerCase();
      const name = (s.uploaderName || "").toLowerCase();
      return sub.includes(q) || name.includes(q);
    });
  }

  /** Filtered + folder (major/year) or flat mode + “this week” + sort. */
  function getBrowseItems() {
    let items = filterSummaries(searchInput.value);
    if (!browseFlatMode && browseMajor && browseYear) {
      items = items.filter((s) => s.major === browseMajor && s.yearLevel === browseYear);
    }
    if (browseWeekOnly && browseWeekOnly.checked) {
      const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
      items = items.filter((s) => new Date(s.uploadedAt).getTime() >= cutoff);
    }
    const sort = browseSort ? browseSort.value : "newest";
    const copy = [...items];
    if (sort === "newest") {
      copy.sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt));
    } else if (sort === "oldest") {
      copy.sort((a, b) => new Date(a.uploadedAt) - new Date(b.uploadedAt));
    } else {
      copy.sort((a, b) =>
        (a.subject || "").localeCompare(b.subject || "", undefined, { sensitivity: "base" })
      );
    }
    return copy;
  }

  // ---------------------------------------------------------------------------
  // Future hub (home): trending, hot subjects, personalized next step
  // ---------------------------------------------------------------------------
  function renderFutureHub() {
    const all = getSummaries();
    const heroMetric = document.getElementById("heroMetricCount");
    if (heroMetric) heroMetric.textContent = String(all.length);

    const weekMs = 7 * 24 * 60 * 60 * 1000;
    const cutoff = Date.now() - weekMs;
    const trending = all
      .filter((s) => new Date(s.uploadedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.uploadedAt) - new Date(a.uploadedAt))
      .slice(0, 6);

    if (trendingList && trendingEmpty) {
      trendingList.innerHTML = "";
      if (!trending.length) {
        trendingEmpty.classList.remove("hidden");
      } else {
        trendingEmpty.classList.add("hidden");
        trending.forEach((s) => {
          const li = document.createElement("li");
          li.className = "trending-item";
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "trending-btn";
          btn.setAttribute("data-open-library", s.subject || "");
          const dateShort = new Date(s.uploadedAt).toLocaleDateString(undefined, { dateStyle: "medium" });
          btn.innerHTML = `<span class="trending-title">${escapeHtml(s.title)}</span><span class="trending-meta">${escapeHtml(s.subject)} · ${escapeHtml(dateShort)}</span>`;
          li.appendChild(btn);
          trendingList.appendChild(li);
        });
      }
    }

    if (hotSubjectsList && hotSubjectsEmpty) {
      const counts = {};
      all.forEach((s) => {
        const k = (s.subject || "").trim() || "Uncategorized";
        counts[k] = (counts[k] || 0) + 1;
      });
      const ranked = Object.entries(counts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
      hotSubjectsList.innerHTML = "";
      if (!ranked.length) {
        hotSubjectsEmpty.classList.remove("hidden");
      } else {
        hotSubjectsEmpty.classList.add("hidden");
        ranked.forEach(([sub, n], i) => {
          const li = document.createElement("li");
          const btn = document.createElement("button");
          btn.type = "button";
          btn.className = "hot-subject-btn";
          btn.setAttribute("data-open-library", sub);
          btn.innerHTML = `<span class="hot-rank">${i + 1}</span><span class="hot-name">${escapeHtml(sub)}</span><span class="hot-count">${n}</span>`;
          li.appendChild(btn);
          hotSubjectsList.appendChild(li);
        });
      }
    }

    const nextStep = document.getElementById("futureNextStepText");
    const nextActions = document.getElementById("futureNextActions");
    if (!nextStep || !nextActions) return;
    const user = getCurrentUser();
    if (user) {
      const n = countSummariesForUser(user.id);
      nextStep.textContent =
        n === 0
          ? "You’re ready to share your first summary — upload a PDF or Word file to start your future library."
          : `You’ve shared ${n} summary${n === 1 ? "" : "ies"}. Keep the momentum — every note helps someone’s future self.`;
      nextActions.innerHTML =
        '<a href="#" class="btn btn-primary" data-nav="upload">Upload summary</a><a href="#" class="btn btn-secondary" data-nav="browse">Browse library</a>';
    } else {
      nextStep.textContent =
        "Create an account to upload materials and track milestones toward your personal study-library goals.";
      nextActions.innerHTML =
        '<a href="#" class="btn btn-primary" data-nav="register">Get started</a><a href="#" class="btn btn-secondary" data-nav="browse">Browse library</a>';
    }
    nextActions.querySelectorAll("a[data-nav]").forEach((a) => {
      a.addEventListener("click", (e) => {
        e.preventDefault();
        const t = a.getAttribute("data-nav");
        if (t === "upload" || t === "profile") {
          if (!requireAuth("login")) return;
        }
        showPage(t);
      });
    });
  }

  function openLibraryFromFutureHub(query) {
    const q = query || "";
    if (browseWeekOnly) browseWeekOnly.checked = false;
    if (browseSort) browseSort.value = "newest";
    browseMajor = null;
    browseYear = null;
    browseFlatMode = !!q.trim();
    if (searchInput) searchInput.value = q;
    preserveBrowseNext = true;
    showPage("browse");
  }

  function fillUploadFolderSelects(preferredMajor) {
    const m = document.getElementById("upMajor");
    const y = document.getElementById("upYear");
    if (!m || !y) return;
    const prevMajor = preferredMajor || m.value;
    const prevYear = y.value;
    m.innerHTML = "";
    y.innerHTML = "";
    getAllMajors().forEach((label) => {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      m.appendChild(o);
    });
    YEARS_LIST.forEach((label) => {
      const o = document.createElement("option");
      o.value = label;
      o.textContent = label;
      y.appendChild(o);
    });
    const all = getAllMajors();
    if (prevMajor && all.includes(prevMajor)) m.value = prevMajor;
    if (prevYear && YEARS_LIST.includes(prevYear)) y.value = prevYear;
  }

  function countSummariesInMajor(major) {
    return getSummaries().filter((s) => s.major === major).length;
  }

  function countSummariesInMajorYear(major, year) {
    return getSummaries().filter((s) => s.major === major && s.yearLevel === year).length;
  }

  function renderBrowseBreadcrumb() {
    if (!browseBreadcrumb) return;
    const atList = browseFlatMode || (browseMajor && browseYear);
    const atYears = browseMajor && !browseYear && !browseFlatMode;
    if (!atList && !atYears) {
      browseBreadcrumb.classList.add("hidden");
      browseBreadcrumb.innerHTML = "";
      return;
    }
    browseBreadcrumb.classList.remove("hidden");
    if (browseFlatMode) {
      browseBreadcrumb.innerHTML =
        '<span class="crumb-part">Library</span> <span class="crumb-sep" aria-hidden="true">›</span> <strong>All summaries</strong>';
      return;
    }
    if (atYears) {
      browseBreadcrumb.innerHTML = `<span class="crumb-part">Library</span> <span class="crumb-sep" aria-hidden="true">›</span> <strong>${escapeHtml(browseMajor)}</strong>`;
      return;
    }
    browseBreadcrumb.innerHTML = `<span class="crumb-part">Library</span> <span class="crumb-sep" aria-hidden="true">›</span> <span class="crumb-part">${escapeHtml(browseMajor)}</span> <span class="crumb-sep" aria-hidden="true">›</span> <strong>${escapeHtml(browseYear)}</strong>`;
  }

  function renderMajorGrid() {
    if (!browseFolderGrid) return;
    browseFolderGrid.innerHTML = "";
    getAllMajors().forEach((major) => {
      const n = countSummariesInMajor(major);
      const wrap = document.createElement("div");
      wrap.className = "folder-card-wrap";
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "folder-card";
      btn.setAttribute("role", "listitem");
      btn.dataset.major = major;
      btn.innerHTML = `<span class="folder-card-icon" aria-hidden="true"><svg width="36" height="36" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 7.5V19a2 2 0 002 2h14a2 2 0 002-2V7.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/><path d="M3 7.5L10.2 3.2a2 2 0 012.6 0L21 7.5" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/></svg></span><span class="folder-card-name">${escapeHtml(major)}</span><span class="folder-card-count">${n} file${n === 1 ? "" : "s"}</span>`;
      wrap.appendChild(btn);
      if (isCustomMajor(major)) {
        const del = document.createElement("button");
        del.type = "button";
        del.className = "btn btn-ghost folder-delete-major";
        del.dataset.deleteMajor = major;
        del.setAttribute("aria-label", `Remove major ${major}`);
        del.textContent = "Remove major";
        wrap.appendChild(del);
      }
      browseFolderGrid.appendChild(wrap);
    });
  }

  function renderYearGrid() {
    if (!browseFolderGrid || !browseMajor) return;
    browseFolderGrid.innerHTML = "";
    YEARS_LIST.forEach((year) => {
      const n = countSummariesInMajorYear(browseMajor, year);
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "folder-card folder-card--year";
      btn.setAttribute("role", "listitem");
      btn.dataset.year = year;
      btn.innerHTML = `<span class="folder-card-icon" aria-hidden="true"><svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/></svg></span><span class="folder-card-name">${escapeHtml(year)}</span><span class="folder-card-count">${n} file${n === 1 ? "" : "s"}</span>`;
      browseFolderGrid.appendChild(btn);
    });
  }

  function browseGoBack() {
    if (browseFlatMode) {
      browseFlatMode = false;
      if (searchInput) searchInput.value = "";
      renderBrowsePage();
      return;
    }
    if (browseMajor && browseYear) {
      browseYear = null;
      renderBrowsePage();
      return;
    }
    if (browseMajor) {
      browseMajor = null;
      renderBrowsePage();
    }
  }

  function renderBrowsePage() {
    if (!browseFolderPane || !browseListPane) return;
    const atList = browseFlatMode || (browseMajor && browseYear);
    if (browseBackBtn) {
      browseBackBtn.classList.toggle("hidden", !(browseFlatMode || browseMajor));
    }
    renderBrowseBreadcrumb();
    if (atList) {
      browseFolderPane.classList.add("hidden");
      browseListPane.classList.remove("hidden");
      renderSummaryList();
      return;
    }
    browseFolderPane.classList.remove("hidden");
    browseListPane.classList.add("hidden");
    const addMajorBox = document.getElementById("browseAddMajorBox");
    if (addMajorBox) addMajorBox.classList.toggle("hidden", !!browseMajor || browseFlatMode);
    if (!browseMajor) {
      if (browseFolderPaneTitle) browseFolderPaneTitle.textContent = "Choose a major";
      renderMajorGrid();
    } else {
      if (browseFolderPaneTitle) browseFolderPaneTitle.textContent = `Choose a year · ${browseMajor}`;
      renderYearGrid();
    }
  }

  function fileKind(summary) {
    const n = (summary.fileName || "").toLowerCase();
    const mime = summary.mimeType || "";
    if (n.endsWith(".pdf") || mime === "application/pdf") return "pdf";
    return "doc";
  }

  /** Trigger browser download from stored data URL. */
  function downloadSummary(summary) {
    if (!summary.dataUrl || !summary.fileName) return;
    const a = document.createElement("a");
    a.href = summary.dataUrl;
    a.download = summary.fileName;
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  function renderSummaryList() {
    const items = getBrowseItems();
    summaryList.innerHTML = "";
    if (!items.length) {
      browseEmpty.classList.remove("hidden");
      const hasAny = getSummaries().length > 0;
      const q = searchInput.value.trim();
      const weekOnly = browseWeekOnly && browseWeekOnly.checked;
      if (hasAny && weekOnly) {
        browseEmpty.textContent = q
          ? "No summaries from the last 7 days match your search. Try turning off “This week only.”"
          : "No summaries from the last 7 days. Try turning off “This week only.” to see the full library.";
      } else if (hasAny && q) {
        browseEmpty.textContent = "No summaries match your search or filters.";
      } else if (hasAny && browseMajor && browseYear && !browseFlatMode) {
        browseEmpty.textContent =
          "No summaries in this folder yet. Pick another year or use “View all summaries”.";
      } else if (hasAny && browseFlatMode) {
        browseEmpty.textContent = "No summaries match your search.";
      } else if (hasAny) {
        browseEmpty.textContent = "No summaries match your filters.";
      } else {
        browseEmpty.textContent = "No summaries yet. Upload one to get started.";
      }
      return;
    }
    browseEmpty.classList.add("hidden");
    const frag = document.createDocumentFragment();
    const me = getCurrentUser();
    items.forEach((s) => {
      const li = document.createElement("li");
      li.className = "summary-card";
      const kind = fileKind(s);
      const badgeLabel = kind === "pdf" ? "PDF" : "Word";
      const roleLabel = s.uploaderRole === "professor" ? "Professor" : "Student";
      const dateStr = new Date(s.uploadedAt).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
      const canDel =
        me && s.uploaderId === me.id
          ? `<button type="button" class="btn btn-outline btn-del-summary" data-delete-summary="${escapeHtml(s.id)}">Remove from library</button>`
          : "";
      li.innerHTML = `
        <div class="summary-card-head">
          <h2>${escapeHtml(s.title)}</h2>
          <span class="file-badge file-badge--${kind}">${badgeLabel}</span>
        </div>
        <div class="summary-body">
          <div class="summary-meta">
            <span><strong>Major</strong> ${escapeHtml(s.major || DEFAULT_MAJOR)}</span>
            <span><strong>Year</strong> ${escapeHtml(s.yearLevel || DEFAULT_YEAR)}</span>
            <span><strong>Subject</strong> ${escapeHtml(s.subject)}</span>
            <span><strong>Uploaded by</strong> ${escapeHtml(s.uploaderName)} · ${roleLabel}</span>
            <span><strong>Date</strong> ${escapeHtml(dateStr)}</span>
          </div>
          ${s.description ? `<p class="summary-desc">${escapeHtml(s.description)}</p>` : ""}
        </div>
        <div class="summary-actions">
          <button type="button" class="btn btn-primary btn-dl" data-id="${escapeHtml(s.id)}">Download file</button>
          ${canDel}
        </div>
      `;
      frag.appendChild(li);
    });
    summaryList.appendChild(frag);
    summaryList.querySelectorAll(".btn-dl").forEach((btn) => {
      btn.addEventListener("click", () => {
        const id = btn.getAttribute("data-id");
        const s = getSummaries().find((x) => x.id === id);
        if (s) downloadSummary(s);
      });
    });
  }

  /** Add major from browse or upload UI; shows message in errorEl on failure. */
  function tryAddMajorFromInput(inputEl, errorEl) {
    if (!inputEl) return;
    const raw = inputEl.value;
    const res = addCustomMajor(raw);
    if (errorEl) {
      errorEl.classList.add("hidden");
      errorEl.textContent = "";
    }
    if (!res.ok) {
      if (errorEl) {
        errorEl.textContent = res.message;
        errorEl.classList.remove("hidden");
      }
      return;
    }
    inputEl.value = "";
    fillUploadFolderSelects(res.major);
    const upMajor = document.getElementById("upMajor");
    if (upMajor) upMajor.value = res.major;
    renderBrowsePage();
    renderFutureHub();
  }

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  // ---------------------------------------------------------------------------
  // Profile view + edit
  // ---------------------------------------------------------------------------
  function renderProfile() {
    const user = getCurrentUser();
    if (!user) return;
    pvName.textContent = user.name;
    pvEmail.textContent = user.email;
    pvRole.textContent = user.role === "professor" ? "Professor" : "Student";
    pvCount.textContent = String(countSummariesForUser(user.id));
    updateFutureMilestone(user.id);
    profileView.classList.remove("hidden");
    profileEditForm.classList.add("hidden");
    profileError.classList.add("hidden");
    profileError.textContent = "";
  }

  function openProfileEdit() {
    const user = getCurrentUser();
    if (!user) return;
    pfName.value = user.name;
    pfEmail.value = user.email;
    pfPassword.value = "";
    profileView.classList.add("hidden");
    profileEditForm.classList.remove("hidden");
    profileError.classList.add("hidden");
    profileError.textContent = "";
  }

  function saveProfileEdits() {
    const user = getCurrentUser();
    if (!user) return { ok: false, message: "Not logged in." };
    const name = pfName.value.trim();
    const email = pfEmail.value.trim().toLowerCase();
    const newPass = pfPassword.value;
    if (name.length < 2) return { ok: false, message: "Name is too short." };
    if (!email) return { ok: false, message: "Email is required." };
    const users = getUsers();
    const other = users.find((u) => u.email === email && u.id !== user.id);
    if (other) return { ok: false, message: "That email is already used by another account." };
    const idx = users.findIndex((u) => u.id === user.id);
    if (idx === -1) return { ok: false, message: "User not found." };
    users[idx].name = name;
    users[idx].email = email;
    if (newPass && newPass.length >= 6) users[idx].password = newPass;
    saveUsers(users);
    // Keep summary list display names in sync with new name
    const sums = getSummaries().map((s) =>
      s.uploaderId === user.id ? { ...s, uploaderName: name } : s
    );
    saveSummaries(sums);
    return { ok: true };
  }

  /** Progress tiers toward a richer personal library (profile “Future” block). */
  function updateFutureMilestone(userId) {
    if (
      !futureProgressFill ||
      !futureProgressTrack ||
      !futureMilestoneLabel ||
      !futureMilestoneCount ||
      !futureMilestoneTarget ||
      !futureMilestoneSuffix
    ) {
      return;
    }
    const tiers = [3, 5, 10, 25, 50];
    const count = countSummariesForUser(userId);
    futureMilestoneCount.textContent = String(count);
    const nextTier = tiers.find((t) => count < t);
    if (nextTier === undefined) {
      futureMilestoneTarget.textContent = "50+";
      futureMilestoneSuffix.textContent = " summaries — top tier unlocked";
      futureMilestoneLabel.textContent = "Your future library is in excellent shape.";
      futureProgressFill.style.width = "100%";
      futureProgressTrack.setAttribute("aria-valuenow", "100");
      return;
    }
    futureMilestoneTarget.textContent = String(nextTier);
    futureMilestoneSuffix.textContent = ` summaries (add ${nextTier - count} more to reach ${nextTier})`;
    futureMilestoneLabel.textContent = `Progress toward ${nextTier} shared summaries`;
    const pct = Math.min(100, Math.round((count / nextTier) * 100));
    futureProgressFill.style.width = pct + "%";
    futureProgressTrack.setAttribute("aria-valuenow", String(pct));
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------
  document.querySelectorAll("[data-nav]").forEach((el) => {
    el.addEventListener("click", (e) => {
      e.preventDefault();
      const target = el.getAttribute("data-nav");
      // Upload and profile require an account; browse is public.
      if (target === "upload" || target === "profile") {
        if (!requireAuth("login")) return;
      }
      showPage(target);
      if (el.id === "navFutureLink") {
        requestAnimationFrame(() => {
          document.getElementById("future-hub")?.scrollIntoView({ behavior: "smooth", block: "start" });
        });
      }
    });
  });

  const futureHubRoot = document.getElementById("future-hub");
  if (futureHubRoot) {
    futureHubRoot.addEventListener("click", (e) => {
      const jump = e.target.closest("[data-open-library]");
      if (!jump) return;
      e.preventDefault();
      openLibraryFromFutureHub(jump.getAttribute("data-open-library") || "");
    });
  }

  if (browseSort) {
    browseSort.addEventListener("change", () => renderBrowsePage());
  }
  if (browseWeekOnly) {
    browseWeekOnly.addEventListener("change", () => renderBrowsePage());
  }

  if (browseFolderGrid) {
    browseFolderGrid.addEventListener("click", (e) => {
      const delBtn = e.target.closest("[data-delete-major]");
      if (delBtn) {
        e.preventDefault();
        e.stopPropagation();
        const name = delBtn.getAttribute("data-delete-major");
        if (!name) return;
        const n = countSummariesInMajor(name);
        const msg =
          n > 0
            ? `Remove major “${name}”? ${n} summary file(s) will be moved to “${DEFAULT_MAJOR}”.`
            : `Remove major “${name}”?`;
        if (!window.confirm(msg)) return;
        const res = removeCustomMajor(name);
        if (!res.ok) {
          window.alert(res.message);
          return;
        }
        if (browseMajor === name) {
          browseMajor = null;
          browseYear = null;
        }
        fillUploadFolderSelects();
        renderBrowsePage();
        renderFutureHub();
        return;
      }
      const card = e.target.closest(".folder-card");
      if (!card) return;
      if (card.dataset.year) {
        browseYear = card.dataset.year;
        browseFlatMode = false;
        renderBrowsePage();
        return;
      }
      if (card.dataset.major) {
        browseMajor = card.dataset.major;
        browseYear = null;
        browseFlatMode = false;
        renderBrowsePage();
      }
    });
  }
  if (browseBackBtn) {
    browseBackBtn.addEventListener("click", () => browseGoBack());
  }
  if (browseShowAllBtn) {
    browseShowAllBtn.addEventListener("click", () => {
      browseMajor = null;
      browseYear = null;
      browseFlatMode = true;
      renderBrowsePage();
    });
  }

  if (summaryList) {
    summaryList.addEventListener("click", (e) => {
      const btn = e.target.closest("[data-delete-summary]");
      if (!btn) return;
      e.preventDefault();
      const id = btn.getAttribute("data-delete-summary");
      if (!id) return;
      const s = getSummaries().find((x) => x.id === id);
      const user = getCurrentUser();
      if (!s || !user || s.uploaderId !== user.id) return;
      if (!window.confirm("Remove this summary from the library? This cannot be undone.")) return;
      if (deleteSummaryById(id)) {
        renderBrowsePage();
        renderFutureHub();
        if (pages.profile && pages.profile.classList.contains("page-active")) renderProfile();
      }
    });
  }

  const browseAddMajorBtn = document.getElementById("browseAddMajorBtn");
  const browseAddMajorInput = document.getElementById("browseAddMajorInput");
  const browseAddMajorError = document.getElementById("browseAddMajorError");
  if (browseAddMajorBtn && browseAddMajorInput) {
    browseAddMajorBtn.addEventListener("click", () =>
      tryAddMajorFromInput(browseAddMajorInput, browseAddMajorError)
    );
    browseAddMajorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tryAddMajorFromInput(browseAddMajorInput, browseAddMajorError);
      }
    });
  }

  const uploadAddMajorBtn = document.getElementById("uploadAddMajorBtn");
  const uploadAddMajorInput = document.getElementById("uploadAddMajorInput");
  const uploadAddMajorError = document.getElementById("uploadAddMajorError");
  if (uploadAddMajorBtn && uploadAddMajorInput) {
    uploadAddMajorBtn.addEventListener("click", () =>
      tryAddMajorFromInput(uploadAddMajorInput, uploadAddMajorError)
    );
    uploadAddMajorInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        tryAddMajorFromInput(uploadAddMajorInput, uploadAddMajorError);
      }
    });
  }

  if (navToggle && siteNav) {
    navToggle.addEventListener("click", () => {
      const open = siteNav.classList.toggle("is-open");
      navToggle.setAttribute("aria-expanded", open ? "true" : "false");
    });
  }

  if (logoutBtn) {
    logoutBtn.addEventListener("click", logout);
  }

  loginForm.addEventListener("submit", (e) => {
    e.preventDefault();
    loginError.classList.add("hidden");
    const email = document.getElementById("loginEmail").value;
    const password = document.getElementById("loginPassword").value;
    const res = loginUser(email, password);
    if (!res.ok) {
      loginError.textContent = res.message;
      loginError.classList.remove("hidden");
      return;
    }
    updateNavAuth();
    showPage("browse");
    loginForm.reset();
  });

  registerForm.addEventListener("submit", (e) => {
    e.preventDefault();
    registerError.classList.add("hidden");
    const name = document.getElementById("regName").value;
    const email = document.getElementById("regEmail").value;
    const password = document.getElementById("regPassword").value;
    const role = registerForm.querySelector('input[name="role"]:checked').value;
    const res = registerUser({ name, email, password, role });
    if (!res.ok) {
      registerError.textContent = res.message;
      registerError.classList.remove("hidden");
      return;
    }
    updateNavAuth();
    showPage("upload");
    registerForm.reset();
  });

  uploadForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    uploadError.classList.add("hidden");
    uploadSuccess.classList.add("hidden");
    uploadError.textContent = "";
    uploadSuccess.textContent = "";
    if (!requireAuth("login")) return;

    const title = document.getElementById("upTitle").value;
    const major = document.getElementById("upMajor").value;
    const yearLevel = document.getElementById("upYear").value;
    const subject = document.getElementById("upSubject").value;
    const description = document.getElementById("upDesc").value;
    const fileInput = document.getElementById("upFile");
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      uploadError.textContent = "Please choose a file.";
      uploadError.classList.remove("hidden");
      return;
    }
    if (!allowedMime(file)) {
      uploadError.textContent = "Only PDF or Word (.doc, .docx) files are allowed.";
      uploadError.classList.remove("hidden");
      return;
    }
    try {
      const dataUrl = await readFileAsDataURL(file);
      const res = addSummary({
        title,
        subject,
        description,
        major,
        yearLevel,
        fileName: file.name,
        mimeType: file.type || "application/octet-stream",
        dataUrl,
      });
      if (!res.ok) {
        uploadError.textContent = res.message;
        uploadError.classList.remove("hidden");
        return;
      }
      uploadSuccess.textContent = "Summary saved. You can browse or upload another.";
      uploadSuccess.classList.remove("hidden");
      uploadForm.reset();
      if (fileDropHint) fileDropHint.textContent = "No file selected";
      renderFutureHub();
    } catch (err) {
      uploadError.textContent =
        err.message ||
        "Could not save (file may be too large for browser storage). Try a smaller file.";
      uploadError.classList.remove("hidden");
    }
  });

  searchInput.addEventListener("input", () => {
    renderBrowsePage();
  });

  if (upFileInput && fileDropHint) {
    upFileInput.addEventListener("change", () => {
      const f = upFileInput.files && upFileInput.files[0];
      fileDropHint.textContent = f ? f.name : "No file selected";
    });
  }

  editProfileBtn.addEventListener("click", openProfileEdit);
  cancelEditBtn.addEventListener("click", () => {
    renderProfile();
  });

  profileEditForm.addEventListener("submit", (e) => {
    e.preventDefault();
    profileError.classList.add("hidden");
    const res = saveProfileEdits();
    if (!res.ok) {
      profileError.textContent = res.message;
      profileError.classList.remove("hidden");
      return;
    }
    renderProfile();
  });

  // ---------------------------------------------------------------------------
  // Boot: restore session, hash route, initial nav state
  // ---------------------------------------------------------------------------
  function init() {
    migrateSummariesIfNeeded();
    fillUploadFolderSelects();
    updateNavAuth();
    const hash = (window.location.hash || "").replace("#", "").trim();
    const allowed = ["home", "login", "register", "upload", "browse", "profile"];
    let start = allowed.includes(hash) ? hash : "home";
    if (start === "upload" || start === "profile") {
      if (!getCurrentUser()) start = "login";
    }
    showPage(start);
    renderFutureHub();
  }

  window.addEventListener("hashchange", () => {
    const hash = (window.location.hash || "").replace("#", "").trim();
    const allowed = ["home", "login", "register", "upload", "browse", "profile"];
    if (!allowed.includes(hash)) return;
    if (hash === "upload" || hash === "profile") {
      if (!requireAuth("login")) return;
    }
    showPage(hash);
  });

  init();
})();
