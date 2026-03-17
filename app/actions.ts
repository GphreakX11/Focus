'use server';

// This file is currently used for local server actions if needed, 
// but Calendar Analysis has been moved to a Route Handler for custom timeout support on Vercel.
export async function placeholderAction() {
  return { success: true };
}
