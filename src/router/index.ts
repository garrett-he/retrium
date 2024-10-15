import {RouteRecordRaw, createRouter, createWebHashHistory} from "vue-router";
import IndexPage from "@/views/pages/IndexPage.vue";

const routes: RouteRecordRaw[] = [
    {
        path: "/",
        name: "IndexPage",
        component: IndexPage
    }
];

export default createRouter({
    history: createWebHashHistory(),
    routes
});
