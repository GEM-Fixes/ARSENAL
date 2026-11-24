//go:build windows

// The system language on Windows: the display language of the signed-in user.
// Author: Imperator_Aug (ARSENAL)
package main

import "syscall"

func sysLang() string {
	p := syscall.NewLazyDLL("kernel32.dll").NewProc("GetUserDefaultUILanguage")
	if p.Find() != nil {
		return ""
	}
	id, _, _ := p.Call()
	switch id & 0x3ff { // the primary language of the id
	case 0x19:
		return "ru"
	case 0x22:
		return "uk"
	case 0x04:
		return "zh"
	case 0x09:
		return "en"
	}
	return ""
}
