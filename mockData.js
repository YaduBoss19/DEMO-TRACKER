// mockData.js

const DEFAULT_BRANDING = {
  companyName: "EIGHT TIMES EIGHT CHESS ACADEMY",
  companyLogo: `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 32px; height: 32px; color: var(--brand-primary);"><rect x="3" y="3" width="18" height="18" rx="2" stroke-width="2"/><path d="M9 3v18"/><path d="M15 3v18"/><path d="M3 9h18"/><path d="M3 15h18"/></svg>`,
  logoUrl: "logo.png", // For image URL customization
  currency: "₹",
  connectorType: "supabase", // "sheets" or "supabase"
  sheetsUrl: "", // Google Apps Script Web App URL
  supabaseUrl: "https://qxhhwkucbkwwblriygbs.supabase.co", // Supabase Project URL
  supabaseKey: "PASTE_YOUR_LONG_SUPABASE_ANON_KEY_HERE", // Supabase public anon API key
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
const DEFAULT_DEMOS = [
  {
    id: "demo_1",
    tutorId: "tutor_1",
    tutorName: "Yadu",
    studentName: "Advik",
    date: "2026-08-12",
    time: "11:30 AM IST",
    dateTime: "2026-08-12 11:30 AM IST",
    slot: "Slot 12",
    status: "DEMO DONE",
    age: "7",
    language: "Malayalam",
    agentName: "Rajesh",
    location: "Kochi",
    mobileNumber: "+91 98765 43210",
    level: "Beginner",
    feedback: "Active child, needs patience. Understands how rook and bishop move.",
    revision: "Yes",
    topicToStart: "Basics"
  },
  {
    id: "demo_2",
    tutorId: "tutor_2",
    tutorName: "Kabir",
    studentName: "Zara",
    date: "2026-08-11",
    time: "1:00 PM IST",
    dateTime: "2026-08-11 1:00 PM IST",
    slot: "Slot 15",
    status: "CONVERTED",
    age: "9",
    language: "English",
    agentName: "Meera",
    location: "Bangalore",
    mobileNumber: "+91 99887 76655",
    level: "Intermediate",
    feedback: "Very sharp, already knows basic checkmates and forks. Can start with tactics.",
    revision: "No",
    topicToStart: "Tactics"
  },
  {
    id: "demo_3",
    tutorId: "tutor_1",
    tutorName: "Yadu",
    studentName: "Reyansh",
    date: "2026-08-12",
    time: "12:00 PM IST",
    dateTime: "2026-08-12 12:00 PM IST",
    slot: "Slot 13",
    status: "DEMO NOT DONE",
    age: "8",
    language: "Hindi",
    agentName: "Amit",
    location: "Delhi",
    mobileNumber: "+91 98989 89898",
    level: "Beginner",
    feedback: "",
    revision: "-",
    topicToStart: "-"
  },
  {
    id: "demo_4",
    tutorId: "tutor_3",
    tutorName: "Anjali",
    studentName: "Aanya",
    date: "2026-08-13",
    time: "11:30 AM IST",
    dateTime: "2026-08-13 11:30 AM IST",
    slot: "Slot 12",
    status: "DEMO DONE",
    age: "10",
    language: "Tamil",
    agentName: "Sarah",
    location: "Chennai",
    mobileNumber: "+91 88776 65544",
    level: "Beginner",
    feedback: "Good focus. Recommended starting with opening principles next class.",
    revision: "Yes",
    topicToStart: "Openings"
  },
  {
    id: "demo_5",
    tutorId: "tutor_4",
    tutorName: "Vikram",
    studentName: "Vivaan",
    date: "2026-08-14",
    time: "12:30 PM IST",
    dateTime: "2026-08-14 12:30 PM IST",
    slot: "Slot 14",
    status: "RESCHEDULE",
    age: "6",
    language: "Kannada",
    agentName: "John",
    location: "Mysore",
    mobileNumber: "+91 77665 54433",
    level: "Beginner",
    feedback: "Parent requested reschedule due to internet issues.",
    revision: "-",
    topicToStart: "-"
  },
  {
    id: "demo_6",
    tutorId: "tutor_5",
    tutorName: "Siddharth",
    studentName: "Diya",
    date: "2026-08-15",
    time: "11:30 AM IST",
    dateTime: "2026-08-15 11:30 AM IST",
    slot: "Slot 12",
    status: "DEMO DONE",
    age: "11",
    language: "English",
    agentName: "Rajesh",
    location: "Mumbai",
    mobileNumber: "+91 99009 90099",
    level: "Intermediate",
    feedback: "Knows basic coordinates, needs guidance on middlegame planning.",
    revision: "No",
    topicToStart: "Middlegames"
  },
  {
    id: "demo_7",
    tutorId: "Unassigned",
    tutorName: "Unassigned",
    studentName: "Aarav",
    date: "2026-08-16",
    time: "1:30 PM IST",
    dateTime: "2026-08-16 1:30 PM IST",
    slot: "Slot 16",
    status: "DEMO NOT DONE",
    age: "9",
    language: "English",
    agentName: "Meera",
    location: "Pune",
    mobileNumber: "+91 91234 56789",
    level: "Beginner",
    feedback: "",
    revision: "-",
    topicToStart: "-"
  },
  {
    id: "demo_8",
    tutorId: "tutor_2",
    tutorName: "Kabir",
    studentName: "Ira",
    date: "2026-08-11",
    time: "1:30 PM IST",
    dateTime: "2026-08-11 1:30 PM IST",
    slot: "Slot 16",
    status: "CANCELLED",
    age: "8",
    language: "Hindi",
    agentName: "Amit",
    location: "Delhi",
    mobileNumber: "+91 92345 67890",
    level: "Beginner",
    feedback: "Cancelled by admin as parent was unreachable.",
    revision: "-",
    topicToStart: "-"
  },
  {
    id: "demo_9",
    tutorId: "tutor_3",
    tutorName: "Anjali",
    studentName: "Karan",
    date: "2026-08-13",
    time: "12:00 PM IST",
    dateTime: "2026-08-13 12:00 PM IST",
    slot: "Slot 13",
    status: "DEMO NOT DONE",
    age: "12",
    language: "English",
    agentName: "Sarah",
    location: "Kolkata",
    mobileNumber: "+91 93456 78901",
    level: "Intermediate",
    feedback: "",
    revision: "-",
    topicToStart: "-"
  },
  {
    id: "demo_10",
    tutorId: "tutor_1",
    tutorName: "Yadu",
    studentName: "Nikhil",
    date: "2026-08-12",
    time: "11:30 AM IST",
    dateTime: "2026-08-12 11:30 AM IST",
    slot: "Slot 12",
    status: "CONVERTED",
    age: "8",
    language: "Malayalam",
    agentName: "Rajesh",
    location: "Kochi",
    mobileNumber: "+91 94567 89012",
    level: "Advanced",
    feedback: "Rated player, knows endgame tactics. Very high potential.",
    revision: "No",
    topicToStart: "Endgames"
  }
];

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
