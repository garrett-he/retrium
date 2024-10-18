import {RouteRecordRaw, createRouter, createWebHashHistory} from "vue-router";
import IndexPage from "@/views/pages/IndexPage.vue";
import ProgramPage from "@/views/pages/ProgramPage.vue";

const routes: RouteRecordRaw[] = [
    {
        path: "/",
        name: "IndexPage",
        component: IndexPage
    },
    {
        path: "/programs/:id",
        name: "ProgramPage",
        component: ProgramPage
    }
];

export default createRouter({
    history: createWebHashHistory(),
    routes
});
