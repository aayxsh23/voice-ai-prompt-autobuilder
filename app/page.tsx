import { redirect } from 'next/navigation';

// The product entry point is the project list — the same pattern as Linear,
// Vercel and Notion. "New session" lives in the header and on the dashboard,
// so the previous marketing hero was a detour, not a destination.
export default function HomePage() {
  redirect('/dashboard');
}
