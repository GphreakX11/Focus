import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Mark the route as dynamic
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    console.log('AI API Request Body:', JSON.stringify(body, null, 2));
    
    const { prompt, transcript, userName } = body;
    const finalTranscript = prompt || transcript;
    
    console.log('Extracted Transcript:', { hasTranscript: !!finalTranscript, userName });

    if (!finalTranscript) {
      console.error('Missing transcript in payload');
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
                  IMPORTANT: Prefix each distinct action item that is a standalone task with "[ACTION]". 
                  For example: "[ACTION] Send the budget report to Sarah."
               3. A list of general decisions made during the meeting.
               Keep the tone professional and concise. Use Markdown for formatting.`,
      prompt: finalTranscript,
    });

    return result.toTextStreamResponse();
  } catch (error) {
    console.error('AI Analysis Error:', error);
    return new Response('Error processing transcript', { status: 500 });
  }
}
