import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Image, Alert, ScrollView, ActivityIndicator, TextInput, FlatList, Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as FileSystem from 'expo-file-system/legacy';
import { initDatabase, saveDeck, getDecks, getCardsForDeck, deleteDeck } from './db';

const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const MAX_PHOTOS = 5;

// ---------- Design tokens ----------
const COLORS = {
  paper: '#F6F1E7',
  paperCard: '#FFFDF8',
  ink: '#24262B',
  inkSoft: '#726C5E',
  teal: '#10665A',
  tealDark: '#0B4A41',
  mustard: '#E8A93B',
  mustardDark: '#B87F1E',
  danger: '#B3453C',
  border: '#E7DFCC',
};

export default function App() {
  const [screen, setScreen] = useState('home'); // 'home' | 'decks' | 'deckDetail'
  const [photos, setPhotos] = useState([]);
  const [flashcards, setFlashcards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [deckName, setDeckName] = useState('');
  const [saving, setSaving] = useState(false);
  const [decks, setDecks] = useState([]);
  const [selectedDeck, setSelectedDeck] = useState(null);
  const [selectedDeckCards, setSelectedDeckCards] = useState([]);

  useEffect(() => {
    initDatabase();
  }, []);

  const addPhoto = async () => {
    if (photos.length >= MAX_PHOTOS) {
      Alert.alert('Limit reached', `You can add up to ${MAX_PHOTOS} photos per scan.`);
      return;
    }

    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert('Permission needed', 'Camera access is required to scan notes.');
      return;
    }

    const result = await ImagePicker.launchCameraAsync({ quality: 0.8 });
    if (result.canceled) return;

    setPhotos((prev) => [...prev, result.assets[0].uri]);
  };

  const removePhoto = (index) => {
    setPhotos((prev) => prev.filter((_, i) => i !== index));
  };

  const clearScan = () => {
    setPhotos([]);
    setFlashcards([]);
    setDeckName('');
  };

  const generateFlashcards = async () => {
    if (photos.length === 0) {
      Alert.alert('No photos', 'Add at least one photo first.');
      return;
    }

    setLoading(true);
    try {
      const imageParts = await Promise.all(
        photos.map(async (uri) => {
          const base64 = await FileSystem.readAsStringAsync(uri, {
            encoding: FileSystem.EncodingType.Base64,
          });
          return { inline_data: { mime_type: 'image/jpeg', data: base64 } };
        })
      );

      const prompt = `Look at these images of handwritten or printed notes (they may be multiple pages of the same set of notes). Extract the key concepts across all pages and generate an appropriate number of flashcards (question and answer pairs) based on how much content is present — generate between 3 and 10 cards, using your judgment on what's actually worth a separate flashcard. Don't pad with redundant or trivial cards just to hit a number. The text may be in English or Sinhala - respond in the same language as the notes. Respond ONLY with a JSON array, no markdown, no extra text, in this exact format: [{"question": "...", "answer": "..."}]`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }, ...imageParts] }],
          }),
        }
      );

      const data = await response.json();
      const textOutput = data.candidates[0].content.parts[0].text;
      const cleaned = textOutput.replace(/```json|```/g, '').trim();
      setFlashcards(JSON.parse(cleaned));
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not generate flashcards. Check console for details.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveDeck = async () => {
    if (!deckName.trim()) {
      Alert.alert('Name required', 'Please enter a name for this deck.');
      return;
    }
    setSaving(true);
    try {
      await saveDeck(deckName.trim(), flashcards);
      Alert.alert('Saved', `"${deckName}" saved with ${flashcards.length} cards.`);
      clearScan();
    } catch (error) {
      console.error(error);
      Alert.alert('Error', 'Could not save deck.');
    } finally {
      setSaving(false);
    }
  };

  const openDecksScreen = async () => {
    const allDecks = await getDecks();
    setDecks(allDecks);
    setScreen('decks');
  };

  const openDeckDetail = async (deck) => {
    const cards = await getCardsForDeck(deck.id);
    setSelectedDeck(deck);
    setSelectedDeckCards(cards);
    setScreen('deckDetail');
  };

  const handleDeleteDeck = (deck) => {
    Alert.alert(
      'Delete deck',
      `"${deck.name}" and its cards will be permanently removed.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            await deleteDeck(deck.id);
            const allDecks = await getDecks();
            setDecks(allDecks);
          },
        },
      ]
    );
  };

  // ---------- DECKS LIST SCREEN ----------
  if (screen === 'decks') {
    return (
      <View style={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
        <Text style={styles.eyebrow}>YOUR LIBRARY</Text>
        <Text style={styles.title}>My Decks</Text>

        <FlatList
          style={{ width: '100%' }}
          contentContainerStyle={{ paddingBottom: 20 }}
          data={decks}
          keyExtractor={(item) => item.id.toString()}
          ListEmptyComponent={
            <Text style={styles.emptyText}>No decks yet — snap your first page to get started.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.deckItem}>
              <View style={styles.deckTab} />
              <TouchableOpacity style={styles.deckItemBody} onPress={() => openDeckDetail(item)}>
                <Text style={styles.deckName}>{item.name}</Text>
                <Text style={styles.deckMeta}>Tap to review</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteButton} onPress={() => handleDeleteDeck(item)}>
                <Text style={styles.deleteIcon}>🗑</Text>
              </TouchableOpacity>
            </View>
          )}
        />

        <TouchableOpacity style={styles.ghostButton} onPress={() => setScreen('home')}>
          <Text style={styles.ghostButtonText}>← Back home</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ---------- DECK DETAIL SCREEN ----------
  if (screen === 'deckDetail') {
    return (
      <ScrollView contentContainerStyle={styles.container}>
        <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />
        <Text style={styles.eyebrow}>DECK</Text>
        <Text style={styles.title}>{selectedDeck?.name}</Text>

        {selectedDeckCards.map((card, i) => (
          <View key={card.id} style={styles.indexCard}>
            <View style={styles.cardTabStrip} />
            <View style={styles.cardBody}>
              <Text style={styles.cardLabel}>Q{i + 1}</Text>
              <Text style={styles.cardQ}>{card.question}</Text>
              <View style={styles.cardDivider} />
              <Text style={styles.cardA}>{card.answer}</Text>
            </View>
          </View>
        ))}

        <TouchableOpacity style={styles.ghostButton} onPress={() => setScreen('decks')}>
          <Text style={styles.ghostButtonText}>← Back to decks</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ---------- HOME SCREEN ----------
  return (
    <ScrollView contentContainerStyle={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor={COLORS.paper} />

      <Text style={styles.eyebrow}>NOTES → FLASHCARDS</Text>
      <Text style={styles.title}>StudySnap</Text>
      <Text style={styles.subtitle}>Photograph a page, get a deck.</Text>

      {photos.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>PAGES ({photos.length}/{MAX_PHOTOS})</Text>
          <View style={styles.thumbRow}>
            {photos.map((uri, i) => (
              <View
                key={i}
                style={[styles.thumbWrapper, { transform: [{ rotate: `${i % 2 === 0 ? -4 : 4}deg` }] }]}
              >
                <Image source={{ uri }} style={styles.thumb} />
                <TouchableOpacity style={styles.removeBadge} onPress={() => removePhoto(i)}>
                  <Text style={styles.removeBadgeText}>✕</Text>
                </TouchableOpacity>
              </View>
            ))}
          </View>
        </>
      )}

      <TouchableOpacity style={styles.primaryButton} onPress={addPhoto}>
        <Text style={styles.primaryButtonText}>📸  Add Photo</Text>
      </TouchableOpacity>

      {photos.length > 0 && flashcards.length === 0 && (
        <TouchableOpacity style={styles.mustardButton} onPress={generateFlashcards} disabled={loading}>
          <Text style={styles.mustardButtonText}>
            {loading ? 'Reading your notes…' : '✨  Generate Flashcards'}
          </Text>
        </TouchableOpacity>
      )}

      <TouchableOpacity style={styles.ghostButton} onPress={openDecksScreen}>
        <Text style={styles.ghostButtonText}>📚  My Decks</Text>
      </TouchableOpacity>

      {loading && <ActivityIndicator size="large" color={COLORS.teal} style={{ marginTop: 24 }} />}

      {flashcards.length > 0 && (
        <>
          <Text style={styles.sectionLabel}>FLASHCARDS ({flashcards.length})</Text>
          {flashcards.map((card, i) => (
            <View key={i} style={styles.indexCard}>
              <View style={styles.cardTabStrip} />
              <View style={styles.cardBody}>
                <Text style={styles.cardLabel}>Q{i + 1}</Text>
                <Text style={styles.cardQ}>{card.question}</Text>
                <View style={styles.cardDivider} />
                <Text style={styles.cardA}>{card.answer}</Text>
              </View>
            </View>
          ))}

          <View style={styles.saveSection}>
            <Text style={styles.sectionLabel}>SAVE THIS DECK</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g. Chapter 4 — Networks"
              placeholderTextColor={COLORS.inkSoft}
              value={deckName}
              onChangeText={setDeckName}
            />
            <TouchableOpacity style={styles.primaryButton} onPress={handleSaveDeck} disabled={saving}>
              <Text style={styles.primaryButtonText}>{saving ? 'Saving…' : '💾  Save Deck'}</Text>
            </TouchableOpacity>
          </View>
        </>
      )}
    </ScrollView>
  );
}

const shadow = Platform.select({
  ios: {
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 6,
  },
  android: { elevation: 3 },
});

const styles = StyleSheet.create({
  container: {
    flexGrow: 1,
    backgroundColor: COLORS.paper,
    alignItems: 'center',
    padding: 24,
    paddingTop: 64,
  },
  eyebrow: {
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 2,
    color: COLORS.teal,
    marginBottom: 6,
  },
  title: {
    fontSize: 34,
    fontWeight: '800',
    color: COLORS.ink,
    marginBottom: 6,
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 15,
    color: COLORS.inkSoft,
    marginBottom: 28,
  },
  sectionLabel: {
    width: '100%',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1.5,
    color: COLORS.inkSoft,
    marginTop: 26,
    marginBottom: 10,
  },
  emptyText: {
    fontSize: 15,
    color: COLORS.inkSoft,
    marginTop: 20,
    lineHeight: 22,
  },

  thumbRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', width: '100%' },
  thumbWrapper: { margin: 8, position: 'relative', ...shadow },
  thumb: {
    width: 72,
    height: 72,
    borderRadius: 4,
    borderWidth: 3,
    borderColor: COLORS.paperCard,
    backgroundColor: COLORS.paperCard,
  },
  removeBadge: {
    position: 'absolute',
    top: -8,
    right: -8,
    backgroundColor: COLORS.danger,
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: COLORS.paper,
  },
  removeBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },

  primaryButton: {
    backgroundColor: COLORS.teal,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
    ...shadow,
  },
  primaryButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  mustardButton: {
    backgroundColor: COLORS.mustard,
    paddingVertical: 16,
    paddingHorizontal: 28,
    borderRadius: 14,
    marginTop: 14,
    width: '100%',
    alignItems: 'center',
    ...shadow,
  },
  mustardButtonText: { color: COLORS.ink, fontSize: 16, fontWeight: '700' },
  ghostButton: {
    paddingVertical: 13,
    paddingHorizontal: 24,
    borderRadius: 14,
    marginTop: 14,
    borderWidth: 1.5,
    borderColor: COLORS.teal,
    width: '100%',
    alignItems: 'center',
  },
  ghostButtonText: { color: COLORS.teal, fontSize: 15, fontWeight: '700' },

  indexCard: {
    width: '100%',
    flexDirection: 'row',
    backgroundColor: COLORS.paperCard,
    borderRadius: 10,
    marginTop: 12,
    overflow: 'hidden',
    ...shadow,
  },
  cardTabStrip: { width: 6, backgroundColor: COLORS.mustard },
  cardBody: { flex: 1, padding: 16 },
  cardLabel: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    color: COLORS.mustardDark,
    marginBottom: 6,
  },
  cardQ: { fontSize: 16, fontWeight: '700', color: COLORS.ink, lineHeight: 22 },
  cardDivider: { height: 1, backgroundColor: COLORS.border, marginVertical: 10 },
  cardA: { fontSize: 15, color: COLORS.inkSoft, lineHeight: 21 },

  saveSection: { width: '100%', marginTop: 6, alignItems: 'center' },
  input: {
    width: '100%',
    backgroundColor: COLORS.paperCard,
    borderWidth: 1.5,
    borderColor: COLORS.border,
    borderRadius: 12,
    padding: 14,
    marginBottom: 4,
    fontSize: 15,
    color: COLORS.ink,
  },

  deckItem: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'stretch',
    backgroundColor: COLORS.paperCard,
    borderRadius: 10,
    marginTop: 10,
    overflow: 'hidden',
    ...shadow,
  },
  deckTab: { width: 6, backgroundColor: COLORS.teal },
  deckItemBody: { flex: 1, paddingVertical: 16, paddingHorizontal: 14 },
  deckName: { fontSize: 17, fontWeight: '700', color: COLORS.ink },
  deckMeta: { fontSize: 12, color: COLORS.inkSoft, marginTop: 3 },
  deleteButton: { justifyContent: 'center', paddingHorizontal: 16 },
  deleteIcon: { fontSize: 18 },
});