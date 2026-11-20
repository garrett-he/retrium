import {
    createContext,
    createElement,
    type ReactNode,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
} from "react";
import { type Dictionary, en, type StringKey } from "./en";
import { zhCN } from "./zh-CN";

export type { Dictionary, StringKey } from "./en";
export type Language = "en" | "zh-CN";

/** Shown in Settings, each in its own language — the one list that is never translated. */
export const LANGUAGE_OPTIONS: Array<{ value: Language; label: string }> = [
    { value: "en", label: "English" },
    { value: "zh-CN", label: "简体中文" },
];

const DICTIONARIES: Record<Language, Dictionary> = {
    en,
    "zh-CN": zhCN,
};

const STORAGE_KEY = "retrium-language";

export type Params = Record<string, string | number>;

/** Bases that have a `.one` / `.other` pair; `t` picks one from `params.count`. */
type PluralBase = {
    [K in StringKey]: K extends `${infer Base}.one` ? Base : never;
}[StringKey];

export type TFunction = (key: StringKey | PluralBase, params?: Params) => string;

function fill(template: string, params?: Params): string {
    if (params === undefined) {
        return template;
    }
    return template.replace(/\{(\w+)\}/g, (match, name: string) =>
        params[name] === undefined ? match : String(params[name]),
    );
}

function translate(language: Language, key: string, params?: Params): string {
    const dictionary: Record<string, string> = DICTIONARIES[language];
    let template = dictionary[key];
    if (template === undefined && typeof params?.count === "number") {
        template = dictionary[`${key}${params.count === 1 ? ".one" : ".other"}`];
    }
    // A missing key renders as the key itself: visible in review, never silent.
    return template === undefined ? key : fill(template, params);
}

function storedLanguage(): Language | null {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "en" || stored === "zh-CN" ? stored : null;
}

/**
 * System language on first launch. Every `zh-*` tag (Simplified, Traditional,
 * any region) falls back to the one Chinese dictionary we ship; everything
 * else uses English. `navigator.languages` is tried before the single tag so a
 * Chinese user with an English system default still lands on Chinese.
 */
function systemLanguage(): Language {
    const tags = navigator.languages?.length ? navigator.languages : [navigator.language];
    const chinese = tags.some((tag) => tag.toLowerCase().startsWith("zh"));
    return chinese ? "zh-CN" : "en";
}

/**
 * A stored choice always wins. When nothing is stored the system language is
 * re-read on every launch, so changing the OS language takes effect until the
 * user picks one in Settings — from then on the choice is fixed.
 */
function initialLanguage(): Language {
    return storedLanguage() ?? systemLanguage();
}

export interface I18n {
    language: Language;
    setLanguage: (language: Language) => void;
    t: TFunction;
}

const I18nContext = createContext<I18n | null>(null);

/**
 * UI language, stored next to the theme preference rather than in
 * `config.json`: it is presentation, not application state, and the backend
 * never needs it.
 *
 * Only an explicit choice is persisted — see `initialLanguage` for why the
 * detected default is deliberately not written back.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
    const [language, setLanguageState] = useState<Language>(initialLanguage);

    const setLanguage = useCallback((next: Language) => {
        localStorage.setItem(STORAGE_KEY, next);
        setLanguageState(next);
    }, []);

    useEffect(() => {
        document.documentElement.lang = language;
    }, [language]);

    const value = useMemo<I18n>(
        () => ({
            language,
            setLanguage,
            t: ((key: string, params?: Params) => translate(language, key, params)) as TFunction,
        }),
        [language, setLanguage],
    );

    return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18n {
    const context = useContext(I18nContext);
    if (!context) {
        throw new Error("useI18n must be used within an I18nProvider");
    }
    return context;
}

export function useT(): TFunction {
    return useI18n().t;
}

/** Display names for the eight `program.category` values; anything else shows raw. */
const CATEGORY_KEYS: Record<string, StringKey> = {
    game: "category.game",
    application: "category.application",
    utility: "category.utility",
    education: "category.education",
    demo: "category.demo",
    development: "category.development",
    system: "category.system",
    reference: "category.reference",
};

/**
 * Localised label for a category value. The manifest keeps the English value —
 * this only affects what is on screen, so a cart edited in Chinese still stores
 * `game`.
 */
export function categoryLabel(t: TFunction, category: string | undefined): string {
    if (category === undefined || category.length === 0) {
        return t("common.uncategorized");
    }
    const key = CATEGORY_KEYS[category];
    return key === undefined ? category : t(key);
}
