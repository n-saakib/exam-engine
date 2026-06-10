import { MenuBar } from "@/features/shell/MenuBar";
import { GlobalDialogsProvider } from "@/features/shell/GlobalDialogs";

/**
 * Persistent application frame (F1-T1). Wraps every screen with:
 *   - <MenuBar>  — sticky header with four nav destinations
 *   - <main>     — scrollable content area
 *   - <GlobalDialogsProvider> — confirm/discard dialogs reused by F4/F6/F8
 *
 * Rendered by the root layout so every route inherits it automatically.
 */
export function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <GlobalDialogsProvider>
      {/* The body already provides `flex flex-col min-h-full`; this fragment
          just adds MenuBar above the page content. */}
      <MenuBar />
      <main id="main-content" className="flex flex-1 flex-col">
        {children}
      </main>
    </GlobalDialogsProvider>
  );
}
