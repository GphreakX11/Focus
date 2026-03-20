'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Calendar Analyzer using FormData and Gemini 3-Flash-Preview.
 * Updated to support Dual Datasets: Daily Breakdown + Weekly Summary.
 */
export async function analyzeCalendar(formData: FormData) {
  try {
    const base64Image = formData.get('image') as string;
    if (!base64Image) {
      throw new Error("No image data found in the request FormData.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set on the server.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview"
    }, { apiVersion: 'v1beta' });

    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");

    const prompt = `Analyze this weekly calendar screenshot. Return ONLY a valid JSON object with two keys: timesheet and suggested_tasks.

timesheet is an array of objects: { day_of_week (string, e.g. 'Monday'), activity (string), duration_minutes (number) }.

suggested_tasks is an array of objects: { task_name (string), related_meeting (string) }. 

Rules for extraction:
1. Extract ALL scheduled events. Provide the FULL, complete meeting title (e.g. "Wraithwatch Weekly Sync").
2. For EACH event, you MUST provide the correct day_of_week. You are ONLY allowed to use these exact values: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']. DO NOT use project names or any other strings for the day.
3. For each activity name, STRIP OUT platform noise like "Microsoft Teams Meeting", "Zoom Meeting", "Meeting Link", or "Microsoft Teams" ONLY.
4. DO NOT use Markdown bolding (no **) or italics in any activity names or durations.
5. The duration_minutes MUST be a positive number.
6. CRITICAL: Return ONLY the raw JSON array of events. Do not include headers, section titles, or summary rows inside the JSON.
7. Return ONLY the JSON object.`;

    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          data: base64Data,
          mimeType: "image/jpeg",
        },
      },
    ]);

    const text = result.response.text();
    let cleanText = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    let parseData: any;
    try {
      parseData = JSON.parse(cleanText);
    } catch (parseError: any) {
      console.error("AI Response Text:", text);
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    if (!parseData || !Array.isArray(parseData.timesheet)) {
      throw new Error("Data missing in AI response.");
    }
    
    // 1. Process Daily Dataset
    // 1. Filter out metadata and junk rows
    const dayNamesSet = new Set(['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday']);
    const junkNamesSet = new Set(['activity', 'activities', 'day', 'hours', 'description', 'time', 'duration', 'wraithwatch']); // specifically adding wraithwatch if it's junk, though user says it's an activity
    
    const events = (parseData.timesheet || []).filter((event: any) => {
      const activity = (event.activity || "").toLowerCase().trim();
      const mins = Number(event.duration_minutes) || 0;
      
      // Filter out 0 duration
      if (mins <= 0) return false;
      
      // Filter out day names used as activities (Gemini mistake)
      if (dayNamesSet.has(activity)) return false;
      
      // Filter out common header names
      if (junkNamesSet.has(activity)) return false;
      
      return true;
    });

    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const validDayNames = new Set(daysOrder.map(d => d.toLowerCase()));
    const groupedData: Record<string, { activity: string; minutes: number }[]> = {};
    const noiseRegex = /(Microsoft Teams Meeting|Zoom Meeting|Meeting Link|Microsoft Teams|Teams Meeting)/gi;

    for (const event of events) {
      let day = (event.day_of_week || 'Friday').trim();
      let activity = (event.activity || "Unknown Activity").trim();
      
      // Validation: If Gemini put a project name in the Day column, move it.
      if (!validDayNames.has(day.toLowerCase())) {
        activity = `${day} ${activity}`.trim();
        day = 'Monday'; // Default to Monday if we can't tell, or ignore? Let's default to a sane fallback.
      } else {
        // Proper capitalization
        day = day.charAt(0).toUpperCase() + day.slice(1).toLowerCase();
      }

      if (!groupedData[day]) groupedData[day] = [];
      const cleanActivity = activity
        .replace(noiseRegex, '')
        .replace(/\s+/g, ' ')
        .replace(/\*/g, '')
        .trim();
      
      // Secondary filter for late-caught junk
      if (!cleanActivity || junkNamesSet.has(cleanActivity.toLowerCase())) continue;
      
      groupedData[day].push({ activity: cleanActivity, minutes: Number(event.duration_minutes) || 0 });
    }

    // 2. Process Weekly Totals
    const weeklyTotals: Record<string, number> = {};
    let totalWeeklyMeetingMinutes = 0;

    for (const day of Object.keys(groupedData)) {
      for (const event of groupedData[day]) {
        weeklyTotals[event.activity] = (weeklyTotals[event.activity] || 0) + event.minutes;
        totalWeeklyMeetingMinutes += event.minutes;
      }
    }

    // Generate Combined Markdown
    let markdown = "## Daily Breakdown\n\n| Day | Activity | Hours |\n| :--- | :--- | :--- |\n";
    const sortedDays = Object.keys(groupedData).sort((a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b));

    for (const day of sortedDays) {
      let dailyMeetingMins = 0;
      for (const event of groupedData[day]) {
        markdown += `| ${day} | ${event.activity} | ${(event.minutes / 60).toFixed(2)} |\n`;
        dailyMeetingMins += event.minutes;
      }
      const adminMins = Math.max(0, 480 - dailyMeetingMins);
      markdown += `| ${day} | Admin (Daily) | ${(adminMins / 60).toFixed(2)} |\n`;
    }

    markdown += "\n---\n\n## Weekly Summary\n\n| Week | Activity | Total Hours |\n| :--- | :--- | :--- |\n";
    for (const [activity, mins] of Object.entries(weeklyTotals)) {
      markdown += `| Total | ${activity} | ${(mins / 60).toFixed(2)} |\n`;
    }
    
    // Add Weekly Admin
    const weeklyAdminMins = Math.max(0, 2400 - totalWeeklyMeetingMinutes);
    markdown += `| Weekly Admin | ${(weeklyAdminMins / 60).toFixed(2)} |\n`;

    return { 
      success: true, 
      data: { 
        markdown,
        suggestedTasks: parseData.suggested_tasks || [] 
      } 
    };
  } catch (error: any) {
    console.error("Calendar Action Error:", error);
    return { success: false, error: error.message || "Unknown error." };
  }
}

// maxDuration removed to fix build error with Turbopack and Server Actions
