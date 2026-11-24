// ARSENAL Setup: one file per system, no dependencies. It unpacks the ARSENAL toolkit it carries (the small package: tools,
// launchers, guide, indexes; no Node.js and no historical document database) into the per-user programs folder, sets up
// Node.js for the whole computer when a new enough one is missing, checks what the tools depend on, makes the Start menu /
// application entry and the Desktop icon, optionally starts ARSENAL at sign-in and when the install finishes, and can
// download the historical index from a link set at build time or on the command line.
// It never writes into a game folder or a mod folder. Standard library only.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"compress/gzip"
	"archive/zip"
	"bufio"
	"bytes"
	"crypto/sha256"
	_ "embed"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strconv"
	"strings"
	"sync"
	"time"
)

//go:embed payload.zip
var payloadZip []byte

// node.bin.gz: the Node.js program for this system, gzipped; empty in the small installers (build.js --with-node fills it)
//go:embed node.bin.gz
var nodeGz []byte

//go:embed config.json
var configJSON []byte

//go:embed page.html
var pageHTML []byte

//go:embed icon.ico
var iconICO []byte

//go:embed icon.png
var iconPNG []byte

//go:embed icon.icns
var iconICNS []byte

const recName = "ARSENAL-install.txt"

type nodeFile struct {
	File   string `json:"file"`
	Sha256 string `json:"sha256"`
}

type config struct {
	Version string `json:"version"`
	Top     string `json:"top"`
	Node    struct {
		Version  string              `json:"version"`
		MinMajor int                 `json:"minMajor"`
		Base     string              `json:"base"`
		Files    map[string]nodeFile `json:"files"`
	} `json:"node"`
	Historical struct {
		URL    string `json:"url"`
		Sha256 string `json:"sha256"`
		Bytes  int64  `json:"bytes"`
	} `json:"historical"`
}

type options struct {
	Desktop    bool `json:"desktop"`
	Start      bool `json:"start"`
	Autostart  bool `json:"autostart"`
	Historical bool `json:"historical"`
	Node       bool `json:"-"`
	Dry        bool `json:"-"`
}

type progress struct {
	Label string `json:"label"`
	Got   int64  `json:"got"`
	Total int64  `json:"total"`
}

type inst struct {
	cfg      config
	opt      options
	dir      string
	histURL  string
	mu       sync.Mutex
	lines    []string
	phase    string // ask, run, done, fail
	prog     progress
	rec      []string
	nodePath string
	problems int
	testRoot string // ARSENAL_SETUP_TEST_ROOT: shortcuts and registry writes go under this folder (tests)
}

func (in *inst) say(kind, f string, a ...any) {
	line := fmt.Sprintf("  %-5s %s", kind, fmt.Sprintf(tr(f), a...))
	in.mu.Lock()
	in.lines = append(in.lines, line)
	if kind == "no" {
		in.problems++
	}
	in.mu.Unlock()
	fmt.Println(line)
}

func (in *inst) setProg(label string, got, total int64) {
	in.mu.Lock()
	in.prog = progress{tr(label), got, total}
	in.mu.Unlock()
}

func (in *inst) record(kind, v string) { in.rec = append(in.rec, kind+" "+v) }

func archName() string {
	if runtime.GOARCH == "amd64" {
		return "x64"
	}
	return runtime.GOARCH
}

func sysName() string {
	switch runtime.GOOS {
	case "windows":
		return "Windows"
	case "darwin":
		return "macOS"
	}
	return "Linux"
}

func exists(p string) bool { _, err := os.Lstat(p); return err == nil }

func isDir(p string) bool { st, err := os.Stat(p); return err == nil && st.IsDir() }

// ---- the install folder

func (in *inst) checkDir() error {
	d := in.dir
	if !filepath.IsAbs(d) {
		return errT("the install folder %q is not a full path", d)
	}
	d = filepath.Clean(d)
	if len(strings.Split(strings.Trim(filepath.ToSlash(d), "/"), "/")) < 2 {
		return errT("%q is a drive or a top folder, not a place for a program", d)
	}
	low := strings.ToLower(filepath.ToSlash(d)) + "/"
	if strings.Contains(low, "/steamapps/") {
		return errT("%q is inside a Steam library. ARSENAL is never installed into a game folder", d)
	}
	if st, err := os.Stat(d); err == nil {
		if !st.IsDir() {
			return errT("%q is a file, not a folder", d)
		}
		ents, _ := os.ReadDir(d)
		if len(ents) > 0 && !exists(filepath.Join(d, recName)) {
			return errT("%q is not empty and holds no earlier ARSENAL install. Pick an empty or new folder", d)
		}
	}
	in.dir = d
	return nil
}

func readRecord(dir string) (map[string][]string, error) {
	b, err := os.ReadFile(filepath.Join(dir, recName))
	if err != nil {
		return nil, err
	}
	m := map[string][]string{}
	for _, l := range strings.Split(strings.ReplaceAll(string(b), "\r", ""), "\n") {
		if i := strings.IndexByte(l, ' '); i > 0 {
			k := l[:i]
			if k == "item" || k == "link" || k == "tree" || k == "reg" {
				m[k] = append(m[k], l[i+1:])
			}
		}
	}
	return m, nil
}

func plainName(n string) bool {
	return n != "" && n != "." && n != ".." && !strings.ContainsAny(n, `/\:`)
}

// ---- unpack the toolkit

func (in *inst) extract() error {
	zr, err := zip.NewReader(bytes.NewReader(payloadZip), int64(len(payloadZip)))
	if err != nil {
		return errT("the toolkit inside this installer cannot be read: %v", err)
	}
	if old, err := readRecord(in.dir); err == nil {
		in.say("note", "an earlier ARSENAL install is there: its files are replaced")
		for _, k := range []string{"link", "tree", "reg"} { // what the earlier install made outside the folder stays on the record
			for _, v := range old[k] {
				in.record(k, v)
			}
		}
		for _, n := range old["item"] {
			if plainName(n) && n != "node" && n != "ww2sources" {
				os.RemoveAll(filepath.Join(in.dir, n))
			}
		}
	}
	if err := os.MkdirAll(in.dir, 0o755); err != nil {
		return errT("cannot make the install folder: %v", err)
	}
	items := map[string]bool{}
	var done, total int64
	for _, f := range zr.File {
		total += int64(f.UncompressedSize64)
	}
	n := 0
	for _, f := range zr.File {
		if !strings.HasPrefix(f.Name, in.cfg.Top) {
			return errT("unexpected entry %q in the toolkit", f.Name)
		}
		rel := strings.TrimPrefix(f.Name, in.cfg.Top)
		if rel == "" || rel == "Install-ARSENAL.cmd" { // the zip's own script installer: this program takes its place
			continue
		}
		parts := strings.Split(strings.TrimSuffix(rel, "/"), "/")
		for _, p := range parts {
			if !plainName(p) {
				return errT("unsafe entry %q in the toolkit", f.Name)
			}
		}
		items[parts[0]] = true
		dest := filepath.Join(in.dir, filepath.Join(parts...))
		if strings.HasSuffix(rel, "/") {
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return err
			}
			continue
		}
		if err := os.MkdirAll(filepath.Dir(dest), 0o755); err != nil {
			return err
		}
		mode := os.FileMode(0o644)
		if f.Mode()&0o111 != 0 || (len(parts) == 1 && (rel == "arsenal" || rel == "arsenal-gui")) {
			mode = 0o755
		}
		rc, err := f.Open()
		if err != nil {
			return err
		}
		os.Remove(dest)
		w, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
		if err != nil {
			rc.Close()
			return errT("cannot write %s: %v", dest, err)
		}
		_, err = io.Copy(w, rc)
		rc.Close()
		if e := w.Close(); err == nil {
			err = e
		}
		if err != nil {
			return errT("cannot write %s: %v", dest, err)
		}
		n++
		done += int64(f.UncompressedSize64)
		if n%50 == 0 {
			in.setProg("Copying the toolkit", done, total)
		}
	}
	in.setProg("", 0, 0)
	for it := range items {
		in.record("item", it)
	}
	// the icon files and a copy of this program (the uninstaller)
	ico := map[string][]byte{"windows": iconICO, "darwin": iconICNS}[runtime.GOOS]
	icoName := map[string]string{"windows": "ARSENAL.ico", "darwin": "ARSENAL.icns"}[runtime.GOOS]
	if ico == nil {
		ico, icoName = iconPNG, "ARSENAL.png"
	}
	if err := os.WriteFile(filepath.Join(in.dir, icoName), ico, 0o644); err == nil {
		in.record("item", icoName)
	}
	if self, err := os.Executable(); err == nil {
		dst := filepath.Join(in.dir, setupName())
		if a, _ := filepath.EvalSymlinks(self); !strings.EqualFold(a, dst) {
			if b, err := os.ReadFile(self); err == nil {
				os.Remove(dst)
				if os.WriteFile(dst, b, 0o755) == nil {
					in.record("item", setupName())
				}
			}
		} else {
			in.record("item", setupName())
		}
	}
	in.record("item", recName)
	in.say("ok", "copied the toolkit (%d files) into %s", n, in.dir)
	return nil
}

func setupName() string {
	if runtime.GOOS == "windows" {
		return "ARSENAL-Setup.exe"
	}
	return "ARSENAL-Setup"
}

func (in *inst) writeRecord() error {
	var b strings.Builder
	b.WriteString("ARSENAL install record, written by ARSENAL Setup " + in.cfg.Version + ". The uninstaller removes only what is listed here.\n")
	seen := map[string]bool{}
	for _, l := range in.rec {
		if !seen[l] {
			seen[l] = true
			b.WriteString(l + "\n")
		}
	}
	s := b.String()
	if runtime.GOOS == "windows" {
		s = strings.ReplaceAll(s, "\n", "\r\n")
	}
	return os.WriteFile(filepath.Join(in.dir, recName), []byte(s), 0o644)
}

// ---- Node.js

func nodeVersion(p string) (string, int) {
	out, err := exec.Command(p, "-p", "process.versions.node").Output()
	if err != nil {
		return "", 0
	}
	v := strings.TrimSpace(string(out))
	maj, _ := strconv.Atoi(strings.SplitN(v, ".", 2)[0])
	return v, maj
}

// findNode -> the first Node.js that is new enough (path, version), and the version of an older one seen on the way
func (in *inst) findNode() (string, string, string) {
	cands := []string{}
	if p, err := exec.LookPath("node"); err == nil {
		cands = append(cands, p)
	}
	cands = append(cands, nodeCandidates()...)
	old := ""
	for _, c := range cands {
		if !exists(c) {
			continue
		}
		v, maj := nodeVersion(c)
		if maj >= in.cfg.Node.MinMajor {
			return c, v, old
		}
		if v != "" && old == "" {
			old = v
		}
	}
	return "", "", old
}

func (in *inst) download(url, dest, want, label string, resume bool) error {
	var have int64
	if resume {
		if st, err := os.Stat(dest); err == nil {
			have = st.Size()
		}
	}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "ARSENAL-Setup")
	if have > 0 {
		req.Header.Set("Range", "bytes="+strconv.FormatInt(have, 10)+"-")
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return errT("the download of %s failed: %v", url, err)
	}
	defer resp.Body.Close()
	flags := os.O_CREATE | os.O_WRONLY | os.O_TRUNC
	switch {
	case resp.StatusCode == 206 && have > 0:
		flags = os.O_WRONLY | os.O_APPEND
	case resp.StatusCode == 200:
		have = 0
	case resp.StatusCode == 416 && have > 0:
		have = 0
		os.Remove(dest)
		return in.download(url, dest, want, label, false)
	default:
		return errT("the download of %s failed: the server answered %s", url, resp.Status)
	}
	f, err := os.OpenFile(dest, flags, 0o644)
	if err != nil {
		return err
	}
	total := resp.ContentLength
	if total > 0 {
		total += have
	}
	got := have
	buf := make([]byte, 256<<10)
	last := time.Now()
	for {
		n, e := resp.Body.Read(buf)
		if n > 0 {
			if _, we := f.Write(buf[:n]); we != nil {
				f.Close()
				return we
			}
			got += int64(n)
			if time.Since(last) > 200*time.Millisecond {
				in.setProg(label, got, total)
				last = time.Now()
			}
		}
		if e == io.EOF {
			break
		}
		if e != nil {
			f.Close()
			return errT("the download of %s stopped: %v", url, e)
		}
	}
	in.setProg("", 0, 0)
	if err := f.Close(); err != nil {
		return err
	}
	if want != "" {
		got, err := fileSha(dest)
		if err != nil {
			return err
		}
		if !strings.EqualFold(got, want) {
			os.Remove(dest)
			return errT("checksum mismatch for %s: want sha256 %s, got %s. The file was deleted", filepath.Base(dest), want, got)
		}
	}
	return nil
}

func fileSha(p string) (string, error) {
	f, err := os.Open(p)
	if err != nil {
		return "", err
	}
	defer f.Close()
	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return "", err
	}
	return hex.EncodeToString(h.Sum(nil)), nil
}

func (in *inst) bundledNode() (string, error) {
	name := "node"
	if runtime.GOOS == "windows" {
		name = "node.exe"
	}
	d := filepath.Join(in.dir, "node", in.cfg.Node.Version)
	if err := os.MkdirAll(d, 0o755); err != nil {
		return "", err
	}
	zr, err := gzip.NewReader(bytes.NewReader(nodeGz))
	if err != nil {
		return "", err
	}
	p := filepath.Join(d, name)
	os.Remove(p)
	w, err := os.OpenFile(p, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return "", err
	}
	_, err = io.Copy(w, zr)
	if e := w.Close(); err == nil {
		err = e
	}
	if err != nil {
		return "", err
	}
	in.record("item", "node")
	return p, nil
}

func (in *inst) setupNode() {
	if len(nodeGz) > 0 {
		p, err := in.bundledNode()
		if err == nil {
			in.nodePath = p
			in.say("ok", "Node.js %s came inside this installer (%s): nothing to download", in.cfg.Node.Version, p)
			return
		}
		in.say("no", "the Node.js inside this installer could not be unpacked: %v", err)
	}
	p, v, old := in.findNode()
	if p != "" {
		in.nodePath = p
		in.say("ok", "Node.js %s is on this computer (%s)", v, p)
		return
	}
	pin, ok := in.cfg.Node.Files[nodeKey()]
	if !in.opt.Node || !ok {
		why := tr("left out (--no-node)")
		if in.opt.Node {
			why = fmt.Sprintf(tr("no Node.js installer is pinned for this system (%s)"), nodeKey())
		}
		in.say("--", "Node.js for the whole computer: %s. ARSENAL downloads its own copy of Node.js %s on first start", why, in.cfg.Node.Version)
		return
	}
	if old != "" {
		in.say("note", "Node.js %s is on this computer, ARSENAL needs %d or newer: installing %s for the whole computer", old, in.cfg.Node.MinMajor, in.cfg.Node.Version)
	}
	tmp, err := os.MkdirTemp("", "arsenal-setup-")
	if err != nil {
		in.say("no", "Node.js: cannot make a temporary folder: %v", err)
		return
	}
	defer os.RemoveAll(tmp)
	file := filepath.Join(tmp, pin.File)
	in.say("--", "downloading Node.js %s (%s) from %s", in.cfg.Node.Version, pin.File, in.cfg.Node.Base)
	if err := in.download(in.cfg.Node.Base+pin.File, file, pin.Sha256, fmt.Sprintf(tr("Downloading Node.js %s"), in.cfg.Node.Version), false); err != nil {
		in.say("no", "Node.js: %v. ARSENAL downloads its own copy on first start, or install Node.js %d or newer from https://nodejs.org", err, in.cfg.Node.MinMajor)
		return
	}
	in.say("ok", "Node.js download checked (sha256 %s)", pin.Sha256)
	in.say("--", "installing Node.js for the whole computer: the system asks for an administrator now")
	in.setProg("Installing Node.js (answer the administrator prompt)", 0, 0)
	err = installNodeSystem(in, file, pin.Sha256)
	in.setProg("", 0, 0)
	if err != nil {
		in.say("no", "Node.js was not installed for the whole computer: %v. ARSENAL downloads its own copy of Node.js %s on first start instead", err, in.cfg.Node.Version)
		return
	}
	if p, v, _ := in.findNode(); p != "" {
		in.nodePath = p
		in.say("ok", "Node.js %s installed for the whole computer (%s)", v, p)
	} else {
		in.say("no", "the Node.js installer ended without an error, but no Node.js %d or newer was found after it. ARSENAL downloads its own copy on first start", in.cfg.Node.MinMajor)
	}
}

// envWithNode: the environment for a child that must find the Node.js this run found or installed
func (in *inst) envWithNode() []string {
	env := os.Environ()
	if in.nodePath == "" {
		return env
	}
	d := filepath.Dir(in.nodePath)
	for i, e := range env {
		if len(e) > 5 && strings.EqualFold(e[:5], "PATH=") {
			env[i] = e[:5] + d + string(os.PathListSeparator) + e[5:]
			return env
		}
	}
	return append(env, "PATH="+d)
}

// ---- what the tools depend on

func (in *inst) depends() {
	cli, _ := launchers(in.dir)
	cmd := exec.Command(cli, "version")
	cmd.Env = in.envWithNode()
	cmd.Dir = in.dir
	out, err := cmd.CombinedOutput()
	first := strings.TrimSpace(strings.SplitN(strings.TrimSpace(string(out)), "\n", 2)[0])
	if err != nil {
		in.say("no", "the toolkit did not start (%v) %s. Install Node.js %d or newer from https://nodejs.org, then start ARSENAL again", err, first, in.cfg.Node.MinMajor)
	} else {
		in.say("ok", "the toolkit runs: %s", first)
		if exists(filepath.Join(in.dir, "node")) {
			in.record("item", "node")
		}
	}
	checkExtras(in)
	if err == nil {
		g := exec.Command(cli, "game")
		g.Env = in.envWithNode()
		g.Dir = in.dir
		if o, e := g.Output(); e == nil && strings.TrimSpace(string(o)) != "" {
			in.say("ok", "game found: %s", strings.TrimSpace(strings.SplitN(string(o), "\n", 2)[0]))
		} else {
			in.say("--", "no game found yet. It is optional; pick the game folder in the ARSENAL window under Tools & Settings")
		}
	}
}

// ---- the historical index

func (in *inst) histSource() (string, string) {
	url := in.histURL
	if url == "" {
		url = in.cfg.Historical.URL
	}
	return url, in.cfg.Historical.Sha256
}

func (in *inst) historical() error {
	url, want := in.histSource()
	if url == "" {
		return errT("the historical index has no download link yet. A later ARSENAL Setup carries it; then run: %s --historical", setupName())
	}
	if !strings.HasPrefix(url, "https://") && !(in.testRoot != "" && strings.HasPrefix(url, "http://127.0.0.1")) {
		return errT("the historical index link must start with https://")
	}
	dd := filepath.Join(in.dir, "ww2sources")
	if err := os.MkdirAll(dd, 0o755); err != nil {
		return err
	}
	// the sha256 the toolkit itself expects, when its own list names one
	if b, err := os.ReadFile(filepath.Join(dd, "ww2sources.json")); err == nil {
		var j struct {
			SqliteSha256 string `json:"sqliteSha256"`
		}
		if json.Unmarshal(b, &j) == nil && len(j.SqliteSha256) == 64 && want == "" {
			want = j.SqliteSha256
		}
	}
	part := filepath.Join(dd, "index.download")
	in.say("--", "downloading the historical index from %s", url)
	if err := in.download(url, part, "", tr("Downloading the historical index"), true); err != nil {
		return err
	}
	final := filepath.Join(dd, "index.sqlite")
	head := make([]byte, 16)
	if f, err := os.Open(part); err == nil {
		io.ReadFull(f, head)
		f.Close()
	}
	switch {
	case bytes.HasPrefix(head, []byte("SQLite format 3")):
	case bytes.HasPrefix(head, []byte("PK")):
		in.setProg("Unpacking the historical index", 0, 0)
		tmp := filepath.Join(dd, "index.unpack")
		if err := unzipOne(part, "index.sqlite", tmp); err != nil {
			os.Remove(tmp)
			return errT("the downloaded zip holds no index.sqlite that can be read: %v", err)
		}
		os.Remove(part)
		part = tmp
		in.setProg("", 0, 0)
	default:
		os.Remove(part)
		return errT("the downloaded file is neither the index database nor a zip with it. It was deleted")
	}
	if want != "" {
		in.setProg("Checking the historical index", 0, 0)
		got, err := fileSha(part)
		in.setProg("", 0, 0)
		if err != nil {
			return err
		}
		if !strings.EqualFold(got, want) {
			os.Remove(part)
			return errT("checksum mismatch for the historical index: want sha256 %s, got %s. The file was deleted", want, got)
		}
	}
	os.Remove(final)
	if err := os.Rename(part, final); err != nil {
		return err
	}
	if want != "" {
		in.say("ok", "historical index in place, sha256 checked: %s", final)
	} else {
		in.say("ok", "historical index in place (no sha256 was given to check it against): %s", final)
	}
	return nil
}

func unzipOne(zipPath, base, dest string) error {
	zr, err := zip.OpenReader(zipPath)
	if err != nil {
		return err
	}
	defer zr.Close()
	for _, f := range zr.File {
		if f.Name == base || strings.HasSuffix(f.Name, "/"+base) {
			rc, err := f.Open()
			if err != nil {
				return err
			}
			defer rc.Close()
			w, err := os.Create(dest)
			if err != nil {
				return err
			}
			_, err = io.Copy(w, rc)
			if e := w.Close(); err == nil {
				err = e
			}
			return err
		}
	}
	return errT("no %s inside", base)
}

// ---- the whole install

func (in *inst) run() error {
	in.say("ok", "ARSENAL %s for %s %s", in.cfg.Version, sysName(), archName())
	if err := in.checkDir(); err != nil {
		return err
	}
	if in.opt.Dry {
		in.say("dry", "would copy the toolkit into %s", in.dir)
		if len(nodeGz) > 0 {
			in.say("dry", "would unpack the Node.js %s that is inside this installer: nothing to download", in.cfg.Node.Version)
		} else if p, v, _ := in.findNode(); p != "" {
			in.say("dry", "Node.js %s is there (%s): nothing to set up", v, p)
		} else if in.opt.Node {
			in.say("dry", "would download Node.js %s from %s, check its sha256 and install it for the whole computer", in.cfg.Node.Version, in.cfg.Node.Base)
		}
		in.say("dry", "would make the application entry%s%s", map[bool]string{true: tr(" and the Desktop icon")}[in.opt.Desktop], map[bool]string{true: tr(", and start ARSENAL at sign-in")}[in.opt.Autostart])
		if in.opt.Historical {
			u, _ := in.histSource()
			in.say("dry", "would download the historical index from %q", u)
		}
		return nil
	}
	if err := in.extract(); err != nil {
		return err
	}
	in.setupNode()
	in.depends()
	if err := makeLinks(in, in.opt.Desktop); err != nil {
		in.say("no", "shortcuts: %v", err)
	}
	if in.opt.Autostart {
		if err := setAutostart(in); err != nil {
			in.say("no", "start at sign-in: %v", err)
		} else {
			in.say("ok", "ARSENAL starts when you sign in")
		}
	}
	if err := registerUninstall(in); err != nil {
		in.say("no", "uninstall entry: %v", err)
	}
	if err := in.writeRecord(); err != nil {
		return errT("cannot write the install record: %v", err)
	}
	if in.opt.Historical {
		if err := in.historical(); err != nil {
			in.say("no", "historical index: %v", err)
		}
	} else if u, _ := in.histSource(); u == "" {
		in.say("--", "historical index: not part of this installer and no download link is set yet")
	} else {
		in.say("--", "historical index: not downloaded. Later: %s --historical", filepath.Join(in.dir, setupName()))
	}
	if in.opt.Start {
		if err := startApp(in); err != nil {
			in.say("no", "ARSENAL could not be started: %v", err)
		} else {
			in.say("ok", "ARSENAL is starting; its window opens in the web browser")
		}
	}
	in.say("ok", "installed in %s. Remove it with: %s --uninstall", in.dir, filepath.Join(in.dir, setupName()))
	return nil
}

// ---- uninstall

func (in *inst) uninstall(caches string, ask func(string, bool) bool) error {
	rec, err := readRecord(in.dir)
	if err != nil {
		return errT("%q has no %s, so it was not made by ARSENAL Setup. Nothing was removed", in.dir, recName)
	}
	relayUninstall(in, caches, ask) // Windows, started from inside the install folder: hands over to a copy and ends here
	removeIntegration(in, rec)
	for _, l := range rec["link"] {
		if strings.Contains(strings.ToLower(filepath.Base(l)), "arsenal") && exists(l) {
			if os.Remove(l) == nil {
				in.say("ok", "removed %s", l)
			}
		}
	}
	for _, t := range rec["tree"] {
		if strings.HasSuffix(t, "ARSENAL.app") && exists(t) {
			if os.RemoveAll(t) == nil {
				in.say("ok", "removed %s", t)
			}
		}
	}
	n := 0
	for _, it := range rec["item"] {
		if plainName(it) && it != recName {
			if rmRetry(filepath.Join(in.dir, it)) == nil {
				n++
			}
		}
	}
	os.RemoveAll(filepath.Join(in.dir, "node"))
	os.Remove(filepath.Join(in.dir, recName))
	if os.Remove(in.dir) == nil {
		in.say("ok", "removed the install folder %s (%d items)", in.dir, n)
	} else {
		in.say("ok", "removed %d items from %s; the folder stays because it holds files ARSENAL Setup did not put there", n, in.dir)
	}
	var cs []string
	for _, c := range cachesDirs() {
		if exists(c) {
			cs = append(cs, c)
		}
	}
	if len(cs) > 0 {
		rm := caches == "remove"
		if caches == "" {
			rm = ask("Also remove the ARSENAL caches and settings in "+strings.Join(cs, ", ")+"?", false)
		}
		for _, c := range cs {
			if !rm {
				in.say("--", "the caches and settings stay: %s", c)
			} else if err := os.RemoveAll(c); err == nil {
				in.say("ok", "removed the caches %s", c)
			} else {
				in.say("no", "caches: %v", err)
			}
		}
	}
	in.say("--", "Node.js stays on the computer (other programs may use it). Remove it from the system's own program list if you want")
	return nil
}

// rmRetry: a file of a program that has just ended can stay locked for a moment on Windows
func rmRetry(p string) error {
	var err error
	for i := 0; i < 12; i++ {
		if err = os.RemoveAll(p); err == nil {
			return nil
		}
		time.Sleep(300 * time.Millisecond)
	}
	return err
}

// ---- console

func askConsole(q string, def bool) bool {
	d := "y/N"
	if def {
		d = "Y/n"
	}
	fmt.Printf("%s [%s]: ", tr(q), d)
	s, err := bufio.NewReader(os.Stdin).ReadString('\n')
	if err != nil && s == "" {
		return def
	}
	s = strings.ToLower(strings.TrimSpace(s))
	if s == "" {
		return def
	}
	switch s {
	case "y", "yes", "д", "да", "т", "так", "是":
		return true
	}
	return false
}

func pause() {
	fmt.Print(tr("Press Enter to close. "))
	bufio.NewReader(os.Stdin).ReadString('\n')
}

const usage = `ARSENAL Setup: installs ARSENAL for this user, sets up Node.js, makes the shortcuts.
usage: ARSENAL-Setup                      opens the setup page in the web browser
       ARSENAL-Setup --console            asks the same questions in this window
       ARSENAL-Setup --yes [options]      installs without asking
       ARSENAL-Setup --historical         downloads only the historical index into an install
       ARSENAL-Setup --uninstall [--remove-caches | --keep-caches]
options: --dir <folder>        install there, not in the per-user programs folder
         --no-desktop          no Desktop icon
         --no-start            do not start ARSENAL when the install finishes
         --autostart           start ARSENAL at sign-in
         --no-node             do not install Node.js for the whole computer (ARSENAL then gets its own copy on first start)
         --with-historical     also download the historical index
         --historical-url <u>  the link to download the historical index from
         --dry                 print every step, change nothing
         --lang <en|ru|uk|zh>  the language of the texts (default: the language of the system)
         --version             print the version`

func main() {
	if len(os.Args) > 1 && os.Args[1] == "--root-node-install" {
		os.Exit(rootNodeInstall(os.Args[2:]))
	}
	initLang()
	in := &inst{phase: "ask", testRoot: os.Getenv("ARSENAL_SETUP_TEST_ROOT")}
	if err := json.Unmarshal(configJSON, &in.cfg); err != nil {
		fmt.Fprintln(os.Stderr, "ARSENAL Setup: this installer is damaged (config):", err)
		os.Exit(2)
	}
	fs := flag.NewFlagSet("ARSENAL-Setup", flag.ContinueOnError)
	fs.SetOutput(io.Discard)
	console := fs.Bool("console", false, "")
	yes := fs.Bool("yes", false, "")
	dir := fs.String("dir", "", "")
	noDesktop := fs.Bool("no-desktop", false, "")
	noStart := fs.Bool("no-start", false, "")
	autostart := fs.Bool("autostart", false, "")
	noNode := fs.Bool("no-node", false, "")
	withHist := fs.Bool("with-historical", false, "")
	onlyHist := fs.Bool("historical", false, "")
	histURL := fs.String("historical-url", "", "")
	un := fs.Bool("uninstall", false, "")
	rmC := fs.Bool("remove-caches", false, "")
	keepC := fs.Bool("keep-caches", false, "")
	dry := fs.Bool("dry", false, "")
	lng := fs.String("lang", "", "")
	ver := fs.Bool("version", false, "")
	help := fs.Bool("help", false, "")
	if err := fs.Parse(os.Args[1:]); err != nil || fs.NArg() > 0 {
		fmt.Fprintln(os.Stderr, tr("ARSENAL Setup: unknown option. --help lists them."))
		os.Exit(2)
	}
	if *lng != "" && !setLang(*lng) {
		fmt.Fprintln(os.Stderr, tr("ARSENAL Setup: --lang takes en, ru, uk or zh."))
		os.Exit(2)
	}
	if *help {
		fmt.Println(usage)
		return
	}
	if *ver {
		fmt.Println("ARSENAL Setup " + in.cfg.Version + " (" + sysName() + " " + archName() + "), Node.js pin " + in.cfg.Node.Version)
		return
	}
	in.histURL = *histURL
	in.dir = *dir
	if in.dir == "" {
		in.dir = defaultDir()
		// started from inside an install (the uninstaller copy): that install
		if self, err := os.Executable(); err == nil && (*un || *onlyHist) && exists(filepath.Join(filepath.Dir(self), recName)) {
			in.dir = filepath.Dir(self)
		}
	}
	if a, err := filepath.Abs(in.dir); err == nil {
		in.dir = a
	}
	in.opt = options{Desktop: !*noDesktop, Start: !*noStart, Autostart: *autostart, Historical: *withHist, Node: !*noNode, Dry: *dry}
	fmt.Println("ARSENAL Setup " + in.cfg.Version)

	if *un {
		caches := ""
		if *rmC {
			caches = "remove"
		} else if *keepC || *yes {
			caches = "keep"
		}
		if !*yes && !askConsole(fmt.Sprintf(tr("Remove ARSENAL from %s?"), in.dir), true) {
			return
		}
		if err := in.uninstall(caches, askConsole); err != nil {
			fmt.Fprintln(os.Stderr, "ARSENAL Setup:", err)
			os.Exit(1)
		}
		if !*yes {
			pause()
		}
		return
	}
	if *onlyHist {
		if !exists(filepath.Join(in.dir, recName)) {
			fmt.Fprintln(os.Stderr, fmt.Sprintf(tr("ARSENAL Setup: %q holds no ARSENAL install. Install first, or name the folder with --dir."), in.dir))
			os.Exit(1)
		}
		if err := in.historical(); err != nil {
			fmt.Fprintln(os.Stderr, "ARSENAL Setup:", err)
			os.Exit(1)
		}
		return
	}
	if !*yes && !*console && !*dry {
		if err := in.serve(); err == nil {
			return
		} else {
			fmt.Println(fmt.Sprintf(tr("The setup page could not be opened in a web browser (%s). Asking here instead."), err.Error()))
		}
		*console = true
	}
	if *console && !*yes {
		fmt.Println(fmt.Sprintf(tr("Install folder: %s"), in.dir))
		if p, v, _ := in.findNode(); p != "" {
			fmt.Println(fmt.Sprintf(tr("Node.js %s is on this computer."), v))
		} else if len(nodeGz) > 0 {
			fmt.Println(fmt.Sprintf(tr("Node.js %s is inside this installer. Nothing is downloaded."), in.cfg.Node.Version))
		} else {
			fmt.Println(fmt.Sprintf(tr("Node.js %s will be downloaded from nodejs.org and installed for the whole computer (administrator prompt)."), in.cfg.Node.Version))
		}
		if !askConsole("Install ARSENAL?", true) {
			return
		}
		in.opt.Desktop = askConsole("Put an ARSENAL icon on the Desktop?", true)
		in.opt.Autostart = askConsole("Start ARSENAL when you sign in?", false)
		if u, _ := in.histSource(); u != "" {
			in.opt.Historical = askConsole("Download the historical index (large)?", false)
		}
		in.opt.Start = askConsole("Start ARSENAL when the install finishes?", true)
	}
	err := in.run()
	if err != nil {
		fmt.Fprintln(os.Stderr, fmt.Sprintf(tr("ARSENAL Setup: %s. Nothing more was done."), err.Error()))
	}
	if *console && !*yes {
		pause()
	}
	if err != nil {
		os.Exit(1)
	}
	if in.problems > 0 {
		os.Exit(3)
	}
}
