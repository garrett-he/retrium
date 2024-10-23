<script lang="ts" setup>
import {computed, ref} from "vue";
import {useStore} from "vuex";

import {Program} from "dostron/types";
import PageHeader from "@/components/PageHeader.vue";
import ProgramCard from "@/components/ProgramCard.vue";
import api from "@/api";

import {PlusOutlined} from "@ant-design/icons-vue";

const store = useStore();

const programs = computed(() => store.state.programs.filter(program => {
        if (category.value === "All") return true;

        return program.info?.category === category.value;
    })
);

const category = ref("All");
const categories = computed(() => {
    const categories: { [key: string]: number } = {};

    store.state.programs.forEach((program: Program) => {
        const key = program.info?.category;

        if (!key) {
            return;
        }

        if (!(key in Object.keys(categories))) {
            categories[key] = 0;
        }

        categories[key]++;
    });

    return categories;
});

async function addPrograms() {
    await api.addPrograms();
    store.commit("updatePrograms", await api.discoverPrograms());
}
</script>

<template>
    <div class="index-page">
        <page-header title="Programs"/>
        <main>
            <a-space>
                <a-radio-group default-value="All" button-style="solid" @change="e => category = e.target.value">
                    <a-radio-button value="All">
                        All ({{ store.state.programs.length }})
                    </a-radio-button>
                    <a-radio-button v-for="(count, category) in categories" :value="category" :key="category">
                        {{ category }} ({{ count }})
                    </a-radio-button>
                </a-radio-group>
                <a-button @click="addPrograms">
                    <template #icon>
                        <plus-outlined/>
                    </template>
                </a-button>
            </a-space>
            <div class="program-card-list">
                <router-link v-for="program in programs" :to="`/programs/${program.id}`" :key="program.id">
                    <program-card :program="program"/>
                </router-link>
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
