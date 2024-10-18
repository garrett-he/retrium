<script lang="ts" setup>
import UnknownCover from "../assets/images/no-cover.png";
import {computed, PropType} from "vue";
import {Program} from "dostron/types";

const props = defineProps({
    program: {
        type: Object as PropType<Program>,
        required: true
    }
});

const location = computed(() => {
    const cover = props.program.cover;
    return cover ? `local-resource://${cover}` : UnknownCover;
});
</script>

<template>
    <img :src="location" :alt="program.info.name" class="program-cover"/>
</template>
