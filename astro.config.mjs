import { defineConfig } from 'astro/config';
import sitemap from '@astrojs/sitemap';

export default defineConfig({
  site: 'https://www.istihadrabbi.com',
  integrations: [sitemap({ filter: (page) => !page.includes('/tailor') })],
});
