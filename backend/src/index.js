import Koa from 'koa';
import cors from '@koa/cors';
import bodyParser from 'koa-bodyparser';
import { config } from './config.js';
import router from './routes/index.js';
import { bootstrapIndexing } from './services/startupIndexer.js';

const app = new Koa();

app.use(cors({ origin: config.corsOrigin }));
app.use(bodyParser());
app.use(router.routes());
app.use(router.allowedMethods());

app.listen(config.port, () => {
  console.log(`RAG backend running at http://localhost:${config.port}`);

  if (config.github.repos.length > 0) {
    console.log(`[startup] Configured repos: ${config.github.repos.join(', ')}`);
    bootstrapIndexing().catch((err) => {
      console.error('[startup] Auto-index error:', err.message);
    });
  }
});
