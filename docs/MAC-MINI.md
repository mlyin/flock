# Flock always‑on node — Mac mini setup runbook

**Read this first.** Two things in the brief are not achievable as stated, and the whole design follows from them:

1. **You cannot run this with nobody logged in.** The Flock extension is a Chrome MV3 extension that reads ten marketplaces *from the seller's signed-in browser*. Chrome needs a GUI (Aqua) session. So the node is **auto-logged-in and unattended**, not logged out. Every other decision below — FileVault off, a LaunchAgent rather than a LaunchDaemon, no screen saver — exists to keep that one session standing up forever. **Auto-login is the hinge of this build**, not sleep settings.
2. **The calendar is built, and it does not run here.** `lib/calendar.ts` plus
   `/api/calendar/[token]` serve a subscribable feed from Vercel, and seven of
   ten channels now carry verified dispatch deadlines (eBay is verified to have
   *no* single number — handling time is a per-listing seller setting). The mini
   subscribes to that feed like any other client; nothing calendar-shaped needs
   to run on it.

---

## 0. Before you start

**Hardware**

- Apple-silicon Mac mini, wired Ethernet (Wi-Fi drops are indistinguishable from every other silent failure below).
- A small UPS. This is not optional insurance — the expensive thing on this box is a Chrome profile holding ten live marketplace sessions, and a dirty shutdown that corrupts it means a logged-out node, which means re-authenticating on eBay and Poshmark from a "new" device at whatever hour you notice.
- **A display dummy plug (HDMI, ~£8), or accept a bad fallback.** Apple-silicon minis do come up headless with a virtual display, but that is community consensus, not an Apple-documented behaviour, and the virtual display is 1920×1080 at 1×. Screen Sharing is your only path when SSH is not enough (FileVault prompt, a modal dialog, System Settings panes that resist `defaults`), and at 1× it is poor. Buy the plug now rather than discovering this during an outage.
- Keyboard + monitor for the first 30 minutes. You need them for Setup Assistant.

**Decide now, because it is painful later**

- **Fresh Chrome profile or a copy of your existing one?** A fresh profile means signing in to ten marketplaces from an unrecognised device. eBay and Poshmark treat that as a login-risk event — expect SMS/email challenges. Do all ten at the desk, in daylight, in one sitting (§3.2). Do not plan to do it remotely.
- **Where the node lives on the tailnet**, and that you will never port-forward SSH or VNC to the internet.

Record `sw_vers -productVersion` when you first boot. Tahoe (26.x) and Sequoia (15.x) differ on the FileVault default and on several System Settings pane locations.

---

## 1. macOS: power, sleep, login, FileVault, updates

### 1.1 Setup Assistant — the only step that is hard to undo

**Create the node's account as a plain local account. Do not sign in with an Apple Account.**

When Setup Assistant offers "Sign in with your Apple Account", choose **Set Up Later** → **Skip**. Then create a local admin user (e.g. `flock`) with its own password.

This one choice avoids two separate problems at once:

- Apple lists **three** things that block automatic login (support.apple.com/en-us/102316): FileVault is on; **the account is set up to use an Apple Account password to log in**; the home folder is encrypted. Tahoe's setup flow steers you into an Apple Account, which trips the first two simultaneously — and if you only know about FileVault, you will turn it off, find "Automatically log in as" *still* greyed out, and have nothing pointing at the cause.
- macOS 26 Tahoe auto-enables FileVault during Setup Assistant **when you sign in with an Apple Account**. A local-account setup does not do this. (The common claim "Tahoe turns FileVault on by default" is only true for Apple Account setups.)

Make the account an **administrator** — you need `sudo` over SSH.

Give the machine a stable name:

```bash
sudo scutil --set ComputerName flock-node
sudo scutil --set LocalHostName flock-node
sudo scutil --set HostName flock-node
```

### 1.2 FileVault off

**System Settings → Privacy & Security → FileVault → Turn Off.**

Verify:

```bash
fdesetup status
# FileVault is Off
```

FileVault on a headless unattended box is not a security posture, it is a tripwire: at the FileVault pre-boot screen macOS has not booted, so there is **no network, no Tailscale, no SSH**. A reboot with FileVault on means the machine is simply gone until someone walks to it with a keyboard.

If the box holds anything you would mind losing physically, the answer is physical security of the cupboard, not FileVault.

### 1.3 Automatic login

**System Settings → Users & Groups → "Automatically log in as" → choose `flock`**, enter the account password.

Verify from the shell:

```bash
sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser
# flock
```

**If the menu is greyed out**, work through Apple's three blockers in order: `fdesetup status` (must be Off), then check the account is not using an Apple Account password (System Settings → Users & Groups → click the account → it must not show an Apple Account under it; if it does, the fix is to create a *different* plain local account for the node), then confirm the home folder is not encrypted.

**Then reboot and watch it come back to a desktop unattended before you trust it.** Do not proceed until you have seen this happen once.

### 1.4 Power

```bash
sudo pmset -c sleep 0 displaysleep 10 disksleep 0 womp 1 autorestart 1
```

(`-c` is wall power; on a battery-less mini `-c` and `-a` are equivalent.)

- `sleep 0` — never system-sleep. This is the primary control.
- `displaysleep 10` — **let the display sleep.** Display sleep does *not* occlude apps and does not stop `chrome.alarms`. Apple's power-efficiency guide lists exactly three occlusion conditions: another app's windows covering yours, **the screen saver running**, and being in a Mission Control space the user isn't in. Display sleep is not one of them.
- `disksleep 0`, `womp 1` (wake for network access), `autorestart 1` (restart after power failure).

Do **not** rely on `disablesleep`. It does not appear in the `pmset(1)` man page at all — it is an undocumented implementation detail. If you set it as belt-and-braces, re-check `pmset -g | grep -i SleepDisabled` after every reboot and every macOS update, because nothing guarantees it survives either.

Check whether Power Nap even exists on this machine before touching it:

```bash
pmset -g custom | grep -i powernap    # if nothing prints, there is nothing to set
```

Verify the lot:

```bash
pmset -g custom
pmset -g | grep -E 'sleep|womp|autorestart'
```

**Optional belt-and-braces caffeinate.** If you want a second assertion on top of `sleep 0`, the correct flag set is `caffeinate -is` — `-i` prevents idle system sleep, `-s` prevents system sleep on AC.

**Do not use `caffeinate -dimsu`.** `-d` holds the *display* awake, which directly contradicts `displaysleep 10`; and `-u` without `-t` asserts user-activity for a default 5 seconds and then drops, so it does nothing except flick the panel on. If you run caffeinate, run it as a LaunchDaemon with `KeepAlive`, and confirm what it actually asserted:

```bash
pmset -g assertions
```

### 1.5 Screen saver off — the one that actually matters

The screen saver **does** occlude every app's windows, and Chrome responds to occlusion by telling renderers they are hidden.

**Set this in the GUI, not with `defaults`:**

**System Settings → Lock Screen:**
- "Start Screen Saver when inactive" → **Never**
- "Turn display off when inactive (on power adapter)" → **10 minutes** (matches `displaysleep`)
- "Require password after screen saver begins or display is turned off" → **Never**

Then verify from the shell:

```bash
defaults -currentHost read com.apple.screensaver idleTime
# 0
```

Writing `defaults -currentHost write com.apple.screensaver idleTime -int 0` is unreliable on Sonoma and later: System Settings does not re-read the value while the pane is open, and opening the pane afterwards has been reported to write the old value back. Set it by hand once, read it back, move on.

(Note that "Require password → Never" is another setting FileVault-on takes away from you — another reason §1.2 comes first.)

### 1.6 Automatic updates

**System Settings → General → Software Update → ⓘ next to "Automatic Updates":**

- **Off:** "Install macOS updates" — a major-version reboot at 03:00 is the single most likely way this node silently dies.
- **On:** "Install Security Responses and system files" — these are rapid security responses and generally do not reboot.
- On: "Check for updates" and "Download new updates when available" (so patches are staged and fast when you choose to apply them).

**Do not run `sudo softwareupdate --ignore 'macOS 27'`.** Apple removed major-version ignoring in Catalina 10.15.5 and dropped it entirely in Big Sur for non-supervised devices; `--ignore` is not in the current `softwareupdate(8)` man page. **It exits successfully and blocks nothing.** There is no unmanaged-Mac equivalent — deferral is MDM-only. Leaving the toggle off and patching by hand is the whole mechanism.

**When you do patch (monthly, §6):** on Apple silicon, plain `sudo softwareupdate -i -R` is **not sufficient**. The man page marks `--user` ("an owner user to authorize installation") and `--stdinpass` as *Apple silicon only* — installation needs volume-owner credentials, and without them the install stalls on an authorization prompt you cannot see over SSH.

Confirm the account is a volume owner:

```bash
diskutil apfs listUsers /      # the flock user should show "Volume Owner: Yes"
```

Run patches **interactively over Screen Sharing while you are watching**, typing the password yourself:

```bash
sudo softwareupdate -l                      # see what is pending
sudo softwareupdate -i -R --user flock      # you will be prompted; -R restarts
```

Do not put that password in a script, a `launchd` job, or anything that pipes it over SSH. `-R` is documented to quit all applications, log out and restart — so this always takes Chrome down and always requires §1.3 auto-login to be genuinely working.

---

## 2. Remote access — so it can live in a cupboard

### 2.1 Enable the two macOS services

**System Settings → General → Sharing:**
- **Remote Login** → On (this is SSH). Restrict to the `flock` user.
- **Screen Sharing** → On.

Do this in the GUI. `sudo systemsetup -setremotelogin on` needs Full Disk Access for the calling terminal and fails confusingly without it.

### 2.2 Tailscale — the standalone build, not the App Store one

Download the **standalone** package from tailscale.com/download/mac. The Mac App Store build is a sandboxed GUI app tied to the login session; the standalone build installs a system daemon that comes up at boot. **On a box you can only reach remotely, a failed auto-login must not also cost you your way in.**

```bash
alias tailscale="/Applications/Tailscale.app/Contents/MacOS/Tailscale"
tailscale up
tailscale status
tailscale ip -4
```

In the Tailscale admin console: find `flock-node` → ⋯ → **Disable key expiry.** Otherwise the node silently drops off the tailnet in 180 days.

**Tailscale SSH (`tailscale up --ssh`) is Linux-only** — it is not available on macOS. You use macOS's own Remote Login, reached over the tailnet.

Connect:

```bash
ssh flock@flock-node.<your-tailnet>.ts.net       # MagicDNS name, not .local
```

Screen Sharing fallback, from another Mac: Finder → Go → Connect to Server → `vnc://flock-node.<tailnet>.ts.net`

### 2.3 SSH keys

```bash
# from your laptop
ssh-copy-id flock@flock-node.<tailnet>.ts.net
# or manually:
cat ~/.ssh/id_ed25519.pub | ssh flock@... 'mkdir -p ~/.ssh && cat >> ~/.ssh/authorized_keys && chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys'
```

Leave password auth enabled as a fallback. Nothing is exposed to the public internet — the tailnet is the perimeter. **Do not port-forward 22 or 5900.**

---

## 3. Chrome, the extension, and keeping it alive

### 3.1 Install Chrome, one profile, no Login Item

Install Google Chrome normally. Launch it once by hand, click through first-run.

**Use the `Default` profile.** Do not create a second profile — the LaunchAgent below targets `--profile-directory=Default`, and a profile mismatch presents as "everything is signed out."

**Critically: do not add Chrome to Login Items** (System Settings → General → Login Items & Extensions). The LaunchAgent in §3.4 is what starts Chrome. If both do it, launchd's `KeepAlive` sees its child exit immediately (the second launch just activates the first instance and returns) and thrashes.

### 3.2 Sign in to all ten marketplaces — at the desk, in one sitting

eBay, Poshmark, Depop, Mercari, Vinted, Grailed, Facebook Marketplace, StockX, Vestiaire Collective, The RealReal.

For each: sign in, tick "remember this device"/"stay signed in", complete any SMS or email challenge, and then **load the page the extension will actually use** to confirm the session is real:

- Depop inbox: `https://www.depop.com/messages/` — this is the exact page `syncDepopMessages()` opens, and the exact thing that fails first when a session lapses.
- Depop shop: `https://www.depop.com/<your-username>/`

Then **close every tab.** Leave the node with zero open tabs, ideally `about:blank`.

> **This is a functional requirement, not tidiness.** `watch-depop.js` is a content script on `https://www.depop.com/*` that reports Depop's offer badge and triggers a sync (`background.js:786`). That badge path writes `lastSyncAt` (`background.js:815`) — the *same key* the 30-minute alarm reads for its 25-minute throttle (`background.js:665`). A Depop tab left open on the node can push `lastSyncAt` forward every 5 minutes and hold the alarm below its threshold **indefinitely**. And only the alarm path calls `syncDepopListings` — the shop read that gives channel chips their URLs. Leave a Depop tab open and the shop read silently never runs again. Fix it properly in §3.6, but keep the tabs closed regardless.

### 3.3 Install the Flock extension unpacked

```bash
# on your dev machine
npm run pack:ext        # produces dist/extension/ and dist/flock-extension-0.4.2.zip
```

Copy `dist/extension/` to the node at a **permanent path you will never move**:

```bash
scp -r dist/extension flock@flock-node...:/Users/flock/flock-extension
```

On the node (Screen Sharing, or at the desk):

1. Open `chrome://extensions`
2. Turn on **Developer mode** (top right)
3. **Load unpacked** → pick `/Users/flock/flock-extension` (the folder containing `manifest.json`)

> **Never move or rename that folder.** Chrome derives an unpacked extension's ID from a hash of its absolute path. Move it and you get a new extension ID, a fresh empty `chrome.storage.local` — so no `token`, no `apiBase`, no `depopUsername` — and the alarm handler returns early on the missing token with no error anywhere. The symptom is total silence. (If you want the ID pinned independently of the path, add a `"key"` to `manifest.json`; today it has none.)

**Unpacked extensions never auto-update.** Updating the node means: copy the new folder contents over the same path, then click Reload on the extension card (or `launchctl kickstart` Chrome per §3.4 — `onStartup` re-arms the alarm either way). `bridge.js` publishes the running version to the Flock page precisely so a stale build doesn't look like a marketplace change.

### 3.4 Pair it

1. On the node's Chrome, open `https://www.sellonflock.com/connect` (Settings → Browser extension) and click **Generate pairing code**.
2. Click the Flock toolbar icon → paste the `XXXXXX-XXXXXX` code → **Pair**.
3. It should say **Connected · N listings ready**.

The popup writes `token` and `apiBase` into `chrome.storage.local`. Extension tokens **do not expire** — `lib/exttoken.ts` only checks `revoked_at` — so the pairing survives indefinitely unless you revoke it. Revoking a token in Flock is therefore a way to kill the node instantly, and also a way to kill it by accident.

Then set the Depop username, or `syncDepopListings` never runs: on the Flock site, the extension settings write `depopUsername` through `bridge.js`. Confirm it landed (§4.1).

### 3.5 Keep Chrome alive: one LaunchAgent, plus a nightly restart

**LaunchAgent, not LaunchDaemon, not Login Items.** Aqua-session agents load only after a GUI login and are the only ones with Window Server access; a LaunchDaemon runs with no session and cannot render Chrome. Login Items launch once and never restart.

**`~/Library/LaunchAgents/com.flock.chrome.plist`**

```bash
cat > ~/Library/LaunchAgents/com.flock.chrome.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.flock.chrome</string>
  <key>ProgramArguments</key>
  <array>
    <string>/Applications/Google Chrome.app/Contents/MacOS/Google Chrome</string>
    <string>--profile-directory=Default</string>
    <string>--no-first-run</string>
    <string>--no-default-browser-check</string>
    <string>--hide-crash-restore-bubble</string>
    <string>about:blank</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>ThrottleInterval</key><integer>30</integer>
  <key>StandardOutPath</key><string>/Users/flock/Library/Logs/flock-chrome.out.log</string>
  <key>StandardErrorPath</key><string>/Users/flock/Library/Logs/flock-chrome.err.log</string>
</dict>
</plist>
PLIST

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.flock.chrome.plist
launchctl print gui/$(id -u)/com.flock.chrome | head -30
```

Notes that matter:

- Point at the **binary inside the bundle**, not `/usr/bin/open`. `open` returns immediately, so launchd sees an instant exit and `KeepAlive` thrashes.
- `about:blank` and **no `--restore-last-session`** — session restore would bring back a Depop tab and re-create the starvation bug in §3.2.
- `ThrottleInterval 30` (default is 10s) — enough that a crash loop doesn't hammer the machine.
- Management commands: `launchctl bootout gui/$(id -u)/com.flock.chrome` to stop, `launchctl kickstart -k gui/$(id -u)/com.flock.chrome` to force a restart.

**`~/Library/LaunchAgents/com.flock.chrome-restart.plist` — the nightly restart**

```bash
cat > ~/Library/LaunchAgents/com.flock.chrome-restart.plist <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>com.flock.chrome-restart</string>
  <key>ProgramArguments</key>
  <array>
    <string>/usr/bin/osascript</string>
    <string>-e</string>
    <string>quit app "Google Chrome"</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict><key>Hour</key><integer>4</integer><key>Minute</key><integer>0</integer></dict>
</dict>
</plist>
PLIST

launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.flock.chrome-restart.plist
```

**This nightly restart is the single most important piece of the whole build, and not for the reason it looks like.**

`scheduleSync()` is wired only to `chrome.runtime.onInstalled` and `chrome.runtime.onStartup` (`background.js:640-641`). If the `flock-sync` alarm ever vanishes, nothing inside the extension can bring it back: the service worker only starts when an event arrives, and on an unattended node **the alarm is the only recurring event source**. No alarm → no service-worker wake → no self-heal. Any fix that lives inside the extension is circular.

Restarting Chrome fires `onStartup`, which calls `scheduleSync()`. **A nightly restart re-arms the alarm from outside Chrome, capping any lost-alarm outage at 24 hours.** It also picks up whatever Chrome version Keystone staged underneath the running process during the day — Chrome does not relaunch itself, so a browser that never restarts runs old code out of a swapped bundle indefinitely.

Use `osascript -e 'quit app "Google Chrome"'`, not `pkill`. `pkill` SIGTERMs the browser, which is why people then need `--hide-crash-restore-bubble` to paper over the result. On a box whose entire value is ten live sessions in one profile, give Chrome the chance to flush. `KeepAlive` brings it back within 30s. Keep `--hide-crash-restore-bubble` anyway as a backstop.

04:00 will effectively never collide with a sync: the alarm runs on the half hour and the work is a short scrape.

**Do not go looking for Chrome's "Continue running background apps when Google Chrome is closed."** That setting is Windows/Linux only (Chromium issue 40950586, closed Won't Fix). On macOS, closing the last window already leaves the app running, so the option is not surfaced. The macOS equivalents are the two agents above.

**Optional, cheap:** opt Chrome out of App Nap.

```bash
defaults write com.google.Chrome NSAppSleepDisabled -bool YES
```

Verify later over Screen Sharing in Activity Monitor (View → Columns → App Nap).

### 3.6 Four code changes to make before you walk away

These are not optional polish. Two of them are live bugs that present as silence.

**(a) The heartbeat — ship this first, before any pmset tuning.** Every failure below looks identical from outside: nothing syncs, nobody is told. `background.js` already writes `lastSyncAt` and `lastSyncResult` on every run, success or failure (`background.js:678, 683`). Add a POST to Flock in both branches, and alert server-side when no heartbeat has arrived in 90 minutes. This is the only thing that tells you whether the rest of this runbook worked.

**(b) Give the alarm its own throttle key.** In the alarm handler, replace the read/write of `lastSyncAt` (`background.js:665-666, 678, 683`) with `lastAlarmSyncAt`. Today the badge handler (`:815`) and the popup's sync-all handler (`:840`) both write the key the alarm throttles on, so a Depop tab can starve the alarm's `syncDepopListings` call forever. Better still, move the shop read out from under the message-sync throttle entirely — it is the thing that gives channel chips their URLs.

**(c) Bound the sync so it cannot hit Chrome's per-event cap.** Chrome's lifecycle doc still terminates a service worker "when a single request, such as an event or API call, takes longer than 5 minutes to process." **Chrome 110 removed the *idle* ceiling, not the per-event one.** Flock runs the entire sync inside one `onAlarm` handler: `syncDepopMessages(maxThreads = 20)` (`background.js:180`) walks up to 20 threads, each awaiting `whenLoaded` (30s default timeout, `background.js:122`) plus a bare 2500ms settle (`background.js:200`) — a worst case around **11 minutes**, with `syncDepopListings` still to run after it. Lower `maxThreads`, cut the `whenLoaded` timeout, or checkpoint across alarm firings. Also note `fetch()` responses over 30s are their own termination trigger, which touches the POST at `background.js:104`.

**(d) Add a cheap top-level alarm guard — as insurance only.** A top-level `chrome.alarms.get(SYNC_ALARM)` + recreate costs nothing and covers the case where a badge message happens to wake the worker while the alarm is missing. It is **not** the self-heal; the nightly restart in §3.5 is. Ship them in that order.

**Do not add a `chrome.idle` fallback.** `manifest.json` declares only `storage`, `scripting`, `alarms` — with no `idle` permission `chrome.idle` is `undefined`, and registering the listener at top level throws during service-worker evaluation, taking down *every other listener in `background.js`* with it. Adding the permission fixes the throw but not the logic: on a node with nobody at the keyboard, the idle state transitions once and never changes again. (The mailing-list thread this idea comes from is a single unreproduced report about a laptop; Oliver Dunk did not confirm a bug — he said the alarm "shouldn't disappear if the browser remained open" and offered `chrome.idle` as a guess.)

---

## 4. Proving it actually works unattended

Do all four. Each one proves something the others don't.

### 4.1 That it is armed at all (once, at the desk or over Screen Sharing)

`chrome://extensions` → Flock card → **Inspect views: service worker** → console:

```js
await chrome.alarms.get('flock-sync')
// {name: "flock-sync", periodInMinutes: 30, scheduledTime: 1756...}

await chrome.storage.local.get(['token','apiBase','depopUsername','syncPaused','lastSyncAt','lastSyncResult'])
// token: "...", apiBase: "https://www.sellonflock.com", depopUsername: "...",
// syncPaused: undefined, lastSyncAt: 1756..., lastSyncResult: {ok: true, threads: 7, shop: {...}}

new Date((await chrome.storage.local.get('lastSyncAt')).lastSyncAt).toString()
```

If `token` is missing → the extension folder moved (new ID, empty storage). If `depopUsername` is missing → the shop read is being skipped silently. If `syncPaused` is `true` → nothing will ever run.

### 4.2 That it fires with the display asleep and nobody touching it — over SSH, no GUI at all

**This is the real test, and it needs no code change.** Every sync opens a background tab at `https://www.depop.com/messages/` (`background.js:181`), and Chrome records that in the profile's History database like any other navigation.

```bash
ssh flock@flock-node...
cd ~/Library/Application\ Support/Google/Chrome/Default
cp History /tmp/h                       # the live file is locked by Chrome
sqlite3 /tmp/h "
  SELECT datetime(v.visit_time/1000000-11644473600,'unixepoch','localtime') AS t, u.url
  FROM visits v JOIN urls u ON u.id = v.url
  WHERE u.url LIKE 'https://www.depop.com/messages%'
  ORDER BY v.visit_time DESC LIMIT 20;"
```

**Rows roughly 30 minutes apart, continuing overnight, are proof the alarm is firing unattended.** Leave it 4 hours and run this. If you see 8 clusters, it works.

Gaps tell you which failure you have:
- Even 30-minute spacing that just **stops** → alarm vanished, or Chrome died and `KeepAlive` didn't relaunch.
- Clusters ~5 minutes apart → a Depop tab is open and the badge path is driving it (§3.2, §3.6b).
- Visits present but `lastSyncAt` frozen (cross-check §4.1) → the service worker is being killed mid-run at the 5-minute cap (§3.6c) — the tab opens, the work never completes, nothing is written.

### 4.3 That the display really was asleep, and the system really never slept

```bash
pmset -g log | grep -E 'Display is turned (off|on)' | tail -20
pmset -g log | grep -E 'Entering Sleep|Wake from|DarkWake' | tail -40
pmset -g assertions
uptime
```

Cross-reference the timestamps against §4.2. Display off at 22:14, Depop visits at 22:30 and 23:00 → display sleep provably does not stop the sync. `Entering Sleep` should appear **zero** times since boot.

(Chrome's docs say "Alarms continue to run while a device is sleeping. However, an alarm will not wake up a device. When the device wakes up, any missed alarms will fire." Whether a repeating alarm replays every missed cycle or collapses them into one is not documented — treat missed runs as lost. This is exactly why §1.4 matters, and why `Entering Sleep` appearing at all is a finding.)

### 4.4 That the whole unattended chain works — pull the plug

Do this once, deliberately, and time it.

Yank the power (or pull the UPS input and let it drain, if you want the full test). Then watch, without touching a keyboard:

1. Mac powers back on (`autorestart 1`)
2. It reaches a **desktop**, not a login window (auto-login)
3. LaunchAgents load, Chrome launches (`KeepAlive` / `RunAtLoad`)
4. `onStartup` re-arms `flock-sync`
5. The node is reachable over Tailscale
6. A sync lands within ~32 minutes (2-minute `delayInMinutes` + 30)

**Every one of those six is a separate failure mode.** This one test is worth more than every setting above, because it is the only thing that proves they compose. Time step 6 and write the number down — that is your recovery-time budget for the rest of the node's life.

---

## 5. What will break, and exactly what it looks like

| # | Failure | Symptom you will actually observe | Fix |
|---|---|---|---|
| 1 | **Chrome auto-updated (Keystone)** | Usually nothing — the running process keeps executing old code out of a swapped bundle. If a new Chrome breaks an API, `lastSyncResult.ok === false` with a JS error. Chrome's version in `chrome://version` lags the bundle. | The 04:00 restart picks it up. Do not disable Keystone — this browser runs untrusted marketplace JS and holds ten sessions. |
| 2 | **Chrome crashed** | Gap in the History timeline of ≤30s (relaunch) or forever (if `KeepAlive` isn't loaded). `launchctl print gui/$(id -u)/com.flock.chrome` shows a non-zero last exit status. Crash-restore bubble suppressed by the flag. | `KeepAlive` handles it. Verify the agent is actually bootstrapped after every macOS update. |
| 3 | **macOS update rebooted the box** | Total silence — no ping, no Tailscale, no SSH, **for hours**. If FileVault somehow got re-enabled, the machine is sitting at the pre-boot unlock screen where macOS has not booted and no network exists. | Auto-install is off (§1.6). After *any* reboot, re-check `fdesetup status`, `defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser`, and `pmset -g custom` — updates have been known to reset all three. |
| 4 | **Power cut** | Machine comes back (`autorestart 1`) — or comes back to a *dirty* Chrome profile. Dirty profile = **all ten marketplaces logged out at once**, and the symptom of *that* is `lastSyncResult.error === "Depop's inbox didn't load. Check you're signed in."` | UPS. Plus the monthly profile backup (§6) — restoring a profile copy is far cheaper than re-authenticating on ten sites, half of which will challenge you. |
| 5 | **A marketplace session expired** | `lastSyncResult: {ok: false, error: "Depop's inbox didn't load. Check you're signed in."}` — thrown at `background.js:184`. Depop visits still appear in History every 30 min (the tab opens, the inbox just isn't there). eBay/Poshmark typically expire first and quietest. | Screen Sharing in, sign back in by hand, complete the SMS challenge. **This is the most frequent real failure and it needs a human.** It is also the reason the heartbeat (§3.6a) matters more than anything else here. |
| 6 | **A marketplace served a bot challenge** | Identical to #5 — the inbox selector never appears. Distinguish by looking at the actual page over Screen Sharing. | Solve it yourself, at the machine. Do not automate this. If a channel starts challenging every sync, back off the frequency for that channel rather than pushing through. |
| 7 | **The `flock-sync` alarm vanished** | History timeline stops dead at a clean 30-minute boundary and never resumes. `chrome.alarms.get('flock-sync')` returns `undefined`. Nothing in any log. | The 04:00 restart re-arms it within 24 hours. The guard in §3.6d is insurance. Nothing inside the extension can fix this on its own. |
| 8 | **Service worker killed at the 5-minute cap** | Depop tabs keep opening on schedule, but `lastSyncAt` / `lastSyncResult` are **frozen at an old timestamp** — because both writes happen after the work completes. The next alarm retries and dies the same way. Threads never reach Flock. | §3.6c. This gets worse as the seller's inbox grows, so it may work at 5 threads and fail at 18. |
| 9 | **A Depop tab got left open** | Syncs cluster ~5 minutes apart instead of 30. Messages keep arriving, but shop listings **stop refreshing entirely** — new channel chips have no clickable URL, and vanished-listing detection goes quiet. | Close the tab; ship §3.6b so it cannot recur. |
| 10 | **Extension folder moved / renamed / re-`Load unpacked`ed from a new path** | Silence. Popup shows the pairing screen. `chrome.storage.local` is empty — new extension ID. The alarm handler returns early on the missing token and logs nothing. | Never move it. Re-pair if you did. Consider pinning the ID with a manifest `key`. |
| 11 | **Auto-login silently stopped working** | After a reboot: Tailscale is *up* (the standalone daemon runs pre-login) and SSH answers, but **Chrome is not running and no LaunchAgent is loaded** — `launchctl print gui/$(id -u)/com.flock.chrome` errors. That combination is diagnostic: reachable but no GUI session. | Screen Sharing in, log in by hand, then re-check the three blockers in §1.3. |
| 12 | **Tailscale key expired** | Node vanishes from the tailnet at a 180-day boundary. Nothing else changed. | Disable key expiry (§2.2). Check monthly. |
| 13 | **Disk filled** (Chrome profile, logs, macOS update downloads) | Sync failures with odd JS errors; Chrome may refuse to write History, which also breaks your §4.2 check. | `df -h` in the weekly check. |
| 14 | **Someone revoked the extension token in Flock** | `lastSyncResult.error === "Pairing code rejected. Generate a new one in Flock."` (`background.js:107`). | Re-pair. Tokens never expire on their own, so this is always deliberate — check who did it. |

---

## 6. Weekly and monthly checks

### Weekly (5 minutes, all over SSH)

```bash
ssh flock@flock-node...

uptime                                                    # no unexpected reboots
pmset -g log | grep -cE 'Entering Sleep'                  # want 0
pmset -g | grep -E 'sleep|womp|autorestart'               # settings still there
launchctl print gui/$(id -u)/com.flock.chrome | grep -E 'state|last exit'
pgrep -x "Google Chrome" >/dev/null && echo "chrome up" || echo "CHROME DOWN"
df -h /                                                   # headroom
/Applications/Tailscale.app/Contents/MacOS/Tailscale status

# the sync itself
cd ~/Library/Application\ Support/Google/Chrome/Default && cp History /tmp/h
sqlite3 /tmp/h "SELECT datetime(v.visit_time/1000000-11644473600,'unixepoch','localtime')
  FROM visits v JOIN urls u ON u.id=v.url
  WHERE u.url LIKE 'https://www.depop.com/messages%'
  ORDER BY v.visit_time DESC LIMIT 40;"
```

You want ~48 evenly spaced entries per day. Then in Flock: confirm new messages and offers actually arrived this week, and that at least one channel chip acquired a URL (proof `syncDepopListings` ran, not just the message sync).

### Monthly (30 minutes, at a keyboard or over Screen Sharing)

1. **Back up the Chrome profile — the most valuable thing on the box.**
   ```bash
   launchctl bootout gui/$(id -u)/com.flock.chrome
   sleep 5
   tar czf ~/Backups/chrome-profile-$(date +%Y%m%d).tgz \
       -C ~/Library/Application\ Support/Google Chrome
   launchctl bootstrap gui/$(id -u) ~/Library/LaunchAgents/com.flock.chrome.plist
   ```
   Keep three. Copy one off the machine.

2. **Patch macOS by hand**, interactively, watching (§1.6):
   ```bash
   sudo softwareupdate -l
   sudo softwareupdate -i -R --user flock     # type the password yourself
   ```
   After the reboot, re-verify the four things updates like to reset: `fdesetup status`, `sudo defaults read /Library/Preferences/com.apple.loginwindow autoLoginUser`, `pmset -g custom`, `defaults -currentHost read com.apple.screensaver idleTime`. Then run §4.2 and confirm a sync lands.

3. **Touch all ten marketplace sessions.** Open each site, confirm you are still signed in, click one page deep. This is what stops #5 from happening at 02:00 on the day an offer expires. eBay and Poshmark first.

4. **Refresh the extension** if `dist/extension` has moved on: copy over the same path, Reload on the card, confirm the version in `chrome://extensions` matches `manifest.json`, and confirm the Flock page stops warning about a stale build.

5. **Check Tailscale key expiry is still disabled**, and that the admin console shows the node as "Connected" with a recent timestamp.

6. **Re-run the plug-pull test twice a year**, not monthly. It is the only test that covers the whole chain, and the chain drifts.

---

## Appendix: the calendar half of the brief

The brief asks for deadlines on a dedicated calendar. **That is a separate, unstarted piece of work, and standing up the mini does not advance it.**

What exists: `lib/calfeed.ts` issues a revocable feed token; `/api/calendar/[token]/route.ts` serves ICS; Settings → Calendar has the subscribe UI. Subscribe your Mac and phone to it now (Calendar → File → New Calendar Subscription; iOS → Calendar → Add Account → Other → Add Subscribed Calendar) — a feed lands as its own colourable calendar and needs no OAuth.

What does not exist: **any dispatch deadline at all.** `DISPATCH` in `lib/calendar.ts` has all ten channels at `days: null` / `verifiedOn: "unverified"`, and `buildEvents` skips emitting when `days` is null. The feed you just subscribed to publishes nothing on that front, by design.

Three things to know before filling those numbers in:

1. **This work belongs on Vercel, not on the mini.** Deadline computation has no dependency on the seller's browser session. Only the marketplace *reads* need the extension.
2. **`addDays()` has a live bug.** It skips weekends only — not the 11 US federal holidays that eBay excludes (and eBay auto-extends handling time by a day when one falls in the window) — and it computes the weekday with `getUTCDay()` on a local-time `Date`. For a US Pacific seller, a Friday-evening sale reads as Saturday in UTC and gets mis-slotted.
3. **eBay has no single number, and it is worse than it looks.** Handling time is per-listing, 1–30 days, seller-set — *and* whether it counts weekends is also a per-listing seller setting ("This can include business days only, or you have the option to include Saturdays and/or Sundays if you ship on those days"). The honest source is the listing, not a constant. The node must read both the length and the weekend flag off each listing, or the eBay dispatch deadline cannot be computed correctly at all.

And the two clocks that genuinely justify an always-on node, which are not the ones you'd guess:

- **Mercari's rolling 24-hour cancellation-response window.** A buyer can request cancellation at any moment before shipment; the seller has 24 hours to respond; no response means the sale is cancelled and refunded. It can start at any time of day. This is the strongest argument in the whole dataset for a machine that is awake.
- **eBay's 5-calendar-day payment-dispute response.** Card chargebacks are absent from the fee/deadline model entirely, and they invalidate the tidy idea that "delivered + dispute window = safe": eBay documents funds held up to 90 days and resolution taking "90 days or more". The 5-day response clock is *tighter* than the Money Back Guarantee's 3 business days.

Not a seller deadline, despite appearances: **Vestiaire's 60-minute window is the buyer's.** After the buyer accepts a counter-offer they have an hour to complete the order — the seller has already acted and can do nothing. It should render as a one-hour expiry on a provisional sale, never as an alert.

Finally, worth settling explicitly before the box exists and makes it easy: **`lib/negotiate.ts` marks every verdict `needsSeller: true` and sends nothing.** "Judge incoming offers" in the brief could be read as auto-responding. That is a materially different account-risk profile from what the code does today, and the moment there is an always-on machine sitting there, the temptation to flip it is real. Decide it deliberately, not at 2am.