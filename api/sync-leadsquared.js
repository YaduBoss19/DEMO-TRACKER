const SUPABASE_URL = process.env.SUPABASE_URL || "https://qxhhwkucbkwwblriygbs.supabase.co";
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || "";

const LEADSQUARED_ACCESS_KEY = process.env.LEADSQUARED_ACCESS_KEY || "";
const LEADSQUARED_SECRET_KEY = process.env.LEADSQUARED_SECRET_KEY || "";
const LEADSQUARED_API_BASE_URL = process.env.LEADSQUARED_API_BASE_URL || "";

module.exports = async (req, res) => {
  // Set CORS headers
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === "OPTIONS") {
    return res.status(200).end();
  }

  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method Not Allowed" });
  }

  const { demoId } = req.body;
  if (!demoId) {
    return res.status(400).json({ error: "Missing demoId" });
  }

  // Determine auth header for Supabase
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
  if (!supabaseKey) {
    return res.status(500).json({ error: "Supabase credentials are not configured on server" });
  }

  try {
    // 1. Fetch Demo details from Supabase
    const dbUrl = `${SUPABASE_URL}/rest/v1/demos?id=eq.${encodeURIComponent(demoId)}`;
    const dbRes = await fetch(dbUrl, {
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`
      }
    });

    if (!dbRes.ok) {
      const errMsg = await dbRes.text();
      throw new Error(`Failed to query demo from Supabase: ${errMsg}`);
    }

    const demos = await dbRes.json();
    if (!demos || demos.length === 0) {
      return res.status(404).json({ error: "Demo record not found" });
    }

    const demo = demos[0];
    const studentName = demo.studentName || demo.studentname || "";
    const tutorName = demo.tutorName || demo.tutorname || "Unassigned";
    const date = demo.date || "";
    const time = demo.time || "";
    const slot = demo.slot || "";
    const status = demo.status || "DEMO NOT DONE";
    const feedback = demo.feedback || "";
    const revision = demo.revision || "-";
    const topicToStart = demo.topicToStart || demo.topictostart || "-";
    const rawMobile = demo.mobileNumber || demo.mobilenumber || "";

    // Clean mobile number (only keep digits and starting +)
    let cleanedMobile = rawMobile.replace(/[^\d+]/g, "").trim();

    // 2. Identify corresponding LeadSquared Lead
    let leadId = demo.leadsquared_lead_id || demo.leadsquaredLeadId || null;

    if (!leadId) {
      if (!cleanedMobile || cleanedMobile === "-" || cleanedMobile === "") {
        throw new Error("No phone number or Lead ID found to identify the lead.");
      }

      if (!LEADSQUARED_ACCESS_KEY || !LEADSQUARED_SECRET_KEY || !LEADSQUARED_API_BASE_URL) {
        throw new Error("LeadSquared credentials are not configured on server.");
      }

      // Search LeadSquared by phone number
      // Base URL cleaning
      let baseUrl = LEADSQUARED_API_BASE_URL.replace(/\/+$/, "");
      const searchUrl = `${baseUrl}/v2/LeadManagement.svc/RetrieveLeadByPhoneNumber?accessKey=${LEADSQUARED_ACCESS_KEY}&secretKey=${LEADSQUARED_SECRET_KEY}&phone=${encodeURIComponent(cleanedMobile)}`;

      const searchRes = await fetch(searchUrl, {
        method: "GET"
      });

      if (!searchRes.ok) {
        const textErr = await searchRes.text();
        throw new Error(`LeadSquared phone lookup failed: ${textErr}`);
      }

      const searchData = await searchRes.json();
      
      // Parse search response robustly
      if (searchData) {
        if (Array.isArray(searchData) && searchData.length > 0) {
          leadId = searchData[0].ProspectID || searchData[0].LeadId || searchData[0].id;
        } else if (searchData.ProspectID || searchData.LeadId || searchData.id) {
          leadId = searchData.ProspectID || searchData.LeadId || searchData.id;
        }
      }

      if (!leadId) {
        throw new Error(`Lead not found in LeadSquared for mobile number: ${cleanedMobile}`);
      }
    }

    // 3. Compose feedback data
    const summaryText = `Student Name: ${studentName}
Tutor Name: ${tutorName}
Demo Date: ${date}
Time: ${time}
Slot: ${slot}
Status: ${status}
Topic to Start: ${topicToStart}
Revision Details: ${revision}

Tutor Remarks / Notes:
${feedback || "No feedback notes entered."}`;

    // Update Lead attributes list
    const attributes = [
      { "Attribute": "mx_Tutor_Name", "Value": tutorName },
      { "Attribute": "mx_Demo_Date", "Value": date },
      { "Attribute": "mx_Demo_Status", "Value": status },
      { "Attribute": "mx_Overall_Feedback", "Value": summaryText },
      { "Attribute": "Notes", "Value": summaryText }
    ];

    // 4. Send feedback to LeadSquared
    let baseUrl = LEADSQUARED_API_BASE_URL.replace(/\/+$/, "");
    const updateUrl = `${baseUrl}/v2/LeadManagement.svc/Lead.Update?accessKey=${LEADSQUARED_ACCESS_KEY}&secretKey=${LEADSQUARED_SECRET_KEY}&leadId=${leadId}`;

    const updateRes = await fetch(updateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(attributes)
    });

    if (!updateRes.ok) {
      const textErr = await updateRes.text();
      throw new Error(`LeadSquared update request failed: ${textErr}`);
    }

    // 5. Update sync metadata in Supabase (Success)
    const updatePayload = {
      leadsquared_lead_id: leadId,
      leadsquaredLeadId: leadId,
      leadsquared_sync_status: "Sent",
      leadsquaredSyncStatus: "Sent",
      leadsquared_sync_time: new Date().toISOString(),
      leadsquaredSyncTime: new Date().toISOString(),
      leadsquared_sync_error: null,
      leadsquaredSyncError: null
    };

    const dbUpdateUrl = `${SUPABASE_URL}/rest/v1/demos?id=eq.${encodeURIComponent(demoId)}`;
    const dbUpdateRes = await fetch(dbUpdateUrl, {
      method: "PATCH",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "return=representation"
      },
      body: JSON.stringify(updatePayload)
    });

    if (!dbUpdateRes.ok) {
      const textErr = await dbUpdateRes.text();
      throw new Error(`Failed to update metadata in Supabase: ${textErr}`);
    }

    return res.status(200).json({ success: true, leadId });

  } catch (err) {
    console.error("LeadSquared Sync Error:", err.message);

    // Save Failure metadata in Supabase
    try {
      const dbUpdateUrl = `${SUPABASE_URL}/rest/v1/demos?id=eq.${encodeURIComponent(demoId)}`;
      const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || SUPABASE_ANON_KEY;
      
      if (supabaseKey) {
        await fetch(dbUpdateUrl, {
          method: "PATCH",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            leadsquared_sync_status: "Failed",
            leadsquaredSyncStatus: "Failed",
            leadsquared_sync_time: new Date().toISOString(),
            leadsquaredSyncTime: new Date().toISOString(),
            leadsquared_sync_error: err.message,
            leadsquaredSyncError: err.message
          })
        });
      }
    } catch (dbErr) {
      console.error("Failed to save error status to Supabase:", dbErr.message);
    }

    return res.status(500).json({ error: err.message });
  }
};
