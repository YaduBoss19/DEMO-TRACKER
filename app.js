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

function mapSheetDemoToApp(s, rowNum) {
  // If the sheet has an "id" column, use it. Otherwise, use the row number as a virtual ID.
  const demoId = s.id || (rowNum ? String(rowNum) : `demo_${Date.now()}_${Math.random()}`);
  
  // Resolve tutorId using tutorName if tutorId column is missing
  let tutorIdVal = s.tutorId || s.tutorid || "";
  const tutorNameVal = s.tutorName || s.tutorname || s["TUTOR NAME"] || "";
  if (!tutorIdVal && tutorNameVal && tutorNameVal !== "Unassigned") {
    const tutor = state.tutors.find(t => t.name.toLowerCase() === tutorNameVal.toLowerCase());
    if (tutor) tutorIdVal = tutor.id;
  }

  return {
    id: demoId,
    tutorId: tutorIdVal || "Unassigned",
    tutorName: tutorNameVal || "Unassigned",
    studentName: s.studentName || s.studentname || s["STUDENT NAME"] || "",
    date: s.date || s["DATE"] || "",
    time: s.time || s["TIME"] || "",
    dateTime: s.dateTime || s.datetime || ((s.date || s["DATE"] || "") + " " + (s.time || s["TIME"] || "")),
    slot: s.slot || s["SLOT NUMBER"] || "",
    status: s.status || s["DEMO STATUS"] || "DEMO NOT DONE",
    age: s.age || s["AGE"] || "-",
    language: s.language || s["LANGUAGE"] || "-",
    agentName: s.agentName || s.agentname || s["AGENT NAME"] || "-",
    location: s.location || s["LOCATION"] || "-",
    mobileNumber: s.mobileNumber || s.mobilenumber || s["MOBILE NUMBER"] || "-",
    level: s.level || s["LEVEL"] || "-",
    feedback: s.feedback || "",
    zoomLink: s.zoomLink || s.zoomlink || s["ZOOM LINK"] || s["CLASS LINK"] || "",
    revision: s.revision || s["REVISION"] || "-",
    topicToStart: s.topicToStart || s.topictostart || s["TOPIC TO START"] || "-",
    agentNote: s.agentNote || s.agentnote || s["AGENT NOTE"] || "",
    position: parseInt(s.position) || (rowNum ? parseInt(rowNum) : 0)
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
    "TOPIC TO START": a.topicToStart || "-",
    agentNote: a.agentNote || "",
    agentnote: a.agentNote || "",
    position: a.position || 0
  };
}

// --- Supabase Database Integration ---
let supabaseClient = null;

function initSupabase() {
  const url = state.branding.supabaseUrl;
  const key = state.branding.supabaseKey;
  if (url && key && !key.includes("PASTE_YOUR_LONG_SUPABASE_ANON_KEY_HERE")) {
    if (typeof window.supabase === "undefined") {
      console.warn("Supabase SDK not loaded yet. Delaying database connection.");
      return;
    }
    try {
      supabaseClient = window.supabase.createClient(url, key);
      
      // Subscribe to real-time updates from Postgres
      supabaseClient
        .channel('schema-db-changes')
        .on('postgres_changes', { event: '*', schema: 'public' }, () => {
          console.log("Supabase Realtime update detected!");
          fetchFromSheets().then(() => updateViews());
        })
        .subscribe();
    } catch (e) {
      console.error("Failed to initialize Supabase client:", e);
    }
  }
}

async function fetchFromSupabase() {
  const url = state.branding.supabaseUrl;
  const key = state.branding.supabaseKey;
  if (!url || !key || key.includes("PASTE_YOUR_LONG_SUPABASE_ANON_KEY_HERE")) return false;

  if (!supabaseClient) {
    initSupabase();
  }
  if (!supabaseClient) return false;

  const statusIndicator = document.getElementById("sheets-sync-status");
  if (statusIndicator) statusIndicator.style.display = "inline-flex";

  try {
    // 1. Fetch Branding
    const { data: brandingData, error: bErr } = await supabaseClient.from('branding').select('*').eq('id', 'default').maybeSingle();
    if (bErr) throw bErr;
    if (brandingData) {
      state.branding = {
        ...state.branding,
        companyName: brandingData.name || state.branding.companyName,
        logoUrl: brandingData.logo || state.branding.logoUrl,
        currency: brandingData.currency || state.branding.currency,
        themeColors: {
          ...state.branding.themeColors,
          ...((brandingData.themeColors || brandingData.themecolors) || {})
        }
      };
      
      // Pull fields from JSONB back to state.branding for application-wide use
      if (state.branding.themeColors) {
        if (state.branding.themeColors.slotLinks) {
          state.branding.slotLinks = state.branding.themeColors.slotLinks;
        }
        if (state.branding.themeColors.whatsappEnabled !== undefined) {
          state.branding.whatsappEnabled = state.branding.themeColors.whatsappEnabled;
        }
        if (state.branding.themeColors.whatsappInstanceId !== undefined) {
          state.branding.whatsappInstanceId = state.branding.themeColors.whatsappInstanceId;
        }
        if (state.branding.themeColors.whatsappToken !== undefined) {
          state.branding.whatsappToken = state.branding.themeColors.whatsappToken;
        }
        if (state.branding.themeColors.whatsappAdminNumber !== undefined) {
          state.branding.whatsappAdminNumber = state.branding.themeColors.whatsappAdminNumber;
        }
      }

      const rawInvite = brandingData.inviteTemplate || brandingData.invitetemplate;
      if (rawInvite) {
        state.inviteTemplate = rawInvite;
      }
      const rawTimetable = brandingData.timetableTemplate || brandingData.timetabletemplate;
      if (rawTimetable) {
        try {
          state.timetable = typeof rawTimetable === "string"
            ? JSON.parse(rawTimetable)
            : rawTimetable;
        } catch(e) {}
      }
      initializeBrandingLists();
    }

    // 2. Fetch Slabs
    const { data: slabsData, error: sErr } = await supabaseClient.from('slabs').select('*');
    if (sErr) throw sErr;
    if (slabsData && slabsData.length > 0) {
      state.slabs = slabsData.map(s => ({
        id: s.id,
        minDemos: parseInt(s.minDemos) || 0,
        minConversion: parseFloat(s.minConversion) || 0,
        rate: parseFloat(s.rate) || 0,
        enabled: s.enabled === true || s.enabled === "true"
      }));
    }

    // 3. Fetch Tutors
    const { data: tutorsData, error: tErr } = await supabaseClient.from('tutors').select('*');
    if (tErr) throw tErr;
    if (tutorsData && tutorsData.length > 0) {
      const fetchedTutors = tutorsData.map(t => {
        let availability = [];
        if (t.availability) {
          try {
            availability = typeof t.availability === "string" ? JSON.parse(t.availability) : t.availability;
          } catch(e) {}
        }
        return {
          ...t,
          availability,
          accessCode: t.accessCode || t.accesscode || "",
          zoomLink: t.zoomLink || t.zoomlink || ""
        };
      });

      // Preserve logged-in tutor profile if missing in database
      if (state.currentUser && state.currentUser.role === "tutor") {
        const hasCurrentTutor = fetchedTutors.some(t => t.id === state.currentUser.id);
        if (!hasCurrentTutor) {
          const localTutor = state.tutors.find(t => t.id === state.currentUser.id);
          if (localTutor) fetchedTutors.push(localTutor);
        }
      }
      state.tutors = fetchedTutors;
    }

    // 4. Fetch Demos
    const { data: demosData, error: dErr } = await supabaseClient.from('demos').select('*');
    if (dErr) throw dErr;
    if (demosData) {
      // Defensive check: filter out any corrupted rows that lack a student name
      const validDemos = demosData.filter(d => {
        const sName = d.studentName || d.studentname || "";
        return sName.trim() !== "";
      });
      state.demos = validDemos.map((d, index) => mapSheetDemoToApp(d, index + 2));
    }

    saveToLocalStorage();
    return true;
  } catch (err) {
    console.error("Failed to fetch from Supabase: ", err);
    showToast("Supabase sync failed. Running in Offline Mode.", "warning");
    return false;
  } finally {
    if (statusIndicator) statusIndicator.style.display = "none";
  }
}

async function writeToSupabase(action, payload) {
  const url = state.branding.supabaseUrl;
  const key = state.branding.supabaseKey;
  if (!url || !key || key.includes("PASTE_YOUR_LONG_SUPABASE_ANON_KEY_HERE")) {
    showToast("⚠️ Database not connected. Check credentials in mockData.js. Saved locally.", "warning");
    return false;
  }

  if (!supabaseClient) {
    initSupabase();
  }
  if (!supabaseClient) return false;

  const statusIndicator = document.getElementById("sheets-sync-status");
  if (statusIndicator) statusIndicator.style.display = "inline-flex";

  try {
    switch (action) {
      case "updateBranding":
        // Pack slotsList, slotLinks and WhatsApp settings inside themeColors JSONB for cloud persistence
        if (!payload.themeColors) payload.themeColors = {};
        payload.themeColors.slotLinks = payload.slotLinks || [];
        payload.themeColors.whatsappEnabled = payload.whatsappEnabled || false;
        payload.themeColors.whatsappInstanceId = payload.whatsappInstanceId || "";
        payload.themeColors.whatsappToken = payload.whatsappToken || "";
        payload.themeColors.whatsappAdminNumber = payload.whatsappAdminNumber || "";
        
        const bPayload = {
          id: 'default',
          name: payload.companyName,
          logo: payload.logoUrl,
          currency: payload.currency,
          themeColors: payload.themeColors,
          inviteTemplate: state.inviteTemplate || "",
          timetableTemplate: payload.timetableTemplate !== undefined ? payload.timetableTemplate : (state.timetable || [])
        };
        const { error: bErr } = await supabaseClient.from('branding').upsert(bPayload);
        if (bErr) throw bErr;
        break;

      case "addSlab":
        const { error: sAddErr } = await supabaseClient.from('slabs').insert([payload]);
        if (sAddErr) throw sAddErr;
        break;

      case "updateSlab":
        const { error: sUpErr } = await supabaseClient.from('slabs').upsert(payload);
        if (sUpErr) throw sUpErr;
        break;

      case "deleteSlab":
        const { error: sDelErr } = await supabaseClient.from('slabs').delete().eq('id', payload.id);
        if (sDelErr) throw sDelErr;
        break;

      case "addTutor":
        const tutorAddPayload = {
          id: payload.id,
          name: payload.name,
          email: payload.email || "",
          role: payload.role || "tutor",
          status: payload.status || "ACTIVE",
          zoomLink: payload.zoomLink || payload.zoomlink || "",
          zoomlink: payload.zoomLink || payload.zoomlink || "",
          availability: typeof payload.availability === "string" ? JSON.parse(payload.availability) : payload.availability,
          accessCode: payload.accessCode || payload.accesscode || "",
          accesscode: payload.accessCode || payload.accesscode || "",
          avatar: payload.avatar || ""
        };
        const { error: tAddErr } = await supabaseClient.from('tutors').insert([tutorAddPayload]);
        if (tAddErr) throw tAddErr;
        break;

      case "updateTutor":
        const tutorUpPayload = {
          id: payload.id,
          name: payload.name,
          email: payload.email || "",
          role: payload.role || "tutor",
          status: payload.status || "ACTIVE",
          zoomLink: payload.zoomLink || payload.zoomlink || "",
          zoomlink: payload.zoomLink || payload.zoomlink || "",
          availability: typeof payload.availability === "string" ? JSON.parse(payload.availability) : payload.availability,
          accessCode: payload.accessCode || payload.accesscode || "",
          accesscode: payload.accessCode || payload.accesscode || "",
          avatar: payload.avatar || ""
        };
        const { error: tUpErr } = await supabaseClient.from('tutors').upsert(tutorUpPayload);
        if (tUpErr) throw tUpErr;
        break;

      case "deleteTutor":
        const { error: tDelErr } = await supabaseClient.from('tutors').delete().eq('id', payload.id);
        if (tDelErr) throw tDelErr;
        break;

      case "addDemo":
        const demoAddPayload = {
          id: payload.id,
          tutorId: payload.tutorId,
          tutorid: payload.tutorId,
          tutorName: payload.tutorName,
          tutorname: payload.tutorName,
          studentName: payload.studentName,
          studentname: payload.studentName,
          date: payload.date,
          time: payload.time,
          dateTime: payload.dateTime || `${payload.date} ${payload.time}`,
          datetime: payload.dateTime || `${payload.date} ${payload.time}`,
          slot: payload.slot,
          status: payload.status,
          age: payload.age,
          language: payload.language,
          agentName: payload.agentName,
          agentname: payload.agentName,
          location: payload.location,
          mobileNumber: payload.mobileNumber,
          mobilenumber: payload.mobileNumber,
          level: payload.level,
          feedback: payload.feedback || "",
          revision: payload.revision || "-",
          topicToStart: payload.topicToStart || "-",
          topictostart: payload.topicToStart || "-",
          position: payload.position || 0
        };
        try {
          const { error: dAddErr } = await supabaseClient.from('demos').insert([demoAddPayload]);
          if (dAddErr) throw dAddErr;
        } catch (err) {
          if (err.message && (err.message.includes("column") || err.message.includes("position"))) {
            console.warn("Table does not have position column. Retrying insert without position.", err);
            delete demoAddPayload.position;
            const { error: retryErr } = await supabaseClient.from('demos').insert([demoAddPayload]);
            if (retryErr) throw retryErr;
          } else {
            throw err;
          }
        }
        break;

      case "updateDemo":
        const demoUpPayload = {
          id: payload.id,
          tutorId: payload.tutorId,
          tutorid: payload.tutorId,
          tutorName: payload.tutorName,
          tutorname: payload.tutorName,
          studentName: payload.studentName,
          studentname: payload.studentName,
          date: payload.date,
          time: payload.time,
          dateTime: payload.dateTime || `${payload.date} ${payload.time}`,
          datetime: payload.dateTime || `${payload.date} ${payload.time}`,
          slot: payload.slot,
          status: payload.status,
          age: payload.age,
          language: payload.language,
          agentName: payload.agentName,
          agentname: payload.agentName,
          location: payload.location,
          mobileNumber: payload.mobileNumber,
          mobilenumber: payload.mobileNumber,
          level: payload.level,
          feedback: payload.feedback || "",
          revision: payload.revision || "-",
          topicToStart: payload.topicToStart || "-",
          topictostart: payload.topicToStart || "-",
          position: payload.position || 0
        };
        try {
          const { error: dUpErr } = await supabaseClient.from('demos').upsert(demoUpPayload);
          if (dUpErr) throw dUpErr;
        } catch (err) {
          if (err.message && (err.message.includes("column") || err.message.includes("position"))) {
            console.warn("Table does not have position column. Retrying upsert without position.", err);
            delete demoUpPayload.position;
            const { error: retryErr } = await supabaseClient.from('demos').upsert(demoUpPayload);
            if (retryErr) throw retryErr;
          } else {
            throw err;
          }
        }
        break;

      case "deleteDemo":
        const { error: dDelErr } = await supabaseClient.from('demos').delete().eq('id', payload.id);
        if (dDelErr) throw dDelErr;
        break;

      case "updateDemoStatus":
        const { error: dStatErr } = await supabaseClient.from('demos').update({ status: payload.status }).eq('id', payload.id);
        if (dStatErr) throw dStatErr;
        break;

      case "updateDemoFeedback":
        const { error: dFeedErr } = await supabaseClient.from('demos').update({ feedback: payload.feedback }).eq('id', payload.id);
        if (dFeedErr) throw dFeedErr;
        break;

      case "addDemosBulk":
        const demosBulkPayload = payload.map(d => ({
          id: d.id,
          tutorId: d.tutorId,
          tutorid: d.tutorId,
          tutorName: d.tutorName,
          tutorname: d.tutorName,
          studentName: d.studentName,
          studentname: d.studentName,
          date: d.date,
          time: d.time,
          dateTime: d.dateTime || `${d.date} ${d.time}`,
          datetime: d.dateTime || `${d.date} ${d.time}`,
          slot: d.slot,
          status: d.status,
          age: d.age,
          language: d.language,
          agentName: d.agentName,
          agentname: d.agentName,
          location: d.location,
          mobileNumber: d.mobileNumber,
          mobilenumber: d.mobileNumber,
          level: d.level,
          feedback: d.feedback || "",
          revision: d.revision || "-",
          topicToStart: d.topicToStart || "-",
          topictostart: d.topicToStart || "-"
        }));
        const { error: dBulkErr } = await supabaseClient.from('demos').insert(demosBulkPayload);
        if (dBulkErr) throw dBulkErr;
        break;

      default:
        console.warn("Unknown write action for Supabase:", action);
    }
    return true;
  } catch (err) {
    console.error("Failed to write to Supabase: ", err);
    const errMsg = err.message || err.details || (typeof err === "object" ? JSON.stringify(err) : String(err));
    showToast("Write to Supabase failed: " + errMsg, "error");
    return false;
  } finally {
    if (statusIndicator) statusIndicator.style.display = "none";
  }
}

async function fetchFromSheets() {
  return await fetchFromSupabase();
}

async function writeToSheets(action, payload) {
  const restrictedActions = ["addTutor", "updateTutor", "deleteTutor", "updateSlab", "deleteSlab", "updateBranding", "clearDatabase"];
  if (restrictedActions.includes(action)) {
    let isAllowed = false;
    
    // Tutors are allowed to update their own profile (for availability and zoom link settings)
    if (action === "updateTutor" && state.currentUser && state.currentUser.role === "tutor" && state.currentUser.id === payload.id) {
      isAllowed = true;
    }
    // Admins are allowed to perform all actions
    if (state.currentUser && state.currentUser.role === "admin") {
      isAllowed = true;
    }

    if (!isAllowed) {
      console.error(`Security violation: role ${state.currentUser?.role} attempted restricted action: ${action}`);
      showToast("Access Denied: Only Admins can modify system settings.", "error");
      return false;
    }
  }

  return await writeToSupabase(action, payload);
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
      
      // Override with new Supabase defaults if set in mockData.js
      if (window.DEFAULT_BRANDING.connectorType === "supabase" && window.DEFAULT_BRANDING.supabaseKey && !window.DEFAULT_BRANDING.supabaseKey.includes("PASTE_YOUR_LONG_SUPABASE_ANON_KEY_HERE")) {
        state.branding.connectorType = "supabase";
        state.branding.supabaseUrl = window.DEFAULT_BRANDING.supabaseUrl;
        state.branding.supabaseKey = window.DEFAULT_BRANDING.supabaseKey;
      }
    } catch (e) {
      state.branding = { ...window.DEFAULT_BRANDING };
    }
  } else {
    state.branding = { ...window.DEFAULT_BRANDING };
  }
  initializeBrandingLists();
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

  // Initialize Supabase DB client if credentials exist
  initSupabase();
}

function saveToLocalStorage() {
  try {
    localStorage.setItem("CHESS_PORTAL_BRANDING", JSON.stringify(state.branding));
    localStorage.setItem("CHESS_PORTAL_SLABS", JSON.stringify(state.slabs));
    localStorage.setItem("CHESS_PORTAL_TUTORS", JSON.stringify(state.tutors));
    localStorage.setItem("CHESS_PORTAL_TIMETABLE", JSON.stringify(state.timetable));
    localStorage.setItem("DEMO_INVITE_TEMPLATE", state.inviteTemplate);
    
    // If a cloud database is connected, clear local demos cache to save domain storage quota!
    const isConnected = state.branding.connectorType === "supabase" || !!state.branding.sheetsUrl;
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
    // Admin / Coordinator login validation
    if (codeInput === window.ADMIN_ACCESS_CODE) {
      state.currentUser = {
        id: "admin",
        name: nameInput,
        email: "yadukrishnanpp19@gmail.com",
        role: "admin",
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=YaduAdmin"
      };
      loginSuccess();
      return;
    }

    const user = state.tutors.find(t => 
      (t.name || "").trim().toLowerCase() === nameInput.toLowerCase() && 
      String(t.accessCode || t.accesscode || "").trim() === codeInput
    );

    if (user) {
      const allowedAdminRoles = ["admin", "sales", "demo_manager"];
      if (allowedAdminRoles.includes(user.role)) {
        state.currentUser = {
          id: user.id,
          name: user.name,
          email: user.email || "",
          role: user.role,
          avatar: user.avatar || ""
        };
        loginSuccess();
      } else {
        showToast("Tutors cannot access the Admin Portal.", "warning");
      }
    } else {
      showToast("Invalid Credentials.", "warning");
    }
  } else if (isTutorPage) {
    // Tutor login validation
    const tutor = state.tutors.find(t => 
      (t.name || "").trim().toLowerCase() === nameInput.toLowerCase() && 
      String(t.accessCode || t.accesscode || "").trim() === codeInput
    );
    if (tutor) {
      if (tutor.role === "tutor" || !tutor.role) {
        state.currentUser = {
          id: tutor.id,
          name: tutor.name,
          email: tutor.email || "",
          role: "tutor",
          avatar: tutor.avatar || ""
        };
        loginSuccess();
      } else {
        showToast("Administrative accounts must log in via the Admin Portal.", "warning");
      }
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
  const isConnected = state.branding.connectorType === "supabase" || !!state.branding.sheetsUrl;
  if (isConnected) {
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

function getAmpmSuffix(timeStr) {
  if (!timeStr) return "AM";
  if (timeStr.toLowerCase().includes("pm")) return "PM";
  return "AM";
}

function formatZoomStartLink(url) {
  if (!url) return "";
  const lowercaseUrl = url.toLowerCase();
  
  // 1. Handle Zoom links (/j/ -> /s/)
  if (lowercaseUrl.includes("zoom.us")) {
    return url.replace(/\/j\//i, "/s/");
  }
  
  // 2. Handle onlineclass.site redirect links (/joinPublic/{id} -> /teacher/classes/{id}/overview?type=live)
  if (lowercaseUrl.includes("onlineclass.site")) {
    const matchPublic = url.match(/\/joinPublic\/([a-zA-Z0-9]+)/i);
    if (matchPublic && matchPublic[1]) {
      return `https://eighttimeseight.onlineclass.site/teacher/classes/${matchPublic[1]}/overview?type=live`;
    }
    const matchJoin = url.match(/\/join\/([a-zA-Z0-9]+)/i);
    if (matchJoin && matchJoin[1]) {
      return `https://eighttimeseight.onlineclass.site/teacher/classes/${matchJoin[1]}/overview?type=live`;
    }
  }
  
  return url;
}

function normalizePhoneNumber(phone) {
  if (!phone) return "";
  let cleaned = String(phone).replace(/[^\d]/g, "");
  // If it starts with 0 and has 11 digits, strip the leading 0 (e.g. 09876543210 -> 9876543210)
  if (cleaned.startsWith("0") && cleaned.length > 10) {
    cleaned = cleaned.substring(1);
  }
  // If it has 10 digits (common local format), append default country code '91'
  if (cleaned.length === 10) {
    cleaned = "91" + cleaned;
  }
  return cleaned;
}

async function sendBackgroundWhatsApp(to, body) {
  const enabled = state.branding.whatsappEnabled;
  const instanceId = state.branding.whatsappInstanceId;
  const token = state.branding.whatsappToken;

  if (!enabled || !instanceId || !token) {
    console.log("WhatsApp dispatch skipped: Reminders are not enabled or credentials are empty.");
    return false;
  }

  const cleanPhone = normalizePhoneNumber(to);
  if (!cleanPhone) {
    console.error("WhatsApp dispatch aborted: Invalid phone number.");
    return false;
  }

  const url = `https://api.ultramsg.com/${instanceId}/messages/chat`;
  
  const payload = new URLSearchParams();
  payload.append("token", token);
  payload.append("to", cleanPhone);
  payload.append("body", body);
  payload.append("priority", "10");

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: payload.toString()
    });
    const result = await response.json();
    if (result && (result.sent === "true" || result.sent === true || result.success)) {
      console.log(`WhatsApp message successfully sent to ${cleanPhone}.`);
      return true;
    } else {
      console.error("WhatsApp API responded with error:", result);
      return false;
    }
  } catch (err) {
    console.error("Failed to send WhatsApp message via UltraMsg:", err);
    return false;
  }
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

// Helper to construct a Date object for a demo's combined Date and Time
function getDemoDateTimeObject(demo) {
  if (!demo) return new Date(0);
  
  let dateObj = parseDateString(demo.date || demo.dateTime);
  if (!dateObj || isNaN(dateObj.getTime())) {
    dateObj = new Date(0);
  }
  
  const timeStr = String(demo.time || "").replace(/IST/i, "").trim().toUpperCase();
  const match = timeStr.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (match) {
    let hrs = parseInt(match[1]);
    const mins = parseInt(match[2]);
    const ampm = match[3];
    
    if (ampm === "PM" && hrs < 12) hrs += 12;
    if (ampm === "AM" && hrs === 12) hrs = 0;
    
    dateObj.setHours(hrs, mins, 0, 0);
  } else {
    const match24 = timeStr.match(/^(\d{2}):(\d{2})$/);
    if (match24) {
      dateObj.setHours(parseInt(match24[1]), parseInt(match24[2]), 0, 0);
    }
  }
  return dateObj;
}

function getFilteredDemosByRange() {
  const rangeSelectorId = isAdminPage ? "demo-filter-range" : "tutor-filter-range";
  const rangeEl = document.getElementById(rangeSelectorId);
  const range = rangeEl ? rangeEl.value : "MONTH";
  
  let list = [];
  if (range === "ALL") {
    list = state.demos;
  } else if (range === "MONTH") {
    list = getMonthYearFilteredDemos();
  } else if (range === "DAY") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    list = state.demos.filter(d => {
      const dateObj = parseDateString(d.date || d.dateTime);
      return dateObj.getDate() === today.getDate() && 
             dateObj.getMonth() === today.getMonth() && 
             dateObj.getFullYear() === today.getFullYear();
    });
  } else if (range === "WEEK") {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay());
    startOfWeek.setHours(0, 0, 0, 0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23, 59, 59, 999);
    
    list = state.demos.filter(d => {
      const dateObj = parseDateString(d.date || d.dateTime);
      return dateObj >= startOfWeek && dateObj <= endOfWeek;
    });
  } else {
    list = getMonthYearFilteredDemos();
  }
  
  // Sort chronologically by date and time automatically
  return list.sort((a, b) => getDemoDateTimeObject(a).getTime() - getDemoDateTimeObject(b).getTime());
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

// Helper to populate all dropdown selectors with active tutors
function populateTutorDropdowns() {
  const selects = document.querySelectorAll(".tutor-select-el");
  selects.forEach(select => {
    const prevVal = select.value;
    select.innerHTML = "";
    
    // Filter to only display users with the "tutor" role or empty role
    const tutorsList = state.tutors.filter(t => t.role === "tutor" || !t.role);
    
    tutorsList.forEach(t => {
      const op = document.createElement("option");
      op.value = t.id;
      op.textContent = t.name;
      select.appendChild(op);
    });
    if (prevVal && tutorsList.some(t => t.id === prevVal)) {
      select.value = prevVal;
    }
  });
}

// --- Views Dispatches ---
function updateViews() {
  populateTutorDropdowns();
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

  if (isAdminPage && state.currentUser) {
    const role = state.currentUser.role || "admin";
    const leaderboardTab = document.querySelector('.nav-item[data-tab="leaderboard"]');
    const slabsTab = document.querySelector('.nav-item[data-tab="admin-slabs"]');
    const brandingTab = document.querySelector('.nav-item[data-tab="admin-branding"]');
    const tutorsTab = document.querySelector('.nav-item[data-tab="admin-tutors"]');
    const navHeader = document.querySelector('.nav-header');

    if (role === "sales") {
      if (leaderboardTab) leaderboardTab.style.display = "none";
      if (slabsTab) slabsTab.style.display = "none";
      if (brandingTab) brandingTab.style.display = "none";
      if (tutorsTab) tutorsTab.style.display = "none";
      if (navHeader) navHeader.style.display = "none";
      if (["leaderboard", "admin-slabs", "admin-branding", "admin-tutors"].includes(state.activeTab)) {
        state.activeTab = "dashboard";
      }
    } else if (role === "demo_manager") {
      if (leaderboardTab) leaderboardTab.style.display = "flex";
      if (slabsTab) slabsTab.style.display = "none";
      if (brandingTab) brandingTab.style.display = "none";
      if (tutorsTab) tutorsTab.style.display = "none";
      if (navHeader) navHeader.style.display = "none";
      if (["admin-slabs", "admin-branding", "admin-tutors"].includes(state.activeTab)) {
        state.activeTab = "dashboard";
      }
    } else { // admin
      if (leaderboardTab) leaderboardTab.style.display = "flex";
      if (slabsTab) slabsTab.style.display = "flex";
      if (brandingTab) brandingTab.style.display = "flex";
      if (tutorsTab) tutorsTab.style.display = "flex";
      if (navHeader) navHeader.style.display = "block";
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

  const today = new Date();
  const todaysCount = demos.filter(d => {
    if (isTutor && d.tutorId !== tutorId) return false;
    
    const demoDate = parseDateString(d.date || d.dateTime);
    if (!demoDate || isNaN(demoDate.getTime())) return false;
    
    return demoDate.getDate() === today.getDate() &&
           demoDate.getMonth() === today.getMonth() &&
           demoDate.getFullYear() === today.getFullYear();
  }).length;
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
  
  // Dynamic next class quick start panel update
  const quickStartContainer = document.getElementById("next-class-quick-start-container");
  if (quickStartContainer) {
    quickStartContainer.innerHTML = "";
    if (isTutor) {
      // Find all scheduled demos for this tutor that are DEMO NOT DONE or empty/not cancelled
      const activeTutorDemos = state.demos.filter(d => {
        if (d.tutorId !== state.currentUser.id) return false;
        const st = (d.status || "").toUpperCase();
        return st === "DEMO NOT DONE" || st === "";
      });
      
      // Sort them chronologically by date/time
      activeTutorDemos.sort((a, b) => getDemoDateTimeObject(a).getTime() - getDemoDateTimeObject(b).getTime());
      
      // Filter to find the next upcoming demo (today or in the future)
      const now = new Date();
      // subtract 1 hour buffer so a class that started 30 mins ago still shows up as active/joinable!
      const bufferTime = new Date(now.getTime() - 60 * 60 * 1000); 
      
      const nextDemo = activeTutorDemos.find(d => {
        const demoDT = getDemoDateTimeObject(d);
        return demoDT >= bufferTime;
      });
      
      if (nextDemo) {
        const tutor = state.tutors.find(t => t.id === state.currentUser?.id);
        let demoLink = "";
        if (nextDemo.slot) {
          demoLink = getTeacherZoomLinkForSlot(nextDemo.slot);
        }
        if (!demoLink || demoLink.includes("onlineclass.site/home") || demoLink.includes("onlineclass.site/join")) {
          const raw = nextDemo.zoomLink || (tutor && tutor.zoomLink) || getZoomLinkForSlot(nextDemo.slot);
          demoLink = formatZoomStartLink(raw);
        }
        quickStartContainer.innerHTML = `
          <div class="card-panel" style="background: linear-gradient(135deg, rgba(34, 197, 94, 0.1) 0%, rgba(22, 163, 74, 0.05) 100%); border: 1.5px solid rgba(34, 197, 94, 0.25); border-radius: 12px; padding: 18px; display: flex; justify-content: space-between; align-items: center; gap: 20px; flex-wrap: wrap;">
            <div style="display: flex; align-items: center; gap: 15px;">
              <div style="background: #22c55e; color: white; width: 48px; height: 48px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 1.4rem; box-shadow: 0 4px 10px rgba(34,197,94,0.3); animation: pulse 2s infinite;">
                🟢
              </div>
              <div>
                <h4 style="font-size: 1rem; font-weight: bold; margin: 0; color: var(--text-main);">Next Scheduled Demo Class</h4>
                <p style="margin: 4px 0 0 0; font-size: 0.85rem; color: var(--text-muted);">
                  Student: <strong style="color: var(--brand-secondary); font-size: 0.95rem;">${nextDemo.studentName}</strong> | 
                  Date: <strong>${formatDisplayDate(nextDemo.date || nextDemo.dateTime)}</strong> | 
                  Time: <strong>${formatDisplayTime(nextDemo.time)}</strong> | 
                  Slot: <strong>${nextDemo.slot || '-'}</strong>
                </p>
              </div>
            </div>
            <div>
              <a href="${demoLink}" target="_blank" class="btn" style="background-color: #22c55e; color: white; font-weight: bold; padding: 10px 20px; border-radius: 8px; font-size: 0.9rem; text-decoration: none; display: inline-flex; align-items: center; gap: 8px; border: none; box-shadow: 0 4px 12px rgba(34,197,94,0.3); transition: transform 0.2s, background-color 0.2s;" onmouseover="this.style.transform='translateY(-2px)'" onmouseout="this.style.transform='none'">
                🚀 Start Zoom Class
              </a>
            </div>
          </div>
        `;
      } else {
        quickStartContainer.innerHTML = `
          <div class="card-panel" style="background: rgba(255,255,255,0.01); border: 1px solid var(--border-color); border-radius: 12px; padding: 15px; display: flex; align-items: center; gap: 12px; justify-content: center; color: var(--text-muted); font-size: 0.85rem; font-style: italic;">
            <span>📅</span> No upcoming scheduled classes for today.
          </div>
        `;
      }
    }
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

// Date format conversion for HTML5 native date pickers
function formatDateForInput(dateStr) {
  if (!dateStr) return "";
  const d = parseDateString(dateStr);
  if (!d || isNaN(d.getTime())) return "";
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

// Time format conversions between 12-hour AM/PM and 24-hour HH:MM
function getTimezoneSuffix(timeStr) {
  if (!timeStr) return "IST";
  if (String(timeStr).toUpperCase().includes("GMT")) return "GMT";
  return "IST";
}

function formatTimeForInput(timeStr) {
  if (!timeStr) return "";
  // Strip both IST and GMT suffixes so native time pickers can parse
  const clean = String(timeStr).replace(/IST/i, "").replace(/GMT/i, "").trim().toUpperCase();
  const match = clean.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)?$/);
  if (!match) {
    const match24 = clean.match(/^(\d{2}):(\d{2})$/);
    if (match24) return match24[0];
    return "";
  }
  let hrs = parseInt(match[1]);
  const mins = match[2];
  const ampm = match[3];
  
  if (ampm === "PM" && hrs < 12) hrs += 12;
  if (ampm === "AM" && hrs === 12) hrs = 0;
  
  return `${String(hrs).padStart(2, "0")}:${mins}`;
}

function formatTimeForDatabase(time24, zone = "IST") {
  if (!time24) return "";
  const match = time24.match(/^(\d{2}):(\d{2})$/);
  if (!match) return time24;
  let hrs = parseInt(match[1]);
  const mins = match[2];
  const ampm = hrs >= 12 ? "PM" : "AM";
  hrs = hrs % 12;
  if (hrs === 0) hrs = 12;
  return `${hrs}:${mins} ${ampm} ${zone}`;
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
      const student = (d.studentName || "").toLowerCase();
      const tutor = (d.tutorName || "").toLowerCase();
      const agent = (d.agentName || "").toLowerCase();
      
      const matchesSearch = student.includes(searchQuery) || 
                            tutor.includes(searchQuery) ||
                            agent.includes(searchQuery);
                            
      const matchesStatus = statusQuery === "ALL" || 
                            (d.status && d.status.toUpperCase() === statusQuery.toUpperCase());
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
      tr.dataset.id = demo.id;
      
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

      // Build inline Slot dropdown select
      let slotSelectHtml = `<select class="inline-slot-select" data-id="${demo.id}" style="width:105px;">`;
      const slots = state.branding.themeColors?.slotsList || [];
      slots.forEach(sName => {
        slotSelectHtml += `<option value="${sName}" ${demo.slot === sName ? 'selected' : ''}>${sName}</option>`;
      });
      if (demo.slot && !slots.includes(demo.slot)) {
        slotSelectHtml += `<option value="${demo.slot}" selected>${demo.slot}</option>`;
      }
      slotSelectHtml += `</select>`;

      // Build inline Tutor dropdown select
      let tutorSelectHtml = `<select class="inline-tutor-select" data-id="${demo.id}" style="width:125px;">`;
      state.tutors.forEach(t => {
        if (t.role === "tutor" || !t.role) {
          tutorSelectHtml += `<option value="${t.id}" ${demo.tutorId === t.id ? 'selected' : ''}>${t.name}</option>`;
        }
      });
      tutorSelectHtml += `</select>`;

      // Build inline Agent dropdown select
      let agentSelectHtml = `<select class="inline-agent-select" data-id="${demo.id}" style="width:115px;">`;
      const agents = state.branding.themeColors?.agentsList || [];
      agents.forEach(agent => {
        agentSelectHtml += `<option value="${agent}" ${(demo.agentName || "Admin") === agent ? 'selected' : ''}>${agent}</option>`;
      });
      if (demo.agentName && !agents.includes(demo.agentName)) {
        agentSelectHtml += `<option value="${demo.agentName}" selected>${demo.agentName}</option>`;
      }
      agentSelectHtml += `</select>`;

        const hasFeedback = demo.feedback && demo.feedback.trim() !== "";
        const truncatedFeedback = hasFeedback 
          ? (demo.feedback.length > 20 ? demo.feedback.slice(0, 20) + "..." : demo.feedback)
          : "Click to add...";
        const feedbackStyle = hasFeedback ? "color: var(--brand-secondary); font-weight: 700;" : "color: var(--text-muted); font-style: italic;";
        const feedbackMarkup = `
          <div class="edit-feedback-btn" data-id="${demo.id}" style="display:flex; align-items:center; justify-content:space-between; gap:4px; cursor:pointer; width:130px; padding:3px 6px; border:1px solid rgba(255,255,255,0.08); border-radius:6px; background:rgba(255,255,255,0.02);" title="Click to view/edit full feedback">
            <span style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; ${feedbackStyle}">${truncatedFeedback}</span>
            <span style="font-size:0.85rem;">💬</span>
          </div>
        `;

        tr.innerHTML = `
          <td><input type="checkbox" class="demo-bulk-checkbox" data-id="${demo.id}" ${isChecked}></td>
          <td><strong>${idx + 1}</strong></td>
          <td style="white-space: nowrap;"><input type="date" class="inline-date-input" data-id="${demo.id}" value="${formatDateForInput(demo.date || demo.dateTime)}" style="padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-weight:bold; font-family:var(--font-main);"></td>
          <td style="white-space: nowrap;">
            <div style="display:flex; align-items:center; gap:6px;">
              <input type="time" class="inline-time-input" data-id="${demo.id}" value="${formatTimeForInput(demo.time)}" style="width:115px; padding:3px 6px;">
              <button type="button" class="ampm-toggle-btn timezone-toggle-btn" data-id="${demo.id}">${getAmpmSuffix(demo.time)}</button>
              <button type="button" class="timezone-toggle-btn" data-id="${demo.id}">${getTimezoneSuffix(demo.time)}</button>
            </div>
          </td>
          <td><div style="display:flex; align-items:center; gap:5px;">${slotSelectHtml} <a href="${zoomLink}" target="_blank" style="font-size:1.1rem;" title="Click to join class">🔗</a></div></td>
          <td>${tutorSelectHtml}</td>
          <td><input type="text" class="inline-student-input" data-id="${demo.id}" value="${demo.studentName || ''}" style="width:110px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-weight:bold; font-family:var(--font-main);"></td>
          <td>
            <select class="status-pill-select ${statusClass} admin-status-select" data-id="${demo.id}">
              <option value="DEMO NOT DONE" ${st === 'DEMO NOT DONE' ? 'selected' : ''}>DEMO NOT DONE</option>
              <option value="DEMO DONE" ${st === 'DEMO DONE' ? 'selected' : ''}>DEMO DONE</option>
              <option value="CONVERTED" ${st === 'CONVERTED' ? 'selected' : ''}>CONVERTED</option>
              <option value="CANCELLED" ${st === 'CANCELLED' ? 'selected' : ''}>CANCELLED</option>
              <option value="RESCHEDULE" ${st === 'RESCHEDULE' ? 'selected' : ''}>RESCHEDULE</option>
            </select>
          </td>
          <td><input type="text" class="inline-age-input" data-id="${demo.id}" value="${demo.age !== '-' ? demo.age : ''}" style="width:40px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
          <td><input type="text" class="inline-language-input" data-id="${demo.id}" value="${demo.language !== '-' ? demo.language : ''}" style="width:85px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
          <td>${agentSelectHtml}</td>
          <td><input type="text" class="inline-location-input" data-id="${demo.id}" value="${demo.location !== '-' ? demo.location : ''}" style="width:85px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
          <td><input type="text" class="inline-mobile-input" data-id="${demo.id}" value="${demo.mobileNumber !== '-' ? demo.mobileNumber : ''}" style="width:105px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
          <td><input type="text" class="inline-level-input" data-id="${demo.id}" value="${demo.level !== '-' ? demo.level : ''}" style="width:90px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
          <td>${feedbackMarkup}</td>
          <td><input type="text" class="inline-revision-input" data-id="${demo.id}" value="${demo.revision !== '-' ? demo.revision : ''}" style="width:75px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
        <td><input type="text" class="inline-topic-input" data-id="${demo.id}" value="${demo.topicToStart !== '-' ? demo.topicToStart : ''}" style="width:115px; padding:3px 6px; border-radius:6px; border:1px solid var(--border-color); background:var(--card-bg); color:var(--text-main); font-family:var(--font-main);"></td>
        <td>
          <button class="action-btn edit-demo-btn-el" data-id="${demo.id}" title="Edit Demo">✏️</button>
          <button class="action-btn delete delete-demo-btn-el" data-id="${demo.id}" title="Delete Demo">🗑️</button>
          <button class="action-btn share-demo-btn-el" data-id="${demo.id}" title="Share Invite on WhatsApp" style="background-color: #25d366; color: white;">💬</button>
          <button class="action-btn reminder-demo-btn-el" data-id="${demo.id}" title="Send/Copy 1-Hour Reminder" style="background-color: #e07a5f; color: white;">⏰</button>
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
        <th>DEMO STATUS</th>
        <th>ACTION</th>
      </tr>
    `;

    const tutorDemos = demos.filter(d => {
      if (d.tutorId === state.currentUser.id) return true;
      const isUnassigned = !d.tutorId || d.tutorId === "" || d.tutorName === "Unassigned" || d.tutorName === "" || !d.tutorName;
      const isNotCancelled = (d.status || "").toUpperCase() !== "CANCELLED";
      return isUnassigned && isNotCancelled;
    });

    body.innerHTML = "";
    if (tutorDemos.length === 0) {
      body.innerHTML = `<tr><td colspan="11" style="text-align:center;color:var(--text-muted);padding:40px;">No demos scheduled for you this month.</td></tr>`;
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

      // Format notes, revision, and topic combined inside the feedback cell
      let combinedNotesMarkup = "";
      if (demo.feedback) {
        combinedNotesMarkup += `<div style="font-size:0.85rem; margin-bottom: 4px; word-break: break-word; font-weight: 700; color: var(--brand-secondary);"><strong>${demo.feedback}</strong></div>`;
      }
      
      const hasRevision = demo.revision && demo.revision !== "-";
      const hasTopic = demo.topicToStart && demo.topicToStart !== "-";
      
      if (hasRevision || hasTopic) {
        combinedNotesMarkup += `<div style="font-size:0.75rem; color:var(--text-muted); display:flex; flex-direction:column; gap:2px; margin-top: 4px; text-align: left;">`;
        if (hasRevision) combinedNotesMarkup += `<span><strong>Revision:</strong> ${demo.revision}</span>`;
        if (hasTopic) combinedNotesMarkup += `<span><strong>Topic:</strong> ${demo.topicToStart}</span>`;
        combinedNotesMarkup += `</div>`;
      }
      
      const noteText = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:6px; min-width: 160px;">
          <div style="text-align:left; flex-grow:1;">
            ${combinedNotesMarkup || `<span style="color:var(--text-muted);font-style:italic;">No notes</span>`}
          </div>
          <button class="btn btn-sm edit-feedback-btn" data-id="${demo.id}" style="padding: 2px 6px; flex-shrink: 0;" title="Edit Notes & Outcomes">✏️</button>
        </div>
      `;

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

      const tutor = state.tutors.find(t => t.id === state.currentUser?.id);
      let zoomLink = "";
      if (demo.slot) {
        zoomLink = getTeacherZoomLinkForSlot(demo.slot);
      }
      if (!zoomLink || zoomLink.includes("onlineclass.site/home") || zoomLink.includes("onlineclass.site/join")) {
        const raw = demo.zoomLink || (tutor && tutor.zoomLink) || getZoomLinkForSlot(demo.slot);
        zoomLink = formatZoomStartLink(raw);
      }

      const isDemoUnassigned = !demo.tutorId || demo.tutorId === "" || demo.tutorName === "Unassigned" || demo.tutorName === "" || !demo.tutorName;
      
      let statusHtml = "";
      let actionHtml = "";
      if (isDemoUnassigned) {
        statusHtml = `<span style="background: rgba(236, 112, 99, 0.15); color: #f1948a; border: 1.5px solid rgba(236, 112, 99, 0.3); padding: 4px 8px; border-radius: 6px; font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; display: inline-block;">Open Pool</span>`;
        actionHtml = `
          <button class="btn btn-sm claim-demo-btn" data-id="${demo.id}" style="background-color: var(--brand-secondary); color: #0c0f17; font-weight: 800; padding: 6px 12px; border-radius: 6px; font-size: 0.75rem; border: none; cursor: pointer; transition: transform 0.15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'">
            🙋‍♂️ Claim Demo
          </button>
        `;
      } else {
        statusHtml = `
          <select class="status-pill-select ${statusClass} tutor-status-select" data-id="${demo.id}">
            ${tutorStatusOptions}
          </select>
        `;
        actionHtml = `
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <a href="${zoomLink}" target="_blank" class="btn btn-sm" style="background-color:#22c55e; color:white; font-weight:bold; padding:6px 12px; border-radius:6px; font-size:0.75rem; text-decoration:none; display:inline-flex; align-items:center; justify-content:center; gap:4px; border:none; box-shadow:0 2px 4px rgba(34,197,94,0.2); transition:transform 0.15s;" onmouseover="this.style.transform='scale(1.05)'" onmouseout="this.style.transform='scale(1)'" title="Start Zoom Class">
              🟢 Start Class
            </a>
            <button class="btn btn-sm tutor-remind-btn" data-id="${demo.id}" style="background-color:#e07a5f; color:white; font-weight:bold; padding:4px 8px; border-radius:6px; font-size:0.72rem; border:none; cursor:pointer;" title="Send Reminder to Student">
              ⏰ Remind
            </button>
          </div>
        `;
      }
      
      tr.innerHTML = `
        <td><strong>${idx + 1}</strong></td>
        <td style="white-space: nowrap;">${formatDisplayDate(demo.date || demo.dateTime)}</td>
        <td style="white-space: nowrap;">${formatDisplayTime(demo.time)}</td>
        <td>${demo.slot || '-'}</td>
        <td><strong>${demo.studentName}</strong></td>
        <td>${demo.age}</td>
        <td>${demo.language}</td>
        <td>${demo.level || '-'}</td>
        <td>${noteText}</td>
        <td>${statusHtml}</td>
        <td style="white-space: nowrap;">${actionHtml}</td>
      `;
      body.appendChild(tr);
    });
  }
}

async function moveDemoRow(demoId, direction) {
  const isTutor = isTutorPage;
  if (isTutor) return; // Only Admin / Demo Manager roles can sort
  
  const filteredDemos = getFilteredDemosByRange();
  const index = filteredDemos.findIndex(d => d.id === demoId);
  if (index === -1) return;
  
  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= filteredDemos.length) return; // Boundary lock
  
  const item1 = filteredDemos[index];
  const item2 = filteredDemos[targetIndex];
  
  const pos1 = item1.position || 0;
  const pos2 = item2.position || 0;
  
  // If positions are default or identical, initialize all items with unique sequential index values
  if (pos1 === pos2) {
    state.demos.forEach((d, idx) => {
      d.position = idx * 10;
    });
    // Re-swap positions based on new unique numbering
    const newPos1 = item1.position;
    const newPos2 = item2.position;
    item1.position = newPos2;
    item2.position = newPos1;
  } else {
    item1.position = pos2;
    item2.position = pos1;
  }
  
  saveToLocalStorage();
  
  // Write both swaps to database
  await writeToSheets("updateDemo", item1);
  await writeToSheets("updateDemo", item2);
  
  renderDemosTable();
}

function setupTableDragAndDrop(tbody) {
  let dragEl = null;

  tbody.querySelectorAll("tr").forEach(tr => {
    // Only bind events if user is admin or demo_manager
    if (!state.currentUser || (state.currentUser.role !== "admin" && state.currentUser.role !== "demo_manager")) {
      tr.draggable = false;
      return;
    }

    tr.addEventListener("dragstart", (e) => {
      // Only drag if click started on the drag handle
      const handle = e.target.closest(".drag-handle");
      if (!handle && e.target.tagName.toLowerCase() !== "td") {
        // Prevent dragging if editing inputs
        e.preventDefault();
        return;
      }
      dragEl = tr;
      tr.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", tr.dataset.id);
    });

    tr.addEventListener("dragend", () => {
      if (dragEl) {
        dragEl.classList.remove("dragging");
      }
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("drag-over"));
      dragEl = null;
    });

    tr.addEventListener("dragover", (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const targetTr = e.target.closest("tr");
      if (targetTr && targetTr !== dragEl) {
        tbody.querySelectorAll("tr").forEach(r => r.classList.remove("drag-over"));
        targetTr.classList.add("drag-over");
      }
    });

    tr.addEventListener("dragleave", (e) => {
      const targetTr = e.target.closest("tr");
      if (targetTr) {
        targetTr.classList.remove("drag-over");
      }
    });

    tr.addEventListener("drop", async (e) => {
      e.preventDefault();
      tbody.querySelectorAll("tr").forEach(r => r.classList.remove("drag-over"));
      
      const targetTr = e.target.closest("tr");
      if (!targetTr || !dragEl || targetTr === dragEl) return;

      const draggedId = dragEl.dataset.id;
      const targetId = targetTr.dataset.id;

      const filteredDemos = getFilteredDemosByRange();
      const draggedIdx = filteredDemos.findIndex(d => d.id === draggedId);
      const targetIdx = filteredDemos.findIndex(d => d.id === targetId);

      if (draggedIdx !== -1 && targetIdx !== -1) {
        const draggedItem = filteredDemos[draggedIdx];
        
        // Remove item from old position and insert at new position
        filteredDemos.splice(draggedIdx, 1);
        filteredDemos.splice(targetIdx, 0, draggedItem);

        // Assign clean sequential position numbers
        filteredDemos.forEach((d, idx) => {
          d.position = idx * 10;
        });

        saveToLocalStorage();
        renderDemosTable();
        showToast("Row order updated.");

        // Batch upload positions to database in background
        filteredDemos.forEach(async (d) => {
          await writeToSheets("updateDemo", d);
        });
      }
    });
  });
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
    body.innerHTML = `<tr><td colspan="10" style="text-align:center;color:var(--text-muted);padding:40px;">No unclaimed demos available at the moment.</td></tr>`;
    return;
  }

  unassignedDemos.forEach((demo, idx) => {
    const tr = document.createElement("tr");
    
    let requirements = "";
    const hasRev = demo.revision && demo.revision !== "-";
    const hasTop = demo.topicToStart && demo.topicToStart !== "-";
    if (hasRev || hasTop) {
      if (hasRev) requirements += `Revision: ${demo.revision}`;
      if (hasTop) {
        if (requirements) requirements += " | ";
        requirements += `Topic: ${demo.topicToStart}`;
      }
    } else {
      requirements = "-";
    }

    tr.innerHTML = `
      <td><strong>${idx + 1}</strong></td>
      <td style="white-space: nowrap;"><strong>${formatDisplayDate(demo.date || demo.dateTime)}</strong></td>
      <td style="white-space: nowrap;">${formatDisplayTime(demo.time)}</td>
      <td>${demo.slot || '-'}</td>
      <td><strong>${demo.studentName}</strong></td>
      <td>${demo.age}</td>
      <td>${demo.language}</td>
      <td>${demo.level || '-'}</td>
      <td>${requirements}</td>
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
  demo.feedback = "Tutor Locked";
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
    demo.feedback = "";
    showToast("Failed to claim demo in the database. Please try again.", "warning");
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

// Helper to guarantee Slots and Agents lists are initialized in branding
function initializeBrandingLists() {
  if (!state.branding.themeColors) {
    state.branding.themeColors = {};
  }
  if (!state.branding.slotLinks || !Array.isArray(state.branding.slotLinks) || state.branding.slotLinks.length === 0) {
    const list = [];
    for (let i = 1; i <= 48; i++) {
      list.push({
        id: `slot_${i}`,
        name: `Slot ${i}`,
        link: "https://eighttimeseight.onlineclass.site/join",
        teacherLink: ""
      });
    }
    state.branding.slotLinks = list;
  }
  
  // Defensive check: Ensure all existing slots have a teacherLink property
  if (state.branding.slotLinks && Array.isArray(state.branding.slotLinks)) {
    state.branding.slotLinks.forEach(s => {
      if (s.teacherLink === undefined) {
        s.teacherLink = "";
      }
    });
  }

  // Synchronize slotsList for compatibility
  state.branding.themeColors.slotsList = state.branding.slotLinks.map(s => s.name);

  if (!state.branding.themeColors.agentsList || !Array.isArray(state.branding.themeColors.agentsList)) {
    state.branding.themeColors.agentsList = [];
  }
}

function renderSettingsDropdownLists() {
  const slotsListDiv = document.getElementById("slots-manager-list");
  const agentsListDiv = document.getElementById("sales-manager-list");
  if (!slotsListDiv || !agentsListDiv) return;

  initializeBrandingLists();

  // Render Slots list
  slotsListDiv.innerHTML = "";
  if (state.branding.themeColors.slotsList.length === 0) {
    slotsListDiv.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">No slots created.</p>`;
  } else {
    state.branding.themeColors.slotsList.forEach(slot => {
      const row = document.createElement("div");
      row.style = "display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem;";
      row.innerHTML = `
        <span>${slot}</span>
        <button type="button" class="delete-slot-option-btn" data-slot="${slot}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem; padding:0 2px;">🗑️</button>
      `;
      slotsListDiv.appendChild(row);
    });
  }

  // Render Sales list
  agentsListDiv.innerHTML = "";
  if (state.branding.themeColors.agentsList.length === 0) {
    agentsListDiv.innerHTML = `<p style="font-size:0.8rem; color:var(--text-muted); text-align:center; padding:10px;">No sales representatives created.</p>`;
  } else {
    state.branding.themeColors.agentsList.forEach(agent => {
      const isObj = typeof agent === "object" && agent !== null;
      const name = isObj ? agent.name : agent;
      const code = isObj ? agent.accessCode : "";
      const displayStr = code ? `${name} <span style="opacity: 0.6; font-size: 0.8rem; margin-left: 8px;">(Code: ${code})</span>` : name;
      
      const row = document.createElement("div");
      row.style = "display: flex; justify-content: space-between; align-items: center; padding: 6px 8px; border-bottom: 1px solid rgba(255,255,255,0.05); font-size: 0.85rem;";
      row.innerHTML = `
        <span>${displayStr}</span>
        <button type="button" class="delete-agent-option-btn" data-agent="${name}" style="background:none; border:none; color:#ef4444; cursor:pointer; font-size:0.9rem; padding:0 2px;">🗑️</button>
      `;
      agentsListDiv.appendChild(row);
    });
  }
}

function renderSlotLinksSettingsTable() {
  const tbody = document.getElementById("slot-links-settings-tbody");
  if (!tbody) return;

  initializeBrandingLists();

  tbody.innerHTML = "";
  const slotLinks = state.branding.slotLinks || [];
  if (slotLinks.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:20px;">No slot configurations found. Click '+ Add Slot Link' to create one.</td></tr>`;
    return;
  }

  slotLinks.forEach(slotItem => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>
        <input type="text" class="slot-setting-name-input form-control" data-id="${slotItem.id}" value="${slotItem.name}" style="width:100%; font-weight:bold; padding:4px 8px; font-size:0.85rem;">
      </td>
      <td>
        <input type="text" class="slot-setting-link-input form-control" data-id="${slotItem.id}" value="${slotItem.link || ''}" style="width:100%; padding:4px 8px; font-size:0.85rem;" placeholder="e.g. https://.../joinPublic/... (Student)">
      </td>
      <td>
        <input type="text" class="slot-setting-teacher-link-input form-control" data-id="${slotItem.id}" value="${slotItem.teacherLink || ''}" style="width:100%; padding:4px 8px; font-size:0.85rem;" placeholder="e.g. https://.../teacher/... (Tutor)">
      </td>
      <td style="text-align:center; vertical-align:middle;">
        <button type="button" class="btn btn-sm btn-danger delete-slot-link-setting-btn" data-id="${slotItem.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });
}

// --- VIEW: ADMIN BRANDING ---
function renderAdminBranding() {
  const branding = state.branding;

  document.getElementById("brand-name").value = branding.companyName;
  document.getElementById("brand-currency").value = branding.currency;
  
  const subUrlEl = document.getElementById("brand-supabase-url");
  if (subUrlEl) subUrlEl.value = branding.supabaseUrl || "";

  const subKeyEl = document.getElementById("brand-supabase-key");
  if (subKeyEl) subKeyEl.value = branding.supabaseKey || "";
  
  // Load WhatsApp Settings
  const whatsappEnabledEl = document.getElementById("brand-whatsapp-enabled");
  if (whatsappEnabledEl) whatsappEnabledEl.checked = !!branding.whatsappEnabled;

  const whatsappInstanceEl = document.getElementById("brand-whatsapp-instance");
  if (whatsappInstanceEl) whatsappInstanceEl.value = branding.whatsappInstanceId || "";

  const whatsappTokenEl = document.getElementById("brand-whatsapp-token");
  if (whatsappTokenEl) whatsappTokenEl.value = branding.whatsappToken || "";

  const whatsappTestNumEl = document.getElementById("brand-whatsapp-test-num");
  if (whatsappTestNumEl) whatsappTestNumEl.value = branding.whatsappAdminNumber || "";

  document.getElementById("color-primary").value = branding.themeColors.primary;
  document.getElementById("color-secondary").value = branding.themeColors.secondary;

  const accessCodeEl = document.getElementById("sales-access-code-input");
  if (accessCodeEl) accessCodeEl.value = branding.themeColors.agentAccessCode || "AGENT123";

  renderSettingsDropdownLists();
  renderSlotLinksSettingsTable();
}

// --- VIEW: ADMIN TUTORS ---
function renderAdminTutors() {
  const tbody = document.getElementById("admin-tutors-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";

  if (state.tutors.length === 0) {
    tbody.innerHTML = `<tr><td colspan="4" style="text-align:center;color:var(--text-muted);padding:30px;">No user profiles found.</td></tr>`;
    return;
  }

  state.tutors.forEach(t => {
    const tr = document.createElement("tr");
    const roleLabel = t.role ? t.role.toUpperCase().replace("_", " ") : "TUTOR";
    tr.innerHTML = `
      <td>
        <div style="display:flex; align-items:center; gap:10px;">
          <img src="${t.avatar}" style="width:26px; height:26px; border-radius:50%; background:#e5e7eb;">
          <strong>${t.name}</strong>
        </div>
      </td>
      <td><span class="badge" style="background: rgba(224,122,95,0.12); color: var(--brand-secondary); font-size: 0.72rem; padding: 3px 8px; border-radius: 6px; font-weight: 700; border: 1px solid rgba(224,122,95,0.2); text-transform: uppercase;">${roleLabel}</span></td>
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

  const saveBtn = document.getElementById("save-invite-template-btn");
  if (state.currentUser && state.currentUser.role !== "admin") {
    textarea.disabled = true;
    if (saveBtn) saveBtn.style.display = "none";
  } else {
    textarea.disabled = false;
    if (saveBtn) saveBtn.style.display = "inline-flex";
  }
}

function renderTutorSlots() {
  const tbody = document.getElementById("tutor-slots-grid-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  if (!state.currentUser) return;

  const tutor = state.tutors.find(t => t.id === state.currentUser.id);
  if (!tutor) return;

  // availability load
  const availability = Array.isArray(tutor.availability) ? tutor.availability : [];
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
      
      // Check if there is an active class/demo booked for this tutor at this slot
      const bookedDemo = state.demos.find(d => {
        if (d.tutorId !== state.currentUser.id) return false;
        if (d.status === "Cancelled") return false;
        
        const dDayKey = getDayKeyFromDateStr(d.date);
        if (dDayKey !== day.key) return false;
        
        const slotName = `Slot ${timeIdx + 1}`;
        return d.time === time || d.slot === slotName;
      });

      const td = document.createElement("td");
      const cell = document.createElement("div");
      cell.dataset.slotId = slotId;

      if (bookedDemo) {
        // Red Color for Class Booked
        cell.className = "calendar-cell booked";
        cell.style.cursor = "pointer";
        cell.title = `Click to start class for ${bookedDemo.studentName}`;
        cell.innerHTML = `🎓 ${bookedDemo.studentName}`;
        cell.addEventListener("click", () => {
          const tutor = state.tutors.find(t => t.id === state.currentUser?.id);
          let zoomLink = "";
          if (bookedDemo.slot) {
            zoomLink = getTeacherZoomLinkForSlot(bookedDemo.slot);
          }
          if (!zoomLink || zoomLink.includes("onlineclass.site/home") || zoomLink.includes("onlineclass.site/join")) {
            const raw = bookedDemo.zoomLink || (tutor && tutor.zoomLink) || getZoomLinkForSlot(bookedDemo.slot);
            zoomLink = formatZoomStartLink(raw);
          }
          if (confirm(`Do you want to start the class for ${bookedDemo.studentName}?`)) {
            window.open(zoomLink, "_blank");
          }
        });
      } else {
        // Green Color for Available
        const isActive = availability.includes(slotId);
        cell.className = `calendar-cell ${isActive ? 'active' : ''}`;
        cell.innerHTML = isActive ? "Available ✓" : "Unavailable";

        cell.addEventListener("click", () => {
          const currentlyActive = cell.classList.contains("active");
          
          if (currentlyActive) {
            // Check 24 hour cancellation rule
            if (isSlotWithin24Hours(day.key, time)) {
              showToast("You cannot cancel availability for slots that start in less than 24 hours!", "error");
              return;
            }

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
      }

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

function isSlotWithin24Hours(dayKey, timeStr) {
  const dayKeys = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const targetDayIndex = dayKeys.indexOf(dayKey.toLowerCase());
  if (targetDayIndex === -1) return false;

  const now = new Date();
  
  // Parse the time string (e.g., "10:00 AM" or "6:30 PM")
  const timeRegex = /(\d+):(\d+)\s*(AM|PM)/i;
  const match = timeStr.match(timeRegex);
  if (!match) return false;

  let hours = parseInt(match[1]);
  const minutes = parseInt(match[2]);
  const ampm = match[3].toUpperCase();

  if (ampm === "PM" && hours !== 12) hours += 12;
  if (ampm === "AM" && hours === 12) hours = 0;

  // Find the next occurrence of targetDayIndex starting from today
  const targetDate = new Date(now);
  let daysDiff = targetDayIndex - now.getDay();
  if (daysDiff < 0) {
    daysDiff += 7;
  }
  
  targetDate.setDate(now.getDate() + daysDiff);
  targetDate.setHours(hours, minutes, 0, 0);

  // If the target slot is earlier today, next occurrence is next week
  if (targetDate < now) {
    targetDate.setDate(targetDate.getDate() + 7);
  }

  // Calculate difference
  const diffMs = targetDate - now;
  const diffHours = diffMs / (1000 * 60 * 60);

  return diffHours < 24;
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

  const duration = (type === "warning" || type === "danger" || type === "error") ? 10000 : 2500;

  setTimeout(() => {
    toast.style.opacity = "0";
    toast.style.transform = "translateY(10px)";
    toast.style.transition = "all 0.3s ease";
    setTimeout(() => toast.remove(), 300);
  }, duration);
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
    title.textContent = "Edit User Profile";
    const tutor = state.tutors.find(t => t.id === tutorId);
    if (tutor) {
      const emailVal = tutor.email || "";
      const emailParts = emailVal.split("|");
      const languages = emailParts[0] ? emailParts[0].trim() : "";
      const phone = emailParts[1] ? emailParts[1].trim() : "";

      document.getElementById("tutor-form-id").value = tutor.id;
      document.getElementById("tutor-form-name").value = tutor.name;
      document.getElementById("tutor-form-code").value = tutor.accessCode || tutor.accesscode || "";
      document.getElementById("tutor-form-languages").value = languages;
      document.getElementById("tutor-form-phone").value = phone;
      document.getElementById("tutor-form-role").value = tutor.role || "tutor";
    }
  } else {
    title.textContent = "Add User Profile";
    document.getElementById("tutor-form-id").value = "";
    document.getElementById("tutor-form-languages").value = "English";
    document.getElementById("tutor-form-phone").value = "";
    document.getElementById("tutor-form-role").value = "tutor";
  }
  modal.classList.add("open");
}

async function handleTutorSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("tutor-form-id").value;
  const name = document.getElementById("tutor-form-name").value.trim();
  const accessCode = document.getElementById("tutor-form-code").value.trim();
  const role = document.getElementById("tutor-form-role").value;
  const languages = document.getElementById("tutor-form-languages").value.trim();
  const phone = document.getElementById("tutor-form-phone").value.trim();
  const dbEmail = phone ? `${languages} | ${phone}` : languages;

  const avatar = `https://api.dicebear.com/7.x/avataaars/svg?seed=${encodeURIComponent(name)}`;
  const tutorData = { name, accessCode, role, avatar, email: dbEmail };

  if (id) {
    const idx = state.tutors.findIndex(t => t.id === id);
    if (idx !== -1) {
      const oldTutor = state.tutors[idx];
      const updatedTutor = { ...oldTutor, ...tutorData, id };
      state.tutors[idx] = updatedTutor;
      await writeToSheets("updateTutor", updatedTutor);
      showToast("User profile updated.");
    }
  } else {
    const newId = `tutor_${Date.now()}`;
    const newTutor = { id: newId, ...tutorData, availability: [], zoomLink: "", zoomlink: "" };
    state.tutors.push(newTutor);
    await writeToSheets("addTutor", newTutor);
    showToast("User profile added.");
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

// Date and Time visual formatters
function formatDisplayDate(dateStr) {
  if (!dateStr || dateStr === "-") return "-";
  
  if (typeof dateStr === "string") {
    const trimmed = dateStr.trim();
    // Case 1: ISO string with T, e.g. 2026-08-11T18:30:00.000Z
    if (trimmed.includes("T")) {
      try {
        const dateObj = new Date(trimmed);
        if (!isNaN(dateObj.getTime())) {
          const yy = String(dateObj.getFullYear()).slice(-2);
          const mm = String(dateObj.getMonth() + 1).padStart(2, '0');
          const dd = String(dateObj.getDate()).padStart(2, '0');
          return `${dd}-${mm}-${yy}`;
        }
      } catch (e) {}
      const parts = trimmed.split("T")[0].split("-");
      if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0].slice(-2)}`;
      }
    }
    
    // Case 2: standard YYYY-MM-DD
    const ymdMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (ymdMatch) {
      return `${ymdMatch[3]}-${ymdMatch[2]}-${ymdMatch[1].slice(-2)}`;
    }

    // Case 3: DD-MM-YY already
    if (/^\d{2}[-/]\d{2}[-/]\d{2}$/.test(trimmed)) {
      return trimmed.replace(/\//g, "-");
    }

    // Case 4: DD-MM-YYYY -> convert to DD-MM-YY
    const ymdMatch4 = trimmed.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
    if (ymdMatch4) {
      return `${ymdMatch4[1]}-${ymdMatch4[2]}-${ymdMatch4[3].slice(-2)}`;
    }
  }
  
  return dateStr;
}

function formatDisplayTime(timeStr) {
  if (!timeStr || timeStr === "-") return "-";
  
  let formatted = timeStr;
  if (typeof timeStr === "string" && timeStr.includes("T")) {
    try {
      const dateObj = new Date(timeStr);
      if (!isNaN(dateObj.getTime())) {
        let hour = dateObj.getHours();
        const minutes = String(dateObj.getMinutes()).padStart(2, '0');
        const ampm = hour >= 12 ? 'PM' : 'AM';
        hour = hour % 12 || 12;
        formatted = `${hour}:${minutes} ${ampm}`;
      }
    } catch (e) {
      console.warn("Time parsing failed:", timeStr, e);
    }
    const parts = timeStr.split("T");
    if (parts.length === 2) {
      const timeParts = parts[1].split(":");
      if (timeParts.length >= 2) {
        let hr = parseInt(timeParts[0]);
        const min = timeParts[1];
        const ampm = hr >= 12 ? 'PM' : 'AM';
        hr = hr % 12 || 12;
        formatted = `${hr}:${min} ${ampm}`;
      }
    }
  }
  
  if (typeof formatted === "string" && (formatted.includes("AM") || formatted.includes("PM")) && !formatted.includes("IST")) {
    formatted = `${formatted} IST`;
  }
  
  return formatted;
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
    const slots = state.branding.themeColors?.slotsList || [];
    slots.forEach(slot => {
      const op = document.createElement("option");
      op.value = slot;
      op.textContent = slot;
      slotSelect.appendChild(op);
    });
    const customOp = document.createElement("option");
    customOp.value = "CUSTOM";
    customOp.textContent = "-- Type Custom Slot --";
    slotSelect.appendChild(customOp);
  }

  const agentSelect = document.getElementById("demo-sales-name");
  if (agentSelect) {
    agentSelect.innerHTML = "";
    const agents = state.branding.themeColors?.agentsList || [];
    agents.forEach(agent => {
      const op = document.createElement("option");
      op.value = agent;
      op.textContent = agent;
      agentSelect.appendChild(op);
    });
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
      document.getElementById("demo-sales-name").value = demo.agentName || "";
      document.getElementById("demo-location").value = demo.location || "";
      document.getElementById("demo-mobile-number").value = demo.mobileNumber || "";
      document.getElementById("demo-feedback").value = demo.feedback || "";
      document.getElementById("demo-sales-note").value = demo.agentNote || "";
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
    document.getElementById("demo-sales-name").value = "";
    document.getElementById("demo-location").value = "";
    document.getElementById("demo-mobile-number").value = "";
    document.getElementById("demo-sales-note").value = "";
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
  const agentName = document.getElementById("demo-sales-name").value.trim() || "-";
  const location = document.getElementById("demo-location").value.trim() || "-";
  const mobileNumber = document.getElementById("demo-mobile-number").value.trim() || "-";
  const feedback = document.getElementById("demo-feedback").value.trim() || "";
  const agentNote = document.getElementById("demo-sales-note").value.trim() || "";

  let status = "DEMO NOT DONE";
  let shouldTriggerWhatsApp = false;
  let targetDemoId = id;

  if (id) {
    const oldDemo = state.demos.find(d => d.id === id);
    if (oldDemo) {
      status = oldDemo.status || "DEMO NOT DONE";
      const isScheduled = (status.toUpperCase() === "DEMO NOT DONE" || status === "");
      const dateChanged = oldDemo.date !== date;
      const timeChanged = oldDemo.time !== time;
      const slotChanged = oldDemo.slot !== slot;
      const tutorChanged = oldDemo.tutorId !== tutorId;
      
      if (isScheduled && (dateChanged || timeChanged || slotChanged || tutorChanged)) {
        shouldTriggerWhatsApp = true;
      }
    }
  } else {
    shouldTriggerWhatsApp = true;
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
    agentNote,
    zoomLink: tutor.zoomLink || ""
  };

  if (id) {
    const idx = state.demos.findIndex(d => d.id === id);
    if (idx !== -1) {
      state.demos[idx] = { id, ...demoData };
      await writeToSheets("updateDemo", { id, ...demoData });
      showToast("Demo log updated.");
      targetDemoId = id;
    }
  } else {
    const newId = `demo_${Date.now()}`;
    state.demos.push({ id: newId, ...demoData });
    await writeToSheets("addDemo", { id: newId, ...demoData });
    showToast("Demo log registered.");
    targetDemoId = newId;
  }

  // Trigger background WhatsApp if needed
  if (shouldTriggerWhatsApp && state.branding.whatsappEnabled && mobileNumber && mobileNumber !== "-") {
    const demoObj = state.demos.find(d => d.id === targetDemoId);
    if (demoObj) {
      const studentNameVal = demoObj.studentName || "Student";
      const dateVal = demoObj.date || demoObj.dateTime || "";
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
      const timeVal = demoObj.time || "";
      const slotVal = demoObj.slot || "Slot 1";
      const tutorVal = demoObj.tutorName || "Assigning soon";
      const zoomLink = demoObj.zoomLink || getZoomLinkForSlot(slotVal);

      let template = state.inviteTemplate || localStorage.getItem("DEMO_INVITE_TEMPLATE") || DEFAULT_INVITE_TEMPLATE;
      let text = template
        .replace(/{DATE}/gi, dateFormatted)
        .replace(/{TIME}/gi, timeVal)
        .replace(/{SLOT}/gi, slotVal)
        .replace(/{LINK}/gi, zoomLink)
        .replace(/{STUDENT}/gi, studentNameVal)
        .replace(/{TUTOR}/gi, tutorVal);

      sendBackgroundWhatsApp(mobileNumber, text).then(sent => {
        if (sent) {
          showToast("Automated WhatsApp notification sent!", "success");
        }
      });
    }
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
  if (!slotName) return "https://eighttimeseight.onlineclass.site/join";
  
  // 1. Look up in our custom dynamic slotLinks list
  if (state.branding && state.branding.slotLinks) {
    const found = state.branding.slotLinks.find(s => s.name.toLowerCase() === slotName.toLowerCase());
    if (found && found.link) return found.link;
  }

  // 2. Look up in our custom timetable template if configured
  if (state.timetable && state.timetable.length > 0) {
    const slotObj = state.timetable.find(s => s.name.toLowerCase() === slotName.toLowerCase());
    if (slotObj && slotObj.zoomLink) return slotObj.zoomLink;
  }

  const branding = state.branding || {};
  const cleanKey = slotName.toLowerCase().replace(/\s+/g, '');
  
  // 3. Look up in direct branding variables
  const link = branding[cleanKey] || branding[cleanKey + 'zoom'] || branding[slotName];
  if (link) return link;
  
  // 4. Standard default fallback
  return "https://eighttimeseight.onlineclass.site/join";
}

function getTeacherZoomLinkForSlot(slotName) {
  if (!slotName) return "https://eighttimeseight.onlineclass.site/home";
  
  if (state.branding && state.branding.slotLinks) {
    const found = state.branding.slotLinks.find(s => s.name.toLowerCase() === slotName.toLowerCase());
    if (found) {
      if (found.teacherLink) return found.teacherLink;
      if (found.link) return formatZoomStartLink(found.link);
    }
  }

  if (state.timetable && state.timetable.length > 0) {
    const slotObj = state.timetable.find(s => s.name.toLowerCase() === slotName.toLowerCase());
    if (slotObj && slotObj.zoomLink) return formatZoomStartLink(slotObj.zoomLink);
  }

  return formatZoomStartLink(getZoomLinkForSlot(slotName));
}

async function sendDemoInvite(demoId) {
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
  
  const enabled = state.branding.whatsappEnabled;
  const instanceId = state.branding.whatsappInstanceId;
  const token = state.branding.whatsappToken;

  if (enabled && instanceId && token) {
    const choice = confirm(`Do you want to send this WhatsApp invite automatically in the background?\n\n• Click OK to send automatically via UltraMsg API to ${mobile || "the student"}.\n• Click Cancel to share manually via WhatsApp Web.`);
    if (choice) {
      const targetPhone = mobile || demo.mobileNumber;
      if (!targetPhone) {
        showToast("No mobile number provided to send WhatsApp.", "warning");
        return;
      }
      showToast("Sending WhatsApp in background...", "info");
      const sent = await sendBackgroundWhatsApp(targetPhone, text);
      if (sent) {
        showToast("WhatsApp invitation sent successfully!", "success");
      } else {
        showToast("Failed to send WhatsApp invitation. Check console or try manually.", "error");
      }
      return;
    }
  }

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

function openReportModal(demoId) {
  const modal = document.getElementById("report-modal");
  if (!modal) return;
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;

  // Set fields
  const companyNameEl = modal.querySelector(".company-name-text");
  if (companyNameEl) {
    companyNameEl.textContent = state.branding.companyName || "Eight Times Eight Chess Academy";
  }

  document.getElementById("rep-student-name").textContent = demo.studentName || "-";
  document.getElementById("rep-student-age").textContent = demo.age || "-";
  document.getElementById("rep-student-lang").textContent = demo.language || "-";
  document.getElementById("rep-student-level").textContent = demo.level || "-";
  document.getElementById("rep-student-loc").textContent = demo.location || "-";

  document.getElementById("rep-tutor-name").textContent = demo.tutorName || "-";
  document.getElementById("rep-class-date").textContent = formatDisplayDate(demo.date || demo.dateTime) || "-";
  document.getElementById("rep-class-time").textContent = formatDisplayTime(demo.time) || "-";
  document.getElementById("rep-class-slot").textContent = demo.slot || "-";
  document.getElementById("rep-agent-name").textContent = demo.agentName || "-";

  const statusEl = document.getElementById("rep-class-status");
  if (statusEl) {
    const st = (demo.status || "DEMO NOT DONE").toUpperCase();
    statusEl.textContent = st;
    
    // Status colors
    let bg = "rgba(255,255,255,0.08)";
    let fg = "var(--text-main)";
    if (st === "DEMO DONE") {
      bg = "rgba(34, 197, 94, 0.2)";
      fg = "#22c55e";
    } else if (st === "CONVERTED") {
      bg = "rgba(59, 130, 246, 0.2)";
      fg = "#3b82f6";
    } else if (st === "CANCELLED") {
      bg = "rgba(239, 68, 68, 0.2)";
      fg = "#ef4444";
    }
    statusEl.style.backgroundColor = bg;
    statusEl.style.color = fg;
  }

  document.getElementById("rep-class-topic").textContent = demo.topicToStart || "-";
  document.getElementById("rep-class-revision").textContent = (demo.revision && demo.revision !== "-") ? demo.revision : "None required";
  document.getElementById("rep-class-feedback").textContent = demo.feedback || "No feedback notes entered.";
  const repAgentNoteEl = document.getElementById("rep-class-sales-note");
  if (repAgentNoteEl) {
    repAgentNoteEl.textContent = demo.agentNote || "No sales notes entered.";
  }

  // Save demoId onto edit button
  const editBtn = document.getElementById("report-edit-btn");
  if (editBtn) {
    editBtn.dataset.id = demo.id;
  }

  modal.classList.add("open");
}

// Tutor Feedback edit popup
function openFeedbackModal(demoId) {
  const modal = document.getElementById("feedback-modal");
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;

  document.getElementById("feedback-demo-id").value = demo.id;
  document.getElementById("feedback-student-label").textContent = `Student: ${demo.studentName}`;
  document.getElementById("feedback-info-label").textContent = `Date: ${formatDisplayDate(demo.date || demo.dateTime)} | Slot: ${demo.slot}`;
  document.getElementById("feedback-notes-input").value = demo.feedback || "";
  
  const statusSelect = document.getElementById("feedback-status-select");
  if (statusSelect) {
    statusSelect.innerHTML = "";
    const st = (demo.status || "").toUpperCase();
    if (st === "CONVERTED" || st === "CANCELLED" || st === "RESCHEDULE") {
      statusSelect.innerHTML = `<option value="${st}" selected>${st} (Locked by Admin)</option>`;
      statusSelect.disabled = true;
    } else {
      statusSelect.innerHTML = `
        <option value="DEMO NOT DONE" ${st === 'DEMO NOT DONE' ? 'selected' : ''}>DEMO NOT DONE</option>
        <option value="DEMO DONE" ${st === 'DEMO DONE' ? 'selected' : ''}>DEMO DONE</option>
      `;
      statusSelect.disabled = false;
    }
  }

  const revisionInput = document.getElementById("feedback-revision-input");
  if (revisionInput) {
    revisionInput.value = (demo.revision && demo.revision !== "-") ? demo.revision : "";
  }
  
  const topicInput = document.getElementById("feedback-topic-input");
  if (topicInput) {
    topicInput.value = (demo.topicToStart && demo.topicToStart !== "-") ? demo.topicToStart : "";
  }
  
  modal.classList.add("open");
}

async function handleFeedbackSubmit(e) {
  e.preventDefault();
  const id = document.getElementById("feedback-demo-id").value;
  const feedback = document.getElementById("feedback-notes-input").value.trim();
  const statusSelect = document.getElementById("feedback-status-select");
  const revisionInput = document.getElementById("feedback-revision-input");
  const topicInput = document.getElementById("feedback-topic-input");
  
  const status = statusSelect ? statusSelect.value : "DEMO NOT DONE";
  const revision = revisionInput ? (revisionInput.value.trim() || "-") : "-";
  const topicToStart = topicInput ? (topicInput.value.trim() || "-") : "-";

  const idx = state.demos.findIndex(d => d.id === id);
  if (idx !== -1) {
    const demo = state.demos[idx];
    demo.feedback = feedback;
    demo.status = status;
    demo.revision = revision;
    demo.topicToStart = topicToStart;
    
    const success = await writeToSheets("updateDemo", demo);
    if (success) {
      saveToLocalStorage();
      document.getElementById("feedback-modal").classList.remove("open");
      renderDemosTable();
      renderDashboard();
      showToast("Demo notes, status and outcome saved successfully.");
    } else {
      showToast("Failed to save changes to database. Saved locally.", "warning");
      saveToLocalStorage();
      document.getElementById("feedback-modal").classList.remove("open");
      renderDemosTable();
      renderDashboard();
    }
  }
}

// Brand settings submit
async function handleBrandingSubmit(e) {
  e.preventDefault();
  const name = document.getElementById("brand-name").value.trim();
  const currency = document.getElementById("brand-currency").value.trim();
  
  let supabaseUrl = document.getElementById("brand-supabase-url").value.trim();
  // Strip trailing /rest/v1/ or /rest/v1 if present in Supabase URL
  if (supabaseUrl.endsWith("/rest/v1/")) {
    supabaseUrl = supabaseUrl.slice(0, -9);
  } else if (supabaseUrl.endsWith("/rest/v1")) {
    supabaseUrl = supabaseUrl.slice(0, -8);
  }
  if (supabaseUrl.endsWith("/")) {
    supabaseUrl = supabaseUrl.slice(0, -1);
  }
  document.getElementById("brand-supabase-url").value = supabaseUrl;

  const supabaseKey = document.getElementById("brand-supabase-key").value.trim();
  
  const primary = document.getElementById("color-primary").value;
  const secondary = document.getElementById("color-secondary").value;

  // Save WhatsApp settings values
  const whatsappEnabled = document.getElementById("brand-whatsapp-enabled")?.checked || false;
  const whatsappInstanceId = document.getElementById("brand-whatsapp-instance")?.value.trim() || "";
  const whatsappToken = document.getElementById("brand-whatsapp-token")?.value.trim() || "";
  const whatsappAdminNumber = document.getElementById("brand-whatsapp-test-num")?.value.trim() || "";
  const agentAccessCode = document.getElementById("agent-access-code-input")?.value.trim() || "AGENT123";

  state.branding.companyName = name;
  state.branding.currency = currency;
  state.branding.connectorType = "supabase"; // Exclusively Supabase
  state.branding.sheetsUrl = "";
  state.branding.supabaseUrl = supabaseUrl;
  state.branding.supabaseKey = supabaseKey;
  state.branding.themeColors.primary = primary;
  state.branding.themeColors.secondary = secondary;
  state.branding.themeColors.agentAccessCode = agentAccessCode;
  
  state.branding.whatsappEnabled = whatsappEnabled;
  state.branding.whatsappInstanceId = whatsappInstanceId;
  state.branding.whatsappToken = whatsappToken;
  state.branding.whatsappAdminNumber = whatsappAdminNumber;

  initSupabase();

  saveToLocalStorage();
  applyBranding();
  await writeToSheets("updateBranding", state.branding);
  
  await syncFullState();

  updateViews();
  showToast("Settings and branding updated successfully.");
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

  // Report modal controls
  document.getElementById("report-modal-close")?.addEventListener("click", () => document.getElementById("report-modal").classList.remove("open"));
  document.getElementById("report-modal-cancel")?.addEventListener("click", () => document.getElementById("report-modal").classList.remove("open"));
  
  document.getElementById("report-edit-btn")?.addEventListener("click", (e) => {
    const demoId = e.target.dataset.id;
    document.getElementById("report-modal").classList.remove("open");
    openFeedbackModal(demoId);
  });

  document.getElementById("report-print-btn")?.addEventListener("click", () => {
    const printContents = document.getElementById("report-modal-print-area").innerHTML;
    const printWindow = window.open('', '', 'height=700,width=800');
    if (!printWindow) {
      showToast("Pop-up blocker is preventing print view. Please allow pop-ups.", "warning");
      return;
    }
    printWindow.document.write('<html><head><title>Demo Class Report</title>');
    printWindow.document.write('<style>');
    printWindow.document.write(`
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
        color: #0f172a;
        background: #ffffff;
        padding: 30px;
        margin: 0;
      }
      strong { color: #000000; }
      span { display: block; margin-bottom: 4px; font-size: 13px; color: #475569; }
      p { margin: 4px 0 0 0; line-height: 1.4; font-size: 13px; }
      h2 { color: #0f172a; margin: 0; font-size: 20px; text-transform: uppercase; }
      h5 { margin: 0 0 8px 0; color: #f97316; font-size: 14px; border-bottom: 1px dashed #cbd5e1; padding-bottom: 4px; text-transform: uppercase; }
      .print-grid { display: block; width: 100%; }
      .print-col { display: inline-block; width: 48%; vertical-align: top; margin-right: 2%; box-sizing: border-box; }
      .print-box { border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px; margin-bottom: 15px; background: #f8fafc; }
      .print-status-badge { display: inline-block; padding: 3px 8px; border-radius: 4px; font-weight: bold; background: #e2e8f0; color: #0f172a; font-size: 11px; }
    `);
    printWindow.document.write('</style></head><body>');
    
    let formattedHtml = printContents;
    formattedHtml = formattedHtml.replace(/grid-template-columns:\s*1fr\s*1fr/g, '');
    formattedHtml = formattedHtml.replace(/background:\s*rgba\(255,255,255,0\.02\)/g, 'background:#f8fafc; border:1px solid #e2e8f0; color:#0f172a;');
    formattedHtml = formattedHtml.replace(/color:\s*var\(--text-main\)/g, 'color:#000000;');
    
    printWindow.document.write(formattedHtml);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  });

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

    tutor.availability = availability;

    saveToLocalStorage();

    // Write to Sheets / Supabase
    const payload = {
      ...tutor,
      availability: JSON.stringify(availability)
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

  // Add Slot option in Settings
  const addSlotBtn = document.getElementById("add-slot-btn");
  if (addSlotBtn) {
    addSlotBtn.addEventListener("click", async () => {
      const input = document.getElementById("new-slot-input");
      const val = input.value.trim();
      if (!val) return;
      initializeBrandingLists();
      if (state.branding.themeColors.slotsList.includes(val)) {
        showToast("Slot already exists.", "warning");
        return;
      }
      state.branding.themeColors.slotsList.push(val);
      input.value = "";
      renderSettingsDropdownLists();
      await writeToSheets("updateBranding", state.branding);
      showToast("Slot added and saved.");
      renderDashboard();
    });
  }

  // Bulk add slots upload option
  const bulkFileEl = document.getElementById("bulk-slots-file");
  const bulkBtnEl = document.getElementById("bulk-slots-upload-btn");
  if (bulkBtnEl && bulkFileEl) {
    bulkBtnEl.addEventListener("click", () => bulkFileEl.click());
    bulkFileEl.addEventListener("change", (e) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = async (evt) => {
        const text = evt.target.result;
        if (!text) {
          showToast("Empty file.", "warning");
          return;
        }

        let rawLines = [];
        if (file.name.endsWith(".csv")) {
          rawLines = text.split(/[\r\n,]+/);
        } else {
          rawLines = text.split(/[\r\n]+/);
        }

        initializeBrandingLists();
        let addedCount = 0;
        rawLines.forEach(line => {
          const slotVal = line.trim();
          if (slotVal && !state.branding.themeColors.slotsList.includes(slotVal)) {
            const lowerVal = slotVal.toLowerCase();
            if (lowerVal !== "slot" && lowerVal !== "slots" && lowerVal !== "name") {
              state.branding.themeColors.slotsList.push(slotVal);
              addedCount++;
            }
          }
        });

        bulkFileEl.value = ""; // reset

        if (addedCount > 0) {
          renderSettingsDropdownLists();
          await writeToSheets("updateBranding", state.branding);
          showToast(`Successfully added ${addedCount} slots in bulk.`, "success");
          renderDashboard();
        } else {
          showToast("No new unique slots found in file.", "warning");
        }
      };
      reader.onerror = () => showToast("Error reading file.", "error");
      reader.readAsText(file);
    });
  }

  // Add Sales representative option in Settings
  const addAgentBtn = document.getElementById("add-sales-btn");
  if (addAgentBtn) {
    addAgentBtn.addEventListener("click", async () => {
      const input = document.getElementById("new-sales-input");
      const codeInput = document.getElementById("new-sales-code-input");
      const val = input.value.trim();
      const codeVal = codeInput ? codeInput.value.trim() : "";
      
      if (!val) return;
      initializeBrandingLists();
      
      const exists = state.branding.themeColors.agentsList.some(a => {
        const name = (typeof a === "object" && a !== null) ? a.name : a;
        return name.toLowerCase() === val.toLowerCase();
      });
      
      if (exists) {
        showToast("Sales representative already exists.", "warning");
        return;
      }
      
      state.branding.themeColors.agentsList.push({
        name: val,
        accessCode: codeVal || "AGENT123"
      });
      
      input.value = "";
      if (codeInput) codeInput.value = "";
      
      renderSettingsDropdownLists();
      await writeToSheets("updateBranding", state.branding);
      showToast("Sales representative added and saved.");
      renderDashboard();
    });
  }

  // Add new Slot Link setting
  const addNewSlotLinkBtn = document.getElementById("add-new-slot-link-btn");
  if (addNewSlotLinkBtn) {
    addNewSlotLinkBtn.addEventListener("click", async () => {
      initializeBrandingLists();
      const newId = `slot_${Date.now()}`;
      state.branding.slotLinks.push({
        id: newId,
        name: `Slot ${state.branding.slotLinks.length + 1}`,
        link: "https://eighttimeseight.onlineclass.site/join"
      });
      // Synchronize compatibility list
      state.branding.themeColors.slotsList = state.branding.slotLinks.map(s => s.name);

      renderSlotLinksSettingsTable();
      renderSettingsDropdownLists();
      await writeToSheets("updateBranding", state.branding);
      saveToLocalStorage();
      renderDashboard();
      showToast("New slot link added.");
    });
  }

  // Unified Database Connection Tester
  // Unified Database Connection Tester (Supabase Exclusive)
  const testConnectionBtn = document.getElementById("test-connection-btn");
  if (testConnectionBtn) {
    testConnectionBtn.addEventListener("click", async () => {
      const statusMsg = document.getElementById("connection-status-msg");
      if (!statusMsg) return;

      let urlInput = document.getElementById("brand-supabase-url").value.trim();
      // Strip trailing /rest/v1/ or /rest/v1 if present in Supabase URL
      if (urlInput.endsWith("/rest/v1/")) {
        urlInput = urlInput.slice(0, -9);
      } else if (urlInput.endsWith("/rest/v1")) {
        urlInput = urlInput.slice(0, -8);
      }
      if (urlInput.endsWith("/")) {
        urlInput = urlInput.slice(0, -1);
      }
      document.getElementById("brand-supabase-url").value = urlInput;

      const keyInput = document.getElementById("brand-supabase-key").value.trim();
      
      if (!urlInput || !keyInput) {
        statusMsg.style.color = "#dc2626"; // red
        statusMsg.textContent = "⚠️ Enter Supabase URL and public anon key first.";
        return;
      }

      // Validate URL format for Supabase Project URL
      if (!urlInput.startsWith("http://") && !urlInput.startsWith("https://")) {
        statusMsg.style.color = "#dc2626"; // red
        statusMsg.textContent = "⚠️ Invalid URL: Supabase Project URL must start with http:// or https://";
        return;
      }

      statusMsg.style.color = "#4b5563"; // muted gray
      statusMsg.textContent = "⏳ Testing Supabase API connection...";

      try {
        const testClient = window.supabase.createClient(urlInput, keyInput);
        const { error } = await testClient.from('branding').select('id').limit(1);
        if (error) throw error;
        
        statusMsg.style.color = "#16a34a"; // green
        statusMsg.textContent = "✔️ Connected successfully! Schema verified.";
        showToast("Supabase connection verified successfully.", "success");
      } catch (err) {
        console.error("Supabase connection test failed:", err);
        statusMsg.style.color = "#dc2626"; // red
        statusMsg.textContent = `❌ Connection failed: ${err.message || "Verify your tables & credentials."}`;
      }
    });
  }

  // WhatsApp test message dispatcher
  const whatsappTestBtn = document.getElementById("whatsapp-test-btn");
  if (whatsappTestBtn) {
    whatsappTestBtn.addEventListener("click", async () => {
      const testNum = document.getElementById("brand-whatsapp-test-num")?.value.trim();
      const instanceId = document.getElementById("brand-whatsapp-instance")?.value.trim();
      const token = document.getElementById("brand-whatsapp-token")?.value.trim();

      if (!testNum || !instanceId || !token) {
        showToast("Please enter Instance ID, API Token, and Test Number.", "warning");
        return;
      }

      whatsappTestBtn.disabled = true;
      whatsappTestBtn.textContent = "Sending...";

      const oldEnabled = state.branding.whatsappEnabled;
      const oldInstance = state.branding.whatsappInstanceId;
      const oldToken = state.branding.whatsappToken;

      state.branding.whatsappEnabled = true;
      state.branding.whatsappInstanceId = instanceId;
      state.branding.whatsappToken = token;

      const success = await sendBackgroundWhatsApp(testNum, `Hello! This is a test message from your Chess Academy Demo Tracker. Connection verified successfully! ♟️✅`);

      state.branding.whatsappEnabled = oldEnabled;
      state.branding.whatsappInstanceId = oldInstance;
      state.branding.whatsappToken = oldToken;

      whatsappTestBtn.disabled = false;
      whatsappTestBtn.textContent = "Send Test";

      if (success) {
        showToast("Test WhatsApp message sent successfully!", "success");
      } else {
        showToast("Failed to send test message. Check Instance ID/Token or developer console.", "error");
      }
    });
  }

  // Copy Supabase Key Helper
  const copyKeyBtn = document.getElementById("copy-key-btn");
  if (copyKeyBtn) {
    copyKeyBtn.addEventListener("click", () => {
      const key = document.getElementById("brand-supabase-key").value.trim();
      if (!key) {
        showToast("Enter or save a Supabase key first.", "warning");
        return;
      }
      navigator.clipboard.writeText(key).then(() => {
        showToast("Supabase Key copied to clipboard! Paste it into mockData.js.", "success");
      }).catch(() => {
        // Fallback for systems blocking navigator.clipboard
        const textarea = document.createElement("textarea");
        textarea.value = key;
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          showToast("Supabase Key copied to clipboard! Paste it into mockData.js.", "success");
        } catch (e) {
          showToast("Failed to copy. Double-click the field to copy manually.", "warning");
        }
        document.body.removeChild(textarea);
      });
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
      populateTutorDropdowns();

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
  document.addEventListener("click", async (e) => {
    const target = e.target;

    if (target.classList.contains("edit-slab-btn-el")) openSlabModal(target.dataset.id);
    if (target.classList.contains("delete-slab-btn-el")) deleteSlab(target.dataset.id);
    
    if (target.classList.contains("edit-tutor-btn-el")) openTutorModal(target.dataset.id);
    if (target.classList.contains("delete-tutor-btn-el")) deleteTutor(target.dataset.id);

    if (target.classList.contains("edit-demo-btn-el")) openDemoModal(target.dataset.id);
    if (target.classList.contains("delete-demo-btn-el")) deleteDemo(target.dataset.id);
    if (target.classList.contains("share-demo-btn-el")) sendDemoInvite(target.dataset.id);
    if (target.classList.contains("edit-slot-btn-el")) openSlotModal(target.dataset.id);
    if (target.classList.contains("reminder-demo-btn-el") || target.classList.contains("tutor-remind-btn")) {
      openReminderModal(target.dataset.id);
    }
    if (target.classList.contains("claim-demo-btn")) {
      claimDemo(target.dataset.id);
    }

    if (target.classList.contains("row-move-up-btn")) {
      e.preventDefault();
      moveDemoRow(target.dataset.id, "up");
    }
    if (target.classList.contains("row-move-down-btn")) {
      e.preventDefault();
      moveDemoRow(target.dataset.id, "down");
    }

    // AM/PM Toggle (AM <-> PM)
    if (target.classList.contains("ampm-toggle-btn")) {
      e.preventDefault();
      const id = target.dataset.id;
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        const currentTime = state.demos[idx].time || "";
        const currentAmpm = getAmpmSuffix(currentTime);
        const newAmpm = currentAmpm === "AM" ? "PM" : "AM";
        
        let newTime = currentTime;
        if (currentTime.toLowerCase().includes("am") || currentTime.toLowerCase().includes("pm")) {
          newTime = currentTime.replace(/am/i, newAmpm).replace(/pm/i, newAmpm);
        } else {
          const zone = getTimezoneSuffix(currentTime);
          const cleanTime = currentTime.replace(/ist/i, "").replace(/gmt/i, "").trim();
          newTime = `${cleanTime} ${newAmpm} ${zone}`;
        }
        
        state.demos[idx].time = newTime;
        writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast(`Time toggled to ${newAmpm}.`);
      }
    }
    // Timezone Toggle (IST <-> GMT)
    else if (target.classList.contains("timezone-toggle-btn")) {
      e.preventDefault();
      const id = target.dataset.id;
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        const currentTime = state.demos[idx].time || "";
        const currentZone = getTimezoneSuffix(currentTime);
        const newZone = currentZone === "IST" ? "GMT" : "IST";
        
        let newTime = currentTime;
        if (currentTime.toLowerCase().includes("ist") || currentTime.toLowerCase().includes("gmt")) {
          newTime = currentTime.replace(/ist/i, newZone).replace(/gmt/i, newZone);
        } else {
          newTime = currentTime ? `${currentTime} ${newZone}` : "";
        }
        
        state.demos[idx].time = newTime;
        writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast(`Timezone toggled to ${newZone}.`);
      }
    }

    // Delete custom Slot option
    if (target.classList.contains("delete-slot-option-btn")) {
      e.preventDefault();
      const slotVal = target.dataset.slot;
      initializeBrandingLists();
      state.branding.themeColors.slotsList = state.branding.themeColors.slotsList.filter(s => s !== slotVal);
      renderSettingsDropdownLists();
      writeToSheets("updateBranding", state.branding);
      showToast("Slot removed and saved.");
      renderDashboard();
    }

    // Delete custom Sales representative option
    if (target.classList.contains("delete-agent-option-btn")) {
      e.preventDefault();
      const agentVal = target.dataset.agent;
      initializeBrandingLists();
      state.branding.themeColors.agentsList = state.branding.themeColors.agentsList.filter(a => {
        const name = (typeof a === "object" && a !== null) ? a.name : a;
        return name !== agentVal;
      });
      renderSettingsDropdownLists();
      await writeToSheets("updateBranding", state.branding);
      showToast("Sales representative removed and saved.");
      renderDashboard();
    }

    // Delete Custom Slot Link setting
    if (target.classList.contains("delete-slot-link-setting-btn")) {
      e.preventDefault();
      const id = target.dataset.id;
      if (confirm("Are you sure you want to delete this slot and its link?")) {
        initializeBrandingLists();
        state.branding.slotLinks = state.branding.slotLinks.filter(s => s.id !== id);
        state.branding.themeColors.slotsList = state.branding.slotLinks.map(s => s.name);

        renderSlotLinksSettingsTable();
        renderSettingsDropdownLists();
        writeToSheets("updateBranding", state.branding);
        saveToLocalStorage();
        renderDashboard();
        showToast("Slot configuration deleted.");
      }
    }

    const feedbackBtn = target.closest(".edit-feedback-btn");
    if (feedbackBtn) {
      if (isTutorPage) {
        openFeedbackModal(feedbackBtn.dataset.id);
      } else {
        openReportModal(feedbackBtn.dataset.id);
      }
    }

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

  // Table status and inline dropdown update dispatches
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

    // Inline Tutor Select
    if (target.classList.contains("inline-tutor-select")) {
      const id = target.dataset.id;
      const tutorId = target.value;
      const tutor = state.tutors.find(t => t.id === tutorId);
      const tutorName = tutor ? tutor.name : "Unassigned";

      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].tutorId = tutorId;
        state.demos[idx].tutorid = tutorId;
        state.demos[idx].tutorName = tutorName;
        state.demos[idx].tutorname = tutorName;
        
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast("Assigned tutor updated.");
      }
    }

    // Inline Slot Select
    if (target.classList.contains("inline-slot-select")) {
      const id = target.dataset.id;
      const slot = target.value;

      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].slot = slot;
        
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        
        // Dynamically update the Zoom link icon href next to the select without repainting
        const parent = target.parentElement;
        if (parent) {
          const anchor = parent.querySelector("a");
          if (anchor) {
            anchor.href = getZoomLinkForSlot(slot);
          }
        }
        
        renderDashboard();
        showToast("Demo slot updated.");
      }
    }

    // Inline Sales Select
    if (target.classList.contains("inline-agent-select")) {
      const id = target.dataset.id;
      const agentName = target.value;

      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].agentName = agentName;
        state.demos[idx].agentname = agentName;
        
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast("Sales name updated.");
      }
    }

    // Inline Date Input
    if (target.classList.contains("inline-date-input")) {
      const id = target.dataset.id;
      const date = target.value;
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].date = date;
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast("Date updated.");
      }
    }

    // Inline Time Input Change (24-hour clock)
    if (target.classList.contains("inline-time-input")) {
      const id = target.dataset.id;
      const time24 = target.value;
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        const currentSuffix = getTimezoneSuffix(state.demos[idx].time);
        const formatted = formatTimeForDatabase(time24, currentSuffix);
        state.demos[idx].time = formatted;
        
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast("Time updated.");
      }
    }

    // Inline Student Input
    if (target.classList.contains("inline-student-input")) {
      const id = target.dataset.id;
      const studentName = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].studentName = studentName;
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        renderDashboard();
        showToast("Student name updated.");
      }
    }

    // Inline Age Input
    if (target.classList.contains("inline-age-input")) {
      const id = target.dataset.id;
      const age = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].age = age || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Student age updated.");
      }
    }

    // Inline Language Input
    if (target.classList.contains("inline-language-input")) {
      const id = target.dataset.id;
      const language = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].language = language || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Language updated.");
      }
    }

    // Inline Location Input
    if (target.classList.contains("inline-location-input")) {
      const id = target.dataset.id;
      const location = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].location = location || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Location updated.");
      }
    }

    // Inline Mobile Input
    if (target.classList.contains("inline-mobile-input")) {
      const id = target.dataset.id;
      const mobileNumber = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].mobileNumber = mobileNumber || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Mobile number updated.");
      }
    }

    // Inline Level Input
    if (target.classList.contains("inline-level-input")) {
      const id = target.dataset.id;
      const level = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].level = level || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Level updated.");
      }
    }

    // Inline Feedback Input
    if (target.classList.contains("inline-feedback-input")) {
      const id = target.dataset.id;
      const feedback = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].feedback = feedback || "";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Feedback updated.");
      }
    }

    // Inline Revision Input
    if (target.classList.contains("inline-revision-input")) {
      const id = target.dataset.id;
      const revision = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].revision = revision || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Revision updated.");
      }
    }

    // Inline Topic Input
    if (target.classList.contains("inline-topic-input")) {
      const id = target.dataset.id;
      const topicToStart = target.value.trim();
      const idx = state.demos.findIndex(d => d.id === id);
      if (idx !== -1) {
        state.demos[idx].topicToStart = topicToStart || "-";
        await writeToSheets("updateDemo", state.demos[idx]);
        saveToLocalStorage();
        showToast("Topic to start updated.");
      }
    }

    // Custom Slot Settings Name Input
    if (target.classList.contains("slot-setting-name-input")) {
      const id = target.dataset.id;
      const val = target.value.trim();
      if (!val) return;
      initializeBrandingLists();
      const found = state.branding.slotLinks.find(s => s.id === id);
      if (found) {
        found.name = val;
        state.branding.themeColors.slotsList = state.branding.slotLinks.map(s => s.name);
        
        writeToSheets("updateBranding", state.branding);
        saveToLocalStorage();
        renderDashboard();
        showToast("Slot name updated.");
      }
    }

    // Custom Slot Settings Link Input
    if (target.classList.contains("slot-setting-link-input")) {
      const id = target.dataset.id;
      const val = target.value.trim();
      initializeBrandingLists();
      const found = state.branding.slotLinks.find(s => s.id === id);
      if (found) {
        found.link = val;
        writeToSheets("updateBranding", state.branding);
        saveToLocalStorage();
        renderDashboard();
        showToast("Slot link updated.");
      }
    }

    // Custom Slot Settings Teacher Link Input
    if (target.classList.contains("slot-setting-teacher-link-input")) {
      const id = target.dataset.id;
      const val = target.value.trim();
      initializeBrandingLists();
      const found = state.branding.slotLinks.find(s => s.id === id);
      if (found) {
        found.teacherLink = val;
        writeToSheets("updateBranding", state.branding);
        saveToLocalStorage();
        renderDashboard();
        showToast("Teacher slot link updated.");
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
        
        // 1. Delete from Sheets / Supabase in bulk
        const connector = state.branding.connectorType || "sheets";
        if (connector === "supabase") {
          if (!supabaseClient) {
            initSupabase();
          }
          if (supabaseClient) {
            const { error } = await supabaseClient.from('demos').delete().in('id', deletedIds);
            if (error) {
              console.error("Bulk delete failed in Supabase:", error);
              showToast("Failed to delete from Supabase.", "danger");
              return;
            }
          }
        } else if (state.branding.sheetsUrl) {
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

  const templateBtn = document.getElementById("download-template-btn");
  if (templateBtn) {
    templateBtn.addEventListener("click", downloadDemoImportTemplate);
  }
}

function downloadDemoImportTemplate() {
  const headers = [
    "Date",
    "Time",
    "Slot",
    "Tutor Name",
    "Student Name",
    "Status",
    "Age",
    "Language",
    "Sales Name",
    "Location",
    "Mobile Number",
    "Level"
  ];
  
  const sampleRow = [
    "2026-08-14",
    "10:00 AM IST",
    "Slot 1",
    "Admin",
    "John Doe",
    "DEMO NOT DONE",
    "10",
    "English",
    "Amit",
    "New York",
    "+1234567890",
    "Beginner"
  ];

  // Prepend UTF-8 BOM for Excel compatibility
  const csvContent = "\uFEFF" + [
    headers.join(","),
    sampleRow.join(",")
  ].join("\n");
  
  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", "demo_import_template.csv");
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  showToast("Import template downloaded.");
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
    "Sales Name": d.agentName || "",
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
  // Inject premium UI styling
  const style = document.createElement("style");
  style.textContent = `
    /* Premium Table Styling */
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 0;
      margin-top: 15px;
    }
    th {
      font-size: 0.72rem !important;
      text-transform: uppercase !important;
      letter-spacing: 0.05em !important;
      color: var(--text-muted) !important;
      font-weight: 700 !important;
      padding: 12px 14px !important;
      border-bottom: 2px solid rgba(255, 255, 255, 0.06) !important;
      background-color: rgba(255, 255, 255, 0.01) !important;
    }
    td {
      padding: 10px 12px !important;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03) !important;
      vertical-align: middle !important;
    }
    tr {
      transition: background-color 0.15s ease-in-out;
    }
    tr:hover {
      background-color: rgba(255, 255, 255, 0.02) !important;
    }
    
    /* Elegant Form Controls */
    input[type="text"],
    input[type="number"],
    input[type="date"],
    input[type="time"],
    select {
      background: rgba(255, 255, 255, 0.02) !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 8px !important;
      color: var(--text-main) !important;
      padding: 6px 12px !important;
      font-size: 0.85rem !important;
      font-family: var(--font-main) !important;
      outline: none !important;
      transition: border-color 0.2s ease, box-shadow 0.2s ease, background-color 0.2s ease !important;
    }
    input[type="text"]:focus,
    input[type="number"]:focus,
    input[type="date"]:focus,
    input[type="time"]:focus,
    select:focus {
      border-color: var(--brand-secondary) !important;
      background: rgba(255, 255, 255, 0.04) !important;
      box-shadow: 0 0 0 2px rgba(224, 122, 95, 0.15) !important;
    }
    
    /* Custom Dropdown Styling */
    select {
      appearance: none !important;
      -webkit-appearance: none !important;
      background-image: url("data:image/svg+xml;charset=utf-8,%3Csvg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 20 20'%3E%3Cpath stroke='%239ca3af' stroke-linecap='round' stroke-linejoin='round' stroke-width='1.5' d='m6 8 4 4 4-4'/%3E%3C/svg%3E") !important;
      background-position: right 0.5rem center !important;
      background-repeat: no-repeat !important;
      background-size: 1em !important;
      padding-right: 1.8rem !important;
    }
    
    /* Custom Checkbox Styling */
    input[type="checkbox"] {
      appearance: none !important;
      -webkit-appearance: none !important;
      width: 16px !important;
      height: 16px !important;
      border: 1.5px solid var(--border-color) !important;
      border-radius: 4px !important;
      background: transparent !important;
      outline: none !important;
      cursor: pointer !important;
      display: inline-flex !important;
      align-items: center !important;
      justify-content: center !important;
      transition: background 0.15s ease, border-color 0.15s ease !important;
    }
    input[type="checkbox"]:checked {
      background: var(--brand-secondary) !important;
      border-color: var(--brand-secondary) !important;
    }
    input[type="checkbox"]:checked::after {
      content: "✓" !important;
      color: white !important;
      font-size: 0.65rem !important;
      font-weight: bold !important;
    }
    
    /* Timezone Button Styling */
    .timezone-toggle-btn {
      padding: 4px 8px !important;
      font-size: 0.7rem !important;
      font-weight: 700 !important;
      text-transform: uppercase !important;
      border-radius: 6px !important;
      border: 1px solid var(--border-color) !important;
      background: rgba(255, 255, 255, 0.04) !important;
      color: var(--text-main) !important;
      cursor: pointer !important;
      transition: background-color 0.15s ease, border-color 0.15s ease !important;
    }
    .timezone-toggle-btn:hover {
      background: var(--brand-secondary) !important;
      border-color: var(--brand-secondary) !important;
      color: white !important;
    }
    
    /* Status Pill Base */
    .status-pill-select {
      font-weight: 700 !important;
      font-size: 0.72rem !important;
      text-transform: uppercase !important;
      letter-spacing: 0.02em !important;
      border: none !important;
      padding: 4px 24px 4px 10px !important;
      border-radius: 9999px !important;
    }
    
    @keyframes pulse {
      0% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4);
      }
      70% {
        box-shadow: 0 0 0 10px rgba(34, 197, 94, 0);
      }
      100% {
        box-shadow: 0 0 0 0 rgba(34, 197, 94, 0);
      }
    }
  `;
  document.head.appendChild(style);

  loadFromLocalStorage();
  applyBranding();
  initEventListeners();

  // Load select option dropdowns in admin layout
  populateTutorDropdowns();

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
    const allowedAdminRoles = ["admin", "sales", "demo_manager"];
    if (isAdminPage && !allowedAdminRoles.includes(state.currentUser.role)) {
      sessionStorage.removeItem("CHESS_PORTAL_SESSION");
      state.currentUser = null;
      window.location.reload();
      return;
    }

    document.getElementById("login-screen").style.display = "none";
    document.getElementById("app-container").style.display = "flex";
    syncFullState().then(() => {
      if (isTutorPage && state.currentUser) {
        const stillExists = state.tutors.some(t => t.id === state.currentUser.id);
        if (!stillExists) {
          showToast("Your tutor profile has been deleted by the admin.", "warning");
          setTimeout(() => {
            handleSignout();
          }, 1500);
          return;
        }
      }
      updateViews();
    });

    // Auto-refresh background poll (every 6 seconds) to fetch external updates
    setInterval(async () => {
      const isConnected = state.branding.connectorType === "supabase" || !!state.branding.sheetsUrl;
      if (isConnected) {
        // Skip background fetching if a modal is open or if user is active in an input field
        const openModals = document.querySelectorAll(".modal.open");
        const activeEl = document.activeElement;
        const isEditing = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA" || activeEl.tagName === "SELECT");
        if (openModals.length > 0 || isEditing) {
          return;
        }

        const updated = await fetchFromSheets();
        if (updated) {
          if (isTutorPage && state.currentUser) {
            const stillExists = state.tutors.some(t => t.id === state.currentUser.id);
            if (!stillExists) {
              showToast("Your tutor profile has been deleted by the admin.", "warning");
              setTimeout(() => {
                handleSignout();
              }, 1500);
              return;
            }
          }
          updateViews();
        }
      }
    }, 6000);
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

function openReminderModal(demoId) {
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;

  const tutor = state.tutors.find(t => t.id === demo.tutorId);
  
  let zoomLink = "";
  if (demo.slot) {
    zoomLink = typeof getTeacherZoomLinkForSlot === "function" ? getTeacherZoomLinkForSlot(demo.slot) : "";
  }
  if (!zoomLink || zoomLink.includes("onlineclass.site/home") || zoomLink.includes("onlineclass.site/join")) {
    const raw = demo.zoomLink || (tutor && tutor.zoomLink) || (typeof getZoomLinkForSlot === "function" ? getZoomLinkForSlot(demo.slot) : "");
    zoomLink = typeof formatZoomStartLink === "function" ? formatZoomStartLink(raw) : raw;
  }
  if (!zoomLink) {
    const cleanKey = (demo.slot || "").toLowerCase().replace(/\s+/g, '');
    zoomLink = `https://eighttimeseight.onlineclass.site/joinPublic/default-${cleanKey}`;
  }

  const dateStr = typeof formatDisplayDate === "function" ? formatDisplayDate(demo.date || demo.dateTime) : (demo.date || "");
  const timeStr = typeof formatDisplayTime === "function" ? formatDisplayTime(demo.time) : (demo.time || "");
  
  const msg = `Dear Parent,\n\nThis is a friendly reminder that the scheduled Demo Chess Class for ${demo.studentName || "your child"} starts in 1 hour.\n\nDATE: ${dateStr}\nTIME: ${timeStr} (IST)\nCLASS JOIN LINK:\n${zoomLink}\n\nPlease join 5 minutes early. See you there!\n\nRegards,\nTeam Eight Times Eight Chess Academy`;

  // Create backdrop
  const modalDiv = document.createElement("div");
  modalDiv.id = "dynamic-reminder-modal";
  modalDiv.className = "modal-backdrop open";
  modalDiv.style.position = "fixed";
  modalDiv.style.top = "0";
  modalDiv.style.left = "0";
  modalDiv.style.width = "100vw";
  modalDiv.style.height = "100vh";
  modalDiv.style.background = "rgba(0,0,0,0.6)";
  modalDiv.style.display = "flex";
  modalDiv.style.alignItems = "center";
  modalDiv.style.justifyContent = "center";
  modalDiv.style.padding = "20px";
  modalDiv.style.zIndex = "210000";

  modalDiv.innerHTML = `
    <div class="modal-content" style="max-width: 480px; width: 100%; text-align: left; background: #111827; color: #fff; border: 1px solid var(--border-color); border-radius: 12px; padding: 25px; box-shadow: 0 10px 30px rgba(0,0,0,0.5);">
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 15px;">
        <h4 style="margin:0; font-size:1.2rem; font-weight:700;">⏰ Send 1-Hour Reminder</h4>
        <span style="cursor:pointer; font-size:1.4rem; color:var(--text-muted);" onclick="document.getElementById('dynamic-reminder-modal').remove()">✕</span>
      </div>
      <div>
        <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:12px; margin-top: 0;">Review and send the trial class reminder to the student.</p>
        <div style="margin-bottom:15px;">
          <label style="font-size:0.75rem; font-weight:700; color:#94a3b8; display:block; margin-bottom:6px;">Recipient Phone Number</label>
          <input type="text" id="rem-phone" class="form-control" value="${demo.mobileNumber || demo.mobilenumber || ""}" style="background:#1f2937; color:#fff; border:1px solid var(--border-color); width:100%; box-sizing:border-box; padding:10px; border-radius:8px;">
        </div>
        <div style="margin-bottom:20px;">
          <label style="font-size:0.75rem; font-weight:700; color:#94a3b8; display:block; margin-bottom:6px;">Reminder Message Text</label>
          <textarea id="rem-text" class="form-control" style="background:#1f2937; color:#fff; border:1px solid var(--border-color); width:100%; box-sizing:border-box; padding:10px; border-radius:8px; height:150px; font-family:inherit; font-size:0.85rem; resize:none;">${msg}</textarea>
        </div>
      </div>
      <div style="display:flex; justify-content:flex-end; gap:8px;">
        <button type="button" class="btn" style="background:rgba(255,255,255,0.05); color:#fff; border:1px solid var(--border-color); padding:8px 16px; border-radius:8px; cursor:pointer;" onclick="document.getElementById('dynamic-reminder-modal').remove()">Cancel</button>
        <button type="button" class="btn" style="background:rgba(255,255,255,0.1); color:#fff; border:1px solid var(--border-color); padding:8px 16px; border-radius:8px; cursor:pointer;" id="btn-rem-copy">📋 Copy Message</button>
        <button type="button" class="btn btn-primary" style="background:#25d366; color:#0c0f17; font-weight:700; padding:8px 16px; border-radius:8px; border:none; cursor:pointer;" id="btn-rem-redirect">💬 Open WhatsApp</button>
      </div>
    </div>
  `;

  document.body.appendChild(modalDiv);

  // Event listeners
  document.getElementById("btn-rem-copy").addEventListener("click", () => {
    const text = document.getElementById("rem-text").value;
    navigator.clipboard.writeText(text).then(() => {
      showToast("Reminder message copied to clipboard!");
    });
  });

  document.getElementById("btn-rem-redirect").addEventListener("click", () => {
    const text = document.getElementById("rem-text").value;
    const phoneRaw = document.getElementById("rem-phone").value.trim();
    const cleanPhone = phoneRaw.replace(/[^\d+]/g, "");
    
    navigator.clipboard.writeText(text).then(() => {
      showToast("Message copied! Redirecting to WhatsApp...");
      setTimeout(() => {
        const url = `https://api.whatsapp.com/send?phone=${cleanPhone}&text=${encodeURIComponent(text)}`;
        window.open(url, "_blank");
        document.getElementById('dynamic-reminder-modal').remove();
      }, 800);
    });
  });
}

async function claimDemo(demoId) {
  const demo = state.demos.find(d => d.id === demoId);
  if (!demo) return;

  const tutor = state.tutors.find(t => t.id === state.currentUser.id);
  if (!tutor) return;

  if (confirm(`Do you want to claim the demo class for student ${demo.studentName}?`)) {
    demo.tutorId = tutor.id;
    demo.tutorName = tutor.name;
    demo.tutorid = tutor.id;
    demo.tutorname = tutor.name;

    // Save to local storage
    saveToLocalStorage();

    // Sync database
    const success = await writeToSheets("updateDemo", demo);
    if (success) {
      showToast("Demo claimed successfully!");
      updateViews();
    } else {
      showToast("Failed to claim demo on server.", "error");
    }
  }
}
