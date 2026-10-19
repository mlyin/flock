import "react-native-url-polyfill/auto";
import { AppState } from "react-native";
import * as SecureStore from "expo-secure-store";
import { createClient, processLock } from "@supabase/supabase-js";
import { File } from "expo-file-system";
import * as Crypto from "expo-crypto";

// Public client credentials. Access to inventory and photos is controlled by RLS.
const storage = {
  getItem: (key) => SecureStore.getItemAsync(key),
  setItem: (key, value) => SecureStore.setItemAsync(key, value),
  removeItem: (key) => SecureStore.deleteItemAsync(key),
};
export const supabase = createClient(
  "https://kcudagjttmnklnveitgh.supabase.co",
  "sb_publishable_5n3S6vfa0iJ5nm5Kr8jGSA_Bm-giIvl",
  {
    auth: {
      storage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      lock: processLock,
    },
  },
);
AppState.addEventListener("change", (state) => {
  if (state === "active") supabase.auth.startAutoRefresh();
  else supabase.auth.stopAutoRefresh();
});
export async function loadItems(userId) {
  const { data, error } = await supabase
    .from("items")
    .select(
      "id,title,brand,size,category,condition,notes,cost_basis,list_price,floor_price,status,sku,created_at,photos(id,storage_path,sort_order)",
    )
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  const paths = data.flatMap((i) => i.photos.map((p) => p.storage_path));
  let signed = [];
  if (paths.length) {
    const result = await supabase.storage
      .from("photos")
      .createSignedUrls(paths, 3600);
    if (result.error) throw result.error;
    signed = result.data;
  }
  const urls = new Map(signed.map((p) => [p.path, p.signedUrl]));
  return data.map((item) => ({
    ...item,
    photo: urls.get(
      [...item.photos].sort((a, b) => a.sort_order - b.sort_order)[0]
        ?.storage_path,
    ),
  }));
}
export async function saveItem(userId, input, existingId, photoUri) {
  if (existingId) {
    const { data, error } = await supabase
      .from("items")
      .update(input)
      .eq("id", existingId)
      .eq("user_id", userId)
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }
  if (!photoUri) throw new Error("Add a garment photo before saving.");
  const id = Crypto.randomUUID();
  const path = `${userId}/${id}/${Crypto.randomUUID()}.jpg`;
  const bytes = await new File(photoUri).arrayBuffer();
  const upload = await supabase.storage
    .from("photos")
    .upload(path, bytes, { contentType: "image/jpeg" });
  if (upload.error) throw upload.error;
  let inserted = false;
  try {
    const sku = await supabase.rpc("next_sku", { p_user: userId });
    if (sku.error) throw sku.error;
    const item = await supabase
      .from("items")
      .insert({
        ...input,
        id,
        user_id: userId,
        sku: sku.data,
        status: "draft",
        review_state: "confirmed",
      });
    if (item.error) throw item.error;
    inserted = true;
    const photo = await supabase
      .from("photos")
      .insert({
        user_id: userId,
        item_id: id,
        storage_path: path,
        bytes: bytes.byteLength,
        role: "hero",
        sort_order: 0,
      });
    if (photo.error) throw photo.error;
    return id;
  } catch (error) {
    if (inserted)
      await supabase.from("items").delete().eq("id", id).eq("user_id", userId);
    await supabase.storage.from("photos").remove([path]);
    throw error;
  }
}
