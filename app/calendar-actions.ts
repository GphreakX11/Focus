'use server';

import { GoogleGenerativeAI } from '@google/generative-ai';

/**
 * Calendar Analyzer using FormData and Gemini 3-Flash-Preview.
 * Updated to support Daily Breakdown and History generation.
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
      model: "gemini-3-flash-preview",
      apiVersion: "v1"
    });

    const base64Data = base64Image.replace(/^data:image\/(png|jpeg|webp|jpg);base64,/, "");

    // Updated prompt to include day_of_week as requested
    const prompt = `Analyze this weekly calendar screenshot. Return ONLY a valid JSON object with two keys: timesheet and suggested_tasks.

timesheet is an array of objects: { day_of_week (string, e.g. 'Monday'), activity (string), date (string), duration_minutes (number) }.

suggested_tasks is an array of objects: { task_name (string), related_meeting (string) }. 

Rules for extraction:
1. Extract ALL scheduled events.
2. For each meeting, ensure you provide the correct day_of_week.
3. Ignore generic blocks like 'Lunch' or 'Focus Time' for suggested_tasks, but INCLUDE them in timesheet if they are on the calendar.
4. Return ONLY the JSON object.`;

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
    
    // Group by Day of Week
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

    // Generate Markdown Table with Daily Breakdowns
    let markdownTable = "| Day | Activity | Hours |\n| :--- | :--- | :--- |\n";
    
    // Sort and process by day
    const sortedDays = Object.keys(groupedData).sort((a, b) => daysOrder.indexOf(a) - daysOrder.indexOf(b));

    for (const day of sortedDays) {
      const dayEvents = groupedData[day];
      let totalMeetingMinutes = 0;
      
      // Add individual activity rows for the day
      for (const event of dayEvents) {
        const hours = (event.minutes / 60).toFixed(2);
        markdownTable += `| ${day} | ${event.activity} | ${hours} |\n`;
        totalMeetingMinutes += event.minutes;
      }

      // Calculate Admin time for this specific day (8 hours baseline = 480 mins)
      const adminMinutes = Math.max(0, 480 - totalMeetingMinutes);
      const adminHours = (adminMinutes / 60).toFixed(2);
      markdownTable += `| ${day} | **Admin** | **${adminHours}** |\n`;
      
      // Add a separator line in markdown? Actually standard tables don't have separators, 
      // but we'll keep the Day column filled to make it clear.
    }

    return { 
      success: true, 
      data: { 
        markdownTable,
        suggestedTasks: parseData.suggested_tasks || [] 
      } 
    };
  } catch (error: any) {
    console.error("Detailed GoogleGenerativeAI Error:", error);
    return { 
      success: false, 
      error: error.message || "Unknown error during calendar analysis." 
    };
  }
}

// maxDuration removed to fix build error with Turbopack and Server Actions
