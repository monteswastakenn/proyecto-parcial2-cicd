const app = require('./app');
const { inicializar } = require('./db');
const { log } = require('./observabilidad');

const PUERTO = Number(process.env.PORT || 3000);

async function iniciar() {
  for (let intento = 1; ; intento++) {
    try {
      await inicializar();
      break;
    } catch (e) {
      if (intento >= 30) throw e;
      log('warn', 'base de datos no disponible, reintentando', { intento, error: e.message });
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  app.listen(PUERTO, () => log('info', 'api iniciada', { puerto: PUERTO }));
}

process.on('unhandledRejection', (e) => log('error', 'promesa rechazada sin manejar', { error: String(e) }));
iniciar().catch((e) => {
  log('error', 'no se pudo iniciar la api', { error: e.message });
  process.exit(1);
});
