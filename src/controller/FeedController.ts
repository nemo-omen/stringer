import { Context, Hono } from "hono";
import { validator } from 'hono/validator';
import { z } from "zod";
import { COMMON_FEED_EXTENSIONS } from "../lib/constants/COMMON_FEED_EXTENSIONS";
import { Result } from "../lib/types/Result";
import { db } from "../lib/infra/sqlite";
import { RssService } from "../service/RssService";
import { FeedRepository } from "../repo/FeedRepository";
import { ResultPage } from "../view/pages/feeds/Result";
import { Find } from "../view/pages/feeds/Find";
import { RssSource } from "../lib/types/RssSource";
import { CurrentFeed } from "../model/CurrentFeed";
import { SubscriptionService } from "../service/SubscriptionService";
import { CollectionRepository } from "../repo/CollectionRepository";
import { PostList } from "../view/pages/posts/PostList";
import { FeedPage } from "../view/pages/feeds/FeedPage";
import { CurrentEntry } from "../model/CurrentEntry";
import { EntryRepository } from "../repo/EntryRepository";
import { getFeedSources } from "../lib/util/getFeedSources";

const app = new Hono();

const searchFormSchema = z.object({
  feedurl: z.string().url()
});

const subscribeFormSchema = z.object({
  subscriptionUrl: z.string()
});

/**
 * Find feed page
 */
app.get('/find', (c: Context) => {
  c.set('pageTitle', 'Add Feed');
  return Find(c);
});

app.get('/s/:slug', (c: Context) => {
  const session = c.get('session');
  const slug = c.req.param('slug');
  const user = session.get('user');
  const feedRepo = new FeedRepository(db);
  const entryRepo = new EntryRepository(db);
  const collectionRepo = new CollectionRepository(db);
  const feedResponse = feedRepo.findBySlug(slug);

  if (!feedResponse.ok) {
    session.flash('There was an error getting the feed.');
    return FeedPage(c);
  }

  const entriesResponse = entryRepo.findByFeedId(feedResponse.data.id);

  if (!entriesResponse.ok) {
    session.flash("There was an error getting the feed's entries.");
    return FeedPage(c);
  }

  const entries: CurrentEntry[] = entriesResponse?.data.map((entry) => {
    const isRead = collectionRepo.isEntryInCollection(entry.id, user.id, 'Read');
    entry.read = isRead;
    return entry;
  });

  feedResponse.data.entries = entries ?? [];
  feedResponse.data.entries = feedResponse.data.entries.sort(
    (a, b) => {
      return (new Date(b.published).valueOf()) - (new Date(a.published).valueOf());
    }
  );

  c.set('feed', feedResponse.data);
  c.set('pageTitle', 'Feed Page');
  return FeedPage(c);
});

// update current view route
app.get('/s/:slug/:view', (c: Context) => {
  const session = c.get('session');
  const slug = c.req.param('slug');
  const user = session.get('user');
  const feedRepo = new FeedRepository(db);
  const entryRepo = new EntryRepository(db);
  const collectionRepo = new CollectionRepository(db);
  return FeedPage(c);
});

/**
 * Find a feed
 */
app.post(
  '/find',
  validator('form', (value, c) => {
    const result: z.SafeParseReturnType<any, any> = parseInput(c, searchFormSchema, value);
    return result.data;
  }),
  async (c: Context) => {
    const session = c.get('session');
    const rssService = new RssService();
    // Returns valid data only
    interface ValidatedSearch {
      data: {
        feedurl: string;
      };
    }
    let data: ValidatedSearch | null = c.req.valid('form');
    let feedurl: string;
    c.set('pageTitle', 'Add Feed');

    if (!data) {
      // If no valid data in form, get formData directly
      const formdata = (await c.req.formData());
      feedurl = String(formdata.get('feedurl'));
      // TODO: Call FeedRepository to SELECT title ILIKE
      //       or feedUrl ILIKE (maybe search in categories too?)

      // we don't have a valid url, so attempt
      // to build one
      // TODO: (probably ought to remove this from RssService)
      const builtUrlResult = rssService.buildUrl(feedurl);
      if (!builtUrlResult.ok) {
        // return results with flash error if can't build url
        session.flash('error', `Cannot find a feed for ${feedurl}. Try ${feedurl}.com?`);
        return ResultPage(c);
      }
      feedurl = builtUrlResult.data;
    } else {
      feedurl = data.feedurl;
    }

    // TODO: Call FeedRepository to SELECT feedUrl=feedurl
    let rssUrl: string | undefined = undefined;

    for (const ext of COMMON_FEED_EXTENSIONS) {
      if (feedurl.endsWith(ext)) {
        rssUrl = feedurl;
      }
    }

    if (!rssUrl) {
      const rssUrlResult = await getFeedSources(feedurl);
      // console.log(rssUrlResult.data);
      // const rssUrlResult: Result<RssSource> = await rssService.findDocumentRssLink(feedurl);
      if (!rssUrlResult.ok) {
        session.flash('error', 'Could not find RSS feed at that address.');
        return ResultPage(c);
      }

      if (rssUrlResult.data.length < 1) {
        session.flash('error', 'Could not find any RSS feeds at that address');
        return ResultPage(c);
      }

      // for now just return the first result
      // but in the future we need to display
      // multiple feeds if multiple URLs are found
      rssUrl = rssUrlResult.data[0].url;
    }

    if (rssUrl) {
      const feedResult: Result<CurrentFeed> = await rssService.getFeedByUrl(rssUrl);
      // console.log({ feedResult });
      if (!feedResult.ok) {
        session.flash('error', 'Could not find a feed at that address.');
      } else {
        c.set('feedResult', feedResult.data);
      }
      // set context value to repopulate form
      // input on new page load
      c.set('searchUrl', rssUrl);
      return ResultPage(c);
    } else {
      session.flash('error', 'Could not find valid feed at that address.');
      c.set('searchUrl', feedurl);
      return ResultPage(c);
    }
  }
);

/**
 * Subscribe to a feed
 */
app.post(
  '/subscribe',
  validator('form', (value, c) => {
    const result: z.SafeParseReturnType<any, any> = parseInput(c, subscribeFormSchema, value);
    return result.data;
  }),
  async (c: Context) => {
    let data: { subscriptionUrl: string; } = c.req.valid('form');
    const session = c.get('session');
    const user = session.get('user');
    const feedService = new RssService();
    const feedRepo = new FeedRepository(db);
    const subscriptionService = new SubscriptionService(db);

    // 1. Get feed from db
    let storedFeedResult: Result<CurrentFeed | null> = feedRepo.findByUrl(data.subscriptionUrl);

    // Does not exist or not ok result?
    if (!storedFeedResult.ok) {
      const rssFeedResult: Result<CurrentFeed> = await feedService.getFeedByUrl(data.subscriptionUrl);

      if (!rssFeedResult.ok) {
        c.set('searchUrl', data.subscriptionUrl);
        session.flash('error', `These was an error subscribing to the feed at ${data.subscriptionUrl}`);
        return ResultPage(c);
      }

      c.set('searchUrl', data.subscriptionUrl);
      c.set('feed', rssFeedResult.data);
      session.flash('error', `There was an error subscribing to the feed at ${data.subscriptionUrl}`);
      return ResultPage(c);
    }

    if (storedFeedResult.data === null) {
      const rssFeedResult: Result<CurrentFeed> = await feedService.getFeedByUrl(data.subscriptionUrl);

      if (!rssFeedResult.ok) {
        c.set('searchUrl', data.subscriptionUrl);
        session.flash('error', `These was an error subscribing to the feed at ${data.subscriptionUrl}`);
        return ResultPage(c);
      }

      const feed: CurrentFeed = rssFeedResult.data;

      try {
        subscriptionService.saveSubscriptionFeedEntries(feed, user.id);
      } catch (err) {
        // LOG
        console.error(err);
        c.set('searchUrl', data.subscriptionUrl);
        c.set('feed', rssFeedResult.data);
        session.flash('error', `There was an error subscribing to the feed at ${data.subscriptionUrl}`);
        return ResultPage(c);
      }
      storedFeedResult = { ok: true, data: feed };
    } else {
      // 3. Stored feed exists, subscribe to it
      const subscribeResult = subscriptionService.saveStoredFeedSubscription(storedFeedResult.data.id, user.id);
      if (!subscribeResult.ok) {
        session.flash('error', `There was an error subscribing to ${storedFeedResult.data.title}`);
        return ResultPage(c);
      }
    }

    const feed: CurrentFeed = storedFeedResult.data!;

    session.flash('message', `You have successfully subscribed to ${feed.title}`);

    return c.redirect('/app');
  });

app.post('/unsubscribe', async (c: Context) => {
  const session = c.get('session');
  const user = session.get('user');
  const subscriptionService = new SubscriptionService(db);
  // console.log(c.req);
  const formData = await c.req.formData();
  const feedId = formData.get('feedId');
  const unsubResult = subscriptionService.unsubscribe(feedId, user.id);
  return c.redirect('/app');
});

/**
 * Parses form input with zod schema
 * @param c Context
 * @param schema z.Schema
 * @param value Form input value
 * @returns z.SafeParseReturnType
 */
function parseInput(c: Context, schema: z.Schema, value: any): z.SafeParseReturnType<any, any> {
  const session = c.get('session');
  const result = schema.safeParse(value);

  if (!result.success) {
    const issues = result.error.issues;
    const issuePaths = issues.map((issue) => issue.path[0]);
    const issueMessages = issues.map((issue) => issue.message);
    for (let i = 0; i < issuePaths.length; i++) {
      session.flash(`${issuePaths[i]}Error`, issueMessages[i]);
    }
  }
  return result;
}

export default app;