import { FC } from "hono/jsx";
import { useRequestContext } from "hono/jsx-renderer";
import { CurrentEntry } from "../../../../model/CurrentEntry";
import { Feed, Entry, Image, Text } from '@nooptoday/feed-rs';
import { html } from "hono/html";
import { CurrentFeed } from "../../../../model/CurrentFeed";

export const SearchResultList: FC = () => {
  const c = useRequestContext();
  const feedResult: CurrentFeed = c.get('feedResult');
  
  return (
    <section class="search-results">
      <div class="results-header">
        <div class="results-header-info">
          {(feedResult.logo ? FeedImg(feedResult.logo) : null) }
          <h2>{feedResult.title?.content}</h2>
        </div>
        <form action="/app/feeds/subscribe" method="POST">
          <input type="url" name="subscriptionUrl" id="subscriptionUrl" hidden value={feedResult.feedLink} />
          <button type="submit">Subscribe</button>
        </form>
      </div>
      <div class="results-list">
      {/* <pre><code>{JSON.stringify(entry, null, 4)}</code></pre> */}
        {feedResult.entries.map((entry) => FeedItemCard(entry))}
      </div>
    </section>
  )
}

const FeedImg = (logo: Image) => {
  const { uri, title, link, width, height, description } = logo;
  return (
    <img src={uri} alt={title ? title : description ? description : ''} width={width} height={height} class="feed-image" />
  );
}

const FeedItemCard = async (entry: CurrentEntry) => {
  let dateString = '';
  if(entry.updated) {
    dateString = new Date(entry.updated!).toLocaleDateString('en-US', {month: 'long', day: 'numeric', weekday: 'long', year: 'numeric'});
  } else if(entry.published) {
    dateString = new Date(entry.published).toLocaleDateString('en-US', {month: 'long', day: 'numeric', weekday: 'long', year: 'numeric'});
  }

  return(
    <article class="feed-item">
      <h3>{entry.title}</h3>
      <time>{dateString}</time>
      <section>
       <p>
        {entry.summary ? html(entry.summary) : ''}
       </p>
      </section>
    </article>);
}