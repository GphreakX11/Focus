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

    const prompt = "Analyze this weekly calendar screenshot. Extract every single scheduled event. Return ONLY a valid JSON array of objects. Each object must have: day (string, e.g., 'Monday'), activity (string, the name of the meeting), and duration_minutes (number, the exact length of the meeting in minutes). Do not include any markdown, explanation, or conversational text.";

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
    // Clean potential markdown from output
    const cleanText = text.replace(/```json/g, "").replace(/```/g, "").trim();

    let events: { day: string; activity: string; duration_minutes: number }[];
    try {
      events = JSON.parse(cleanText);
    } catch (parseError) {
      console.error("Failed to parse JSON:", cleanText);
      throw new Error("Failed to parse calendar data from AI.");
    }

    if (!Array.isArray(events)) {
      throw new Error("AI did not return an array.");
    }

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

    return { success: true, data: finalResults };
  } catch (error: any) {
    console.error("analyzeCalendar Error:", error);
    return { success: false, error: error.message || "An unknown error occurred." };
  }
}
