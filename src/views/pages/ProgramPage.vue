<script lang="ts" setup>
import {computed, ref, toRaw} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useStore} from "vuex";

import {Program, ProgramProcess} from "dostron/types";
import PageHeader from "@/components/PageHeader.vue";
import ProgramCover from "@/components/ProgramCover.vue";
import api from "@/api";

import {CaretRightOutlined, PauseOutlined, FolderOpenOutlined, DeleteOutlined} from "@ant-design/icons-vue";

const store = useStore();
const route = useRoute();
const router = useRouter();

const program = computed(() => <Program>store.getters.getProgram(route.params.id));
const process = ref<ProgramProcess | undefined>();

function getProgramInfo(program: Program, key: string) {
    if (!program.info[key]) {
        return "N/A";
    }

    return Array.isArray(program.info[key]) ? program.info[key].join(", ") : program.info[key];
}

async function runProgram(e) {
    process.value = await api.runProgram(toRaw(program.value));
}

async function stopProgram() {
    await api.stopProgram(toRaw(program.value));
    process.value = undefined;
}

async function browseProgram() {
    await api.openProgramFolder(toRaw(program.value));
}

async function deleteProgram() {
    if (confirm("Are you sure to delete this program?")) {
        await api.deleteProgram(toRaw(program.value));
        store.commit("updatePrograms", await api.discoverPrograms());
        await router.go(-1);
    }
}
</script>
<template>
    <div class="program-page" v-if="program">
        <page-header :title="program.info.name" :back="true"/>
        <main>
            <div class="program-cover">
                <program-cover :program="program"/>
            </div>
            <a-space class="program-buttons">
                <a-button v-if="!process" @click="runProgram" type="primary">
                    <template #icon>
                        <caret-right-outlined/>
                    </template>
                    Run
                </a-button>
                <a-button v-else @click="stopProgram" danger>
                    <template #icon>
                        <pause-outlined/>
                    </template>
                    Stop
                </a-button>
                <a-button @click="browseProgram">
                    <template #icon>
                        <folder-open-outlined/>
                    </template>
                    Browse
                </a-button>
                <a-button @click="deleteProgram" danger>
                    <template #icon>
                        <delete-outlined/>
                    </template>
                    Delete
                </a-button>
            </a-space>
            <div class="program-details">
                <a-descriptions title="Information" :column="3" size="small" bordered>
                    <a-descriptions-item label="Category">
                        {{ getProgramInfo(program, "category") }}
                    </a-descriptions-item>
                    <a-descriptions-item label="Release">
                        {{ getProgramInfo(program, "release") }}
                    </a-descriptions-item>
                    <a-descriptions-item label="Language">
                        {{ getProgramInfo(program, "language") }}
                    </a-descriptions-item>
                </a-descriptions>

                <a-descriptions title="Extra Information" :column="1" size="small" bordered>
                    <a-descriptions-item label="Developer">
                        {{ getProgramInfo(program, "developer") }}
                    </a-descriptions-item>
                    <a-descriptions-item label="Publisher">
                        {{ getProgramInfo(program, "publisher") }}
                    </a-descriptions-item>
                    <a-descriptions-item label="Series">
                        {{ getProgramInfo(program, "series") }}
                    </a-descriptions-item>
                    <a-descriptions-item label="Tags">
                        {{ getProgramInfo(program, "tags") }}
                    </a-descriptions-item>
                </a-descriptions>
            </div>
        </main>
    </div>
</template>
<style scoped>
main {
    background: #fff;
    box-shadow: 0 0 5px #333;
    width: 800px;
    margin: 90px auto 0 auto;
}

.program-cover img {
    width: 800px;
}

.program-details {
    padding: 10px 20px;
    clear: both;
}

.program-buttons {
    margin: 10px;
    text-align: right;
    float: right;
}
</style>
