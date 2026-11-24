//go:build windows

// Windows: per-user programs folder, Node.js through the official .msi (one administrator prompt), Start menu and Desktop
// shortcuts, the sign-in entry and the Apps list entry in the user's own registry hive.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"errors"
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
	"time"
)

const runKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
const unKey = `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\ARSENAL`

func sys32(n string) string {
	root := os.Getenv("SystemRoot")
	if root == "" {
		root = `C:\Windows`
	}
	return filepath.Join(root, "System32", n)
}

func defaultDir() string {
	la := os.Getenv("LOCALAPPDATA")
	if la == "" {
		la = filepath.Join(os.Getenv("USERPROFILE"), "AppData", "Local")
	}
	return filepath.Join(la, "Programs", "ARSENAL")
}

func cachesDirs() []string {
	if la := os.Getenv("LOCALAPPDATA"); la != "" {
		return []string{filepath.Join(la, "ARSENAL")}
	}
	return nil
}

func nodeCandidates() []string {
	var c []string
	for _, e := range []string{"ProgramW6432", "ProgramFiles"} {
		if v := os.Getenv(e); v != "" {
			c = append(c, filepath.Join(v, "nodejs", "node.exe"))
		}
	}
	return c
}

func nodeKey() string {
	if strings.EqualFold(os.Getenv("PROCESSOR_ARCHITEW6432"), "ARM64") || strings.EqualFold(os.Getenv("PROCESSOR_ARCHITECTURE"), "ARM64") {
		return "windows-arm64"
	}
	return "windows-x64"
}

func launchers(dir string) (string, string) {
	return filepath.Join(dir, "ARSENAL.cmd"), filepath.Join(dir, "ARSENAL-gui.cmd")
}

// ps runs a Windows PowerShell script with no window; values go in through the environment, never through the script text
func ps(script string, env ...string) (string, error) {
	exe := sys32(`WindowsPowerShell\v1.0\powershell.exe`)
	if !exists(exe) {
		return "", errT("Windows PowerShell is missing")
	}
	cmd := exec.Command(exe, "-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-Command", script)
	cmd.Env = append(os.Environ(), env...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	out, err := cmd.Output()
	return strings.TrimSpace(string(out)), err
}

func installNodeSystem(in *inst, file, sha string) error {
	_, err := ps(`$p = Start-Process -FilePath (Join-Path $env:SystemRoot 'System32\msiexec.exe') -ArgumentList ('/i "' + $env:AR_MSI + '" /qn /norestart') -Verb RunAs -Wait -PassThru; exit $p.ExitCode`, "AR_MSI="+file)
	if err == nil {
		return nil
	}
	var ee *exec.ExitError
	if errors.As(err, &ee) {
		switch ee.ExitCode() {
		case 3010:
			in.say("note", "Node.js is installed; Windows wants a restart to finish it")
			return nil
		case 1602:
			return errT("the Node.js installer was cancelled")
		case 1:
			return errT("the administrator prompt was declined, or the Node.js installer could not start")
		}
		return errT("the Node.js installer ended with code %d", ee.ExitCode())
	}
	return err
}

func (in *inst) reg(args ...string) error {
	if in.testRoot != "" {
		f, err := os.OpenFile(filepath.Join(in.testRoot, "reg.txt"), os.O_CREATE|os.O_APPEND|os.O_WRONLY, 0o644)
		if err != nil {
			return err
		}
		defer f.Close()
		_, err = f.WriteString(strings.Join(args, " ") + "\r\n")
		return err
	}
	cmd := exec.Command(sys32("reg.exe"), args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if out, err := cmd.CombinedOutput(); err != nil {
		return errT("%v %s", err, strings.TrimSpace(string(out)))
	}
	return nil
}

// makeLinks: CreateShortcut on an existing .lnk loads its old fields, so Arguments is cleared: a shortcut left by the older
// Install-ARSENAL.cmd carries "gui", and the launcher opens the browser only when it gets no arguments
func makeLinks(in *inst, desktop bool) error {
	_, gui := launchers(in.dir)
	const script = `$w=New-Object -ComObject WScript.Shell; $d=if($env:AR_OUT){$env:AR_OUT}elseif($env:AR_WHERE -eq 'desktop'){[Environment]::GetFolderPath('Desktop')}else{[Environment]::GetFolderPath('Programs')}; $l=Join-Path $d 'ARSENAL.lnk'; $s=$w.CreateShortcut($l); $s.TargetPath=$env:AR_TGT; $s.Arguments=''; $s.WorkingDirectory=$env:AR_DIR; $s.IconLocation=$env:AR_ICO; $s.WindowStyle=7; $s.Description='ARSENAL window'; $s.Save(); $l`
	one := func(where, name string) error {
		env := []string{"AR_WHERE=" + where, "AR_TGT=" + gui, "AR_DIR=" + in.dir, "AR_ICO=" + filepath.Join(in.dir, "ARSENAL.ico")}
		if in.testRoot != "" {
			out := filepath.Join(in.testRoot, where)
			os.MkdirAll(out, 0o755)
			env = append(env, "AR_OUT="+out)
		}
		lnk, err := ps(script, env...)
		if err != nil || lnk == "" || !exists(lnk) {
			return errT("the %s shortcut could not be made (%v)", name, err)
		}
		in.record("link", lnk)
		in.say("ok", "%s shortcut: %s", name, lnk)
		return nil
	}
	err := one("start", "Start menu")
	if desktop {
		if e := one("desktop", "Desktop"); e != nil && err == nil {
			err = e
		}
	}
	return err
}

func setAutostart(in *inst) error {
	_, gui := launchers(in.dir)
	in.record("reg", runKey+"|ARSENAL")
	return in.reg("add", runKey, "/v", "ARSENAL", "/t", "REG_SZ", "/d", `cmd.exe /c start "ARSENAL" /min "`+gui+`"`, "/f")
}

func registerUninstall(in *inst) error {
	set := func(name, typ, val string) error { return in.reg("add", unKey, "/v", name, "/t", typ, "/d", val, "/f") }
	in.record("reg", unKey)
	for _, v := range [][3]string{
		{"DisplayName", "REG_SZ", "ARSENAL"}, {"DisplayVersion", "REG_SZ", in.cfg.Version}, {"Publisher", "REG_SZ", "ARSENAL"},
		{"InstallLocation", "REG_SZ", in.dir}, {"DisplayIcon", "REG_SZ", filepath.Join(in.dir, "ARSENAL.ico")},
		{"UninstallString", "REG_SZ", `"` + filepath.Join(in.dir, setupName()) + `" --uninstall`},
		{"NoModify", "REG_DWORD", "1"}, {"NoRepair", "REG_DWORD", "1"},
	} {
		if err := set(v[0], v[1], v[2]); err != nil {
			return err
		}
	}
	return nil
}

func removeIntegration(in *inst, rec map[string][]string) {
	for _, r := range rec["reg"] {
		key, val, has := strings.Cut(r, "|")
		var err error
		switch {
		case has && key == runKey && val == "ARSENAL":
			err = in.reg("delete", key, "/v", val, "/f")
		case !has && key == unKey:
			err = in.reg("delete", key, "/f")
		default:
			continue
		}
		if err == nil {
			in.say("ok", "removed the registry entry %s", r)
		}
	}
}

func startApp(in *inst) error {
	_, gui := launchers(in.dir)
	comspec := sys32("cmd.exe")
	cmd := exec.Command(comspec)
	cmd.SysProcAttr = &syscall.SysProcAttr{CmdLine: `cmd.exe /c start "ARSENAL" /min "` + gui + `"`, HideWindow: true}
	cmd.Env = in.envWithNode()
	cmd.Dir = in.dir
	return cmd.Run()
}

func openBrowser(url string) error {
	return exec.Command(sys32("rundll32.exe"), "url.dll,FileProtocolHandler", url).Start()
}

func checkExtras(in *inst) {
	cmd := exec.Command(sys32("reg.exe"), "query", `HKCU\Software\Microsoft\Windows\Shell\Associations\UrlAssociations\http\UserChoice`, "/v", "ProgId")
	cmd.SysProcAttr = &syscall.SysProcAttr{HideWindow: true}
	if out, err := cmd.Output(); err == nil && strings.Contains(string(out), "ProgId") {
		f := strings.Fields(string(out))
		id := f[len(f)-1]
		name := map[string]string{"ChromeHTML": "Google Chrome", "MSEdgeHTM": "Microsoft Edge"}[id]
		if name == "" {
			name = id
			if strings.HasPrefix(id, "FirefoxURL") {
				name = "Mozilla Firefox"
			}
		}
		in.say("ok", "web browser: %s is the default, the ARSENAL window opens there", name)
	} else {
		in.say("--", "web browser: no default browser is set for this user. ARSENAL prints its address; open it in any browser")
	}
	for _, c := range cachesDirs() {
		cd := filepath.Join(c, "cache")
		made1, made2 := !exists(c), !exists(cd)
		os.MkdirAll(cd, 0o755)
		probe := filepath.Join(cd, fmt.Sprintf("write-test-%d.tmp", os.Getpid()))
		err := os.WriteFile(probe, nil, 0o644)
		os.Remove(probe)
		if made2 {
			os.Remove(cd)
		}
		if made1 {
			os.Remove(c)
		}
		if err == nil {
			in.say("ok", "cache folder: %s can be written", cd)
		} else {
			in.say("no", "cache folder: %s cannot be written. The tools still run, but slower, and the window forgets its settings", cd)
		}
	}
}

// relayUninstall: a program cannot delete its own running file on Windows, so the copy inside the install folder hands over
// to a copy in the temporary folder and ends
func relayUninstall(in *inst, caches string, ask func(string, bool) bool) {
	self, err := os.Executable()
	if err != nil || !strings.EqualFold(filepath.Dir(self), in.dir) {
		return
	}
	if caches == "" {
		caches = "keep"
		if c := cachesDirs(); len(c) > 0 && exists(c[0]) && ask("Also remove the ARSENAL caches and settings in "+c[0]+"?", false) {
			caches = "remove"
		}
	}
	b, err := os.ReadFile(self)
	if err != nil {
		return
	}
	tmp := filepath.Join(os.TempDir(), fmt.Sprintf("ARSENAL-Uninstall-%d.exe", os.Getpid()))
	if os.WriteFile(tmp, b, 0o755) != nil {
		return
	}
	cmd := exec.Command(tmp, "--uninstall", "--yes", "--dir", in.dir, "--"+caches+"-caches")
	cmd.Stdout, cmd.Stderr, cmd.Stdin = os.Stdout, os.Stderr, os.Stdin
	cmd.Dir = os.TempDir()
	if cmd.Start() == nil {
		time.Sleep(200 * time.Millisecond)
		os.Exit(0)
	}
}

func rootNodeInstall(args []string) int { return 2 }
