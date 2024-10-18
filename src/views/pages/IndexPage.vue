<script lang="ts" setup>
import {ref} from "vue";
import {useStore} from "vuex";

import PageHeader from "@/components/PageHeader.vue";
import ProgramCard from "@/components/ProgramCard.vue";

const store = useStore();

const programs = ref(store.state.programs);
</script>

<template>
    <div class="index-page">
        <page-header title="Programs"/>
        <main>
            <div class="program-card-list">
                <program-card :program="program" v-for="program in programs" :key="program.id"/>
                <div class="clear"/>
            </div>
        </main>
    </div>
</template>

<style scoped>
.program-card {
    float: left;
    margin: 10px;
}
</style>
