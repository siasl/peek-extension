#!/bin/zsh
# Runs apfel (Apple Intelligence local server) at login with Peek's extension origin allowed.
# Uses Homebrew's binary path, so `brew upgrade apfel` keeps working.
# Undo: launchctl bootout gui/$(id -u)/com.peek.apfel && rm ~/Library/LaunchAgents/com.peek.apfel.plist
set -e
EXT_ID="jfjllmekaamcnijkmjocccgeeepbbggd"
APFEL="$(brew --prefix)/opt/apfel/bin/apfel"
PLIST="$HOME/Library/LaunchAgents/com.peek.apfel.plist"
[ -x "$APFEL" ] || { echo "apfel not found. Run: brew install apfel"; exit 1; }

# Don't fight Homebrew's own service for the port.
brew services stop apfel >/dev/null 2>&1 || true

mkdir -p "$HOME/Library/LaunchAgents" "$HOME/Library/Logs"
cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>com.peek.apfel</string>
  <key>ProgramArguments</key><array>
    <string>$APFEL</string><string>--serve</string>
    <string>--allowed-origins</string><string>chrome-extension://$EXT_ID</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>$HOME/Library/Logs/peek-apfel.log</string>
  <key>StandardErrorPath</key><string>$HOME/Library/Logs/peek-apfel.log</string>
</dict></plist>
PLISTEOF

launchctl bootout "gui/$(id -u)/com.peek.apfel" 2>/dev/null || true
launchctl bootstrap "gui/$(id -u)" "$PLIST"
echo "apfel is running with chrome-extension://$EXT_ID allowed."
