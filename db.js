import * as SQLite from 'expo-sqlite';

let db;

export async function initDatabase() {
  db = await SQLite.openDatabaseAsync('studysnap.db');

  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS decks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS cards (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      deck_id INTEGER NOT NULL,
      question TEXT NOT NULL,
      answer TEXT NOT NULL,
      FOREIGN KEY (deck_id) REFERENCES decks (id)
    );
  `);
}

export async function saveDeck(name, cards) {
  const result = await db.runAsync('INSERT INTO decks (name) VALUES (?)', name);
  const deckId = result.lastInsertRowId;

  for (const card of cards) {
    await db.runAsync(
      'INSERT INTO cards (deck_id, question, answer) VALUES (?, ?, ?)',
      deckId,
      card.question,
      card.answer
    );
  }

  return deckId;
}

export async function getDecks() {
  return await db.getAllAsync('SELECT * FROM decks ORDER BY created_at DESC');
}

export async function getCardsForDeck(deckId) {
  return await db.getAllAsync('SELECT * FROM cards WHERE deck_id = ?', deckId);
}

export async function deleteDeck(deckId) {
  await db.runAsync('DELETE FROM cards WHERE deck_id = ?', deckId);
  await db.runAsync('DELETE FROM decks WHERE id = ?', deckId);
}