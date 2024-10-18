<script lang="ts" setup>
import {computed, ref} from "vue";
import {useRoute, useRouter} from "vue-router";
import {useStore} from "vuex";

import {Program} from "dostron/types";
import PageHeader from "@/components/PageHeader.vue";
import ProgramCover from "@/components/ProgramCover.vue";

const store = useStore();
const route = useRoute();
const program = computed(() => <Program>store.getters.getProgram(route.params.id));
const process = ref<ProgramProcess | undefined>();

function getProgramInfo(program: Program, key: string) {
    if (!program.info[key]) {
        return "N/A";
    }

    return Array.isArray(program.info[key]) ? program.info[key].join(", ") : program.info[key];
}
</script>
<template>
    <div class="program-page" v-if="program">
        <page-header :title="program.info.name" :back="true"/>
        <main>
            <div class="program-cover">
                <program-cover :program="program"/>
            </div>
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
</style>
