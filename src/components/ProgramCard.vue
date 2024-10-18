<script lang="ts" setup>
import {PropType} from "vue";
import ProgramCover from "./ProgramCover.vue";
import {Program} from "dostron/types";

const props = defineProps({
    program: {
        type: Object as PropType<Program>,
        required: true
    }
});
</script>

<template>
    <div class="program-card">
        <program-cover :program="program"/>
        <div class="program-name">
            <span>{{ program.info.name }}</span>
        </div>
    </div>
</template>

<style scoped>
.program-card {
    width: 320px;
    height: 200px;
    overflow: hidden;
}

.program-cover {
    width: 320px;
    height: 200px;
}

.program-card:hover img {
    transform: translateY(-45px);
}

.program-card img {
    transition: transform 0.4s;
    object-fit: cover;
}

.program-card:hover .program-name {
    transform: translateY(0px);
}

.program-name {
    position: relative;
    top: -48px;
    bottom: 0;
    height: 45px;
    width: 100%;
    transition: transform 0.4s, opacity 0.1s 0.3s;
    transform: translateY(100%);
    background: #2c3f52;
}

.program-name span {
    float: left;
    padding: 10px;
    color: #fff;
    font-size: 18px;
}
</style>
