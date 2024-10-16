import {createStore} from "vuex";
import {Program} from "dostron/types";

export default createStore({
    state: () => ({
        programs: <Program[]>[]
    }),
    mutations: {
        updatePrograms: (state, programs: Program[]) => {
            state.programs = programs;
        }
    }
});
