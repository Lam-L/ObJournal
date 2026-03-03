/**
 * Internationalization for Journal View plugin
 * Uses Obsidian's language setting for automatic locale detection
 */
import { getLanguage } from 'obsidian';
import { STRINGS_EN, type StringsType } from './locales/en';
import { STRINGS_ZH_CN } from './locales/zh_cn';
import { STRINGS_ZH_TW } from './locales/zh_tw';
import { STRINGS_JA } from './locales/ja';

const LANGUAGE_MAP: Record<string, StringsType> = {
	en: STRINGS_EN,
	zh: STRINGS_ZH_CN,
	'zh-cn': STRINGS_ZH_CN,
	zh_cn: STRINGS_ZH_CN,
	'zh-tw': STRINGS_ZH_TW,
	zh_tw: STRINGS_ZH_TW,
	ja: STRINGS_JA,
};

function resolveLocale(): string {
	const raw = getLanguage() || 'en';
	const normalized = raw.toLowerCase().replace('_', '-');
	return normalized in LANGUAGE_MAP ? normalized : 'en';
}

const currentLocale = resolveLocale();
export const strings: StringsType = LANGUAGE_MAP[currentLocale] ?? STRINGS_EN;

export function getCurrentLanguage(): string {
	return getLanguage() || 'en';
}
