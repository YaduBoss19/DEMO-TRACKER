// app.js

const DEFAULT_INVITE_TEMPLATE = `Dear Sir/Ma'am

Greetings from Eight Times Eight Chess Academy!

Your demo has been successfully scheduled.

DATE : {DATE}
TIME : {TIME}

Kindly join the demo class using the link below.
{SLOT}
{LINK}

Please join 5 minutes before the class.

Regards,
Team Eight Times Eight Chess Academy`;

// State management
let state = {
  branding: {},
  slabs: [],
  tutors: [],
  demos: [],
  inviteTemplate: "",
  currentUser: null, // { name, role, id, email, avatar }
  activeTab: "dashboard",
  leaderboardSortKey: "conversion",
  selectedMonth: new Date().getMonth(), // 0-11
  selectedYear: new Date().getFullYear(),
  bulkSelectedDemoIds: []
};

// Check page scope
let isTutorPage = window.location.pathname.toLowerCase().includes("tutor");
let isAdminPage = window.location.pathname.toLowerCase().includes("admin");

// Fallback page detection based on DOM elements if path matches failed (e.g. on root index redirects)
if (!isTutorPage && !isAdminPage) {
  if (document.getElementById("bulk-import-btn") || document.getElementById("admin-tutors-table-body")) {
    isAdminPage = true;
  } else if (document.getElementById("demos-table-body") && !document.getElementById("admin-tutors-table-body")) {
    isTutorPage = true;
  }
}

function mapSheetDemoToApp(s) {
  return {
    id: s.id,
    tutorId: s.tutorId || "",
    tutorName: s.tutorName || s["TUTOR NAME"] || "",
    studentName: s.studentName || s["STUDENT NAME"] || "",
    date: s.date || s["DATE"] || "",
    time: s.time || s["TIME"] || "",
    dateTime: s.dateTime || ((s.date || s["DATE"] || "") + " " + (s.time || s["TIME"] || "")),
    slot: s.slot || s["SLOT NUMBER"] || "",
    status: s.status || s["DEMO STATUS"] || "DEMO NOT DONE",
    age: s.age || s["AGE"] || "-",
    language: s.language || s["LANGUAGE"] || "-",
    agentName: s.agentName || s["AGENT NAME"] || "-",
    location: s.location || s["LOCATION"] || "-",
    mobileNumber: s.mobileNumber || s["MOBILE NUMBER"] || "-",
    level: s.level || s["LEVEL"] || "-",
    feedback: s.feedback || "",
    zoomLink: s.zoomLink || s["ZOOM LINK"] || s["CLASS LINK"] || "",
    revision: s.revision || s["REVISION"] || "-",
    topicToStart: s.topicToStart || s["TOPIC TO START"] || "-"
  };
}

function mapAppDemoToSheet(a) {
  return {
    id: a.id,
    tutorId: a.tutorId,
    "TUTOR NAME": a.tutorName,
    "STUDENT NAME": a.studentName,
    "DATE": a.date,
    "TIME": a.time,
    "SLOT NUMBER": a.slot,
    "DEMO STATUS": a.status,
    "AGE": a.age,
    "LANGUAGE": a.language,
    "AGENT NAME": a.agentName,
    "LOCATION": a.location,
    "MOBILE NUMBER": a.mobileNumber,
    "LEVEL": a.level,
    feedback: a.feedback,
    "ZOOM LINK": a.zoomLink || "",
    "REVISION": a.revision || "-",
    "TOPIC TO START": a.topicToStart || "-"
  };
}

async function fetchFromSheets() {
  const url = state.branding.sheetsUrl;
  if (!url) return false;

  const statusIndicator = document.getElementById("sheets-sync-status");
  if (statusIndicator) statusIndicator.style.display = "inline-flex";

  try {
    const response = await fetch(`${url}?action=readAll`, {
      method: "GET",
      mode: "cors"
    });
    const result = await response.json();
    
    if (result && result.status === "success" && result.data) {
      const data = result.data;
      if (data.branding) {
        state.branding = {
          ...state.branding,
          companyName: data.branding.name || data.branding.companyName || state.branding.companyName,
          logoUrl: data.branding.logo || data.branding.logoUrl || state.branding.logoUrl,
          currency: data.branding.currency || state.branding.currency,
          themeColors: {
            ...state.branding.themeColors,
            ...(data.branding.themeColors || {})
          }
        };
        if (data.branding.timetableTemplate) {
          try {
            state.timetable = typeof data.branding.timetableTemplate === "string"
              ? JSON.parse(data.branding.timetableTemplate)
              : data.branding.timetableTemplate;
          } catch (e) {
            console.error("Failed to parse loaded timetableTemplate:", e);
          }
        }
        if (data.branding.inviteTemplate) {
          state.inviteTemplate = data.branding.inviteTemplate;
        }
      }
      if (data.slabs && data.slabs.length > 0) state.slabs = data.slabs;
      if (data.tutors && data.tutors.length > 0) state.tutors = data.tutors;
      if (data.demos && data.demos.length > 0) {
        state.demos = data.demos.map(mapSheetDemoToApp);
      }
      
      saveToLocalStorage();
      return true;
    }
  } catch (err) {
    console.error("Failed to fetch from Google Sheets: ", err);
    showToast("Sheets sync failed. Running in Offline Mode.", "warning");
  } finally {
    if (statusIndicator) statusIndicator.style.display = "none";
  }
  return false;
}
async function writeToSheets(action, payload) {
  const url = state.branding.sheetsUrl;
  if (!url) return false;

  const statusIndicator = document.getElementById("sheets-sync-status");
  if (statusIndicator) statusIndicator.style.display = "inline-flex";

  let mappedPayload = payload;
  let finalAction = action;

  // Intercept and translate payloads/actions for sheet layout compatibility
  if (action === "addDemo" || action === "updateDemo") {
    mappedPayload = mapAppDemoToSheet(payload);
  } else if (action === "updateDemoStatus") {
    finalAction = "updateDemoCell";
    mappedPayload = { id: payload.id, columnName: "DEMO STATUS", value: payload.status };
  } else if (action === "updateDemoFeedback") {
    finalAction = "updateDemoCell";
    mappedPayload = { id: payload.id, columnName: "feedback", value: payload.feedback };
  } else if (action === "addDemosBulk") {
    mappedPayload = payload.map(mapAppDemoToSheet);
  } else if (action === "updateBranding") {
    mappedPayload = {
      name: payload.companyName,
      logo: payload.logoUrl,
      currency: payload.currency,
      themeColors: payload.themeColors,
      timetableTemplate: JSON.stringify(payload.timetableTemplate || [])
    };
  }

  try {
    const response = await fetch(url, {
      method: "POST",
      mode: "cors",
      headers: {
        "Content-Type": "text/plain"
      },
      body: JSON.stringify({ action: finalAction, data: mappedPayload })
    });
    const result = await response.json();
    return result && result.status === "success";
  } catch (err) {
    console.error("Failed to write to Google Sheets: ", err);
    showToast("Write failed. Saved locally.", "warning");
    return false;
  } finally {
    if (statusIndicator) statusIndicator.style.display = "none";
  }
}

function generateDefaultTimetable() {
  const timetable = [];
  const startHour = 10; // 10:00 AM
  const languages = ["English", "Hindi", "English", "Hindi", "English"];
  
  for (let i = 1; i <= 24; i++) {
    const totalMinutes = (i - 1) * 30; // 30 min intervals
    const hour24 = startHour + Math.floor(totalMinutes / 60);
    const hour = hour24 % 12 || 12;
    const ampm = hour24 >= 12 && hour24 < 24 ? "PM" : "AM";
    const minutes = totalMinutes % 60;
    const timeStr = `${hour}:${minutes === 0 ? "00" : minutes} ${ampm}`;
    
    let defaultZoom = "https://zoom.us/j/default-meeting";
    if (i >= 9 && i <= 26) {
      defaultZoom = `https://eighttimeseight.onlineclass.site/joinPublic/default-slot${i}`;
    }
    
    timetable.push({
      id: `slot_${i}`,
      name: `Slot ${i}`,
      time: timeStr,
      tutorId: "",
      tutorName: "Unassigned",
      language: languages[(i - 1) % languages.length],
      zoomLink: defaultZoom
    });
  }
  return timetable;
}

function generateWeeklySlots() {
  const days = [
    { key: "mon", name: "Mon" },
    { key: "tue", name: "Tue" },
    { key: "wed", name: "Wed" },
    { key: "thu", name: "Thu" },
    { key: "fri", name: "Fri" },
    { key: "sat", name: "Sat" },
    { key: "sun", name: "Sun" }
  ];
  
  const slots = [];
  const times = [];
  
  const startHour = 0;
  for (let i = 0; i < 48; i++) {
    const totalMinutes = i * 30;
    const hour24 = startHour + Math.floor(totalMinutes / 60);
    const hour = hour24 % 12 || 12;
    const ampm = hour24 >= 12 ? "PM" : "AM";
    const minutes = totalMinutes % 60;
    const timeStr = `${hour}:${minutes === 0 ? "00" : minutes} ${ampm}`;
    times.push(timeStr);
  }
  
  days.forEach(day => {
    times.forEach((time, index) => {
      slots.push({
        id: `${day.key}_slot_${index}`,
        dayKey: day.key,
        dayName: day.name,
        time: time,
        index: index
      });
    });
  });
  
  return { slots, times, days };
}

// --- Local Storage load/save ---
function loadFromLocalStorage() {
  const localBranding = localStorage.getItem("CHESS_PORTAL_BRANDING");
  const localSlabs = localStorage.getItem("CHESS_PORTAL_SLABS");
  const localTutors = localStorage.getItem("CHESS_PORTAL_TUTORS");
  const localDemos = localStorage.getItem("CHESS_PORTAL_DEMOS");
  const localTimetable = localStorage.getItem("CHESS_PORTAL_TIMETABLE");
  const sessionUser = sessionStorage.getItem("CHESS_PORTAL_SESSION");

  if (localBranding) {
    try {
      const parsed = JSON.parse(localBranding);
      state.branding = {
        ...window.DEFAULT_BRANDING,
        ...parsed,
        themeColors: {
          ...window.DEFAULT_BRANDING.themeColors,
          ...(parsed.themeColors || {})
        }
      };
    } catch (e) {
      state.branding = { ...window.DEFAULT_BRANDING };
    }
  } else {
    state.branding = { ...window.DEFAULT_BRANDING };
  }
  const localTemplate = localStorage.getItem("DEMO_INVITE_TEMPLATE");
  state.inviteTemplate = localTemplate || DEFAULT_INVITE_TEMPLATE;
  try {
    state.slabs = localSlabs ? JSON.parse(localSlabs) : [ ...window.DEFAULT_SLABS ];
  } catch (e) {
    console.error("Failed to parse slabs from local storage:", e);
    state.slabs = [ ...window.DEFAULT_SLABS ];
  }
  try {
    state.timetable = localTimetable ? JSON.parse(localTimetable) : generateDefaultTimetable();
  } catch (e) {
    console.error("Failed to parse timetable from local storage:", e);
    state.timetable = generateDefaultTimetable();
  }
  
  // Wipes old mock data from local cache if it is detected on launch
  const hasDummyTutors = localTutors && (localTutors.includes("Rahul Sharma") || localTutors.includes("Rahul"));
  if (hasDummyTutors) {
    sessionStorage.removeItem("CHESS_PORTAL_SESSION");
    state.currentUser = null;
    localStorage.removeItem("CHESS_PORTAL_TUTORS");
    localStorage.removeItem("CHESS_PORTAL_DEMOS");
    state.tutors = [ ...window.DEFAULT_TUTORS ]; // Empty array []
    state.demos = [ ...window.DEFAULT_DEMOS ]; // Empty array []
  } else {
    try {
      state.tutors = localTutors ? JSON.parse(localTutors) : [ ...window.DEFAULT_TUTORS ];
    } catch (e) {
      console.error("Failed to parse tutors from local storage:", e);
      state.tutors = [ ...window.DEFAULT_TUTORS ];
    }
    try {
      state.demos = localDemos ? JSON.parse(localDemos) : [ ...window.DEFAULT_DEMOS ];
    } catch (e) {
      console.error("Failed to parse demos from local storage:", e);
      state.demos = [ ...window.DEFAULT_DEMOS ];
    }
  }
  
  if (sessionUser) {
    try {
      state.currentUser = JSON.parse(sessionUser);
    } catch (e) {
      console.error("Failed to parse session user:", e);
      state.currentUser = null;
      sessionStorage.removeItem("CHESS_PORTAL_SESSION");
    }
  }
}

function saveToLocalStorage() {
  try {
    localStorage.setItem("CHESS_PORTAL_BRANDING", JSON.stringify(state.branding));
    localStorage.setItem("CHESS_PORTAL_SLABS", JSON.stringify(state.slabs));
    localStorage.setItem("CHESS_PORTAL_TUTORS", JSON.stringify(state.tutors));
    localStorage.setItem("CHESS_PORTAL_TIMETABLE", JSON.stringify(state.timetable));
    localStorage.setItem("DEMO_INVITE_TEMPLATE", state.inviteTemplate);
    
    // If a cloud database is connected, clear local demos cache to save domain storage quota!
    const isConnected = !!state.branding.sheetsUrl;
    if (isConnected) {
      localStorage.removeItem("CHESS_PORTAL_DEMOS");
    } else {
      localStorage.setItem("CHESS_PORTAL_DEMOS", JSON.stringify(state.demos));
    }
  } catch (e) {
    console.warn("Storage quota exceeded. Clearing local demos cache and trying again...", e);
    try {
      localStorage.removeItem("CHESS_PORTAL_DEMOS");
      localStorage.setItem("CHESS_PORTAL_BRANDING", JSON.stringify(state.branding));
      localStorage.setItem("CHESS_PORTAL_SLABS", JSON.stringify(state.slabs));
      localStorage.setItem("CHESS_PORTAL_TUTORS", JSON.stringify(state.tutors));
    } catch (err) {
      console.error("Critical: Failed to save brand configurations to local storage.", err);
    }
  }
}

// --- Authentication controller ---
function handleLogin(e) {
  e.preventDefault();
  const nameInput = document.getElementById("login-tutor-name").value.trim();
  const codeInput = document.getElementById("login-access-code").value.trim();

  if (!nameInput || !codeInput) return;

  if (isAdminPage) {
    // Admin login validation
    if (codeInput === window.ADMIN_ACCESS_CODE) {
      state.currentUser = {
        id: "admin",
        name: nameInput,
        email: "yadukrishnanpp19@gmail.com",
        role: "admin",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=YaduAdmin"
      };
      loginSuccess();
    } else {
      showToast("Invalid Admin Access Code.", "warning");
    }
  } else if (isTutorPage) {
    // Tutor login validation
    const tutor = state.tutors.find(t => (t.name || "").trim().toLowerCase() === nameInput.toLowerCase() && String(t.accessCode || "").trim() === codeInput);
    if (tutor) {
      state.currentUser = {
        id: tutor.id,
        name: tutor.name,
        email: tutor.email,
        role: "tutor",
        avatar: tutor.avatar
      };
      loginSuccess();
    } else {
      showToast("Invalid Tutor Name or Access Code.", "warning");
    }
  }
}

function loginSuccess() {
  sessionStorage.setItem("CHESS_PORTAL_SESSION", JSON.stringify(state.currentUser));
  document.getElementById("login-screen").style.display = "none";
  document.getElementById("app-container").style.display = "flex";
  
  showToast(`Welcome, ${state.currentUser.name}!`);
  
  state.activeTab = "dashboard";
  applyBranding();
  syncFullState().then(() => {
    updateViews();
  });
}

function handleSignout() {
  sessionStorage.removeItem("CHESS_PORTAL_SESSION");
  state.currentUser = null;
  document.getElementById("login-screen").style.display = "flex";
  document.getElementById("app-container").style.display = "none";
  document.getElementById("login-form").reset();
  showToast("Logged out successfully.", "info");
}

async function syncFullState() {
  if (state.branding.sheetsUrl) {
    const success = await fetchFromSheets();
    if (success) {
      applyBranding();
    }
  }
}

// --- Theme and Branding Customizer ---
function applyBranding() {
  const root = document.documentElement;
  const branding = state.branding;
  const colors = branding.themeColors;

  root.style.setProperty('--brand-primary', colors.primary);
  root.style.setProperty('--brand-secondary', colors.secondary);
  root.style.setProperty('--bg-color', colors.background);
  root.style.setProperty('--surface-color', colors.surface);
  root.style.setProperty('--card-bg', colors.cardBg);
  root.style.setProperty('--text-main', colors.textMain);
  root.style.setProperty('--text-muted', colors.textMuted);

  document.querySelectorAll(".company-name-text").forEach(el => {
    el.textContent = branding.companyName;
  });
  const loginBrandName = document.getElementById("login-brand-name");
  if (loginBrandName) loginBrandName.textContent = branding.companyName;
  
  const previewBrandName = document.getElementById("preview-brand-name");
  if (previewBrandName) previewBrandName.textContent = branding.companyName;

  const logoSlot1 = document.getElementById("login-logo-slot");
  const logoSlot2 = document.getElementById("sidebar-logo-slot");
  const logoSlot3 = document.getElementById("preview-logo-slot");

  const hasLogoUrl = branding.logoUrl && branding.logoUrl !== "null" && branding.logoUrl !== "undefined" && branding.logoUrl.trim() !== "";
  const logoMarkup = hasLogoUrl
    ? `<img src="${branding.logoUrl}" alt="Logo" style="width: 100%; height: 100%; object-fit: contain; border-radius: inherit;">`
    : branding.companyLogo;

  if (logoSlot1) {
    logoSlot1.innerHTML = logoMarkup;
    if (hasLogoUrl) {
      logoSlot1.style.backgroundColor = "transparent";
      logoSlot1.style.border = "none";
    } else {
      logoSlot1.style.backgroundColor = "#1e293b";
      logoSlot1.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    }
  }
  if (logoSlot2) {
    logoSlot2.innerHTML = logoMarkup;
    if (hasLogoUrl) {
      logoSlot2.style.backgroundColor = "transparent";
      logoSlot2.style.border = "none";
    } else {
      logoSlot2.style.backgroundColor = "#1e293b";
      logoSlot2.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    }
  }
  if (logoSlot3) {
    logoSlot3.innerHTML = logoMarkup;
    if (hasLogoUrl) {
      logoSlot3.style.backgroundColor = "transparent";
      logoSlot3.style.border = "none";
    } else {
      logoSlot3.style.backgroundColor = "#1e293b";
      logoSlot3.style.border = "1px solid rgba(255, 255, 255, 0.1)";
    }
  }

  document.querySelectorAll(".currency-symbol").forEach(el => {
    el.textContent = branding.currency;
  });

  const sidebarAvatar = document.getElementById("sidebar-user-avatar");
  const sidebarName = document.getElementById("sidebar-user-name");
  
  if (state.currentUser) {
    if (sidebarAvatar) sidebarAvatar.src = state.currentUser.avatar;
    if (sidebarName) sidebarName.textContent = state.currentUser.name;
  }
}

// --- Calculations ---
function getMonthYearFilteredDemos() {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  const targetMonthIndex = state.selectedMonth; // 0-11
  const targetYearLong = state.selectedYear; // e.g. 2026
  const targetYearShort = String(targetYearLong).slice(-2); // "26"
  const targetMonthNumTwoDigit = String(targetMonthIndex + 1).padStart(2, "0"); // "07"
  const targetMonthNumOneDigit = String(targetMonthIndex + 1); // "7"
  
  const textMonthLong = months[targetMonthIndex].toLowerCase();
  const textMonthShort = textMonthLong.slice(0, 3);

  return state.demos.filter(d => {
    const val = String(d.date || d.dateTime || "").toLowerCase().trim();
    if (!val) return false;

    // 1. Check textual matches (e.g. "15 Jul 26" or "15 July 2026")
    const matchesText = val.includes(textMonthShort) && 
                        (val.includes(String(targetYearLong)) || val.includes(targetYearShort));
    if (matchesText) return true;

    // 2. Check slash/hyphen matches (e.g. "15/07/2026", "2026-07-15", "7/15/26")
    // Split by non-alphanumeric characters to parse components
    const segments = val.split(/[^a-zA-Z0-9]/).map(s => s.trim());
    const hasYear = val.includes(String(targetYearLong)) || val.includes(targetYearShort);
    const hasMonthSegment = segments.includes(targetMonthNumTwoDigit) || segments.includes(targetMonthNumOneDigit);

    return hasYear && hasMonthSegment;
  });
}

function parseDateString(dateStr) {
  if (!dateStr) return new Date(0);
  const clean = String(dateStr).trim();
  // Try standard parsing
  let d = new Date(clean);
  if (!isNaN(d.getTime())) return d;
  
  // Handle custom formats like "15 Jul 26" or "15 July 2026"
  const parts = clean.split(/[^a-zA-Z0-9]/).filter(Boolean);
  if (parts.length >= 3) {
    const day = parseInt(parts[0]);
    const monthStr = parts[1].toLowerCase();
    let year = parseInt(parts[2]);
    if (year < 100) year += 2000; // e.g. 26 -> 2026
    
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    let monthIdx = -1;
    months.forEach((m, idx) => {
      if (monthStr.startsWith(m)) monthIdx = idx;
    });
    
    if (monthIdx !== -1 && !isNaN(day) && !isNaN(year)) {
      return new Date(year, monthIdx, day);
    }
  }
  return new Date(0);
}

function getFilteredDemosByRange() {
  const rangeSelectorId = isAdminPage ? "demo-filter-range" : "tutor-filter-range";
  const rangeEl = document.getElementById(rangeSelectorId);
  const range = rangeEl ? rangeEl.value : "MONTH";
  
  if (range === "ALL") {
    return state.demos; // No date filter
  }
  
  if (range === "MONTH") {
    return getMonthYearFilteredDemos(); // Month/Year calendar switcher
  }
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  if (range === "DAY") {
    return state.demos.filter(d => {
      const dateObj = parseDateString(d.date || d.dateTime);
      return dateObj.getDate() === today.getDate() && 
             dateObj.getMonth() === today.getMonth() && 
             dateObj.getFullYear() === today.getFullYear();
    });
  }
  
  if (range === "WEEK") {
    // Current Week Sunday -> Saturday
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    return state.demos.filter(d => {
      const dateObj = parseDateString(d.date || d.dateTime);
      return dateObj >= startOfWeek && dateObj <= endOfWeek;
    });
  }
  
  return getMonthYearFilteredDemos();
}

function calculateTutorMetrics(tutorId, demosList = getMonthYearFilteredDemos()) {
  const tutorDemos = demosList.filter(d => d.tutorId === tutorId);
  const completed = tutorDemos.filter(d => {
    const s = (d.status || "").toUpperCase();
    return s === "DEMO DONE" || s === "CONVERTED";
  }).length;
  const converted = tutorDemos.filter(d => (d.status || "").toUpperCase() === "CONVERTED").length;
  const pending = tutorDemos.filter(d => {
    const s = (d.status || "").toUpperCase();
    return s === "DEMO NOT DONE" || s === "";
  }).length;
  const cancelled = tutorDemos.filter(d => (d.status || "").toUpperCase() === "CANCELLED").length;
  const total = tutorDemos.length;

  const conversion = completed > 0 ? (converted / completed) * 100 : 0;

  const activeSlabs = state.slabs.filter(s => s.enabled);
  const eligibleSlab = getEligibleSlab(completed, conversion, activeSlabs);
  const rate = eligibleSlab ? eligibleSlab.rate : 0;
  const incentive = converted * rate;

  return {
    tutorId,
    total,
    completed,
    converted,
    pending,
    cancelled,
    conversion,
    eligibleSlab,
    rate,
    incentive
  };
}

function getEligibleSlab(completed, conversion, slabs) {
  let highestSlab = null;
  for (const slab of slabs) {
    if (completed >= slab.minDemos && conversion >= slab.minConversion) {
      if (!highestSlab || slab.rate > highestSlab.rate) {
        highestSlab = slab;
      }
    }
  }
  return highestSlab;
}

// --- Views Dispatches ---
function updateViews() {
  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const monthEl = document.getElementById("date-switcher-month");
  if (monthEl) {
    monthEl.textContent = `${months[state.selectedMonth]} ${state.selectedYear}`;
  }

  const headerTitle = document.getElementById("main-header-title");
  const headerSubtitle = document.getElementById("main-header-subtitle");

  if (state.currentUser) {
    if (isAdminPage) {
      if (headerTitle) headerTitle.textContent = `Welcome back, ${state.currentUser.name}`;
      if (headerSubtitle) headerSubtitle.textContent = "Academy Dashboard Overview";
    } else {
      if (headerTitle) headerTitle.textContent = `Welcome back, ${state.currentUser.name}`;
      if (headerSubtitle) headerSubtitle.textContent = "Performance Overview";
    }
  }

  document.querySelectorAll(".nav-item").forEach(item => {
    if (item.getAttribute("data-tab") === state.activeTab) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });

  document.querySelectorAll(".view-section").forEach(view => {
    if (view.getAttribute("id") === `${state.activeTab}-view`) {
      view.classList.add("active");
    } else {
      view.classList.remove("active");
    }
  });

  if (state.activeTab === "dashboard") renderDashboard();
  if (state.activeTab === "mydemos") renderDemosTable();
  if (state.activeTab === "claim-demos") renderClaimDemosTable();
  if (state.activeTab === "leaderboard") renderLeaderboard();
  if (state.activeTab === "admin-slabs") renderAdminSlabs();
  if (state.activeTab === "admin-branding") renderAdminBranding();
  if (state.activeTab === "admin-tutors") renderAdminTutors();
  if (state.activeTab === "admin-timetable") renderAdminTimetable();
  if (state.activeTab === "tutor-slots") renderTutorSlots();
}

// --- VIEW: DASHBOARD ---
function renderDashboard() {
  const isTutor = isTutorPage;
  const tutorId = isTutor ? state.currentUser.id : document.getElementById("tutor-profile-select")?.value || state.tutors[0]?.id;

  if (!tutorId) {
    zeroDashboard();
    return;
  }

  const demos = getMonthYearFilteredDemos();
  const metrics = calculateTutorMetrics(tutorId, demos);
  const currency = state.branding.currency;

  const alertBanner = document.getElementById("dashboard-alert-banner");
  const alertText = document.getElementById("dashboard-alert-text");

  if (isTutor) {
    if (metrics.pending > 0) {
      if (alertBanner) alertBanner.style.display = "flex";
      if (alertText) alertText.textContent = `${metrics.pending} overdue demos still marked "Not Done" — please update the status.`;
    } else {
      if (alertBanner) alertBanner.style.display = "none";
    }
  } else {
    const allPending = demos.filter(d => d.status === "Demo Not Done").length;
    if (allPending > 0) {
      if (alertBanner) alertBanner.style.display = "flex";
      if (alertText) alertText.textContent = `${allPending} overdue demos still marked "Not Done" — please update their status.`;
    } else {
      if (alertBanner) alertBanner.style.display = "none";
    }
  }

  document.getElementById("dash-demos-done").textContent = metrics.completed;
  document.getElementById("dash-demos-converted").textContent = metrics.converted;
  document.getElementById("dash-demos-not-done").textContent = metrics.pending;
  document.getElementById("dash-demos-cancelled").textContent = metrics.cancelled;
  
  document.getElementById("dash-current-slab").textContent = metrics.eligibleSlab 
    ? `${currency}${metrics.eligibleSlab.rate}` 
    : `${currency}0`;

  document.getElementById("dash-incentive-earned").textContent = `${currency}${metrics.incentive.toLocaleString()}`;

  const todayString = "15 Jul 26";
  const todaysCount = demos.filter(d => (isTutor ? d.tutorId === tutorId : true) && d.dateTime.includes(todayString)).length;
  document.getElementById("dash-today-demos").textContent = todaysCount;

  document.getElementById("dash-total-demos").textContent = metrics.total;

  const circleRing = document.getElementById("dash-circle-ring");
  const circleNum = document.getElementById("dash-circle-number");
  if (circleNum) circleNum.textContent = `${metrics.conversion.toFixed(1)}%`;
  if (circleRing) {
    const offset = 471 - (metrics.conversion / 100) * 471;
    circleRing.style.strokeDashoffset = Math.max(0, Math.min(471, offset));
  }

  renderSlabsProgressBarList(metrics);
  renderMiniLeaderboard();

  // Render Tutor Conversion Bar Chart (Admin Only)
  if (isAdminPage) {
    renderTutorConversionChart(demos);
  }

  const simDemos = document.getElementById("sim-demos");
  const simConv = document.getElementById("sim-conversion");
  if (simDemos && simConv) {
    if (simDemos.dataset.dirty !== "true") simDemos.value = metrics.completed;
    if (simConv.dataset.dirty !== "true") simConv.value = Math.round(metrics.conversion);
  }
  updatePredictor();
}

function renderTutorConversionChart(demos) {
  const container = document.getElementById("admin-chart-container");
  if (!container) return;

  container.innerHTML = "";

  const chartData = state.tutors.map(tutor => {
    const stats = calculateTutorMetrics(tutor.id, demos);
    return {
      name: tutor.name,
      conversion: stats.conversion
    };
  }).sort((a, b) => b.conversion - a.conversion);

  if (chartData.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); font-size:0.82rem; padding: 20px;">No tutors registered. Add profiles in Tutor Access to display chart data.</div>`;
    return;
  }

  chartData.forEach(row => {
    const rowDiv = document.createElement("div");
    rowDiv.className = "chart-row";
    rowDiv.innerHTML = `
      <span class="chart-tutor-name" title="${row.name}">${row.name}</span>
      <div class="chart-bar-outer">
        <div class="chart-bar-inner" style="width: 0%;"></div>
      </div>
      <span class="chart-tutor-val">${row.conversion.toFixed(1)}%</span>
    `;
    container.appendChild(rowDiv);

    // Micro-animation layout trigger
    setTimeout(() => {
      const barInner = rowDiv.querySelector(".chart-bar-inner");
      if (barInner) barInner.style.width = `${row.conversion}%`;
    }, 50);
  });
}

function zeroDashboard() {
  document.getElementById("dash-demos-done").textContent = 0;
  document.getElementById("dash-demos-converted").textContent = 0;
  document.getElementById("dash-demos-not-done").textContent = 0;
  document.getElementById("dash-demos-cancelled").textContent = 0;
  document.getElementById("dash-current-slab").textContent = `${state.branding.currency}0`;
  document.getElementById("dash-incentive-earned").textContent = `${state.branding.currency}0`;
  document.getElementById("dash-today-demos").textContent = 0;
  document.getElementById("dash-total-demos").textContent = 0;

  const circleRing = document.getElementById("dash-circle-ring");
  const circleNum = document.getElementById("dash-circle-number");
  if (circleNum) circleNum.textContent = "0.0%";
  if (circleRing) circleRing.style.strokeDashoffset = 471;

  document.getElementById("dash-slabs-progress-container").innerHTML = "";
  document.getElementById("mini-leaderboard-container").innerHTML = "";
}

function renderSlabsProgressBarList(metrics) {
  const container = document.getElementById("dash-slabs-progress-container");
  if (!container) return;

  container.innerHTML = "";
  const currency = state.branding.currency;
  const activeSlabs = state.slabs.filter(s => s.enabled).sort((a,b) => a.rate - b.rate);

  if (activeSlabs.length === 0) {
    container.innerHTML = `<div style="text-align:center;color:var(--text-muted);font-size:0.8rem;">No active slabs.</div>`;
    return;
  }

  activeSlabs.forEach(slab => {
    const isUnlocked = metrics.completed >= slab.minDemos && metrics.conversion >= slab.minConversion;
    const lockIcon = isUnlocked ? "🔓" : "🔒";
    
    const demoProgress = Math.min(100, Math.round((metrics.completed / slab.minDemos) * 100));
    const convProgress = Math.min(100, Math.round((metrics.conversion / slab.minConversion) * 100));
    const progressAvg = Math.round((demoProgress + convProgress) / 2);

    const box = document.createElement("div");
    box.className = "slab-progress-box";
    box.innerHTML = `
      <div class="slab-progress-header">
        <span>${lockIcon} ${currency}${slab.rate} per converted demo</span>
        <span style="color:${isUnlocked ? 'var(--color-success)' : 'var(--text-muted)'}; font-weight:700;">
          ${isUnlocked ? 'Eligible' : 'Locked'}
        </span>
      </div>
      <div class="slab-progress-meta">
        <span>Demos (${metrics.completed}/${slab.minDemos})</span>
        <span>Conv (${metrics.conversion.toFixed(1)}%/${slab.minConversion}%)</span>
      </div>
      <div class="slab-progress-bar-container">
        <div class="slab-progress-bar ${isUnlocked ? '' : 'locked'}" style="width: ${progressAvg}%;"></div>
      </div>
    `;
    container.appendChild(box);
  });
}

function renderMiniLeaderboard() {
  const container = document.getElementById("mini-leaderboard-container");
  if (!container) return;

  container.innerHTML = "";
  const demos = getMonthYearFilteredDemos();
  const list = state.tutors.map(t => {
    const m = calculateTutorMetrics(t.id, demos);
    return { name: t.name, conversion: m.conversion, completed: m.completed, incentive: m.incentive };
  }).sort((a,b) => b.conversion - a.conversion || b.completed - a.completed);

  list.slice(0, 5).forEach((t, i) => {
    const row = document.createElement("div");
    row.style.display = "flex";
    row.style.justifyContent = "space-between";
    row.style.fontSize = "0.78rem";
    row.style.padding = "6px 8px";
    row.style.borderBottom = "1px solid var(--border-color)";
    row.style.fontWeight = "600";
    
    if (i === 0) row.style.color = "var(--brand-secondary)";

    row.innerHTML = `
      <span>${i+1}. ${t.name}</span>
      <span style="color: var(--text-muted);">${t.conversion.toFixed(1)}% Conv (${t.completed} Demos)</span>
    `;
    container.appendChild(row);
  });
}

// --- Predictor ---
function updatePredictor() {
  const simDemosVal = document.getElementById("sim-demos-val");
  const simConvVal = document.getElementById("sim-conversion-val");
  const simSlab = document.getElementById("sim-projected-slab");
  const simIncentive = document.getElementById("sim-projected-incentive");
  const simTip = document.getElementById("sim-projected-tip");

  const dSlider = document.getElementById("sim-demos");
  const cSlider = document.getElementById("sim-conversion");

  if (!dSlider || !cSlider) return;

  const demos = parseInt(dSlider.value);
  const conv = parseInt(cSlider.value);
  const currency = state.branding.currency;

  simDemosVal.textContent = demos;
  simConvVal.textContent = `${conv}%`;

  const activeSlabs = state.slabs.filter(s => s.enabled);
  const eligible = getEligibleSlab(demos, conv, activeSlabs);
  const rate = eligible ? eligible.rate : 0;
  
  const converted = Math.round((demos * conv) / 100);
  const incentive = converted * rate;

  simSlab.textContent = eligible ? `${currency}${rate}/demo` : "None";
  simIncentive.textContent = `${currency}${incentive.toLocaleString()}`;

  let tipText = "";
  if (eligible) {
    const nextSlabs = activeSlabs.filter(s => s.rate > eligible.rate).sort((a,b) => a.rate - b.rate);
    const next = nextSlabs[0];
    if (next) {
      const dDiff = Math.max(0, next.minDemos - demos);
      const cDiff = Math.max(0, next.minConversion - conv);
      if (dDiff > 0) {
        tipText = `Simulate completing **${dDiff} more demos** to unlock the higher **${currency}${next.rate}** slab.`;
      } else if (cDiff > 0) {
        tipText = `Convert **${Math.ceil((next.minConversion * demos) / 100) - converted} more demos** to reach ${next.minConversion}% conversion and unlock **${currency}${next.rate}** slab.`;
      }
    } else {
      tipText = "Simulating the highest eligible slab rate! Keep up the work.";
    }
  } else {
    const first = activeSlabs.sort((a,b) => a.rate - b.rate)[0];
    if (first) {
      const dDiff = Math.max(0, first.minDemos - demos);
      tipText = `Achieve **${dDiff} completed demos** and **${first.minConversion}% conversion** to unlock the first slab (**${currency}${first.rate}**).`;
    }
  }
  simTip.innerHTML = tipText || "Adjust sliders to run predictions.";
}

// --- VIEW: DEMOS LIST ---
function renderDemosTable() {
  const head = document.getElementById("demos-table-head");
  const body = document.getElementById("demos-table-body");
  
  if (!head || !body) return;

  const isTutor = isTutorPage;
  const demos = getFilteredDemosByRange();

  if (isAdminPage) {
    head.innerHTML = `
      <tr>
        <th style="width:40px;"><input type="checkbox" id="bulk-select-all"></th>
        <th>SL.NO</th>
        <th>DATE</th>
        <th>TIME</th>
        <th>SLOT NUMBER</th>
        <th>TUTOR NAME</th>
        <th>STUDENT NAME</th>
        <th>DEMO STATUS</th>
        <th>AGE</th>
        <th>LANGUAGE</th>
        <th>AGENT NAME</th>
        <th>LOCATION</th>
        <th>MOBILE NUMBER</th>
        <th>LEVEL</th>
        <th>feedback</th>
        <th>REVISION</th>
        <th>TOPIC TO START</th>
        <th style="width:100px;">Actions</th>
      </tr>
    `;

    const searchQuery = document.getElementById("demo-search-input").value.toLowerCase();
    const statusQuery = document.getElementById("demo-filter-status").value;

    const filteredDemos = demos.filter(d => {
      const matchesSearch = d.studentName.toLowerCase().includes(searchQuery) || 
                            d.tutorName.toLowerCase().includes(searchQuery) ||
                            (d.agentName && d.agentName.toLowerCase().includes(searchQuery));
      const matchesStatus = statusQuery === "ALL" || d.status === statusQuery;
      return matchesSearch && matchesStatus;
    });

    const countLabel = document.getElementById("demo-logs-count");
    if (countLabel) countLabel.textContent = `(${filteredDemos.length} logs)`;

    body.innerHTML = "";
    if (filteredDemos.length === 0) {
      body.innerHTML = `<tr><td colspan="18" style="text-align:center;color:var(--text-muted);padding:40px;">No matching demos found.</td></tr>`;
      return;
    }

    filteredDemos.forEach((demo, idx) => {
      const tr = document.createElement("tr");
      
      let statusClass = "status-not-done";
      let rowClass = "row-status-not-done";
      const st = (demo.status || "").toUpperCase();
      if (st === "DEMO DONE") {
        statusClass = "status-done";
        rowClass = "row-status-done";
      } else if (st === "CONVERTED") {
        statusClass = "status-converted";
        rowClass = "row-status-converted";
      } else if (st === "CANCELLED") {
        statusClass = "status-cancelled";
        rowClass = "row-status-cancelled";
      } else if (st === "RESCHEDULE") {
        statusClass = "status-reschedule";
        rowClass = "row-status-reschedule";
      }
      tr.className = rowClass;

      const isChecked = state.bulkSelectedDemoIds.includes(demo.id) ? "checked" : "";
      const zoomLink = getZoomLinkForSlot(demo.slot);

      tr.innerHTML = `
        <td><input type="checkbox" class="demo-bulk-checkbox" data-id="${demo.id}" ${isChecked}></td>
        <td><strong>${idx + 1}</strong></td>
        <td><strong>${demo.date || demo.dateTime || '-'}</strong></td>
        <td>${demo.time || '-'}</td>
        <td><a href="${zoomLink}" target="_blank" style="color:var(--brand-secondary); text-decoration:underline; font-weight:600;" title="Click to join class">${demo.slot || '-'} 🔗</a></td>
        <td><strong>${demo.tutorName}</strong></td>
        <td>${demo.studentName}</td>
        <td>
          <select class="status-pill-select ${statusClass} admin-status-select" data-id="${demo.id}">
            <option value="DEMO NOT DONE" ${st === 'DEMO NOT DONE' ? 'selected' : ''}>DEMO NOT DONE</option>
            <option value="DEMO DONE" ${st === 'DEMO DONE' ? 'selected' : ''}>DEMO DONE</option>
            <option value="CONVERTED" ${st === 'CONVERTED' ? 'selected' : ''}>CONVERTED</option>
            <option value="CANCELLED" ${st === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
            <option value="RESCHEDULE" ${st === 'RESCHEDULE' ? 'selected' : ''}>RESCHEDULE</option>
          </select>
        </td>
        <td>${demo.age}</td>
        <td>${demo.language}</td>
        <td>${demo.agentName || '-'}</td>
        <td>${demo.location || '-'}</td>
        <td>${demo.mobileNumber || '-'}</td>
        <td>${demo.level || '-'}</td>
        <td style="max-width:180px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;" title="${demo.feedback || 'No feedback'}">
          ${demo.feedback || '<span style="color:var(--text-muted);font-style:italic;">No feedback</span>'}
        </td>
        <td>${demo.revision || '-'}</td>
        <td>${demo.topicToStart || '-'}</td>
        <td>
          <button class="action-btn edit-demo-btn-el" data-id="${demo.id}" title="Edit Demo">✏️</button>
          <button class="action-btn delete delete-demo-btn-el" data-id="${demo.id}" title="Delete Demo">🗑️</button>
          <button class="action-btn share-demo-btn-el" data-id="${demo.id}" title="Share Invite on WhatsApp" style="background-color: #25d366; color: white;">💬</button>
        </td>
      `;
      body.appendChild(tr);
    });

    if (typeof updateBulkDeleteButton === "function") {
      updateBulkDeleteButton();
    }

  } else {
    // Tutor view Demos
    const tutorMetrics = calculateTutorMetrics(state.currentUser.id, demos);
    document.getElementById("tutor-demos-total").textContent = tutorMetrics.total;
    document.getElementById("tutor-demos-completed").textContent = tutorMetrics.completed;
    document.getElementById("tutor-demos-converted").textContent = tutorMetrics.converted;
    document.getElementById("tutor-demos-conversion").textContent = `${tutorMetrics.conversion.toFixed(1)}%`;

    head.innerHTML = `
      <tr>
        <th>SL.NO</th>
        <th>DATE</th>
        <th>TIME</th>
        <th>SLOT NUMBER</th>
        <th>STUDENT NAME</th>
        <th>AGE</th>
        <th>LANGUAGE</th>
        <th>LEVEL</th>
        <th>feedback</th>
        <th>REVISION</th>
        <th>TOPIC TO START</th>
        <th>DEMO STATUS</th>
      </tr>
    `;

    const tutorDemos = demos.filter(d => d.tutorId === state.currentUser.id);

    body.innerHTML = "";
    if (tutorDemos.length === 0) {
      body.innerHTML = `<tr><td colspan="12" style="text-align:center;color:var(--text-muted);padding:40px;">No demos scheduled for you this month.</td></tr>`;
      return;
    }

    tutorDemos.forEach((demo, idx) => {
      const tr = document.createElement("tr");

      let statusClass = "status-not-done";
      let rowClass = "row-status-not-done";
      const st = (demo.status || "").toUpperCase();
      if (st === "DEMO DONE") {
        statusClass = "status-done";
        rowClass = "row-status-done";
      } else if (st === "CONVERTED") {
        statusClass = "status-converted";
        rowClass = "row-status-converted";
      } else if (st === "CANCELLED") {
        statusClass = "status-cancelled";
        rowClass = "row-status-cancelled";
      } else if (st === "RESCHEDULE") {
        statusClass = "status-reschedule";
        rowClass = "row-status-reschedule";
      }
      tr.className = rowClass;

      const noteText = demo.feedback
        ? `<div style="display:flex; justify-content:space-between; align-items:center; gap:6px;">
             <span style="font-size:0.8rem;">${demo.feedback}</span>
             <button class="btn btn-sm edit-feedback-btn" data-id="${demo.id}" style="padding: 2px 6px;">✏️</button>
           </div>`
        : `<button class="btn btn-sm edit-feedback-btn" data-id="${demo.id}">[+] Add note</button>`;

      // Tutors can only toggle between DEMO NOT DONE and DEMO DONE
      let tutorStatusOptions = `
        <option value="DEMO NOT DONE" ${st === 'DEMO NOT DONE' ? 'selected' : ''}>DEMO NOT DONE</option>
        <option value="DEMO DONE" ${st === 'DEMO DONE' ? 'selected' : ''}>DEMO DONE</option>
      `;
      // If admin has set the demo to CONVERTED, CANCELLED, or RESCHEDULE, display it as a locked, disabled selection
      if (st === 'CONVERTED') {
        tutorStatusOptions += `<option value="CONVERTED" selected disabled>CONVERTED (Closed)</option>`;
      } else if (st === 'CANCELLED') {
        tutorStatusOptions += `<option value="CANCELLED" selected disabled>CANCELLED (Closed)</option>`;
      } else if (st === 'RESCHEDULE') {
        tutorStatusOptions += `<option value="RESCHEDULE" selected disabled>RESCHEDULE (Closed)</option>`;
      }

      const zoomLink = getZoomLinkForSlot(demo.slot);
      tr.innerHTML = `
        <td><strong>${idx + 1}</strong></td>
        <td>${demo.date || demo.dateTime || '-'}</td>
        <td>${demo.time || '-'}</td>
        <td><a href="${zoomLink}" target="_blank" style="color:var(--brand-secondary); text-decoration:underline; font-weight:600;" title="Click to join class">${demo.slot || '-'} 🔗</a></td>
        <td><strong>${demo.studentName}</strong></td>
        <td>${demo.age}</td>
        <td>${demo.language}</td>
        <td>${demo.level || '-'}</td>
        <td>${noteText}</td>
        <td>${demo.revision || '-'}</td>
        <td>${demo.topicToStart || '-'}</td>
        <td>
          <select class="status-pill-select ${statusClass} tutor-status-select" data-id="${demo.id}">
            ${tutorStatusOptions}
          </select>
        </td>
      `;
      body.appendChild(tr);
    });
  }
}

// --- VIEW: AVAILABLE/CLAIMABLE DEMOS ---
function renderClaimDemosTable() {
  const body = document.getElementById("claim-demos-table-body");
  if (!body) return;

  const unassignedDemos = state.demos.filter(d => 
    (!d.tutorId || d.tutorId === "Unassigned" || d.tutorId === "Unassigned Tutor" || d.tutorName === "Unassigned") &&
    d.status !== "CANCELLED"
  );

  body.innerHTML = "";
  if (unassignedDemos.length === 0) {
    body.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:40px;">No unclaimed demos available at the moment.</td></tr>`;
    return;
  }

  unassignedDemos.forEach((demo, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td><strong>${demo.date || demo.dateTime || '-'}</strong></td>
      <td>${demo.time || '-'}</td>
      <td>${demo.slot || '-'}</td>
      <td><strong>${demo.studentName}</strong></td>
      <td>${demo.age}</td>
      <td>${demo.language}</td>
      <td>${demo.level || '-'}</td>
      <td>${demo.revision || '-'}</td>
      <td>${demo.topicToStart || '-'}</td>
      <td>
        <button class="btn btn-primary btn-sm claim-demo-btn" data-id="${demo.id}" style="padding: 4px 10px;">Claim Demo</button>
      </td>
    `;
    body.appendChild(tr);
  });
}

async function claimDemo(id) {
  if (!state.currentUser || state.currentUser.role !== "tutor") {
    showToast("You must be logged in as a tutor to claim demos.", "warning");
    return;
  }

  const idx = state.demos.findIndex(d => d.id === id);
  if (idx === -1) return;

  const demo = state.demos[idx];
  
  if (demo.tutorId && demo.tutorId !== "Unassigned") {
    showToast("This demo has already been claimed.", "warning");
    return;
  }

  const confirmClaim = confirm(`Are you sure you want to claim the demo for ${demo.studentName} on ${demo.date || demo.dateTime} at ${demo.time}?`);
  if (!confirmClaim) return;

  // Find the tutor object to get their zoom link
  const tutor = state.tutors.find(t => t.id === state.currentUser.id);
  const tutorZoom = tutor ? tutor.zoomLink : "";

  // Update locally
  demo.tutorId = state.currentUser.id;
  demo.tutorName = state.currentUser.name;
  if (tutorZoom) {
    demo.zoomLink = tutorZoom;
  }

  // Sync to database
  const success = await writeToSheets("updateDemo", demo);
  if (success) {
    saveToLocalStorage();
    showToast("Demo claimed successfully!");
    updateViews();
  } else {
    // Revert local state if sync failed
    demo.tutorId = "";
    demo.tutorName = "Unassigned";
    showToast("Failed to claim demo on Google Sheets. Please try again.", "warning");
  }
}

// --- VIEW: LEADERBOARD ---
function renderLeaderboard() {
  const container = document.getElementById("leaderboard-rows-container");
  if (!container) return;

  container.innerHTML = "";
  const demos = getMonthYearFilteredDemos();

  const leaderboardList = state.tutors.map(tutor => {
    const stats = calculateTutorMetrics(tutor.id, demos);
    return {
      tutor,
      ...stats
    };
  });

  leaderboardList.sort((a,b) => {
    let keyA, keyB;
    if (state.leaderboardSortKey === "conversion") {
      keyA = a.conversion; keyB = b.conversion;
    } else if (state.leaderboardSortKey === "incentive") {
      keyA = a.incentive; keyB = b.incentive;
    } else if (state.leaderboardSortKey === "completed") {
      keyA = a.completed; keyB = b.completed;
    } else if (state.leaderboardSortKey === "converted") {
      keyA = a.converted; keyB = b.converted;
    }
    return keyB - keyA || b.completed - a.completed;
  });

  leaderboardList.forEach((row, i) => {
    const tr = document.createElement("tr");
    
    let rankLabel = `${i + 1}`;
    if (i === 0) rankLabel = "🏆";
    else if (i === 1) rankLabel = "🥈";
    else if (i === 2) rankLabel = "🥉";

    const starBadge = row.conversion === 100 && row.completed > 0 ? " ⭐" : "";

    tr.innerHTML = `
      <td><span style="font-size: 1.1rem; font-weight:700;">${rankLabel}</span></td>
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${row.tutor.avatar}" style="width:28px; height:28px; border-radius:50%; background:#e5e7eb;">
          <strong style="font-size: 0.88rem;">${row.tutor.name}${starBadge}</strong>
        </div>
      </td>
      <td><strong>${row.completed}</strong></td>
      <td>${row.converted}</td>
      <td style="color:var(--brand-secondary); font-weight:700;">${row.conversion.toFixed(1)}%</td>
      <td><strong style="color:var(--color-success);">${state.branding.currency}${row.incentive.toLocaleString()}</strong></td>
    `;
    container.appendChild(tr);
  });
}

// --- VIEW: SLABS ---
function renderAdminSlabs() {
  const container = document.getElementById("admin-slabs-list");
  if (!container) return;

  container.innerHTML = "";
  const currency = state.branding.currency;

  const sorted = [...state.slabs].sort((a,b) => a.minDemos - b.minDemos);

  if (sorted.length === 0) {
    container.innerHTML = `<div style="text-align:center; color:var(--text-muted); padding:30px;">No slabs.</div>`;
    return;
  }

  sorted.forEach((slab, index) => {
    const item = document.createElement("div");
    item.className = "slab-progress-box";
    item.style.display = "flex";
    item.style.justifyContent = "space-between";
    item.style.alignItems = "center";
    item.style.marginBottom = "10px";

    item.innerHTML = `
      <div>
        <strong style="font-size:0.95rem;">${currency}${slab.rate} Slab</strong>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">
          Requires: <strong>${slab.minDemos}+ Completed Demos</strong> & <strong>${slab.minConversion}%+ Conversion</strong>
          | Enabled: <strong>${slab.enabled ? 'Yes' : 'No'}</strong>
        </div>
      </div>
      <div style="display:flex; align-items:center; gap:8px;">
        <button class="action-btn slab-up-el" data-id="${slab.id}" ${index === 0 ? 'disabled style="opacity:0.2;"' : ''}>▲</button>
        <button class="action-btn slab-down-el" data-id="${slab.id}" ${index === sorted.length - 1 ? 'disabled style="opacity:0.2;"' : ''}>▼</button>
        <button class="btn btn-sm edit-slab-btn-el" data-id="${slab.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-slab-btn-el" data-id="${slab.id}">Delete</button>
      </div>
    `;
    container.appendChild(item);
  });
}

// --- VIEW: ADMIN BRANDING ---
function renderAdminBranding() {
  const branding = state.branding;

  document.getElementById("brand-name").value = branding.companyName;
  document.getElementById("brand-currency").value = branding.currency;
  
  const connType = branding.connectorType || "sheets";
  const connTypeEl = document.getElementById("brand-connector-type");
  if (connTypeEl) connTypeEl.value = connType;

  const sheetsUrlEl = document.getElementById("brand-sheets-url");
  if (sheetsUrlEl) sheetsUrlEl.value = branding.sheetsUrl || "";

  const subUrlEl = document.getElementById("brand-supabase-url");
  if (subUrlEl) subUrlEl.value = branding.supabaseUrl || "";

  const subKeyEl = document.getElementById("brand-supabase-key");
  if (subKeyEl) subKeyEl.value = branding.supabaseKey || "";
  
  document.getElementById("color-primary").value = branding.themeColors.primary;
  document.getElementById("color-secondary").value = branding.themeColors.secondary;

  // Toggle visible config fields based on type
  const groupSheets = document.getElementById("settings-group-sheets");
  const groupSupabase = document.getElementById("settings-group-supabase");
  
  if (groupSheets && groupSupabase) {
    if (connType === "supabase") {
      groupSheets.style.display = "none";
      groupSupabase.style.display = "block";
    } else {
      groupSheets.style.display = "block";
      groupSupabase.style.display = "none";
    }
  }

  const slotContainer = document.getElementById("slot-links-container");
  if (slotContainer) {
    slotContainer.innerHTML = "";
    for (let i = 10; i <= 26; i++) {
      const key = `slot${i}`;
      const val = branding[key] || branding[key + "zoom"] || branding[`Slot ${i}`] || "";
      const div = document.createElement("div");
      div.className = "form-group";
      div.innerHTML = `
        <label style="font-weight:700; font-size:0.8rem; display:block; margin-bottom:4px;">Demo Slot ${i} Link</label>
        <input type="text" class="form-control slot-zoom-input" data-slot="${i}" value="${val}" placeholder="e.g. https://zoom.us/j/...">
      `;
      slotContainer.appendChild(div);
    }
  }
}

// --- VIEW: ADMIN TUTORS ---
function renderAdminTutors() {
  const tbody = document.getElementById("admin-tutors-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (state.tutors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="3" style="text-align:center;color:var(--text-muted);padding:30px;">No tutors.</td></tr>`;
    return;
  }

  state.tutors.forEach(t => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${t.avatar}" style="width:26px; height:26px; border-radius:50%; background:#e5e7eb;">
          <strong>${t.name}</strong>
        </div>
      </td>
      <td><code>${t.accessCode}</code></td>
      <td>
        <button class="btn btn-sm edit-tutor-btn-el" data-id="${t.id}">Edit</button>
        <button class="btn btn-sm btn-danger delete-tutor-btn-el" data-id="${t.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

function renderAdminTimetable() {
  const textarea = document.getElementById("invite-template-textarea");
  if (!textarea) return;

  if (!state.inviteTemplate) {
    state.inviteTemplate = localStorage.getItem("DEMO_INVITE_TEMPLATE") || DEFAULT_INVITE_TEMPLATE;
  }
  textarea.value = state.inviteTemplate;
}

function renderTutorSlots() {
  const tbody = document.getElementById("tutor-slots-grid-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!state.currentUser) return;

  const tutor = state.tutors.find(t => t.id === state.currentUser.id);
  if (!tutor) return;

  // Set master Zoom input value
  const zoomInput = document.getElementById("tutor-master-zoom");
  if (zoomInput) {
    zoomInput.value = tutor.zoomLink || "";
  }

  const availability = tutor.availability || [];
  const { slots, times, days } = generateWeeklySlots();

  times.forEach((time, timeIdx) => {
    if (timeIdx < 12) return; // Only show 6:00 AM onwards (timeIdx >= 12)
    const tr = document.createElement("tr");

    // Time label cell
    const timeTd = document.createElement("td");
    timeTd.style.textAlign = "left";
    timeTd.style.paddingLeft = "15px";
    timeTd.style.fontWeight = "bold";
    timeTd.textContent = time;
    tr.appendChild(timeTd);

    // Day cells
    days.forEach(day => {
      const slotId = `${day.key}_slot_${timeIdx}`;
      const isActive = availability.includes(slotId);

      const td = document.createElement("td");

      const cell = document.createElement("div");
      cell.className = `calendar-cell ${isActive ? 'active' : ''}`;
      cell.dataset.slotId = slotId;
      cell.innerHTML = isActive ? "Available ✓" : "Unavailable";

      cell.addEventListener("click", () => {
        const currentlyActive = cell.classList.contains("active");
        
        if (currentlyActive) {
          // Tutor is trying to make this slot Unavailable (unchecking it)
          // Block if there is any scheduled demo for this tutor on this day and time
          const hasBookedDemo = state.demos.some(d => {
            if (d.tutorId !== state.currentUser.id) return false;
            if (d.status === "Cancelled") return false;
            
            const dDayKey = getDayKeyFromDateStr(d.date);
            if (dDayKey !== day.key) return false;
            
            const slotName = `Slot ${timeIdx + 1}`;
            return d.time === time || d.slot === slotName;
          });
          
          if (hasBookedDemo) {
            showToast("This slot cannot be removed because you have an active demo scheduled!", "error");
            return;
          }
        }

        const active = cell.classList.toggle("active");
        cell.innerHTML = active ? "Available ✓" : "Unavailable";
      });

      td.appendChild(cell);
      tr.appendChild(td);
    });

    tbody.appendChild(tr);
  });
}

function getDayKeyFromDateStr(dateStr) {
  if (!dateStr) return "";
  const date = new Date(dateStr + "T00:00:00");
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return days[date.getDay()];
}

// --- Toast notifications ---
function showToast(message, type = "success") {
  const container = document.getElementById("toast-container");
  if (!container) return;

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.innerHTML = `
    <span>⚡</span>
    <span>${message}</span>
  `;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// --- CRUD Actions ---

// Slabs CRUD
function openSlabModal(slabId = null) {
  const modal = document.getElementById("slab-modal");
  const title = document.getElementById("slab-modal-title");
  
  document.getElementById("slab-form").reset();
  
  if (slabId) {
    title.textContent = "Edit Incentive Slab";
    const slab = state.slabs.find(s => s.id === slabId);
    if (slab) {
      document.getElementById("slab-id").value = slab.id;
      document.getElementById("slab-rate").value = slab.rate;
      document.getElementById("slab-min-demos").value = slab.minDemos;
      document.getElementById("slab-min-conversion").value = slab.minConversion;
      document.getElementById("slab-enabled").checked = slab.enabled;
    }
  } else {
    title.textContent = "Add Incentive Slab";
    document.getElementById("slab-id").value = "";
    document.getElementById("slab-enabled").checked = true;
  }
  
  modal.classList.add("open");
}

async function handleSlabSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("slab-id").value;
  const rate = parseInt(document.getElementById("slab-rate").value);
  const minDemos = parseInt(document.getElementById("slab-min-demos").value);
  const minConversion = parseInt(document.getElementById("slab-min-conversion").value);
  const enabled = document.getElementById("slab-enabled").checked;

  const slabData = { rate, minDemos, minConversion, enabled };

  if (id) {
    const idx = state.slabs.findIndex(s => s.id === id);
    if (idx !== -1) {
      state.slabs[idx] = { id, ...slabData };
      await writeToSheets("updateSlab", { id, ...slabData });
      showToast("Slab updated.");
    }
  } else {
    const newId = `slab_${Date.now()}`;
    state.slabs.push({ id: newId, ...slabData });
    await writeToSheets("addSlab", { id: newId, ...slabData });
    showToast("Slab added.");
  }

  saveToLocalStorage();
  document.getElementById("slab-modal").classList.remove("open");
  updateViews();
}

async function deleteSlab(slabId) {
  if (confirm("Delete this slab?")) {
    state.slabs = state.slabs.filter(s => s.id !== slabId);
    await writeToSheets("deleteSlab", { id: slabId });
    saveToLocalStorage();
    updateViews();
    showToast("Slab deleted.", "warning");
  }
}

// Tutors CRUD
function openSlotModal(slotId) {
  const slot = state.timetable.find(s => s.id === slotId);
  if (!slot) return;
  
  document.getElementById("slot-id-input").value = slot.id;
  document.getElementById("slot-name-label").value = slot.name;
  document.getElementById("slot-time-input").value = slot.time;
  document.getElementById("slot-language-input").value = slot.language || "English";
  document.getElementById("slot-zoom-input").value = slot.zoomLink || "";
  
  // Populate tutor select dropdown
  const tutorSelect = document.getElementById("slot-tutor-select");
  if (tutorSelect) {
    tutorSelect.innerHTML = `<option value="">-- Unassigned / Assign Later --</option>`;
    state.tutors.forEach(t => {
      tutorSelect.innerHTML += `<option value="${t.id}" ${t.id === slot.tutorId ? 'selected' : ''}>${t.name}</option>`;
    });
  }
  
  document.getElementById("slot-modal").classList.add("open");
}

function openTutorModal(tutorId = null) {
  const modal = document.getElementById("tutor-modal");
  const title = document.getElementById("tutor-modal-title");
  document.getElementById("tutor-form").reset();

  if (tutorId) {
    title.textContent = "Edit Tutor Profile";
    const tutor = state.tutors.find(t => t.id === tutorId);
    if (tutor) {
      document.getElementById("tutor-form-id").value = tutor.id;
      document.getElementById("tutor-form-name").value = tutor.name;
      document.getElementById("tutor-form-code").value = tutor.accessCode;
    }
  } else {
    title.textContent = "Add Tutor Profile";
    document.getElementById("tutor-form-id").value = "";
  }
  modal.classList.add("open");
}

async function handleTutorSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("tutor-form-id").value;
  const name = document.getElementById("tutor-form-name").value.trim();
  const accessCode = document.getElementById("tutor-form-code").value.trim();

  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
  const tutorData = { name, accessCode, avatar };

  if (id) {
    const idx = state.tutors.findIndex(t => t.id === id);
    if (idx !== -1) {
      state.tutors[idx] = { id, ...tutorData };
      await writeToSheets("updateTutor", { id, ...tutorData });
      showToast("Tutor updated.");
    }
  } else {
    const newId = `tutor_${Date.now()}`;
    state.tutors.push({ id: newId, ...tutorData });
    await writeToSheets("addTutor", { id: newId, ...tutorData });
    showToast("Tutor added.");
  }

  saveToLocalStorage();
  document.getElementById("tutor-modal").classList.remove("open");
  updateViews();
}

async function deleteTutor(tutorId) {
  if (confirm("Delete this tutor profile?")) {
    state.tutors = state.tutors.filter(t => t.id !== tutorId);
    await writeToSheets("deleteTutor", { id: tutorId });
    saveToLocalStorage();
    updateViews();
    showToast("Tutor deleted.", "warning");
  }
}

// Demos CRUD
function formatDateForPicker(dateStr) {
  if (!dateStr) return new Date().toISOString().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return dateStr;
  
  try {
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toISOString().split('T')[0];
    }
  } catch (e) {}
  
  return new Date().toISOString().split('T')[0];
}

// Demos CRUD
function openDemoModal(demoId = null) {
  const modal = document.getElementById("demo-modal");
  const title = document.getElementById("demo-modal-title");
  const select = document.getElementById("demo-tutor-select");
  
  select.innerHTML = '<option value="">-- Assign Later / Optional --</option>';
  state.tutors.forEach(t => {
    const op = document.createElement("option");
    op.value = t.id;
    op.textContent = t.name;
    select.appendChild(op);
  });

  const slotSelect = document.getElementById("demo-slot");
  if (slotSelect) {
    slotSelect.innerHTML = '<option value="" disabled selected>-- Select Slot --</option>';
    for (let i = 1; i <= 48; i++) {
      const op = document.createElement("option");
      op.value = `Slot ${i}`;
      op.textContent = `Slot ${i}`;
      slotSelect.appendChild(op);
    }
    const customOp = document.createElement("option");
    customOp.value = "CUSTOM";
    customOp.textContent = "-- Type Custom Slot --";
    slotSelect.appendChild(customOp);
  }

  document.getElementById("demo-form").reset();
  
  if (demoId) {
    title.textContent = "Edit Demo Details";
    const demo = state.demos.find(d => d.id === demoId);
    if (demo) {
      document.getElementById("demo-id").value = demo.id;
      document.getElementById("demo-tutor-select").value = demo.tutorId || "";
      document.getElementById("demo-student-name").value = demo.studentName;
      document.getElementById("demo-date-input").value = formatDateForPicker(demo.date || demo.dateTime);
      document.getElementById("demo-time-input").value = demo.time || "10:00 AM";
      
      const slotVal = demo.slot || "";
      let isStandard = false;
      for (let i = 1; i <= 48; i++) {
        if (slotVal === `Slot ${i}`) {
          isStandard = true;
          break;
        }
      }
      const customContainer = document.getElementById("demo-slot-custom-container");
      const customInput = document.getElementById("demo-slot-custom");
      
      if (slotVal && !isStandard) {
        slotSelect.value = "CUSTOM";
        if (customContainer) customContainer.style.display = "block";
        if (customInput) customInput.value = slotVal;
      } else {
        slotSelect.value = slotVal;
        if (customContainer) customContainer.style.display = "none";
        if (customInput) customInput.value = "";
      }
      
      document.getElementById("demo-age").value = demo.age || "";
      document.getElementById("demo-language").value = demo.language || "";
      document.getElementById("demo-level").value = demo.level || "";
      document.getElementById("demo-revision").value = demo.revision || "";
      document.getElementById("demo-topic-start").value = demo.topicToStart || "";
      document.getElementById("demo-agent-name").value = demo.agentName || "";
      document.getElementById("demo-location").value = demo.location || "";
      document.getElementById("demo-mobile-number").value = demo.mobileNumber || "";
      document.getElementById("demo-feedback").value = demo.feedback || "";
    }
  } else {
    title.textContent = "Add Demo Log";
    document.getElementById("demo-id").value = "";
    document.getElementById("demo-date-input").value = new Date().toISOString().split('T')[0];
    document.getElementById("demo-time-input").value = "10:00 AM";
    slotSelect.value = "Slot 1";
    
    const customContainer = document.getElementById("demo-slot-custom-container");
    const customInput = document.getElementById("demo-slot-custom");
    if (customContainer) customContainer.style.display = "none";
    if (customInput) customInput.value = "";
    
    document.getElementById("demo-level").value = "";
    document.getElementById("demo-revision").value = "";
    document.getElementById("demo-topic-start").value = "";
    document.getElementById("demo-agent-name").value = "";
    document.getElementById("demo-location").value = "";
    document.getElementById("demo-mobile-number").value = "";
  }

  modal.classList.add("open");
}

async function handleDemoSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("demo-id").value;
  const tutorId = document.getElementById("demo-tutor-select").value;
  const studentName = document.getElementById("demo-student-name").value.trim();
  const date = document.getElementById("demo-date-input").value.trim();
  const time = document.getElementById("demo-time-input").value.trim();
  let slot = document.getElementById("demo-slot").value.trim();
  if (slot === "CUSTOM") {
    slot = document.getElementById("demo-slot-custom").value.trim();
    if (!slot) {
      alert("Please enter a custom slot name.");
      return;
    }
  }
  
  const age = document.getElementById("demo-age").value.trim() || "-";
  const language = document.getElementById("demo-language").value.trim() || "-";
  const level = document.getElementById("demo-level").value.trim() || "-";
  const revision = document.getElementById("demo-revision").value.trim() || "-";
  const topicToStart = document.getElementById("demo-topic-start").value.trim() || "-";
  const agentName = document.getElementById("demo-agent-name").value.trim() || "-";
  const location = document.getElementById("demo-location").value.trim() || "-";
  const mobileNumber = document.getElementById("demo-mobile-number").value.trim() || "-";
  const feedback = document.getElementById("demo-feedback").value.trim() || "";

  let status = "DEMO NOT DONE";
  if (id) {
    const oldDemo = state.demos.find(d => d.id === id);
    if (oldDemo) status = oldDemo.status || "DEMO NOT DONE";
  }

  const tutor = state.tutors.find(t => t.id === tutorId) || { name: "Unassigned", zoomLink: "" };
  const demoData = {
    tutorId: tutorId || "",
    tutorName: tutor.name,
    studentName,
    date,
    time,
    dateTime: `${date} ${time}`,
    slot,
    status,
    age,
    language,
    level,
    revision,
    topicToStart,
    agentName,
    location,
    mobileNumber,
    feedback,
    zoomLink: tutor.zoomLink || ""
  };

  if (id) {
    const idx = state.demos.findIndex(d => d.id === id);
    if (idx !== -1) {
      state.demos[idx] = { id, ...demoData };
      await writeToSheets("updateDemo", { id, ...demoData });
      showToast("Demo log updated.");
    }
  } else {
    const newId = `demo_${Date.now()}`;
    state.demos.push({ id: newId, ...demoData });
    await writeToSheets("addDemo", { id: newId, ...demoData });
    showToast("Demo log registered.");
  }

  saveToLocalStorage();
  document.getElementById("demo-modal").classList.remove("open");
  updateViews();
}

async function deleteDemo(demoId) {
  if (confirm("Are you sure you want to delete this demo?")) {
    state.demos = state.demos.filter(d => d.id !== demoId);
    await writeToSheets("deleteDemo", { id: demoId });
    saveToLocalStorage();
    updateViews();
    showToast("Demo deleted.", "warning");
  }
}

function getZoomLinkForSlot(slotName) {
  if (!slotName) return "https://zoom.us/j/default-meeting";
  
  // 1. Look up in our custom timetable template if configured
  if (state.timetable && state.timetable.length > 0) {
    const slotObj = state.timetable.find(s => s.name.toLowerCase() === slotName.toLowerCase());
    if (slotObj && slotObj.zoomLink) return slotObj.zoomLink;
  }

  const branding = state.branding || {};
  const cleanKey = slotName.toLowerCase().replace(/\s+/g, '');
  
  // 2. Look up in direct branding variables
  const link = branding[cleanKey] || branding[cleanKey + 'zoom'] || branding[slotName];
  if (link) return link;
  
  // 3. Failsafe fallback mapping for 16 Zoom links (Slot 9 to 26)
  const defaultLinks = {
    "slot 9": "https://zoom.us/j/default-slot9",
    "slot 10": "https://zoom.us/j/default-slot10",
    "slot 11": "https://zoom.us/j/default-slot11",
    "slot 12": "https://zoom.us/j/default-slot12",
    "slot 13": "https://zoom.us/j/default-slot13",
    "slot 14": "https://zoom.us/j/default-slot14",
    "slot 15": "https://zoom.us/j/default-slot15",
    "slot 16": "https://zoom.us/j/default-slot16",
    "slot 17": "https://zoom.us/j/default-slot17",
    "slot 18": "https://zoom.us/j/default-slot18",
    "slot 19": "https://zoom.us/j/default-slot19",
    "slot 20": "https://zoom.us/j/default-slot20",
    "slot 21": "https://zoom.us/j/default-slot21",
    "slot 22": "https://zoom.us/j/default-slot22",
    "slot 23": "https://zoom.us/j/default-slot23",
    "slot 24": "https://zoom.us/j/default-slot24",
    "slot 25": "https://zoom.us/j/default-slot25",
    "slot 26": "https://zoom.us/j/default-slot26"
  };
  return defaultLinks[slotName.toLowerCase()] || "https://zoom.us/j/default-meeting";
}

function sendDemoInvite(demoId) {
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;
  
  const student = demo.studentName || "Student";
  const dateVal = demo.date || demo.dateTime || "";
  
  // Format Date to DD/MM/YY format (e.g. 11/08/26)
  let dateFormatted = dateVal;
  if (dateVal.includes("-")) {
    const parts = dateVal.split("-");
    if (parts.length === 3) {
      const year = parts[0].slice(-2);
      const month = parts[1];
      const day = parts[2];
      dateFormatted = `${day}/${month}/${year}`;
    }
  }
  
  const time = demo.time || "";
  const slot = demo.slot || "Slot 1";
  const tutor = demo.tutorName || "Assigning soon";
  const mobile = demo.mobileNumber ? demo.mobileNumber.replace(/\D/g, '') : ""; // clean digits only
  const zoomLink = demo.zoomLink || getZoomLinkForSlot(slot);
  
  let template = state.inviteTemplate || localStorage.getItem("DEMO_INVITE_TEMPLATE") || DEFAULT_INVITE_TEMPLATE;
  
  // Replace placeholders
  let text = template
    .replace(/{DATE}/gi, dateFormatted)
    .replace(/{TIME}/gi, time)
    .replace(/{SLOT}/gi, slot)
    .replace(/{LINK}/gi, zoomLink)
    .replace(/{STUDENT}/gi, student)
    .replace(/{TUTOR}/gi, tutor);
  
  // Copy to clipboard first
  navigator.clipboard.writeText(text).then(() => {
    showToast("Invitation message copied to clipboard!", "success");
    
    // Then open WhatsApp Web/App if mobile number is present
    if (mobile) {
      setTimeout(() => {
        const whatsappUrl = `https://api.whatsapp.com/send?phone=${mobile}&text=${encodeURIComponent(text)}`;
        window.open(whatsappUrl, '_blank');
      }, 800);
    } else {
      showToast("No mobile number provided to open WhatsApp.", "warning");
    }
  }).catch(err => {
    console.error("Failed to copy:", err);
    if (mobile) {
      const whatsappUrl = `https://api.whatsapp.com/send?phone=${mobile}&text=${encodeURIComponent(text)}`;
      window.open(whatsappUrl, '_blank');
    }
  });
}

// Tutor Feedback edit popup
function openFeedbackModal(demoId) {
  const modal = document.getElementById("feedback-modal");
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;

  document.getElementById("feedback-demo-id").value = demo.id;
  document.getElementById("feedback-student-label").textContent = `Student: ${demo.studentName}`;
  document.getElementById("feedback-info-label").textContent = `Date: ${demo.dateTime} | Slot: ${demo.slot}`;
  document.getElementById("feedback-notes-input").value = demo.feedback || "";
  
  modal.classList.add("open");
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("feedback-demo-id").value;
  const feedback = document.getElementById("feedback-notes-input").value.trim();

  const idx = state.demos.findIndex(d => d.id === id);
  if (idx !== -1) {
    state.demos[idx].feedback = feedback;
    await writeToSheets("updateDemoFeedback", { id, feedback });
    saveToLocalStorage();
    document.getElementById("feedback-modal").classList.remove("open");
    renderDemosTable();
    showToast("Feedback saved.");
  }
}

// Brand settings submit
async function handleBrandingSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("brand-name").value.trim();
  const currency = document.getElementById("brand-currency").value.trim();
  
  const connectorType = document.getElementById("brand-connector-type").value;
  const sheetsUrl = document.getElementById("brand-sheets-url").value.trim();
  const supabaseUrl = document.getElementById("brand-supabase-url").value.trim();
  const supabaseKey = document.getElementById("brand-supabase-key").value.trim();
  
  const primary = document.getElementById("color-primary").value;
  const secondary = document.getElementById("color-secondary").value;

  state.branding.companyName = name;
  state.branding.currency = currency;
  state.branding.connectorType = connectorType;
  state.branding.sheetsUrl = sheetsUrl;
  state.branding.supabaseUrl = supabaseUrl;
  state.branding.supabaseKey = supabaseKey;
  state.branding.themeColors.primary = primary;
  state.branding.themeColors.secondary = secondary;

  saveToLocalStorage();
  applyBranding();
  await writeToSheets("updateBranding", state.branding);
  
  if (sheetsUrl) {
    await syncFullState();
  }

  updateViews();
  showToast("Branding options updated.");
}

function handleBrandingReset() {
  if (confirm("Reset branding to defaults?")) {
    state.branding = { ...window.DEFAULT_BRANDING };
    saveToLocalStorage();
    applyBranding();
    updateViews();
    showToast("Branding reset.", "info");
  }
}

async function handleSaveSlotLinks() {
  const saveBtn = document.getElementById("save-slot-links-btn");
  if (!saveBtn) return;
  
  saveBtn.disabled = true;
  saveBtn.textContent = "Saving...";
  
  const inputs = document.querySelectorAll(".slot-zoom-input");
  inputs.forEach(input => {
    const slotNum = input.dataset.slot;
    const val = input.value.trim();
    const key = `slot${slotNum}`;
    state.branding[key] = val;
  });
  
  saveToLocalStorage();
  
  const success = await writeToSheets("updateBranding", state.branding);
  if (success) {
    showToast("Custom slot Zoom links saved successfully!");
  } else {
    showToast("Failed to save to cloud database. Saved locally.", "warning");
  }
  
  saveBtn.disabled = false;
  saveBtn.textContent = "Save Slot Links";
}

// --- Initialize Event Listeners ---
function initEventListeners() {
  
  const loginForm = document.getElementById("login-form");
  if (loginForm) loginForm.addEventListener("submit", handleLogin);

  const signoutBtn = document.getElementById("sidebar-signout-btn");
  if (signoutBtn) signoutBtn.addEventListener("click", handleSignout);

  document.querySelectorAll(".nav-item").forEach(item => {
    item.addEventListener("click", (e) => {
      e.preventDefault();
      state.activeTab = item.getAttribute("data-tab");
      updateViews();
    });
  });

  const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  
  document.getElementById("date-switcher-prev")?.addEventListener("click", () => {
    state.selectedMonth--;
    if (state.selectedMonth < 0) {
      state.selectedMonth = 11;
      state.selectedYear--;
    }
    const monthEl = document.getElementById("date-switcher-month");
    if (monthEl) monthEl.textContent = `${months[state.selectedMonth]} ${state.selectedYear}`;
    updateViews();
  });

  document.getElementById("date-switcher-next")?.addEventListener("click", () => {
    state.selectedMonth++;
    if (state.selectedMonth > 11) {
      state.selectedMonth = 0;
      state.selectedYear++;
    }
    const monthEl = document.getElementById("date-switcher-month");
    if (monthEl) monthEl.textContent = `${months[state.selectedMonth]} ${state.selectedYear}`;
    updateViews();
  });

  // Predictor
  const dSlider = document.getElementById("sim-demos");
  const cSlider = document.getElementById("sim-conversion");
  if (dSlider) {
    dSlider.addEventListener("input", () => {
      dSlider.dataset.dirty = "true";
      updatePredictor();
    });
  }
  if (cSlider) {
    cSlider.addEventListener("input", () => {
      cSlider.dataset.dirty = "true";
      updatePredictor();
    });
  }

  // Leaderboard filters
  const pills = document.querySelectorAll("#leaderboard-tab-pills .tab-pill");
  pills.forEach(pill => {
    pill.addEventListener("click", () => {
      pills.forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      state.leaderboardSortKey = pill.getAttribute("data-sort");
      renderLeaderboard();
    });
  });

  // Modals cancellation buttons
  document.getElementById("slab-modal-close")?.addEventListener("click", () => document.getElementById("slab-modal").classList.remove("open"));
  document.getElementById("slab-modal-cancel")?.addEventListener("click", () => document.getElementById("slab-modal").classList.remove("open"));
  
  document.getElementById("demo-modal-close")?.addEventListener("click", () => document.getElementById("demo-modal").classList.remove("open"));
  document.getElementById("demo-modal-cancel")?.addEventListener("click", () => document.getElementById("demo-modal").classList.remove("open"));
  
  document.getElementById("tutor-modal-close")?.addEventListener("click", () => document.getElementById("tutor-modal").classList.remove("open"));
  document.getElementById("tutor-modal-cancel")?.addEventListener("click", () => document.getElementById("tutor-modal").classList.remove("open"));
  
  document.getElementById("feedback-modal-close")?.addEventListener("click", () => document.getElementById("feedback-modal").classList.remove("open"));
  document.getElementById("feedback-modal-cancel")?.addEventListener("click", () => document.getElementById("feedback-modal").classList.remove("open"));

  // Forms submit triggers
  document.getElementById("slab-form")?.addEventListener("submit", handleSlabSubmit);
  document.getElementById("tutor-form")?.addEventListener("submit", handleTutorSubmit);
  document.getElementById("demo-form")?.addEventListener("submit", handleDemoSubmit);
  document.getElementById("feedback-form")?.addEventListener("submit", handleFeedbackSubmit);
  document.getElementById("branding-form")?.addEventListener("submit", handleBrandingSubmit);
  document.getElementById("reset-branding-btn")?.addEventListener("click", handleBrandingReset);
  document.getElementById("save-slot-links-btn")?.addEventListener("click", handleSaveSlotLinks);
  document.getElementById("demo-slot")?.addEventListener("change", (e) => {
    const customContainer = document.getElementById("demo-slot-custom-container");
    if (customContainer) {
      customContainer.style.display = e.target.value === "CUSTOM" ? "block" : "none";
    }
  });

  document.getElementById("slot-form")?.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = document.getElementById("slot-id-input").value;
    const time = document.getElementById("slot-time-input").value.trim();
    const language = document.getElementById("slot-language-input").value;
    const tutorId = document.getElementById("slot-tutor-select").value;
    const zoomLink = document.getElementById("slot-zoom-input").value.trim();

    const tutor = state.tutors.find(t => t.id === tutorId);
    const tutorName = tutor ? tutor.name : "Unassigned";

    const idx = state.timetable.findIndex(s => s.id === id);
    if (idx !== -1) {
      state.timetable[idx] = {
        ...state.timetable[idx],
        time,
        language,
        tutorId,
        tutorName,
        zoomLink
      };
      showToast(`Slot ${state.timetable[idx].name} updated locally.`);
    }

    document.getElementById("slot-modal").classList.remove("open");
    renderAdminTimetable();
  });

  document.getElementById("slot-modal-close")?.addEventListener("click", () => document.getElementById("slot-modal").classList.remove("open"));
  document.getElementById("slot-modal-cancel")?.addEventListener("click", () => document.getElementById("slot-modal").classList.remove("open"));

  document.getElementById("save-invite-template-btn")?.addEventListener("click", async () => {
    const saveBtn = document.getElementById("save-invite-template-btn");
    const textarea = document.getElementById("invite-template-textarea");
    if (!saveBtn || !textarea) return;

    saveBtn.disabled = true;
    saveBtn.textContent = "Saving to cloud...";

    const textVal = textarea.value.trim();
    state.inviteTemplate = textVal;
    localStorage.setItem("DEMO_INVITE_TEMPLATE", textVal);

    saveToLocalStorage();

    // Write to Sheets
    const success = await writeToSheets("updateBranding", {
      ...state.branding,
      inviteTemplate: textVal
    });

    if (success) {
      showToast("WhatsApp invitation template saved successfully!");
    } else {
      showToast("Failed to save to database. Saved locally.", "warning");
    }

    saveBtn.disabled = false;
    saveBtn.textContent = "Save Template";
  });

  document.getElementById("save-tutor-slots-btn")?.addEventListener("click", async () => {
    const saveBtn = document.getElementById("save-tutor-slots-btn");
    if (!saveBtn) return;
    saveBtn.disabled = true;
    saveBtn.textContent = "Saving...";

    const tutor = state.tutors.find(t => t.id === state.currentUser.id);
    if (!tutor) {
      saveBtn.disabled = false;
      saveBtn.textContent = "Save Settings";
      return;
    }

    const currentAvailability = tutor.availability || [];
    const preservedAvailability = currentAvailability.filter(slotId => {
      const parts = slotId.split("_slot_");
      if (parts.length === 2) {
        const timeIdx = parseInt(parts[1]);
        return timeIdx < 12; // Preserve slots before 6:00 AM (which are not rendered)
      }
      return false;
    });

    const availability = [...preservedAvailability];
    document.querySelectorAll(".calendar-cell.active").forEach(cell => {
      availability.push(cell.dataset.slotId);
    });

    const zoomLinkInput = document.getElementById("tutor-master-zoom");
    const zoomLink = zoomLinkInput ? zoomLinkInput.value.trim() : "";

    tutor.availability = availability;
    tutor.zoomLink = zoomLink;

    saveToLocalStorage();

    // Write to Sheets / Supabase
    const payload = {
      ...tutor,
      availability: JSON.stringify(availability),
      zoomLink: zoomLink
    };

    const success = await writeToSheets("updateTutor", payload);

    if (success) {
      showToast("Availability calendar saved successfully!");
    } else {
      showToast("Failed to save to database. Saved locally.", "warning");
    }

    saveBtn.disabled = false;
    saveBtn.textContent = "Save Settings";
  });

  // Download Payroll CSV Exporter
  const downloadPayrollBtn = document.getElementById("download-payroll-btn");
  if (downloadPayrollBtn) {
    downloadPayrollBtn.addEventListener("click", () => {
      const demos = getMonthYearFilteredDemos();
      const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
      const monthName = months[state.selectedMonth];
      const currency = state.branding.currency;

      let csvContent = "Tutor Name,Completed Demos,Converted Demos,Conversion Rate,Eligible Slab Rate,Total Incentive Earned\n";
      
      state.tutors.forEach(t => {
        const m = calculateTutorMetrics(t.id, demos);
        const slabRate = m.eligibleSlab ? `${currency}${m.eligibleSlab.rate}` : "None";
        csvContent += `"${t.name}",${m.completed},${m.converted},${m.conversion.toFixed(1)}%,${slabRate},${currency}${m.incentive}\n`;
      });

      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.setAttribute("href", url);
      link.setAttribute("download", `payroll_report_${monthName.toLowerCase()}_${state.selectedYear}.csv`);
      link.style.visibility = "hidden";
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      showToast(`Payroll report downloaded for ${monthName} ${state.selectedYear}.`);
    });
  }

  // Connector Type Selector Toggle
  const connTypeEl = document.getElementById("brand-connector-type");
  if (connTypeEl) {
    connTypeEl.addEventListener("change", (e) => {
      const type = e.target.value;
      const groupSheets = document.getElementById("settings-group-sheets");
      const groupSupabase = document.getElementById("settings-group-supabase");
      if (groupSheets && groupSupabase) {
        if (type === "supabase") {
          groupSheets.style.display = "none";
          groupSupabase.style.display = "block";
        } else {
          groupSheets.style.display = "block";
          groupSupabase.style.display = "none";
        }
      }
    });
  }

  // Unified Database Connection Tester
  const testConnectionBtn = document.getElementById("test-connection-btn");
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener("click", async () => {
      const statusMsg = document.getElementById("connection-status-msg");
      if (!statusMsg) return;

      const urlInput = document.getElementById("brand-sheets-url").value.trim();
      if (!urlInput) {
        statusMsg.style.color = "#dc2626"; // red
        statusMsg.textContent = "⚠️ Enter a Google Sheets Web App URL first.";
        return;
      }

      statusMsg.style.color = "#4b5563"; // muted gray
      statusMsg.textContent = "⏳ Pinging Sheets API...";

      try {
        const response = await fetch(`${urlInput}?action=readAll`, {
          method: "GET",
          mode: "cors"
        });
        const result = await response.json();
        
        if (result && result.status === "success") {
          statusMsg.style.color = "#16a34a"; // green
          statusMsg.textContent = "✔️ Connected successfully! Ready to sync.";
          showToast("Sheets API response verified successfully.", "success");
        } else {
          statusMsg.style.color = "#dc2626"; // red
          statusMsg.textContent = "❌ Connection failed. Check script settings.";
        }
      } catch (err) {
        console.error("Sheets connection test failed:", err);
        statusMsg.style.color = "#dc2626"; // red
        statusMsg.textContent = "❌ Network error. Check URL or CORS settings.";
      }
    });
  }
  
  document.getElementById("clear-database-btn")?.addEventListener("click", async () => {
    if (confirm("WARNING: This will wipe ALL tutor profiles and demo logs from local storage. Are you sure you want to start fresh?")) {
      state.tutors = [];
      state.demos = [];
      saveToLocalStorage();
      
      // Send wipe command to Google Sheets if linked
      await writeToSheets("clearDatabase", {});
      
      // Force reload select selectors
      const selects = document.querySelectorAll(".tutor-select-el");
      selects.forEach(select => {
        select.innerHTML = "";
      });

      updateViews();
      showToast("Tutor profiles and demo logs wiped.", "warning");
    }
  });

  // Admin page layout controls
  document.getElementById("copy-booking-link-btn")?.addEventListener("click", () => {
    const bookingUrl = `${window.location.origin}/book`;
    navigator.clipboard.writeText(bookingUrl).then(() => {
      showToast("Booking page link copied to clipboard!", "success");
    }).catch(err => {
      console.error("Failed to copy link:", err);
      showToast("Could not copy link automatically. Please copy the URL from address bar.", "warning");
    });
  });

  document.getElementById("add-demo-btn")?.addEventListener("click", () => openDemoModal());
  document.getElementById("admin-add-slab-btn")?.addEventListener("click", () => openSlabModal());
  document.getElementById("admin-add-tutor-btn")?.addEventListener("click", () => openTutorModal());

  // Search filter and status queries inside Admin Demos List
  const searchInput = document.getElementById("demo-search-input");
  const filterSelect = document.getElementById("demo-filter-status");
  const rangeSelect = document.getElementById("demo-filter-range");
  const tutorRangeSelect = document.getElementById("tutor-filter-range");
  
  if (searchInput) searchInput.addEventListener("input", renderDemosTable);
  if (filterSelect) filterSelect.addEventListener("change", renderDemosTable);
  if (rangeSelect) rangeSelect.addEventListener("change", renderDemosTable);
  if (tutorRangeSelect) tutorRangeSelect.addEventListener("change", renderDemosTable);

  // Selector swap triggers
  const swapper = document.getElementById("tutor-profile-select");
  if (swapper) {
    swapper.addEventListener("change", () => renderDashboard());
  }

  // Local System Image Upload Reader (Logo upload)
  const logoFileField = document.getElementById("brand-logo-file");
  if (logoFileField) {
    logoFileField.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (file) {
        const reader = new FileReader();
        reader.onload = function(evt) {
          state.branding.logoUrl = evt.target.result; // Base64 encoding
          applyBranding();
          showToast("Logo loaded. Save settings to persist.", "info");
        };
        reader.readAsDataURL(file);
      }
    });
  }

  // Bulk Import Tutors from CSV
  const bulkTutorsBtn = document.getElementById("bulk-import-tutors-btn");
  if (bulkTutorsBtn) {
    bulkTutorsBtn.addEventListener("click", async () => {
      const raw = prompt("Paste comma-separated tutor rows (Name, AccessCode):");
      if (raw) {
        const lines = raw.split("\n");
        let added = 0;
        lines.forEach(line => {
          const parts = line.split(",");
          if (parts.length >= 2) {
            const name = parts[0].trim();
            const accessCode = parts[1].trim();
            
            if (name && accessCode) {
              const id = `tutor_${Date.now()}_${added}`;
              const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
              const tutorData = { id, name, accessCode, avatar };
              
              state.tutors.push(tutorData);
              // Async write back
              writeToSheets("addTutor", tutorData);
              added++;
            }
          }
        });
        if (added > 0) {
          saveToLocalStorage();
          renderAdminTutors();
          showToast(`Imported ${added} tutors.`);
        }
      }
    });
  }

  // Delegate click events on dynamically generated buttons
  document.addEventListener("click", (e) => {
    const target = e.target;

    if (target.classList.contains("edit-slab-btn-el")) openSlabModal(target.dataset.id);
    if (target.classList.contains("delete-slab-btn-el")) deleteSlab(target.dataset.id);
    
    if (target.classList.contains("edit-tutor-btn-el")) openTutorModal(target.dataset.id);
    if (target.classList.contains("delete-tutor-btn-el")) deleteTutor(target.dataset.id);

    if (target.classList.contains("edit-demo-btn-el")) openDemoModal(target.dataset.id);
    if (target.classList.contains("delete-demo-btn-el")) deleteDemo(target.dataset.id);
    if (target.classList.contains("share-demo-btn-el")) sendDemoInvite(target.dataset.id);
    if (target.classList.contains("edit-slot-btn-el")) openSlotModal(target.dataset.id);

    if (target.classList.contains("edit-feedback-btn")) openFeedbackModal(target.dataset.id);

    if (target.classList.contains("claim-demo-btn")) claimDemo(target.dataset.id);

    if (target.classList.contains("slab-up-el") || target.classList.contains("slab-down-el")) {
      const id = target.dataset.id;
      const direction = target.classList.contains("slab-up-el") ? "up" : "down";
      const idx = state.slabs.findIndex(s => s.id === id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      
      if (targetIdx >= 0 && targetIdx < state.slabs.length) {
        const temp = state.slabs[idx];
        state.slabs[idx] = state.slabs[targetIdx];
        state.slabs[targetIdx] = temp;
        saveToLocalStorage();
        updateViews();
      }
    }
  });

  // Table status dropdown update dispatches
  document.addEventListener("change", async (e) => {
    const target = e.target;
    if (target.classList.contains("admin-status-select") || target.classList.contains("tutor-status-select")) {
      const id = target.dataset.id;
      const status = target.value;

      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].status = status;
        await writeToSheets("updateDemoStatus", { id, status });
        saveToLocalStorage();
        renderDemosTable();
        renderDashboard();
        showToast("Outcome status updated.");
      }
    }
  });

  // Bulk selector checkbox triggers
  document.addEventListener("change", (e) => {
    const target = e.target;
    if (target.id === "bulk-select-all") {
      const checkboxes = document.querySelectorAll(".demo-bulk-checkbox");
      state.bulkSelectedDemoIds = [];
      checkboxes.forEach(cb => {
        cb.checked = target.checked;
        if (target.checked) state.bulkSelectedDemoIds.push(cb.dataset.id);
      });
      updateBulkDeleteButton();
    }
    if (target.classList.contains("demo-bulk-checkbox")) {
      const id = target.dataset.id;
      if (target.checked) {
        if (!state.bulkSelectedDemoIds.includes(id)) state.bulkSelectedDemoIds.push(id);
      } else {
        state.bulkSelectedDemoIds = state.bulkSelectedDemoIds.filter(bid => bid !== id);
      }
      
      const selectAll = document.getElementById("bulk-select-all");
      if (selectAll) {
        const checkboxes = document.querySelectorAll(".demo-bulk-checkbox");
        selectAll.checked = state.bulkSelectedDemoIds.length === checkboxes.length;
      }
      updateBulkDeleteButton();
    }
  });

  // Click listener for bulk delete button
  const bulkDeleteBtn = document.getElementById("bulk-delete-btn");
  if (bulkDeleteBtn) {
    bulkDeleteBtn.addEventListener("click", async () => {
      const count = state.bulkSelectedDemoIds.length;
      if (count === 0) return;
      if (confirm(`Are you sure you want to permanently delete the ${count} selected demos from the database?`)) {
        const deletedIds = [...state.bulkSelectedDemoIds];
        
        // 1. Delete from Sheets in bulk
        if (state.branding.sheetsUrl) {
          for (const delId of deletedIds) {
            await writeToSheets("deleteDemo", { id: delId });
          }
        }
        
        // 2. Delete locally
        state.demos = state.demos.filter(d => !deletedIds.includes(d.id));
        state.bulkSelectedDemoIds = [];
        saveToLocalStorage();
        
        // 3. Update views
        updateBulkDeleteButton();
        updateViews();
        showToast(`Successfully deleted ${count} demos.`, "warning");
      }
    });
  }

  // Bulk import demos from file (Excel or CSV)
  const bulkBtn = document.getElementById("bulk-import-btn");
  const fileInput = document.getElementById("demo-file-input");
  
  if (bulkBtn && fileInput) {
    bulkBtn.addEventListener("click", () => {
      fileInput.click();
    });
    
    fileInput.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;
      
      const fileName = file.name.toLowerCase();
      const reader = new FileReader();
      
      try {
        if (fileName.endsWith(".csv")) {
          reader.onload = function(evt) {
            try {
              const text = evt.target.result;
              const rows = parseCSV(text);
              processImportedRows(rows);
            } catch (err) {
              console.error(err);
              showToast(`CSV parse error: ${err.message}`, "danger");
            }
          };
          reader.readAsText(file);
        } else if (fileName.endsWith(".xlsx") || fileName.endsWith(".xls")) {
          if (typeof XLSX === "undefined") {
            showToast("Excel reader library not loaded. Check internet connection.", "danger");
            return;
          }
          reader.onload = function(evt) {
            try {
              const data = new Uint8Array(evt.target.result);
              const workbook = XLSX.read(data, { type: "array" });
              const firstSheetName = workbook.SheetNames[0];
              const worksheet = workbook.Sheets[firstSheetName];
              const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
              processImportedRows(rows);
            } catch (err) {
              console.error(err);
              showToast(`Excel parse error: ${err.message}`, "danger");
            }
          };
          reader.readAsArrayBuffer(file);
        } else {
          showToast("Unsupported file format. Please upload a .csv, .xlsx, or .xls file.", "danger");
        }
      } catch (err) {
        console.error(err);
        showToast(`File read error: ${err.message}`, "danger");
      }
      
      // Reset input value to allow uploading the same file name again
      fileInput.value = "";
    });
  }

  // Export demos to Excel spreadsheet
  const exportBtn = document.getElementById("export-demos-btn");
  if (exportBtn) {
    exportBtn.addEventListener("click", exportDemosToExcel);
  }
}

function exportDemosToExcel() {
  if (state.demos.length === 0) {
    showToast("No demo records to export.", "warning");
    return;
  }
  
  if (typeof XLSX === "undefined") {
    showToast("Excel exporter library not loaded. Check internet connection.", "danger");
    return;
  }

  // Map demos to clean column names for export
  const exportData = state.demos.map(d => ({
    "Demo ID": d.id,
    "Tutor ID": d.tutorId,
    "Tutor Name": d.tutorName,
    "Student Name": d.studentName,
    "Date": d.date,
    "Time": d.time,
    "Slot": d.slot,
    "Status": d.status,
    "Age": d.age || "",
    "Language": d.language || "",
    "Agent Name": d.agentName || "",
    "Location": d.location || "",
    "Mobile Number": d.mobileNumber || "",
    "Level": d.level || "",
    "Feedback": d.feedback || ""
  }));

  const worksheet = XLSX.utils.json_to_sheet(exportData);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "Demos Log");
  
  const dateStr = new Date().toISOString().slice(0, 10);
  XLSX.writeFile(workbook, `Demos_Export_${dateStr}.xlsx`);
  showToast("Demos exported to Excel successfully!");
}

function updateBulkDeleteButton() {
  const btn = document.getElementById("bulk-delete-btn");
  if (!btn) return;
  const count = state.bulkSelectedDemoIds.length;
  if (count > 0) {
    btn.style.display = "inline-flex";
    btn.textContent = `🗑️ Delete Selected (${count})`;
  } else {
    btn.style.display = "none";
  }
}

// --- App Entry Point ---
document.addEventListener("DOMContentLoaded", () => {
  loadFromLocalStorage();
  applyBranding();
  initEventListeners();

  // Load select option dropdowns in admin layout
  const selects = document.querySelectorAll(".tutor-select-el");
  selects.forEach(select => {
    select.innerHTML = "";
    state.tutors.forEach(t => {
      const op = document.createElement("option");
      op.value = t.id;
      op.textContent = t.name;
      select.appendChild(op);
    });
  });

  if (state.currentUser) {
    // Session exists
    // Verify if page match is valid (tutor on admin page or vice versa)
    if (isTutorPage && state.currentUser.role !== "tutor") {
      // Redirect or force logout
      sessionStorage.removeItem("CHESS_PORTAL_SESSION");
      state.currentUser = null;
      window.location.reload();
      return;
    }
    if (isAdminPage && state.currentUser.role !== "admin") {
      sessionStorage.removeItem("CHESS_PORTAL_SESSION");
      state.currentUser = null;
      window.location.reload();
      return;
    }

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    syncFullState().then(() => updateViews());

    // Auto-refresh background poll (every 30 seconds) to fetch external updates
    setInterval(async () => {
      if (state.branding.sheetsUrl) {
        const updated = await fetchFromSheets();
        if (updated) {
          updateViews();
        }
      }
    }, 30000);
  } else {
    // Require Login
    document.getElementById("login-screen").style.display = "flex";
    document.getElementById("app-container").style.display = "none";
    syncFullState();
  }
});

// --- File Importer Helper Functions ---
function parseCSV(text) {
  const lines = text.split("\n");
  return lines.map(line => {
    if (!line.trim()) return [];
    // Basic CSV splitting (supporting commas and tabs)
    const delimiter = line.split("\t").length > 1 ? "\t" : ",";
    return line.split(delimiter).map(cell => {
      return cell.trim().replace(/^["']|["']$/g, "");
    });
  }).filter(row => row.length > 0);
}

function processImportedRows(rows) {
  if (!rows || rows.length === 0) {
    showToast("The file is empty or has no data.", "warning");
    return;
  }
  
  // Clean headers list safely, converting each cell to uppercase string
  const firstRowStr = (rows[0] || []).map(c => c !== undefined && c !== null ? String(c).toUpperCase().trim() : "");
  const hasHeaders = firstRowStr.some(h => h.includes("STUDENT") || h.includes("DATE") || h.includes("TUTOR") || h.includes("STATUS") || h.includes("SLOT"));
  
  let startIndex = hasHeaders ? 1 : 0;
  
  // Header indexes lookup with fallback
  let statusIdx = -1, slotIdx = -1, dateIdx = -1, timeIdx = -1, tutorNameIdx = -1, studentNameIdx = -1;
  let ageIdx = -1, languageIdx = -1, agentNameIdx = -1, locationIdx = -1, mobileNumberIdx = -1, levelIdx = -1;
  
  if (hasHeaders) {
    firstRowStr.forEach((header, idx) => {
      if (header.includes("STUDENT") || (header.includes("NAME") && !header.includes("TUTOR") && !header.includes("AGENT"))) {
        studentNameIdx = idx;
      } else if (header.includes("TUTOR")) {
        tutorNameIdx = idx;
      } else if (header.includes("STATUS")) {
        statusIdx = idx;
      } else if (header.includes("SLOT")) {
        slotIdx = idx;
      } else if (header.includes("DATE")) {
        dateIdx = idx;
      } else if (header.includes("TIME")) {
        timeIdx = idx;
      } else if (header.includes("AGE")) {
        ageIdx = idx;
      } else if (header.includes("LANG")) {
        languageIdx = idx;
      } else if (header.includes("AGENT")) {
        agentNameIdx = idx;
      } else if (header.includes("LOC")) {
        locationIdx = idx;
      } else if (header.includes("MOB") || header.includes("PHONE") || header.includes("CONTACT")) {
        mobileNumberIdx = idx;
      } else if (header.includes("LEV")) {
        levelIdx = idx;
      }
    });
  }
  
  // Index positions fallbacks if headers were not parsed or mapped
  if (statusIdx === -1) statusIdx = 0;
  if (slotIdx === -1) slotIdx = 1;
  if (dateIdx === -1) dateIdx = 2;
  if (timeIdx === -1) timeIdx = 3;
  if (tutorNameIdx === -1) tutorNameIdx = 4;
  if (studentNameIdx === -1) studentNameIdx = 5;
  if (ageIdx === -1) ageIdx = 6;
  if (languageIdx === -1) languageIdx = 7;
  if (agentNameIdx === -1) agentNameIdx = 8;
  if (locationIdx === -1) locationIdx = 9;
  if (mobileNumberIdx === -1) mobileNumberIdx = 10;
  if (levelIdx === -1) levelIdx = 11;
  
  let addedCount = 0;
  
  for (let i = startIndex; i < rows.length; i++) {
    const row = rows[i];
    if (!row || row.length === 0) continue;
    
    // Ensure we have a valid student name
    const studentNameVal = (row[studentNameIdx] !== undefined && row[studentNameIdx] !== null) ? String(row[studentNameIdx]).trim() : "";
    if (!studentNameVal) continue;
    
    const status = (row[statusIdx] !== undefined && row[statusIdx] !== null) ? String(row[statusIdx]).trim() : "Demo Not Done";
    const slot = (row[slotIdx] !== undefined && row[slotIdx] !== null) ? String(row[slotIdx]).trim() : "Slot 1";
    const date = (row[dateIdx] !== undefined && row[dateIdx] !== null) ? String(row[dateIdx]).trim() : "15 Jul 26";
    const time = (row[timeIdx] !== undefined && row[timeIdx] !== null) ? String(row[timeIdx]).trim() : "10:00 AM";
    const tutorName = (row[tutorNameIdx] !== undefined && row[tutorNameIdx] !== null) ? String(row[tutorNameIdx]).trim() : "Unknown";
    const studentName = studentNameVal;
    const age = (row[ageIdx] !== undefined && row[ageIdx] !== null) ? String(row[ageIdx]).trim() : "-";
    const language = (row[languageIdx] !== undefined && row[languageIdx] !== null) ? String(row[languageIdx]).trim() : "-";
    const agentName = (row[agentNameIdx] !== undefined && row[agentNameIdx] !== null) ? String(row[agentNameIdx]).trim() : "-";
    const location = (row[locationIdx] !== undefined && row[locationIdx] !== null) ? String(row[locationIdx]).trim() : "-";
    const mobileNumber = (row[mobileNumberIdx] !== undefined && row[mobileNumberIdx] !== null) ? String(row[mobileNumberIdx]).trim() : "-";
    const level = (row[levelIdx] !== undefined && row[levelIdx] !== null) ? String(row[levelIdx]).trim() : "-";

    const tutor = state.tutors.find(t => t.name.toLowerCase() === tutorName.toLowerCase()) || state.tutors[0] || { id: "tutor_1", name: tutorName };
    const demoData = {
      id: `demo_${Date.now()}_${addedCount}`,
      tutorId: tutor.id,
      tutorName: tutor.name,
      studentName,
      date,
      time,
      dateTime: `${date} ${time}`,
      slot,
      status,
      age,
      language,
      agentName,
      location,
      mobileNumber,
      level,
      feedback: ""
    };
    
    state.demos.push(demoData);
    addedCount++;
  }
  
  if (addedCount > 0) {
    saveToLocalStorage();
    updateViews();
    showToast(`Successfully imported ${addedCount} demos.`);
    
    // Batch upload all imported rows to Google Sheets in a single network request
    const demosToSync = state.demos.slice(-addedCount).map(mapAppDemoToSheet);
    writeToSheets("addDemosBulk", demosToSync);
  } else {
    showToast("No valid rows were found. Make sure Student Name is populated.", "warning");
  }
}
