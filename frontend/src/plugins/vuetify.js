import 'vuetify/styles';
import '@mdi/font/css/materialdesignicons.css';
import { createVuetify } from 'vuetify';
import * as components from 'vuetify/components';
import * as directives from 'vuetify/directives';

// Custom premium glassmorphic dark theme using Tailwind slate & violet colors
const customDarkTheme = {
  dark: true,
  colors: {
    background: '#0B0F19', // Very dark slate/blue background
    surface: '#111827',    // Dark slate container surface
    'surface-variant': '#1F2937', // Medium slate container surface
    primary: '#7C3AED',    // Rich neon violet primary
    secondary: '#10B981',  // Emerald success/secondary
    accent: '#F43F5E',     // Rose neon accent
    error: '#EF4444',
    info: '#3B82F6',
    success: '#10B981',
    warning: '#F59E0B',
  },
};

export default createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'customDarkTheme',
    themes: {
      customDarkTheme,
    },
  },
});
