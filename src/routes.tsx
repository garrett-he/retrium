import type { RouteObject } from "react-router-dom";
import { IndexPage } from "./pages/IndexPage";
import { ProgramPage } from "./pages/ProgramPage";

export const routes: RouteObject[] = [
    {
        path: "/",
        element: <IndexPage />,
    },
    {
        path: "/programs/:id",
        element: <ProgramPage />,
    },
];
