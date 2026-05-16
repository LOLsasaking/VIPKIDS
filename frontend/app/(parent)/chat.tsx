import React, { useEffect, useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, FlatList, TextInput, TouchableOpacity, KeyboardAvoidingView,
  Platform, Image, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Send } from 'lucide-react-native';
import { Api } from '@/src/api';
import { useAuth } from '@/src/auth';
import { C, S, T, Fonts } from '@/src/theme';

export default function ChatScreen() {
  const { user } = useAuth();
  const [conversations, setConversations] = useState<any[]>([]);
  const [active, setActive] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const poll = useRef<any>(null);

  useEffect(() => {
    Api.conversations().then((c) => {
      setConversations(c);
      if (c.length) setActive(c[0]);
      setLoading(false);
    });
  }, []);

  const loadMessages = useCallback(async (uid: string) => {
    try { const m = await Api.messages(uid); setMessages(m); } catch {}
  }, []);

  useEffect(() => {
    if (!active) return;
    loadMessages(active.user.id);
    poll.current = setInterval(() => loadMessages(active.user.id), 3000);
    return () => clearInterval(poll.current);
  }, [active, loadMessages]);

  const send = async () => {
    if (!text.trim() || !active) return;
    const t = text.trim();
    setText('');
    await Api.sendMessage(active.user.id, t, undefined);
    loadMessages(active.user.id);
  };

  if (loading) return <SafeAreaView style={styles.loader}><ActivityIndicator color={C.gold} /></SafeAreaView>;

  if (conversations.length === 0) {
    return (
      <SafeAreaView style={styles.root}>
        <View style={styles.empty}>
          <Text style={[T.h3, { textAlign: 'center' }]}>No conversations yet</Text>
          <Text style={[T.bodySm, { textAlign: 'center', marginTop: 8 }]}>
            Once you have an assigned driver, chat will appear here.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.root} edges={['top']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={80}
      >
        <View style={styles.header}>
          {active?.user?.photo_url && <Image source={{ uri: active.user.photo_url }} style={styles.avatar} />}
          <View style={{ flex: 1, marginLeft: S.sm }}>
            <Text style={styles.headerName}>{active?.user?.name}</Text>
            <Text style={styles.headerSub}>
              {user?.role === 'parent' ? `Driver for ${active?.child_name}` : `Parent of ${active?.child_name}`}
            </Text>
          </View>
        </View>

        <FlatList
          data={messages}
          inverted={false}
          keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: S.md, gap: 8 }}
          ListEmptyComponent={() => (
            <Text style={[T.bodySm, { textAlign: 'center', marginTop: S.lg }]}>Send the first message.</Text>
          )}
          renderItem={({ item }) => {
            const mine = item.from_user_id === user?.id;
            return (
              <View style={[styles.bubble, mine ? styles.mine : styles.theirs]}>
                <Text style={[styles.bubbleText, mine && { color: C.bg }]}>{item.text}</Text>
                <Text style={[styles.bubbleTime, mine && { color: C.bg, opacity: 0.6 }]}>
                  {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </Text>
              </View>
            );
          }}
        />

        <View style={styles.inputRow}>
          <TextInput
            testID="chat-input"
            style={styles.input}
            value={text}
            onChangeText={setText}
            placeholder="Write a message..."
            placeholderTextColor={C.textMuted}
            multiline
          />
          <TouchableOpacity onPress={send} style={styles.sendBtn} testID="chat-send">
            <Send size={18} color={C.bg} />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  loader: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: S.lg },
  header: { flexDirection: 'row', alignItems: 'center', padding: S.md, borderBottomColor: C.border, borderBottomWidth: 1 },
  avatar: { width: 44, height: 44, borderRadius: 22 },
  headerName: { ...T.h3, fontSize: 17 },
  headerSub: { ...T.bodySm, fontSize: 12 },
  bubble: { maxWidth: '78%', padding: 12, borderRadius: 16 },
  mine: { backgroundColor: C.gold, alignSelf: 'flex-end' },
  theirs: { backgroundColor: C.bgSecondary, alignSelf: 'flex-start', borderWidth: 1, borderColor: C.border },
  bubbleText: { ...T.body, fontSize: 14 },
  bubbleTime: { ...T.bodySm, fontSize: 10, marginTop: 4 },
  inputRow: { flexDirection: 'row', padding: S.sm, gap: S.sm, borderTopColor: C.border, borderTopWidth: 1, alignItems: 'flex-end' },
  input: { flex: 1, backgroundColor: C.bgSecondary, borderRadius: 18, padding: 12, color: C.text, fontFamily: Fonts.body, fontSize: 14, maxHeight: 100 },
  sendBtn: { backgroundColor: C.gold, width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center' },
});
