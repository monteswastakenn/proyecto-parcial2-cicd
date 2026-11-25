// Captura las paginas publicas de GitHub Actions y el reporte HTML de Playwright para el reporte.
// Uso: node capturas-github.mjs <run_fallido> <run_exitoso> <dir_reporte_html> <dir_salida>
import { chromium } from '@playwright/test';
import path from 'node:path';

const [fallido, exitoso, reporteHtml, salida] = process.argv.slice(2);
const repo = 'https://github.com/monteswastakenn/proyecto-parcial2-cicd';
const navegador = await chromium.launch();
const page = await navegador.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1.5, locale: 'es-MX' });

async function captura(url, archivo, alto = 900) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: path.join(salida, archivo), clip: { x: 0, y: 0, width: 1440, height: alto } });
  console.log('ok', archivo);
}

await captura(`${repo}/actions`, 'gha-historial.png', 820);
await captura(`${repo}/actions/runs/${fallido}`, 'gha-fallo.png', 900);
await captura(`${repo}/actions/runs/${exitoso}`, 'gha-exito.png', 900);
if (reporteHtml) await captura(`file://${path.resolve(reporteHtml)}/index.html`, 'gha-reporte-playwright.png', 1000);
await navegador.close();
