<script lang="ts" setup>
import {ref, onMounted} from "vue";
import api from "./api";
import MainView from "./views/MainView.vue";

const ready = ref(false);

onMounted(async () => {
    console.log(api.hello());

    ready.value = true;
});
</script>

<template>
    <main-view v-if="ready"/>
</template>
