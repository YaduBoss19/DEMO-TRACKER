// mockData.js

const DEFAULT_BRANDING = {
  companyName: "EIGHT TIMES EIGHT CHESS ACADEMY",
  companyLogo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px; color: var(--brand-primary);"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  logoUrl: "logo.png", // For image URL customization
  currency: "₹",
  connectorType: "supabase", // "sheets" or "supabase"
  sheetsUrl: "", // Google Apps Script Web App URL
  supabaseUrl: "https://qxhhwkucbkwwblriygbs.supabase.co", // Supabase Project URL
  supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF4aGh3a3VjYmt3d2Jscml5Z2JzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY1NTcxMTAsImV4cCI6MjEwMjEzMzExMH0.Q38DHD2QGCDF4-yxAICJTRTq9LmC0JCPx5eqQ20IXi4", // Supabase public anon API key
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

// 5 Sample Tutors with mock availability and access codes
const DEFAULT_TUTORS = [
  {
    id: "tutor_1",
    name: "Yadu",
    email: "yadu@academy.com",
    role: "tutor",
    status: "ACTIVE",
    zoomLink: "https://zoom.us/j/yadu-meeting",
    availability: ["mon-slot12", "mon-slot13", "tue-slot14", "wed-slot15", "thu-slot16"],
    accessCode: "1111",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Yadu"
  },
  {
    id: "tutor_2",
    name: "Kabir",
    email: "kabir@academy.com",
    role: "tutor",
    status: "ACTIVE",
    zoomLink: "https://zoom.us/j/kabir-meeting",
    availability: ["mon-slot15", "tue-slot16", "wed-slot12", "thu-slot13", "fri-slot14"],
    accessCode: "2222",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Kabir"
  },
  {
    id: "tutor_3",
    name: "Anjali",
    email: "anjali@academy.com",
    role: "tutor",
    status: "ACTIVE",
    zoomLink: "https://zoom.us/j/anjali-meeting",
    availability: ["tue-slot12", "wed-slot13", "thu-slot14", "fri-slot15", "sat-slot16"],
    accessCode: "3333",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Anjali"
  },
  {
    id: "tutor_4",
    name: "Vikram",
    email: "vikram@academy.com",
    role: "tutor",
    status: "ACTIVE",
    zoomLink: "https://zoom.us/j/vikram-meeting",
    availability: ["wed-slot14", "thu-slot15", "fri-slot16", "sat-slot12", "sun-slot13"],
    accessCode: "4444",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Vikram"
  },
  {
    id: "tutor_5",
    name: "Siddharth",
    email: "siddharth@academy.com",
    role: "tutor",
    status: "ACTIVE",
    zoomLink: "https://zoom.us/j/siddharth-meeting",
    availability: ["thu-slot12", "fri-slot13", "sat-slot14", "sun-slot15", "mon-slot16"],
    accessCode: "5555",
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Siddharth"
  }
];

// 10 Sample Demos with varied student information and outcomes
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
