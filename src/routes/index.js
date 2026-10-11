/**
 * 路由装配
 */
import registerCoreRoutes from './core.js';
import registerAuthUserRoutes from './auth-users.js';
import registerListingRoutes from './listings.js';
import registerChatRoutes from './chat.js';
import registerFeedRoutes from './feeds.js';
import registerAdminRoutes from './admin.js';

export default function registerRoutes(app) {
  registerCoreRoutes(app);
  registerAuthUserRoutes(app);
  registerListingRoutes(app);
  registerChatRoutes(app);
  registerFeedRoutes(app);
  registerAdminRoutes(app);
  return app;
}
