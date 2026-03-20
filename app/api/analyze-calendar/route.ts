import { GoogleGenerativeAI } from '@google/generative-ai';
import { NextResponse } from 'next/server';

// Extend Vercel's default 10s timeout to 60s for the free tier.
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { base64Image } = await req.json();
    if (!base64Image) {
      return NextResponse.json({ success: false, error: "No image provided." }, { status: 400 });
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ success: false, error: "GEMINI_API_KEY is not set." }, { status: 500 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-3-flash-preview"
    }, { apiVersion: 'v1beta' });

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
      return NextResponse.json({ success: false, error: `Failed to parse AI response: ${parseError.message}` }, { status: 500 });
    }

    if (!parseData || !Array.isArray(parseData.timesheet)) {
       return NextResponse.json({ success: false, error: "AI did not return the expected timesheet array." }, { status: 500 });
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

    return NextResponse.json({ 
      success: true, 
      data: { 
        timesheetData: finalResults, 
        suggestedTasks: parseData.suggested_tasks || [] 
      } 
    });

  } catch (error: any) {
    console.error("API analyze-calendar Error:", error);
    return NextResponse.json({ success: false, error: error.message || "An unknown error occurred." }, { status: 500 });
  }
}
