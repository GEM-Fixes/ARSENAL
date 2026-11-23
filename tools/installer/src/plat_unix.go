//go:build linux || darwin

// Linux and macOS, the shared part: folders, launchers, start, the administrator step that unpacks Node.js on Linux.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"archive/tar"
	"compress/gzip"
	"fmt"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"syscall"
)

func home() string { h, _ := os.UserHomeDir(); return h }

func xdg(name, def string) string {
	if v := os.Getenv(name); filepath.IsAbs(v) {
		return v
	}
	return filepath.Join(home(), def)
}

func launchers(dir string) (string, string) {
	return filepath.Join(dir, "arsenal"), filepath.Join(dir, "arsenal-gui")
}

func registerUninstall(in *inst) error { return nil }

func removeIntegration(in *inst, rec map[string][]string) {}

func relayUninstall(in *inst, caches string, ask func(string, bool) bool) {}

func checkExtras(in *inst) {}

func hasCmd(n string) bool { _, err := exec.LookPath(n); return err == nil }

func isTerminal() bool {
	st, err := os.Stdin.Stat()
	return err == nil && st.Mode()&os.ModeCharDevice != 0
}

func detached(name string, env []string, args ...string) error {
	cmd := exec.Command(name, args...)
	cmd.Env = env
	cmd.SysProcAttr = &syscall.SysProcAttr{Setsid: true}
	if err := cmd.Start(); err != nil {
		return err
	}
	go cmd.Wait()
	return nil
}

func writeFile(in *inst, kind, p, body string, mode os.FileMode) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	os.Remove(p)
	if err := os.WriteFile(p, []byte(body), mode); err != nil {
		return err
	}
	in.record(kind, p)
	return nil
}

func symlink(in *inst, target, p string) error {
	if err := os.MkdirAll(filepath.Dir(p), 0o755); err != nil {
		return err
	}
	if st, err := os.Lstat(p); err == nil {
		if st.Mode()&os.ModeSymlink == 0 {
			return fmt.Errorf("%s is there already and is not a link", p)
		}
		os.Remove(p)
	}
	if err := os.Symlink(target, p); err != nil {
		return err
	}
	in.record("link", p)
	return nil
}

// rootNodeInstall: `--root-node-install <node tar.gz> <sha256>`, started with administrator rights on Linux. Unpacks the
// archive under <prefix>/lib/nodejs and links node, npm, npx and corepack into <prefix>/bin. prefix is /usr/local.
func rootNodeInstall(args []string) int {
	fail := func(f string, a ...any) int {
		fmt.Fprintf(os.Stderr, "ARSENAL Setup (Node.js): "+f+"\n", a...)
		return 1
	}
	if len(args) != 2 {
		return fail("wrong arguments")
	}
	prefix := "/usr/local"
	if p := os.Getenv("ARSENAL_SETUP_NODE_PREFIX"); filepath.IsAbs(p) && os.Geteuid() != 0 {
		prefix = p // tests: a folder the user owns
	} else if os.Geteuid() != 0 {
		return fail("this step needs administrator rights")
	}
	if got, err := fileSha(args[0]); err != nil || !strings.EqualFold(got, args[1]) {
		return fail("the archive %s does not have the pinned sha256", args[0])
	}
	f, err := os.Open(args[0])
	if err != nil {
		return fail("%v", err)
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return fail("%v", err)
	}
	root := filepath.Join(prefix, "lib", "nodejs")
	if err := os.MkdirAll(root, 0o755); err != nil {
		return fail("%v", err)
	}
	stem := ""
	tr := tar.NewReader(gz)
	for {
		h, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return fail("%v", err)
		}
		name := filepath.ToSlash(filepath.Clean(h.Name))
		if name == "." || strings.HasPrefix(name, "../") || strings.HasPrefix(name, "/") || strings.Contains(name, "/../") {
			return fail("unsafe entry %q", h.Name)
		}
		top := strings.SplitN(name, "/", 2)[0]
		if stem == "" {
			stem = top
			os.RemoveAll(filepath.Join(root, stem))
		} else if top != stem {
			return fail("the archive has more than one top folder")
		}
		dest := filepath.Join(root, filepath.FromSlash(name))
		switch h.Typeflag {
		case tar.TypeDir:
			if err := os.MkdirAll(dest, 0o755); err != nil {
				return fail("%v", err)
			}
		case tar.TypeSymlink:
			if filepath.IsAbs(h.Linkname) || !strings.HasPrefix(filepath.Clean(filepath.Join(filepath.Dir(dest), h.Linkname)), filepath.Join(root, stem)+string(os.PathSeparator)) {
				return fail("unsafe link %q", h.Name)
			}
			os.MkdirAll(filepath.Dir(dest), 0o755)
			if err := os.Symlink(h.Linkname, dest); err != nil {
				return fail("%v", err)
			}
		case tar.TypeReg:
			os.MkdirAll(filepath.Dir(dest), 0o755)
			mode := os.FileMode(0o644)
			if h.Mode&0o111 != 0 {
				mode = 0o755
			}
			w, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
			if err != nil {
				return fail("%v", err)
			}
			_, err = io.Copy(w, tr)
			if e := w.Close(); err == nil {
				err = e
			}
			if err != nil {
				return fail("%v", err)
			}
		}
	}
	if stem == "" || !exists(filepath.Join(root, stem, "bin", "node")) {
		return fail("the archive holds no bin/node")
	}
	bin := filepath.Join(prefix, "bin")
	if err := os.MkdirAll(bin, 0o755); err != nil {
		return fail("%v", err)
	}
	for _, n := range []string{"node", "npm", "npx", "corepack"} {
		src := filepath.Join(root, stem, "bin", n)
		if !exists(src) {
			continue
		}
		dst := filepath.Join(bin, n)
		if st, err := os.Lstat(dst); err == nil {
			if st.Mode()&os.ModeSymlink == 0 {
				fmt.Fprintf(os.Stderr, "ARSENAL Setup (Node.js): %s is a file of another install; left as it is\n", dst)
				continue
			}
			os.Remove(dst)
		}
		if err := os.Symlink(src, dst); err != nil {
			return fail("%v", err)
		}
	}
	return 0
}
