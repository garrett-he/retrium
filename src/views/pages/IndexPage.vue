<script lang="ts" setup>
import {computed, ref} from "vue";
import {useStore} from "vuex";
import PageHeader from "@/components/PageHeader.vue";

const store = useStore();

const programs = ref(store.state.programs);
</script>

<template>
    <div class="index-page">
        <page-header title="Programs"/>
        <main>
            {{ programs }}
        </main>
    </div>
</template>

<style scoped>
h1 {
    color: #900;
}
</style>
