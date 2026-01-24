# ⏱️ rclone Configuration and Scheduling Cheatsheet
macOS (cron) + Linux / DigitalOcean (systemd service + timer)

This document covers how to view, stop, disable, restart, and debug rclone when scheduled via cron on macOS or systemd timers on Linux / DigitalOcean.

---

## 🍎 macOS — cron

### View current cron jobs
```bash
crontab -l
```

### Edit cron jobs
```bash
crontab -e
```

### Disable a cron job (recommended)
Comment it out with `#`:
```bash
# */5 * * * * /opt/homebrew/bin/rclone sync gdrive: ~/gdrive >> /tmp/rclone.log 2>&1
```

### Check if rclone is running
```bash
ps aux | grep rclone
```

### Stop rclone immediately
```bash
pkill rclone
```

### Cron logs (macOS)
macOS does not log cron to `/var/log/cron` by default.

Check system log:
```bash
log show --predicate 'process == "cron"' --last 1h
```

Check rclone log file (if redirected):
```bash
tail -n 100 /tmp/rclone.log
```

Follow log live:
```bash
tail -f /tmp/rclone.log
```

### Common cron pitfalls
* `*/1 * * * *` runs every minute (very aggressive)
* `rclone sync` deletes files on the destination
* Cron continues running after logout

---

## 🐧 Linux / DigitalOcean — systemd (Service + Timer)

### List all rclone timers
```bash
systemctl list-timers --all | grep -i rclone
```

### List rclone services
```bash
systemctl list-units --type=service --all | grep -i rclone
```

### Check status
```bash
systemctl status rclone-sync.timer
systemctl status rclone-sync.service
```

### Stop rclone immediately
```bash
sudo systemctl stop rclone-sync.service
```

### Stop the scheduler (IMPORTANT)
```bash
sudo systemctl stop rclone-sync.timer
```

### Disable timer (prevents auto-start on boot)
```bash
sudo systemctl disable rclone-sync.timer
```

### Re-enable timer later
```bash
sudo systemctl enable --now rclone-sync.timer
```

### Manually trigger one run
```bash
sudo systemctl start rclone-sync.service
```

---

## 📜 systemd Logs

### View recent rclone logs
```bash
journalctl -u rclone-sync.service -n 100 --no-pager
```

### Follow logs live
```bash
journalctl -u rclone-sync.service -f
```

### Timer logs
```bash
journalctl -u rclone-sync.timer -n 50 --no-pager
```

---

## 🧯 Edit the service
```bash
sudo vi /etc/systemd/system/rclone-sync.service
```

---

## 🧯 Edit the timer
```bash
sudo vi /etc/systemd/system/rclone-sync.timer
```

---

## 🧪 Verify nothing is running
```bash
ps aux | grep rclone
systemctl list-timers --all | grep -i rclone
```

---

## 🧯 Emergency: Stop Everything
```bash
pkill rclone
sudo systemctl stop rclone-sync.timer
sudo systemctl stop rclone-sync.service
```

---

## ✅ Best Practices
* Prefer systemd timers over cron on Linux
* Avoid running rclone every minute
* Use conservative flags with Google Drive:
```bash
  --drive-server-side-across-configs
  --checkers 4
  --transfers 4
```
* Avoid long-running sync loops

---

## 🕒 Recommended Cadence
* **Backup**: every 30–60 minutes
* **Mirror**: every 1–4 hours
* **Large reorganization**: run once, then stop

## Creating an RCLONE remote
* Be sure to set root folder in advanced config
* Client ID and Secret are in 1Password "Google API ID / Secret (no org)" note
```
 rclone config
No remotes found, make a new one?
n) New remote
s) Set configuration password
q) Quit config
n/s/q> n

Enter name for new remote.
name> RAG

Option Storage.
Type of storage to configure.
Choose a number from below, or type in your own value.
...
22 / Google Drive
   \ (drive)
...
Storage> 22

Option client_id.
Google Application Client Id
Setting your own is recommended.
See https://rclone.org/drive/#making-your-own-client-id for how to create your own.
If you leave this blank, it will use an internal key which is low performance.
Enter a value. Press Enter to leave empty.
client_id> XXXX

Option client_secret.
OAuth Client Secret.
Leave blank normally.
Enter a value. Press Enter to leave empty.
client_secret> XXXXX

Option scope.
Comma separated list of scopes that rclone should use when requesting access from drive.
Choose a number from below, or type in your own value.
Press Enter to leave empty.
 1 / Full access all files, excluding Application Data Folder.
   \ (drive)
 2 / Read-only access to file metadata and file contents.
   \ (drive.readonly)
   / Access to files created by rclone only.
 3 | These are visible in the drive website.
   | File authorization is revoked when the user deauthorizes the app.
   \ (drive.file)
   / Allows read and write access to the Application Data folder.
 4 | This is not visible in the drive website.
   \ (drive.appfolder)
   / Allows read-only access to file metadata but
 5 | does not allow any access to read or download file content.
   \ (drive.metadata.readonly)
scope> 2

Option service_account_file.
Enter a value. Press Enter to leave empty.
service_account_file> <ENTER>

Edit advanced config?
y) Yes
n) No (default)
y/n> y

**** Press <ENTER> for all except root folder ****

Option root_folder_id.
ID of the root folder.
Leave blank normally.
Fill in to access "Computers" folders (see docs), or for rclone to use
a non root folder as its starting point.
Enter a value. Press Enter to leave empty.
root_folder_id> <GET FROM URL FOR FOLDER ON GOOGLE DRIVE>

**** Press <ENTER> for all remaining except root folder ****

Edit advanced config?
y) Yes
n) No (default)
y/n> <ENTER>

Use web browser to automatically authenticate rclone with remote?
 * Say Y if the machine running rclone has a web browser you can use
 * Say N if running rclone on a (remote) machine without web browser access
If not sure try Y. If Y failed, try N.

y) Yes (default)
n) No
y/n> 

2026/01/24 10:19:08 NOTICE: Make sure your Redirect URL is set to "http://127.0.0.1:53682/" in your custom config.
2026/01/24 10:19:08 NOTICE: If your browser doesn't open automatically go to the following link: http://127.0.0.1:53682/auth?state=SHGTgblDZWhrBKpoNYO0Ow
2026/01/24 10:19:08 NOTICE: Log in and authorize rclone for access
2026/01/24 10:19:08 NOTICE: Waiting for code...
2026/01/24 10:19:11 NOTICE: Got code
Configure this as a Shared Drive (Team Drive)?

y) Yes
n) No (default)
y/n> y

Option config_team_drive.
Shared Drive
Choose a number from below, or type in your own value of type string.
Press Enter for the default (0AHxYri0BiyHdUk9PVA).
 1 / PulseBridge Shared
   \ (0AHxYri0BiyHdUk9PVA)
config_team_drive> 1

Configuration complete.
Options:
- <WILL LIST ALL OPTIONS>

e) Edit existing remote
n) New remote
d) Delete remote
r) Rename remote
c) Copy remote
s) Set configuration password
q) Quit config
e/n/d/r/c/s/q> q
davidschmid@Davids-MacBook-Air ~ % 
```