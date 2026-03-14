import { google } from '@ai-sdk/google';
import { streamText } from 'ai';

// Mark the route as dynamic
export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
  try {
    const { transcript, userName } = await req.json();

    if (!transcript) {
      return new Response('No transcript provided', { status: 400 });
    }

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
