//go:build linux || darwin

// The system language on Linux and macOS: macOS keeps the user's list in its settings; elsewhere the locale variables say it.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"os"
	"os/exec"
	"runtime"
	"strings"
)

func sysLang() string {
	if runtime.GOOS == "darwin" {
		if out, err := exec.Command("defaults", "read", "-g", "AppleLanguages").Output(); err == nil {
			for _, line := range strings.Split(string(out), "\n") {
				line = strings.Trim(strings.TrimSpace(line), `",`)
				if l := pickLang(line); l != "" {
					return l
				}
				if len(line) >= 2 && line != "(" && line != ")" {
					break // the first language of the list is one the installer does not have
				}
			}
		}
	}
	for _, n := range []string{"LANGUAGE", "LC_ALL", "LC_MESSAGES", "LANG"} {
		v := strings.SplitN(os.Getenv(n), ":", 2)[0]
		if l := pickLang(v); l != "" {
			return l
		}
	}
	return ""
}
