import translations from './data/descriptions.zh-CN.json';

// Match the original text so renamed films retain their description and custom notes stay intact.
const descriptions = new Map(Object.entries(translations));
export const localizeDescription = (text: string) => descriptions.get(text) ?? text;
