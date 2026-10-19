import React, { useEffect, useState, useRef } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import * as ImagePicker from "expo-image-picker";
import * as ImageManipulator from "expo-image-manipulator";
import * as Crypto from "expo-crypto";
import { supabase, loadItems, saveItem } from "./src/client";
import { samples } from "./src/samples";
import model from "./src/model.cjs";
const { CONDITIONS, itemInput, draftText, metrics } = model;
const blank = {
  title: "",
  brand: "",
  size: "",
  category: "",
  condition: "good",
  notes: "",
  cost_basis: "0",
  list_price: "",
  floor_price: "",
};
const money = (n) => `$${Number(n || 0).toFixed(2)}`;
const open = (url) =>
  Linking.openURL(url).catch(() =>
    Alert.alert("Unable to open link", "Please try again."),
  );
function Button({ title, onPress, secondary, disabled }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={[
        s.button,
        secondary && s.secondary,
        disabled && { opacity: 0.45 },
      ]}
    >
      <Text style={[s.buttonText, secondary && { color: "#ECEFE2" }]}>
        {title}
      </Text>
    </Pressable>
  );
}
function Field({
  label,
  value,
  onChangeText,
  multiline,
  secure,
  keyboardType,
}) {
  return (
    <View style={s.field}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        testID={`field-${label}`}
        style={[
          s.input,
          multiline && { height: 110, textAlignVertical: "top" },
        ]}
        value={String(value ?? "")}
        onChangeText={onChangeText}
        multiline={multiline}
        secureTextEntry={secure}
        autoCapitalize={secure || keyboardType === "email-address" ? "none" : "sentences"}
        autoCorrect={!secure && keyboardType !== "email-address"}
        keyboardType={keyboardType}
        placeholderTextColor="#757B68"
      />
    </View>
  );
}
function Art({ item, large = false }) {
  return item.photo ? (
    <Image
      accessibilityLabel={item.title}
      source={{ uri: item.photo }}
      style={[s.art, large && s.artLarge]}
    />
  ) : (
    <View
      style={[
        s.art,
        large && s.artLarge,
        {
          backgroundColor: item.sampleColor || "#2F3425",
          alignItems: "center",
          justifyContent: "center",
        },
      ]}
    >
      <Text style={{ fontSize: large ? 88 : 44, color: "#171A12" }}>♧</Text>
      <Text style={{ color: "#171A12", fontWeight: "700" }}>
        {" "}
        {item.category || "Garment"}{" "}
      </Text>
    </View>
  );
}
export default function App() {
  const userRef = useRef(null);
  const [session, setSession] = useState(null),
    [boot, setBoot] = useState(true),
    [demo, setDemo] = useState(false);
  const [email, setEmail] = useState(""),
    [password, setPassword] = useState(""),
    [busy, setBusy] = useState(false);
  const [items, setItems] = useState([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState("");
  const [tab, setTab] = useState("Closet"),
    [query, setQuery] = useState(""),
    [selected, setSelected] = useState(null),
    [editor, setEditor] = useState(null),
    [photo, setPhoto] = useState(null);
  useEffect(() => {
    let active = true;
    supabase.auth
      .getSession()
      .then(({ data, error }) => {
        if (active) {
          userRef.current = data.session?.user.id;
          setSession(data.session);
          setBoot(false);
          if (error) setError(error.message);
        }
      })
      .catch((e) => {
        if (active) {
          setError(e.message);
          setBoot(false);
        }
      });
    const { data } = supabase.auth.onAuthStateChange((_event, next) => {
      userRef.current = next?.user.id;
      setSession(next);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    if (!demo) {
      setItems([]);
      setSelected(null);
      if (session) refresh();
    }
  }, [session?.user.id, demo]);
  useEffect(() => {
    const handle = (url) => {
      if (url === "flock://sample") startDemo();
    };
    Linking.getInitialURL().then(handle);
    const sub = Linking.addEventListener("url", (e) => handle(e.url));
    return () => sub.remove();
  }, []);
  async function refresh() {
    if (demo || !session) return;
    setLoading(true);
    setError("");
    try {
      const id = session.user.id;
      const next = await loadItems(id);
      if (userRef.current === id) setItems(next);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }
  async function login() {
    if (!email.trim() || !password) {
      setError("Enter your email and password.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
      setPassword("");
      setDemo(false);
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  function startDemo() {
    setItems(samples.map((i) => ({ ...i })));
    setDemo(true);
    setError("");
    setTab("Closet");
  }
  async function pick(camera) {
    try {
      if (camera) {
        const permission = await ImagePicker.requestCameraPermissionsAsync();
        if (!permission.granted) {
          Alert.alert(
            "Camera access needed",
            "Allow camera access in Settings, or choose a photo instead.",
          );
          return;
        }
      }
      const result = await (
        camera
          ? ImagePicker.launchCameraAsync
          : ImagePicker.launchImageLibraryAsync
      )({
        mediaTypes: ["images"],
        quality: 0.9,
        allowsMultipleSelection: false,
      });
      if (result.canceled) return;
      const converted = await ImageManipulator.manipulateAsync(
        result.assets[0].uri,
        [{ resize: { width: 1600 } }],
        { compress: 0.85, format: ImageManipulator.SaveFormat.JPEG },
      );
      setPhoto(converted.uri);
    } catch (e) {
      Alert.alert("Could not add photo", e.message);
    }
  }
  function edit(item) {
    setEditor(
      item
        ? {
            ...blank,
            ...item,
            cost_basis: String(item.cost_basis ?? 0),
            list_price: item.list_price == null ? "" : String(item.list_price),
            floor_price:
              item.floor_price == null ? "" : String(item.floor_price),
          }
        : { ...blank },
    );
    setPhoto(item?.photo ?? null);
  }
  async function save() {
    setBusy(true);
    try {
      const input = itemInput(editor);
      if (!editor.id && !photo)
        throw new Error("Add a garment photo before saving.");
      if (demo) {
        const item = {
          ...editor,
          ...input,
          id: editor.id || Crypto.randomUUID(),
          photo,
          status: editor.status || "draft",
          sku: editor.sku || "SAMPLE",
        };
        setItems((old) => [item, ...old.filter((i) => i.id !== item.id)]);
        setSelected(item);
      } else {
        await saveItem(session.user.id, input, editor.id, photo);
        await refresh();
        setSelected(null);
      }
      setEditor(null);
    } catch (e) {
      Alert.alert("Could not save garment", e.message);
    } finally {
      setBusy(false);
    }
  }
  async function share(item) {
    try {
      await Share.share({ title: item.title, message: draftText(item) });
    } catch (e) {
      Alert.alert("Could not share draft", e.message);
    }
  }
  async function logout() {
    setBusy(true);
    try {
      if (!demo) {
        const { error } = await supabase.auth.signOut();
        if (error) throw error;
      }
      setDemo(false);
      setItems([]);
      setSelected(null);
      setError("");
      setTab("Closet");
    } catch (e) {
      Alert.alert("Could not sign out", e.message);
    } finally {
      setBusy(false);
    }
  }
  const totals = metrics(items),
    visible = items.filter((i) =>
      [i.title, i.brand, i.size]
        .join(" ")
        .toLowerCase()
        .includes(query.toLowerCase()),
    );
  if (boot)
    return (
      <SafeAreaProvider>
        <SafeAreaView style={s.page}>
          <ActivityIndicator
            color="#C0E42A"
            accessibilityLabel="Loading Flock"
          />
        </SafeAreaView>
      </SafeAreaProvider>
    );
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <SafeAreaView style={s.page}>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View style={s.header}>
            <Image source={require("./assets/brand-mark.png")} style={s.logo} />
            <Text style={s.wordmark}>flock</Text>
            <Text style={s.eyebrow}>
              {demo ? "SAMPLE CLOSET" : "YOUR RESALE STUDIO"}
            </Text>
          </View>
          {!session && !demo ? (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.content}
            >
              <Text style={s.kicker}>LESS CLUTTER. MORE POSSIBILITY.</Text>
              <Text style={s.hero}>
                {"Your closet,\nready for its\nnext chapter."}
              </Text>
              <Text style={s.body}>
                Photograph garments, organize your inventory, and prepare your
                next listing.
              </Text>
              <View style={s.panel}>
                <Text style={s.title}>Welcome back</Text>
                <Field
                  label="Email"
                  value={email}
                  onChangeText={setEmail}
                  keyboardType="email-address"
                />
                <Field
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  secure
                />
                {!!error && (
                  <Text accessibilityRole="alert" style={s.error}>
                    {error}
                  </Text>
                )}
                <Button
                  title={busy ? "Signing in…" : "Sign in"}
                  onPress={login}
                  disabled={busy}
                />
                <Button
                  secondary
                  title="Explore a sample closet"
                  onPress={startDemo}
                />
                <Text style={s.caption}>
                  Sample changes stay in this session. Sign in to save to your
                  Flock account.
                </Text>
                <Button
                  secondary
                  title="Account help"
                  onPress={() => open("https://www.sellonflock.com/login")}
                />
              </View>
              <View style={s.row}>
                <Button
                  secondary
                  title="Privacy"
                  onPress={() => open("https://www.sellonflock.com/privacy")}
                />
                <Button
                  secondary
                  title="Support"
                  onPress={() => open("https://www.sellonflock.com/support")}
                />
              </View>
            </ScrollView>
          ) : (
            <>
              {tab === "Closet" ? (
                <FlatList
                  data={visible}
                  keyExtractor={(i) => i.id}
                  refreshing={loading}
                  onRefresh={refresh}
                  contentContainerStyle={s.content}
                  keyboardShouldPersistTaps="handled"
                  ListHeaderComponent={
                    <>
                      <Text style={s.kicker}>
                        {demo ? "TRY IT OUT" : "ALL YOUR GARMENTS, TOGETHER"}
                      </Text>
                      <Text style={s.hero}>The closet.</Text>
                      <View style={s.row}>
                        <View style={s.stat}>
                          <Text style={s.number}>{totals.count}</Text>
                          <Text style={s.caption}>GARMENTS</Text>
                        </View>
                        <View style={s.stat}>
                          <Text style={s.number}>{money(totals.asking)}</Text>
                          <Text style={s.caption}>ASKING VALUE</Text>
                        </View>
                      </View>
                      {demo && (
                        <Text style={s.notice}>
                          Sample workspace · not connected to your account
                        </Text>
                      )}
                      <Field
                        label="Search your closet"
                        value={query}
                        onChangeText={setQuery}
                      />
                      <Button
                        title="+ Add a garment"
                        onPress={() => edit(null)}
                      />
                      {!!error && (
                        <View>
                          <Text accessibilityRole="alert" style={s.error}>
                            {error}
                          </Text>
                          <Button
                            secondary
                            title="Try again"
                            onPress={refresh}
                          />
                        </View>
                      )}
                    </>
                  }
                  ListEmptyComponent={
                    !loading ? (
                      <Text style={s.body}>
                        {query
                          ? "No garments match your search."
                          : "Your next chapter starts with a photo. Add your first garment above."}
                      </Text>
                    ) : null
                  }
                  renderItem={({ item }) => (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={`Open ${item.title}`}
                      onPress={() => setSelected(item)}
                      style={s.card}
                    >
                      <Art item={item} />
                      <View style={{ flex: 1, gap: 6 }}>
                        <Text style={s.caption}>{item.sku || item.status}</Text>
                        <Text style={s.title}>{item.title}</Text>
                        <Text style={s.body}>
                          {[item.brand, item.size].filter(Boolean).join(" · ")}
                        </Text>
                        <Text style={s.price}>
                          {item.list_price != null
                            ? money(item.list_price)
                            : "Not priced yet"}
                        </Text>
                      </View>
                      <Text style={s.body}>›</Text>
                    </Pressable>
                  )}
                />
              ) : tab === "Drafts" ? (
                <ScrollView contentContainerStyle={s.content}>
                  <Text style={s.kicker}>READY WHEN YOU ARE</Text>
                  <Text style={s.hero}>Your drafts.</Text>
                  <Text style={s.body}>
                    Review the copy, then share it wherever you sell. Sharing
                    does not publish a marketplace listing.
                  </Text>
                  {items.length === 0 && (
                    <Text style={s.notice}>
                      Add a garment to prepare your first draft.
                    </Text>
                  )}
                  {items.map((item) => (
                    <View key={item.id} style={s.panel}>
                      <Text style={s.title}>{item.title}</Text>
                      <Text selectable style={s.body}>
                        {draftText(item)}
                      </Text>
                      <Button title="Share draft" onPress={() => share(item)} />
                      <Button
                        secondary
                        title="Edit garment"
                        onPress={() => edit(item)}
                      />
                    </View>
                  ))}
                </ScrollView>
              ) : (
                <ScrollView contentContainerStyle={s.content}>
                  <Text style={s.kicker}>MAKE SPACE FOR WHAT'S NEXT</Text>
                  <Text style={s.hero}>Your account.</Text>
                  <View style={s.panel}>
                    <Text style={s.title}>
                      {demo ? "Sample workspace" : session?.user.email}
                    </Text>
                    <Text style={s.body}>
                      {demo
                        ? "Explore without changing your real inventory. Sample changes reset when you leave."
                        : "Your inventory is connected to your Flock account."}
                    </Text>
                    <Text style={s.caption}>
                      Inventory cost: {money(totals.cost)}
                    </Text>
                    <Button
                      secondary
                      title="Privacy policy"
                      onPress={() =>
                        open("https://www.sellonflock.com/privacy")
                      }
                    />
                    <Button
                      secondary
                      title="Contact support"
                      onPress={() =>
                        open("https://www.sellonflock.com/support")
                      }
                    />
                    {!demo && (
                      <Button
                        secondary
                        title="Delete my account"
                        onPress={() =>
                          Alert.alert(
                            "Delete your Flock account",
                            "Continue to the secure account page and choose Delete account. You may need to sign in again. This removes your account and inventory.",
                            [
                              { text: "Cancel", style: "cancel" },
                              {
                                text: "Continue to account page",
                                onPress: () =>
                                  open("https://www.sellonflock.com/settings"),
                              },
                            ],
                          )
                        }
                      />
                    )}
                    <Button
                      title={demo ? "Leave sample closet" : "Sign out"}
                      onPress={logout}
                      disabled={busy}
                    />
                  </View>
                  <Text style={s.caption}>
                    Flock 1.0 · Independent resale tools
                  </Text>
                </ScrollView>
              )}
              <View style={s.tabs}>
                {["Closet", "Drafts", "Account"].map((name) => (
                  <Pressable
                    key={name}
                    accessibilityRole="tab"
                    accessibilityState={{ selected: tab === name }}
                    style={[s.tab, tab === name && s.tabActive]}
                    onPress={() => setTab(name)}
                  >
                    <Text
                      style={[s.tabText, tab === name && { color: "#C0E42A" }]}
                    >
                      {name}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          )}
        </KeyboardAvoidingView>
        <Modal
          visible={!!editor || !!selected}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={() => {
            if (!busy) {
              setEditor(null);
              setSelected(null);
            }
          }}
        >
          <SafeAreaView style={s.page}>
            {editor ? (
              <KeyboardAvoidingView
                style={{ flex: 1 }}
                behavior={Platform.OS === "ios" ? "padding" : undefined}
              >
                <ScrollView
                  keyboardShouldPersistTaps="handled"
                  contentContainerStyle={s.content}
                >
                  {editor && (
                    <>
                      <Button
                        secondary
                        title="Cancel"
                        onPress={() => setEditor(null)}
                        disabled={busy}
                      />
                      <Text style={s.hero}>
                        {editor.id ? "Edit garment." : "A new chapter."}
                      </Text>
                      {photo && (
                        <Image source={{ uri: photo }} style={s.artLarge} />
                      )}
                      {!editor.id && (
                        <View style={s.row}>
                          <Button
                            title="Take photo"
                            onPress={() => pick(true)}
                          />
                          <Button
                            secondary
                            title="Choose photo"
                            onPress={() => pick(false)}
                          />
                        </View>
                      )}
                      {[
                        ["title", "Title"],
                        ["brand", "Brand"],
                        ["size", "Size"],
                        ["category", "Category"],
                        ["cost_basis", "Cost ($)"],
                        ["list_price", "Asking price ($)"],
                        ["floor_price", "Minimum price ($)"],
                      ].map(([key, label]) => (
                        <Field
                          key={key}
                          label={label}
                          value={editor[key]}
                          onChangeText={(value) =>
                            setEditor({ ...editor, [key]: value })
                          }
                          keyboardType={
                            [
                              "cost_basis",
                              "list_price",
                              "floor_price",
                            ].includes(key)
                              ? "decimal-pad"
                              : undefined
                          }
                        />
                      ))}
                      <Text style={s.label}>Condition</Text>
                      <View style={s.wrap}>
                        {CONDITIONS.map((c) => (
                          <Pressable
                            accessibilityRole="radio"
                            accessibilityState={{
                              checked: editor.condition === c,
                            }}
                            key={c}
                            style={[
                              s.chip,
                              editor.condition === c && s.chipSelected,
                            ]}
                            onPress={() =>
                              setEditor({ ...editor, condition: c })
                            }
                          >
                            <Text style={s.tabText}>
                              {c === "nwt" ? "New with tags" : c}
                            </Text>
                          </Pressable>
                        ))}
                      </View>
                      <Field
                        label="Notes and flaws"
                        value={editor.notes}
                        multiline
                        onChangeText={(value) =>
                          setEditor({ ...editor, notes: value })
                        }
                      />
                      <Text style={s.caption}>
                        Your costs and minimum price stay private; they are
                        never included in shared drafts.
                      </Text>
                      <Button
                        title={busy ? "Saving…" : "Save garment"}
                        onPress={save}
                        disabled={busy}
                      />
                    </>
                  )}
                </ScrollView>
              </KeyboardAvoidingView>
            ) : (
              <ScrollView contentContainerStyle={s.content}>
                {selected && (
                  <>
                    <Button
                      secondary
                      title="Back to closet"
                      onPress={() => setSelected(null)}
                    />
                    <Art item={selected} large />
                    <Text style={s.kicker}>
                      {selected.sku || "YOUR GARMENT"}
                    </Text>
                    <Text style={s.hero}>{selected.title}</Text>
                    <Text style={s.body}>
                      {[selected.brand, selected.size, selected.condition]
                        .filter(Boolean)
                        .join(" · ")}
                    </Text>
                    <View style={s.row}>
                      <View style={s.stat}>
                        <Text style={s.price}>
                          {money(selected.cost_basis)}
                        </Text>
                        <Text style={s.caption}>COST</Text>
                      </View>
                      <View style={s.stat}>
                        <Text style={s.price}>
                          {selected.list_price == null
                            ? "—"
                            : money(selected.list_price)}
                        </Text>
                        <Text style={s.caption}>ASKING</Text>
                      </View>
                    </View>
                    <Text style={s.body}>
                      {selected.notes || "No notes yet."}
                    </Text>
                    <Button
                      title="Edit garment"
                      onPress={() => edit(selected)}
                    />
                    <Button
                      secondary
                      title="Share listing draft"
                      onPress={() => share(selected)}
                    />
                  </>
                )}
              </ScrollView>
            )}
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#12140D" },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 22,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderColor: "#2F3425",
  },
  logo: { width: 38, height: 38, borderRadius: 10 },
  wordmark: {
    fontSize: 29,
    fontWeight: "800",
    color: "#ECEFE2",
    letterSpacing: -1,
  },
  eyebrow: {
    fontSize: 9,
    color: "#A0A691",
    marginLeft: "auto",
    letterSpacing: 1,
  },
  content: {
    padding: 22,
    gap: 18,
    paddingBottom: 40,
    width: "100%",
    maxWidth: 800,
    alignSelf: "center",
  },
  kicker: {
    color: "#C0E42A",
    fontSize: 10,
    letterSpacing: 2,
    fontWeight: "700",
    marginTop: 10,
  },
  hero: {
    color: "#ECEFE2",
    fontSize: 42,
    lineHeight: 46,
    fontWeight: "700",
    letterSpacing: -1.5,
  },
  body: { color: "#A0A691", fontSize: 16, lineHeight: 24 },
  caption: {
    color: "#A0A691",
    fontSize: 11,
    lineHeight: 17,
    letterSpacing: 0.5,
  },
  title: { color: "#ECEFE2", fontSize: 20, fontWeight: "600" },
  panel: {
    backgroundColor: "#1A1D14",
    padding: 20,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: "#2F3425",
    gap: 14,
  },
  field: { gap: 8 },
  label: { color: "#ECEFE2", fontSize: 13, fontWeight: "600" },
  input: {
    backgroundColor: "#21251A",
    borderWidth: 1,
    borderColor: "#3C4430",
    borderRadius: 12,
    minHeight: 48,
    padding: 13,
    fontSize: 16,
    color: "#ECEFE2",
  },
  button: {
    backgroundColor: "#C0E42A",
    borderRadius: 12,
    minHeight: 48,
    padding: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  secondary: {
    backgroundColor: "#2A3021",
    borderWidth: 1,
    borderColor: "#3C4430",
  },
  buttonText: { color: "#14180A", fontSize: 15, fontWeight: "700" },
  error: { color: "#FFB4A3", fontSize: 14, lineHeight: 21 },
  row: { flexDirection: "row", gap: 12, flexWrap: "wrap" },
  stat: {
    flex: 1,
    minWidth: 120,
    backgroundColor: "#1A1D14",
    padding: 18,
    borderRadius: 16,
    gap: 8,
  },
  number: { color: "#ECEFE2", fontSize: 28, fontWeight: "600" },
  notice: {
    color: "#C0E42A",
    backgroundColor: "#2A3312",
    padding: 13,
    borderRadius: 10,
    fontSize: 13,
    lineHeight: 20,
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    gap: 15,
    padding: 13,
    borderRadius: 18,
    backgroundColor: "#1A1D14",
    marginTop: 14,
    borderWidth: 1,
    borderColor: "#2F3425",
  },
  art: { width: 90, height: 115, borderRadius: 12 },
  artLarge: { width: "100%", height: 280, borderRadius: 20 },
  price: { color: "#C0E42A", fontSize: 19, fontWeight: "600" },
  tabs: {
    flexDirection: "row",
    borderTopWidth: 1,
    borderColor: "#2F3425",
    padding: 10,
    gap: 8,
  },
  tab: { flex: 1, padding: 15, alignItems: "center", borderRadius: 12 },
  tabActive: { backgroundColor: "#2A3312" },
  tabText: { color: "#ECEFE2", fontWeight: "600", fontSize: 14 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#21251A",
    borderWidth: 1,
    borderColor: "#2F3425",
  },
  chipSelected: { borderColor: "#C0E42A", backgroundColor: "#2A3312" },
});
