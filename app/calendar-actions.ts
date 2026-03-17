'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Calendar Analyzer using FormData and Gemini 3-Flash-Preview
 * Syncing to v1 endpoint for production stability.
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

    // Initialize with v1 endpoint stability preference if supported by SDK version
    // Otherwise the SDK defaults to v1beta for some models, but gemini-3 usually supports v1.
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Using gemini-3-flash-preview as requested for better free-tier RPM and precision
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview",
      apiVersion: "v1" // Attempt to sync to stable v1 endpoint
    });

    // Clean image data
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
    // CRITICAL: Precise error logging as requested
    console.error("Detailed GoogleGenerativeAI Error:", {
      message: error.message,
      stack: error.stack,
      status: error.status,
      statusText: error.statusText,
      errorDetails: error.errorDetails
    });
    
    return { 
      success: false, 
      error: error.message || "Unknown error during calendar analysis." 
    };
  }
}
