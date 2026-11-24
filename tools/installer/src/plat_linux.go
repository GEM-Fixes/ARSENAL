//go:build linux

// Linux: per-user data folder, Node.js from the official archive into /usr/local (pkexec or sudo), desktop entries.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
)

func defaultDir() string { return filepath.Join(xdg("XDG_DATA_HOME", ".local/share"), "arsenal-toolkit") }

func cachesDirs() []string {
	return []string{filepath.Join(xdg("XDG_DATA_HOME", ".local/share"), "arsenal"), filepath.Join(xdg("XDG_CONFIG_HOME", ".config"), "arsenal"), filepath.Join(xdg("XDG_CACHE_HOME", ".cache"), "arsenal")}
}

func nodeCandidates() []string {
	c := []string{"/usr/local/bin/node", "/usr/bin/node"}
	if p := os.Getenv("ARSENAL_SETUP_NODE_PREFIX"); filepath.IsAbs(p) {
		c = append([]string{filepath.Join(p, "bin", "node")}, c...)
	}
	return c
}

func nodeKey() string { return "linux-" + archName() }

func hasDisplay() bool { return os.Getenv("DISPLAY") != "" || os.Getenv("WAYLAND_DISPLAY") != "" }

func installNodeSystem(in *inst, file, sha string) error {
	self, err := os.Executable()
	if err != nil {
		return err
	}
	var cmd *exec.Cmd
	switch {
	case os.Geteuid() == 0 || os.Getenv("ARSENAL_SETUP_NODE_PREFIX") != "":
		cmd = exec.Command(self, "--root-node-install", file, sha)
	case hasCmd("pkexec") && hasDisplay():
		cmd = exec.Command("pkexec", self, "--root-node-install", file, sha)
	case hasCmd("sudo") && isTerminal():
		cmd = exec.Command("sudo", self, "--root-node-install", file, sha)
		cmd.Stdin = os.Stdin
	default:
		return errT("no way to ask for administrator rights here (pkexec with a desktop, or sudo in a terminal)")
	}
	cmd.Stdout, cmd.Stderr = os.Stdout, os.Stderr
	if err := cmd.Run(); err != nil {
		return errT("the administrator step was declined or failed")
	}
	return nil
}

func desktopQuote(p string) string {
	r := strings.NewReplacer(`\`, `\\\\`, `"`, `\\"`, "`", "\\\\`", `$`, `\\$`)
	return `"` + r.Replace(p) + `"`
}

func desktopEntry(in *inst) string {
	_, gui := launchers(in.dir)
	return "[Desktop Entry]\nType=Application\nName=ARSENAL\nComment=Modding toolkit window\nExec=" + desktopQuote(gui) +
		"\nIcon=" + filepath.Join(in.dir, "ARSENAL.png") + "\nTerminal=false\nCategories=Development;Game;\n"
}

func desktopDir() string {
	if out, err := exec.Command("xdg-user-dir", "DESKTOP").Output(); err == nil {
		if d := strings.TrimSpace(string(out)); filepath.IsAbs(d) && d != home() && isDir(d) {
			return d
		}
	}
	return filepath.Join(home(), "Desktop")
}

func makeLinks(in *inst, desktop bool) error {
	apps := filepath.Join(xdg("XDG_DATA_HOME", ".local/share"), "applications", "arsenal.desktop")
	if err := writeFile(in, "link", apps, desktopEntry(in), 0o755); err != nil {
		return err
	}
	in.say("ok", "application menu entry: %s", apps)
	cli, _ := launchers(in.dir)
	bin := filepath.Join(home(), ".local", "bin", "arsenal")
	if err := symlink(in, cli, bin); err == nil {
		in.say("ok", "command: %s", bin)
	}
	if !desktop {
		return nil
	}
	dd := desktopDir()
	if !isDir(dd) {
		in.say("--", "Desktop icon: this user has no Desktop folder (%s); none made", dd)
		return nil
	}
	p := filepath.Join(dd, "arsenal.desktop")
	if err := writeFile(in, "link", p, desktopEntry(in), 0o755); err != nil {
		return err
	}
	if hasCmd("gio") {
		exec.Command("gio", "set", p, "", "true").Run() // GNOME: lets the icon start without the "untrusted" question
	}
	in.say("ok", "Desktop icon: %s", p)
	return nil
}

func setAutostart(in *inst) error {
	return writeFile(in, "link", filepath.Join(xdg("XDG_CONFIG_HOME", ".config"), "autostart", "arsenal.desktop"), desktopEntry(in), 0o644)
}

func startApp(in *inst) error {
	_, gui := launchers(in.dir)
	return detached(gui, in.envWithNode())
}

func openBrowser(url string) error {
	if !hasDisplay() {
		return errT("no desktop session")
	}
	if !hasCmd("xdg-open") {
		return errT("xdg-open is missing")
	}
	return detached("xdg-open", os.Environ(), url)
}
