import Header from "./Header";
import Footer from "./Footer";
import { ExploreCategoryProvider } from "./explore/ExploreCategoryProvider";

export default function AppFrame({ children, publicPage = false }: { children: React.ReactNode; publicPage?: boolean }) {
  return <ExploreCategoryProvider><div className="korum-app-root">
    <Header publicPage={publicPage} /><main>{children}</main><Footer publicPage={publicPage} />
  </div></ExploreCategoryProvider>;
}
