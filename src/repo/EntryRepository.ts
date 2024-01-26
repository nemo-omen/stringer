import { CurrentEntry, CurrentEntryDTO, PersistanceEntryDTO } from "../model/CurrentEntry";
import { Result } from "../lib/types/Result";
import { Repository } from "./Repository";
import { Database } from 'bun:sqlite';


export class EntryRepository implements Repository<CurrentEntry> {
  private _db: Database;

  constructor (db: Database) {
    this._db = db;
  }

  get db(): Database {
    return this.db;
  }

  create(entry: CurrentEntry): Result<string> {
    const query = this._db.query(insertEntryQuery);
    let entryResult: CurrentEntryDTO | undefined = undefined;

    try {
      entryResult = query.get(
        entryQueryValues(entry.toPersistance())
      ) as CurrentEntryDTO;
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!entryResult) {
      return { ok: false, error: 'Error saving entry.' };
    }

    return { ok: true, data: entryResult.id };
  }

  update(entry: CurrentEntry): Result<CurrentEntry> {
    const query = this._db.query(updateEntryQuery);
    let updateResponse: CurrentEntryDTO | undefined = undefined;
    try {
      updateResponse = query.get(
        entryQueryValues(entry.toPersistance())
      ) as CurrentEntryDTO;
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!updateResponse) {
      return { ok: false, error: 'Failed to update entry' };
    }

    return { ok: true, data: entry };
  }

  delete(entryId: string): Result<boolean> {
    const query = this._db
      .query(`DELETE FROM entries WHERE id=$id RETURNING id`);
    let deleteResult: { id: string; } | undefined = undefined;
    try {
      deleteResult = query.get() as { id: string; };
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!deleteResult) {
      return {
        ok: false,
        error: `There was a problem deleting the entry ${entryId}`
      };
    }

    return { ok: true, data: true };
  }

  findById(entryId: string): Result<CurrentEntry> {
    const query = this._db.query(
      `SELECT * FROM entries WHERE id=$id;`
    );
    let unreadResult: PersistanceEntryDTO | undefined = undefined;

    try {
      unreadResult = query
        .get({ $id: entryId }) as PersistanceEntryDTO;
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!unreadResult) {
      return {
        ok: false,
        error: `There was a problem retrievingthe entry: ${entryId}`
      };
    }

    return {
      ok: true,
      data: CurrentEntry.fromPersistance(unreadResult)
    };
  }

  findByFeedId(feedId: string): Result<CurrentEntry[]> {
    const query = this._db.query(
      `SELECT * FROM entries WHERE feedId=$feedId;`
    );
    let entriesResult: PersistanceEntryDTO[] | undefined = undefined;

    try {
      entriesResult = query.all(
        { $feedId: feedId }
      ) as PersistanceEntryDTO[];
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!entriesResult) {
      return {
        ok: false,
        error: `There was a problem retrieving entries for the feed ${feedId}.`
      };
    }

    return {
      ok: true,
      data: entriesResult.map(
        (e) => CurrentEntry.fromPersistance(e)
      )
    };
  }

  findAll(): Result<CurrentEntry[]> {
    const query = this._db.query(
      `SELECT * FROM entries;`
    );
    let entriesResult: PersistanceEntryDTO[] | undefined = undefined;

    try {
      entriesResult = query.all() as PersistanceEntryDTO[];
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!entriesResult) {
      return {
        ok: false,
        error: 'There was a problem retrieving entries'
      };
    }

    return {
      ok: true,
      data: entriesResult.map(
        (e) => CurrentEntry.fromPersistance(e)
      )
    };
  }

  findByStatus(status: 'read' | 'unread'): Result<CurrentEntry[]> {
    const query = this._db.query(
      `SELECT * FROM entries WHERE read=$read;`
    );
    let statusResult: PersistanceEntryDTO[] | undefined = undefined;
    try {
      statusResult = query.all(
        { $read: status === 'read' ? 1 : 0 }
      ) as PersistanceEntryDTO[];
    } catch (err) {
      return { ok: false, error: String(err) };
    }

    if (!statusResult) {
      return {
        ok: false,
        error: `There was a problem retrieving ${status} entries`
      };
    }

    return {
      ok: true,
      data: statusResult.map((e) => CurrentEntry.fromPersistance(e))
    };
  }
}

const insertEntryQuery = `
          INSERT INTO entries (
          id,
          rssId,
          feedId,
          title,
          updated,
          published,
          authors,
          content,
          links,
          summary,
          categories,
          media,
          feedTitle,
          feedLogo,
          feedIcon,
          read
        )
        VALUES (
          $id,
          $rssId,
          $feedId,
          $title,
          $updated,
          $published,
          $authors,
          $content,
          $links,
          $summary,
          $categories,
          $media,
          $feedTitle,
          $feedLogo,
          $feedIcon,
          $read
        )
        RETURNING *;
`;

const updateEntryQuery = `
          UPDATE entries
          SET 
            rssId = $rssId,
            feedId = $feedId,
            title = $title,
            updated = $updated,
            published = $published,
            authors = $authors,
            content = $content,
            links = $links,
            summary = $summary,
            categories = $categories,
            media = $media,
            feedTitle = $feedTitle,
            feedLogo = $feedLogo,
            feedIcon = $feedIcon,
            read = $read
          WHERE
            id = $id;
`;


const entryQueryValues = (entryDTO: PersistanceEntryDTO) => {
  return {
    $id: entryDTO.id,
    $rssId: entryDTO.rssId || null,
    $feedId: entryDTO.feedId || null,
    $title: entryDTO.title || null,
    $updated: entryDTO.updated || null,
    $published: entryDTO.published || null,
    $authors: entryDTO.authors || null,
    $content: entryDTO.content || null,
    $links: entryDTO.links || null,
    $summary: entryDTO.summary || null,
    $categories: entryDTO.categories || null,
    $media: entryDTO.media || null,
    $feedTitle: entryDTO.feedTitle || null,
    $feedLogo: entryDTO.feedLogo || null,
    $feedIcon: entryDTO.feedIcon || null,
    $read: entryDTO.read || false,
  };
};