import "react-native-url-polyfill/auto";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, BackHandler, Linking, Platform, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { WebView } from "react-native-webview";
import * as Notifications from "expo-notifications";
import * as Device from "expo-device";
import Constants from "expo-constants";
import { SITE, navigationTarget, notificationTarget } from "./navigation.cjs";

/**
 * Flock for iOS.
 *
 * The screen is the web app. Native push delivery and a dedicated capture flow
 * still need end-to-end integration before App Store submission.
 */

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

/** Registers for APNs and hands the token to Flock so the server can reach this device. */
async function registerForPush(postToWebView) {
  if (!Device.isDevice) return; // simulators have no push token
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  // Do not request permission until the authenticated token receiver and sender
  // are implemented and explicitly enabled in the app configuration.
  if (!projectId || Constants.expoConfig?.extra?.nativePushEnabled !== true) return;

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;
  if (status !== "granted") {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== "granted") return;

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

  // The web app owns the session, so it does the authenticated save rather than
  // this shell holding credentials of its own.
  postToWebView(JSON.stringify({ type: "push-token", token, platform: Platform.OS }));
}

export default function App() {
  const webview = useRef(null);
  const [canGoBack, setCanGoBack] = useState(false);
  const [failed, setFailed] = useState(false);

  const post = (message) => webview.current?.postMessage(message);

  useEffect(() => {
    registerForPush(post).catch(() => {
      // A device that won't take push is still a usable app.
    });
  }, []);

  // Android's hardware back button should walk the web history first.
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (canGoBack) {
        webview.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [canGoBack]);

  // Tapping a notification should land on the thing it was about.
  useEffect(() => {
    const sub = Notifications.addNotificationResponseReceivedListener((response) => {
      const url = notificationTarget(response.notification.request.content.data?.url);
      if (url) webview.current?.injectJavaScript(`location.href=${JSON.stringify(url)};true;`);
    });
    return () => sub.remove();
  }, []);

  if (failed) {
    return (
      <SafeAreaProvider>
        <SafeAreaView style={styles.center}>
          <ScrollView
            contentContainerStyle={styles.center}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={() => { setFailed(false); webview.current?.reload(); }} />
            }
          >
            <Text style={styles.title}>No connection</Text>
            <Text style={styles.body}>
              Flock could not load. Check your connection and pull down to try again.
            </Text>
          </ScrollView>
        </SafeAreaView>
      </SafeAreaProvider>
    );
  }

  return (
    <SafeAreaProvider>
      <StatusBar style="auto" />
      <SafeAreaView style={styles.fill} edges={["top", "left", "right"]}>
        <WebView
          ref={webview}
          source={{ uri: SITE }}
          style={styles.fill}
          // Sign-in and the camera both break without these.
          sharedCookiesEnabled
          thirdPartyCookiesEnabled
          allowsInlineMediaPlayback
          mediaCapturePermissionGrantType="grant"
          javaScriptCanOpenWindowsAutomatically
          pullToRefreshEnabled
          onNavigationStateChange={(state) => setCanGoBack(state.canGoBack)}
          onError={() => setFailed(true)}
          onHttpError={() => {}}
          startInLoadingState
          renderLoading={() => (
            <View style={styles.center}>
              <ActivityIndicator />
            </View>
          )}
          // Flock and the existing OAuth hosts stay embedded. Ordinary links
          // (including Stripe) open externally; executable schemes are blocked.
          onShouldStartLoadWithRequest={(request) => {
            const target = navigationTarget(request.url);
            if (target === "external") {
              Linking.openURL(request.url).catch(() => {});
            }
            return target === "internal";
          }}
        />
      </SafeAreaView>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: "#F7F8F1" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", padding: 28 },
  title: { fontSize: 20, fontWeight: "700", marginBottom: 8, color: "#171A12" },
  body: { fontSize: 15, lineHeight: 22, textAlign: "center", color: "#545948" },
});

