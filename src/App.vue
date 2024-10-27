<script lang="ts" setup>
import {ref, onMounted} from "vue";
import {useStore} from "vuex";

import api from "./api";
import MainView from "./views/MainView.vue";

const store = useStore();
const ready = ref(false);

onMounted(async () => {
    store.commit("updatePrograms", await api.discoverPrograms());
    store.commit("dosboxVersions", await api.getDosboxVersions());

    ready.value = true;
});
</script>

<template>
    <main-view v-if="ready"/>
</template>
