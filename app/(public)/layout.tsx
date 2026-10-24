import AppFrame from "../components/AppFrame";
import PublicProviders from "../components/PublicProviders";

export default function PublicLayout({ children }: { children: React.ReactNode }) {
  return <PublicProviders><AppFrame publicPage>{children}</AppFrame></PublicProviders>;
}
