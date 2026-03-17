'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Calendar Analyzer using FormData to bypass payload limits.
 * Updated to use gemini-2.0-flash and strict inlineData formatting.
 */
export async function analyzeCalendar(formData: FormData) {
  try {
    const base64Image = formData.get('image') as string;
    if (!base64Image) {
      throw new Error("No image data found in the request.");
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("GEMINI_API_KEY is not set.");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    // Explicitly using gemini-2.0-flash as requested
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

    // Clean image data: remove any data URL prefix
    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");

    const prompt = "Analyze this weekly calendar screenshot. Return ONLY a valid JSON object with two keys: timesheet and suggested_tasks.\n\ntimesheet is an array of objects: { day (string), activity (string), duration_minutes (number) }.\n\nsuggested_tasks is an array of objects: { task_name (string, a short, highly probable prep or follow-up action based on the meeting title), related_meeting (string) }. Only infer tasks for meetings that clearly require prep or follow-up (e.g., '1:1', 'Review', 'Planning'). Ignore generic blocks like 'Lunch' or 'Focus Time'. Do not include any text outside the JSON.";

    // Using strictly inlineData formatting as required by specs
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
      throw new Error(`Failed to parse AI response: ${parseError.message}`);
    }

    if (!parseData || !Array.isArray(parseData.timesheet)) {
      throw new Error("Data missing in AI response.");
    }

    const events = parseData.timesheet;
    let adminPoolMinutes = 2400; 
    const activityMap: Record<string, number> = {};

    for (const event of events) {
      if (typeof event.duration_minutes !== 'number' || typeof event.activity !== 'string') continue;
      const activity = event.activity.trim();
      const duration = event.duration_minutes;
      activityMap[activity] = (activityMap[activity] || 0) + duration;
      adminPoolMinutes -= duration;
    }

    const finalResults = Object.entries(activityMap).map(([activity, duration]) => ({
      activity,
      hours: Number((duration / 60).toFixed(2))
    }));

    if (adminPoolMinutes > 0) {
      finalResults.push({ activity: 'Admin', hours: Number((adminPoolMinutes / 60).toFixed(2)) });
    }

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
    return { success: false, error: error.message || "Unknown error." };
  }
}

// Note: maxDuration removed to fix build error. Server actions imported in client 
// components cannot reliably export non-function constants.
