import { redirect } from 'next/navigation';

export default function Home() {
  // Redirect the root URL to the canonical Explore route.
  redirect('/explore');
}
