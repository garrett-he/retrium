<script lang="ts" setup>
import {useRouter} from "vue-router";
import {LeftOutlined, MenuOutlined} from "@ant-design/icons-vue";

const props = defineProps({
    title: String,
    back: Boolean,
    menu: Boolean
});

const router = useRouter();

function goBack() {
    window.history.length > 1 ? router.go(-1) : router.push("/");
}
</script>

<template>
    <div class="page-header">
        <a-row>
            <a-col :span="1">
                <a-button v-if="back" class="back-button" @click="goBack" type="link">
                    <template #icon>
                        <left-outlined class="back-icon"/>
                    </template>
                </a-button>
            </a-col>
            <a-col :span="22">
                <h1>{{ title }}</h1>
            </a-col>
            <a-col :span="1" class="menu">
                <a-button v-if="menu" type="link" @click="$emit('menu-click')">
                    <template #icon>
                        <menu-outlined class="menu-icon"/>
                    </template>
                </a-button>
            </a-col>
        </a-row>
    </div>
</template>


<style scoped>
.page-header {
    top: 0;
    height: 50px;
    background: #fff;
    position: fixed;
    z-index: 99999;
    width: 100%;
    border-bottom: 1px solid #ccc;
}

h1 {
    font-size: 22px;
    font-weight: lighter;
    text-align: center;
    padding-top: 10px;
}

.menu-icon,
.back-icon {
    color: #333;
    font-size: 26px;
    margin-top: 10px;
}
</style>
