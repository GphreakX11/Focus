import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Mark the route as dynamic
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('AI API Request Body:', JSON.stringify(body, null, 2));
    
    // Support both prompt (useCompletion default) and transcript
    const prompt = body.prompt;
    const transcript = body.transcript;
    const userName = body.userName;
    
    const finalTranscript = prompt || transcript;
    
    console.log('Processed Payload:', { hasTranscript: !!finalTranscript, userName, transcriptLength: finalTranscript?.length });

    if (!finalTranscript || finalTranscript.trim().length === 0) {
      console.error('Validation Failed: Empty or missing transcript');
      return new Response('No transcript provided', { status: 400 });
    }

    console.log('API Keys Detected:', { 
      GOOGLE_GEN_AI: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GEMINI: !!process.env.GEMINI_API_KEY 
    });

    const result = await streamText({
      model: google('gemini-1.5-flash') as any,
      system: `You are a highly capable AI Meeting Assistant. The user's name is ${userName || 'the user'}. 
               Your goal is to process meeting transcripts and provide high-value insights.
               Please provide:
               1. A brief summary of the meeting.
               2. A bulleted list of Action Items specifically assigned to ${userName || 'the user'}. 
                  IMPORTANT: Prefix each distinct action item that is a standalone task with "[ACTION]". 
                  For example: "[ACTION] Send the budget report to Sarah."
               3. A list of general decisions made during the meeting.
               Keep the tone professional and concise. Use Markdown for formatting.`,
      prompt: finalTranscript,
    });

    return result.toTextStreamResponse();
  } catch (error: any) {
    console.error('AI Analysis Error:', error);
    const errorMessage = error?.message || 'Unknown error occurred';
    return new Response(`Error processing transcript: ${errorMessage}`, { status: 500 });
  }
}
