// mockData.js

const DEFAULT_BRANDING = {
  companyName: "EIGHT TIMES EIGHT CHESS ACADEMY",
  companyLogo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px; color: var(--brand-primary);"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  logoUrl: "", // For image URL customization
  currency: "₹",
  connectorType: "sheets", // "sheets" or "supabase"
  sheetsUrl: "", // Google Apps Script Web App URL
  supabaseUrl: "", // Supabase Project URL
  supabaseKey: "", // Supabase public anon API key
  themeColors: {
    primary: "#111827", // Dark Gray/Black from screenshots
    secondary: "#e07a5f", // Peach/Accent color
    background: "#f9fafb", // Off-white background
    surface: "#ffffff", // Pure white for cards/sidebar
    cardBg: "#f3f4f6", // Very light grey
    textMain: "#111827", // Near black
    textMuted: "#6b7280" // Muted gray
  }
};

const DEFAULT_SLABS = [
  {
    id: "slab_1",
    minDemos: 25,
    minConversion: 35,
    rate: 300,
    enabled: true
  },
  {
    id: "slab_2",
    minDemos: 30,
    minConversion: 40,
    rate: 350,
    enabled: true
  },
  {
    id: "slab_3",
    minDemos: 35,
    minConversion: 45,
    rate: 400,
    enabled: true
  }
];

// Start with default fallback tutors list so calendar is populated even if sheets connection is failing
const DEFAULT_TUTORS = [
  {
    id: "tutor_1",
    name: "Rahul Sharma",
    email: "rahul@example.com",
    accessCode: "RAHUL2026",
    languages: "English, Hindi",
    availability: ["mon_slot_0", "mon_slot_1", "mon_slot_2", "mon_slot_3", "tue_slot_4", "tue_slot_5", "tue_slot_6", "wed_slot_0", "wed_slot_1", "thu_slot_2", "thu_slot_3", "fri_slot_4", "fri_slot_5", "sat_slot_6", "sat_slot_7", "sun_slot_8"],
    zoomLink: "https://zoom.us/j/rahul-meeting"
  },
  {
    id: "tutor_2",
    name: "Gopakumar",
    email: "gopakumar@example.com",
    accessCode: "GOPA2026",
    languages: "English, Malayalam",
    availability: ["mon_slot_0", "mon_slot_2", "tue_slot_5", "wed_slot_1", "thu_slot_3", "fri_slot_5", "sat_slot_7", "sun_slot_9"],
    zoomLink: "https://zoom.us/j/gopa-meeting"
  }
];
const DEFAULT_DEMOS = [];

const ADMIN_ACCESS_CODE = "ADMIN123";

// Mock historical stats (starts empty)
const HISTORICAL_STATS = {};

// Bind to window object
window.DEFAULT_BRANDING = DEFAULT_BRANDING;
window.DEFAULT_SLABS = DEFAULT_SLABS;
window.DEFAULT_TUTORS = DEFAULT_TUTORS;
window.DEFAULT_DEMOS = DEFAULT_DEMOS;
window.HISTORICAL_STATS = HISTORICAL_STATS;
window.ADMIN_ACCESS_CODE = ADMIN_ACCESS_CODE;
