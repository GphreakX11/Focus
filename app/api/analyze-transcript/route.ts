import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Mark the route as dynamic
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { transcript, userName } = body;
    
    console.log('AI API Request:', { hasTranscript: !!transcript, userName });

    if (!transcript) {
      console.error('Missing transcript');
      return new Response('No transcript provided', { status: 400 });
    }

    console.log('API Keys Detected:', { 
      GOOGLE_GEN_AI: !!process.env.GOOGLE_GENERATIVE_AI_API_KEY,
      GEMINI: !!process.env.GEMINI_API_KEY 
    });

    const result = await streamText({
      model: google('gemini-1.5-flash'),
      system: `You are a highly capable AI Meeting Assistant. The user's name is ${userName || 'the user'}. 
               Your goal is to process meeting transcripts and provide high-value insights.
               Please provide:
               1. A brief summary of the meeting.
               2. A bulleted list of Action Items specifically assigned to ${userName || 'the user'}. 
               3. A list of general decisions made during the meeting.
               Keep the tone professional and concise. Use Markdown for formatting.`,
      prompt: transcript,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return new Response('Error processing transcript', { status: 500 });
  }
}
