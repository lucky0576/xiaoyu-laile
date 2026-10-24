/**
 * 路由装配
 */
import registerCoreRoutes from './core.js';
import registerAuthUserRoutes from './auth-users.js';
import registerListingRoutes from './listings.js';
import registerChatRoutes from './chat.js';
import registerFeedRoutes from './feeds.js';
import registerForumRoutes from './forums.js';
import registerInvestRoutes from './invest.js';
import registerTagRoutes from './tags.js';
import registerAdminRoutes from './admin.js';
import registerProviderRoutes from './providers.js';
import registerNewsRoutes from './news.js';

export default function registerRoutes(app) {
  registerCoreRoutes(app);
  registerAuthUserRoutes(app);
  registerListingRoutes(app);
  registerChatRoutes(app);
  registerFeedRoutes(app);
  registerForumRoutes(app);
  registerInvestRoutes(app);
  registerTagRoutes(app);
  registerAdminRoutes(app);
  registerProviderRoutes(app);
  registerNewsRoutes(app);
  return app;
}
