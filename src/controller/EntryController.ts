import { Context, Hono } from "hono";
import { PostList } from "../view/pages/posts/PostList";
import { Result } from "../lib/types/Result";
import { SubscriptionRepository } from "../repo/SubscriptionRepository";
import { RssService } from "../service/RssService";
import { db } from "../lib/infra/sqlite";
import { Post } from "../view/pages/posts/Post";
import { CurrentEntry } from "../model/CurrentEntry";
import { Subscription } from "../model/Subscription";
import { EntryRepository } from "../repo/EntryRepository";
import { FeedRepository } from "../repo/FeedRepository";
import { CurrentFeed } from "../model/CurrentFeed";

const app = new Hono();

app.get('/test', (c: Context) => {
  return c.text('Ya Mutha');
});

app.get('/all', async (c: Context) => {
  // TODO: Move multi-step business logic into SubscriptionService
  const feedRepo = new FeedRepository(db);
  const entryRepo = new EntryRepository(db);
  const subscriptionRepo = new SubscriptionRepository(db);
  const rssService = new RssService();
  const session = c.get('session');
  const user = session.get('user');
  const posts: CurrentEntry[] = [];

  //TODO: When we integrate HTMX, the pattern should be:
  // 1. Get stored feeds from DB
  // 2. Render them
  // 3. Fetch updated feeds
  // 4. Store new items
  // 5. Render new items
  // 6. Set an update interval and run steps 3-5
  const subscriptionsResult: Result<Subscription[]> = subscriptionRepo.getSubscriptionByUserId(user.id);

  if (!subscriptionsResult.ok) {
    session.flash('error', 'There was a problem getting your subscriptions.');
    return PostList(c);
  }

  const subscriptions: Subscription[] = subscriptionsResult.data;
  c.set('subscriptions', subscriptions);

  if (subscriptions.length < 1) {
    c.set('pageTitle', 'Find Feeds');
    return c.redirect('/app/feeds/find');
  }

  for (const subscription of subscriptions) {
    const storedFeedResult: Result<CurrentFeed | null> = feedRepo.findById(subscription.feedId);
    if (!storedFeedResult) {
      session.flash('There was an error retrieving your subscribed feeds.');
      return PostList(c);
    }

    if (!storedFeedResult.ok) {
      session.flash('There was an error retrieving your subscribed feeds.');
      return PostList(c);
    }

    const remoteFeedResult: Result<CurrentFeed> = await rssService.getFeedByUrl(storedFeedResult.data?.feedLink!);

    if (!remoteFeedResult.ok) {
      session.flash(`There was an error updating ${storedFeedResult.data?.title}.`);
      return PostList(c);
    }

    for (const entry of remoteFeedResult.data.entries) {
      const insertEntryResult: Result<string> = entryRepo.create(entry);

      if (!insertEntryResult.ok) {
        console.error(`Failed to save entry ${entry.title}`);
      }
    }

    const entriesResult: Result<CurrentEntry[]> = entryRepo.findByFeedId(subscription.feedId);

    if (!entriesResult.ok) {
      session.flash('error', 'There was a problem getting your feeds.');
      return c.redirect('/app/feeds/find');
    }

    posts.push(...entriesResult.data);
  }

  const sorted = posts.sort((a, b) => {
    return (
      (new Date(b.published!).valueOf())
      - (new Date(a.published!).valueOf())
    );
  });

  c.set('posts', sorted);
  c.set('pageTitle', 'All Posts');
  return PostList(c);
});

app.get('/:id', async (c: Context) => {
  const session = c.get('session');
  const id = c.req.param('id');
  const entryRepo = new EntryRepository(db);
  const entryResult: Result<CurrentEntry> = entryRepo.findById(id);

  if (!entryResult.ok) {
    session.flash('Could not find item');
  } else {
    c.set('entry', entryResult.data);
  }

  return Post(c);
});

export default app;