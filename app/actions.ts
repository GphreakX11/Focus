'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

export async function analyzeCalendar(base64Image: string) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // Remove any data URL prefix if present e.g. "data:image/png;base64,"
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");

    const prompt = "Analyze this weekly calendar screenshot. Return ONLY a valid JSON object with two keys: timesheet and suggested_tasks.\n\ntimesheet is an array of objects: { day (string), activity (string), duration_minutes (number) }.\n\nsuggested_tasks is an array of objects: { task_name (string, a short, highly probable prep or follow-up action based on the meeting title), related_meeting (string) }. Only infer tasks for meetings that clearly require prep or follow-up (e.g., '1:1', 'Review', 'Planning'). Ignore generic blocks like 'Lunch' or 'Focus Time'. Do not include any text outside the JSON.";

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
    // Clean potential markdown from output (e.g. ```json\n[{...}]\n```)
    let cleanText = text.replace(/```(?:json)?/gi, "").replace(/```/g, "").trim();

    // Extract only the JSON object
    const firstBrace = cleanText.indexOf('{');
    const lastBrace = cleanText.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      cleanText = cleanText.substring(firstBrace, lastBrace + 1);
    }

    let parseData: { 
      timesheet: { day: string; activity: string; duration_minutes: number }[];
      suggested_tasks: { task_name: string; related_meeting: string }[];
    };
    try {
      parseData = JSON.parse(cleanText);
    } catch (parseError: any) {
      console.error("Failed to parse JSON:", cleanText);
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    if (!parseData || !Array.isArray(parseData.timesheet)) {
      throw new Error("AI did not return the expected timesheet array. Data missing.");
    }

    const events = parseData.timesheet;

    // Mathematical processing
    let adminPoolMinutes = 2400; // 5 days * 480 minutes
    const activityMap: Record<string, number> = {};

    for (const event of events) {
      if (typeof event.duration_minutes !== 'number' || typeof event.activity !== 'string') {
        continue; // skip invalid formats
      }

      const activity = event.activity.trim();
      const duration = event.duration_minutes;

      if (!activityMap[activity]) {
        activityMap[activity] = 0;
      }
      activityMap[activity] += duration;
      adminPoolMinutes -= duration;
    }

    const finalResults: { activity: string; hours: number }[] = [];

    // Map aggregated minutes to hours (2 decimal places)
    for (const [activity, duration] of Object.entries(activityMap)) {
      const hours = Number((duration / 60).toFixed(2));
      finalResults.push({ activity, hours });
    }

    // Add remaining admin pool to totals
    if (adminPoolMinutes > 0) {
      const adminHours = Number((adminPoolMinutes / 60).toFixed(2));
      finalResults.push({ activity: 'Admin', hours: adminHours });
    }

    // Sort by hours descending (Admin usually near top or bottom depending, we'll just sort natively)
    finalResults.sort((a, b) => b.hours - a.hours);

    return { 
      success: true, 
      data: { 
        timesheetData: finalResults, 
        suggestedTasks: parseData.suggested_tasks || [] 
      } 
    };
  } catch (error: any) {
    console.error("analyzeCalendar Error:", error);
    return { success: false, error: error.message || "An unknown error occurred." };
  }
}
