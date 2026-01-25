import { createHashRouter, RouterProvider } from "react-router-dom";
import { ProgramsProvider, useProgramsContext } from "./hooks/usePrograms";
import { SetupPage } from "./pages/SetupPage";
import { routes } from "./routes";

const router = createHashRouter(routes);

function AppContent() {
    const { loading, setupState, completeSetup } = useProgramsContext();

    if (loading || !setupState) {
        return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
    }

    if (!setupState.configured) {
        return <SetupPage defaults={setupState} onComplete={completeSetup} />;
    }

    return <RouterProvider router={router} />;
}

export function App() {
    return (
        <ProgramsProvider>
            <AppContent />
        </ProgramsProvider>
    );
}
