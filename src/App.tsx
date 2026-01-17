import { createHashRouter, RouterProvider } from "react-router-dom";
import { ProgramsProvider, useProgramsContext } from "./hooks/usePrograms";
import { routes } from "./routes";

const router = createHashRouter(routes);

function AppContent() {
    const { loading } = useProgramsContext();

    if (loading) {
        return <div className="flex h-screen items-center justify-center text-muted-foreground">Loading...</div>;
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
