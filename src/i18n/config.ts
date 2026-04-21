import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import * as Localization from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';
import en from './en.json';
import es from './es.json';

const resources = {
  en: { translation: en },
  es: { translation: es },
};

const getDeviceLanguage = () => {
  const locales = Localization.getLocales();
  if (locales && locales.length > 0) {
    const langCode = locales[0].languageCode?.toLowerCase();
    const tag = locales[0].languageTag?.toLowerCase();
    if (langCode === 'es' || langCode === 'spa' || tag.startsWith('es')) {
      return 'es';
    }
  }
  return 'en';
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: getDeviceLanguage(), // Default while we load from storage
    fallbackLng: 'en',
    interpolation: {
      escapeValue: false,
    },
    react: {
        useSuspense: false
    }
  });

// Load saved language
AsyncStorage.getItem('@user_language').then(savedLang => {
  if (savedLang) {
    i18n.changeLanguage(savedLang);
  }
});

export default i18n;
