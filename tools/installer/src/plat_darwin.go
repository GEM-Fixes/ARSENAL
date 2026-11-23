//go:build darwin

// macOS: the toolkit in the user's Application Support, an ARSENAL.app in ~/Applications that starts it, Node.js through
// the official .pkg (one administrator prompt), a Desktop link and a sign-in agent.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

const agentID = "org.arsenal.window"

func defaultDir() string { return filepath.Join(home(), "Library", "Application Support", "ARSENAL-Toolkit") }

func cachesDirs() []string {
	return []string{filepath.Join(home(), "Library", "Application Support", "ARSENAL"), filepath.Join(home(), "Library", "Caches", "ARSENAL")}
}

func nodeCandidates() []string {
	return []string{"/usr/local/bin/node", "/opt/homebrew/bin/node"}
}

func nodeKey() string { return "darwin" }

func appPath() string { return filepath.Join(home(), "Applications", "ARSENAL.app") }

func installNodeSystem(in *inst, file, sha string) error {
	if os.Geteuid() == 0 {
		return exec.Command("/usr/sbin/installer", "-pkg", file, "-target", "/").Run()
	}
	q := strings.NewReplacer(`\`, `\\`, `"`, `\"`).Replace(file)
	script := `do shell script "/usr/sbin/installer -pkg " & quoted form of "` + q + `" & " -target /" with administrator privileges`
	if err := exec.Command("/usr/bin/osascript", "-e", script).Run(); err != nil {
		if isTerminal() && hasCmd("sudo") {
			cmd := exec.Command("sudo", "/usr/sbin/installer", "-pkg", file, "-target", "/")
			cmd.Stdin, cmd.Stdout, cmd.Stderr = os.Stdin, os.Stdout, os.Stderr
			if cmd.Run() == nil {
				return nil
			}
		}
		return errors.New("the administrator prompt was declined, or the Node.js installer failed")
	}
	return nil
}

func shQuote(p string) string { return `'` + strings.ReplaceAll(p, `'`, `'\''`) + `'` }

func xmlEsc(s string) string {
	return strings.NewReplacer("&", "&amp;", "<", "&lt;", ">", "&gt;").Replace(s)
}

func makeLinks(in *inst, desktop bool) error {
	_, gui := launchers(in.dir)
	app := appPath()
	os.RemoveAll(app)
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>ARSENAL</string>
<key>CFBundleDisplayName</key><string>ARSENAL</string>
<key>CFBundleIdentifier</key><string>` + agentID + `</string>
<key>CFBundleVersion</key><string>` + xmlEsc(in.cfg.Version) + `</string>
<key>CFBundleShortVersionString</key><string>` + xmlEsc(in.cfg.Version) + `</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>CFBundleExecutable</key><string>ARSENAL</string>
<key>CFBundleIconFile</key><string>ARSENAL</string>
<key>LSUIElement</key><true/>
</dict></plist>
`
	// a program started from the Finder gets a short PATH: add the places Node.js is installed to
	run := "#!/bin/sh\nPATH=/usr/local/bin:/opt/homebrew/bin:$PATH; export PATH\nexec " + shQuote(gui) + "\n"
	if err := writeFile(in, "tree", filepath.Join(app, "Contents", "Info.plist"), plist, 0o644); err != nil {
		return err
	}
	in.rec = in.rec[:len(in.rec)-1]
	in.record("tree", app)
	if err := os.MkdirAll(filepath.Join(app, "Contents", "MacOS"), 0o755); err != nil {
		return err
	}
	if err := os.WriteFile(filepath.Join(app, "Contents", "MacOS", "ARSENAL"), []byte(run), 0o755); err != nil {
		return err
	}
	os.MkdirAll(filepath.Join(app, "Contents", "Resources"), 0o755)
	os.WriteFile(filepath.Join(app, "Contents", "Resources", "ARSENAL.icns"), iconICNS, 0o644)
	in.say("ok", "application: %s", app)
	if !desktop {
		return nil
	}
	p := filepath.Join(home(), "Desktop", "ARSENAL")
	if err := symlink(in, app, p); err != nil {
		return err
	}
	in.say("ok", "Desktop icon: %s", p)
	return nil
}

func setAutostart(in *inst) error {
	plist := `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>Label</key><string>` + agentID + `</string>
<key>ProgramArguments</key><array><string>/usr/bin/open</string><string>` + xmlEsc(appPath()) + `</string></array>
<key>RunAtLoad</key><true/>
</dict></plist>
`
	return writeFile(in, "link", filepath.Join(home(), "Library", "LaunchAgents", agentID+".arsenal.plist"), plist, 0o644)
}

func startApp(in *inst) error {
	if exists(appPath()) {
		return exec.Command("/usr/bin/open", appPath()).Run()
	}
	_, gui := launchers(in.dir)
	return detached(gui, in.envWithNode())
}

func openBrowser(url string) error {
	return exec.Command("/usr/bin/open", url).Run()
}
