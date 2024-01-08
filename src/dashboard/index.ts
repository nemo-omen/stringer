import { Dashboard } from './Dashboard';
import { Context, Hono } from 'hono';
const app = new Hono();

app.get('/', (c: Context) => {
  const session = c.get('session');
  const sessionUser = session.get('user');
  if (sessionUser) {
    return Dashboard(c);
  }
  return c.redirect('/auth/login');
});

export default app;