import {createApp} from "vue";
import App from "./App.vue";

import router from "./router";
import store from "./store";
import "./assets/app.css";

import Antd from "ant-design-vue";
import "ant-design-vue/dist/reset.css";

createApp(App)
    .use(router)
    .use(store)
    .use(Antd)
    .mount("#app");
