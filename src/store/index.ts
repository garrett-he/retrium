import {createStore} from "vuex";
import {Program, DosboxVersionConfig} from "dostron/types";

export default createStore({
    state: () => ({
        programs: <Program[]>[],
        dosboxVersions: <DosboxVersionConfig>{}
    }),
    mutations: {
        updatePrograms: (state, programs: Program[]) => {
            state.programs = programs;
        },
        dosboxVersions: (state, versions: DosboxVersionConfig) => {
            state.dosboxVersions = versions;
        }
    },
    getters: {
        getProgram: state => (id: string): Program | undefined => {
            return state.programs.find(program => program.id === id);
        }
    }
});
