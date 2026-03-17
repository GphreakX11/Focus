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
    });

    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");

    const prompt = `Analyze this weekly calendar screenshot. Return ONLY a valid JSON object with two keys: timesheet and suggested_tasks.

timesheet is an array of objects: { day_of_week (string, e.g. 'Monday'), activity (string), duration_minutes (number) }.

suggested_tasks is an array of objects: { task_name (string), related_meeting (string) }. 

Rules for extraction:
1. Extract ALL scheduled events. Provide the FULL, complete meeting title (e.g. "Wraithwatch Weekly Sync" instead of just "Wraithw").
2. For each activity name, STRIP OUT platform noise like "Microsoft Teams Meeting", "Zoom Meeting", "Meeting Link", or "Microsoft Teams" ONLY. Do not strip actual project names or meeting topics.
3. DO NOT use Markdown bolding (no **) or italics in any activity names or durations.
4. The duration_minutes MUST be a number representing the meeting length. Do not put text in this field.
5. For each meeting, ensure you provide the correct day_of_week based on the visual layout.
6. Return ONLY the JSON object.`;

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

    const events = parseData.timesheet;
    
    // 1. Process Daily Dataset
    const daysOrder = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
    const groupedData: Record<string, { activity: string; minutes: number }[]> = {};

    for (const event of events) {
      const day = event.day_of_week || 'Unknown';
      if (!groupedData[day]) groupedData[day] = [];
      groupedData[day].push({ 
        activity: event.activity, 
        minutes: event.duration_minutes || 0 
      });
    }

    // 2. Process Weekly Totals
    const weeklyTotals: Record<string, number> = {};
    let totalWeeklyMeetingMinutes = 0;

    const noiseRegex = /(Microsoft Teams Meeting|Zoom Meeting|Meeting Link|Microsoft Teams|Teams Meeting)/gi;

    for (const event of events) {
      const activity = (event.activity || "Unknown Activity")
        .replace(noiseRegex, '')
        .replace(/\s+/g, ' ')
        .replace(/\*/g, '')
        .trim();
      const mins = Number(event.duration_minutes) || 0;
      weeklyTotals[activity] = (weeklyTotals[activity] || 0) + mins;
      totalWeeklyMeetingMinutes += mins;
    }

    // Generate Combined Markdown
    let markdown = "## Daily Breakdown\n\n| Day | Activity | Hours |\n| :--- | :--- | :--- |\n";
    const sortedDays = Object.keys(groupedData).sort((a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b));

    for (const day of sortedDays) {
      let dailyMeetingMins = 0;
      for (const event of groupedData[day]) {
        const cleanActivity = event.activity.replace(noiseRegex, '').replace(/\s+/g, ' ').trim();
        markdown += `| ${day} | ${cleanActivity} | ${(event.minutes / 60).toFixed(2)} |\n`;
        dailyMeetingMins += event.minutes;
      }
      const adminMins = Math.max(0, 480 - dailyMeetingMins);
      markdown += `| ${day} | Admin (Daily) | ${(adminMins / 60).toFixed(2)} |\n`;
    }

    markdown += "\n---\n\n## Weekly Summary\n\n| Activity | Total Hours |\n| :--- | :--- |\n";
    for (const [activity, mins] of Object.entries(weeklyTotals)) {
      markdown += `| ${activity} | ${(mins / 60).toFixed(2)} |\n`;
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
