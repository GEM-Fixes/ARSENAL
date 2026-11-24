// Languages of the installer: English, Russian, Ukrainian, Chinese. The table (lang.json) is keyed by the English text, so a
// text with no entry is shown in English. The language is the system's one unless --lang or ARSENAL_SETUP_LANG names another.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	_ "embed"
	"encoding/json"
	"fmt"
	"os"
	"strings"
	"sync"
)

//go:embed lang.json
var langJSON []byte

var langOrder = []string{"en", "ru", "uk", "zh"}

type langTable struct {
	Names map[string]string   `json:"names"`
	Text  map[string][]string `json:"text"` // English text -> ru, uk, zh
	Page  map[string][]string `json:"page"` // key of the setup page -> en, ru, uk, zh
}

var (
	langMu  sync.RWMutex
	curLang = "en"
	langTab langTable
)

// pickLang: "ru_RU.UTF-8", "zh-Hans-CN", "UK" -> the code of a language the installer has, or "".
func pickLang(tag string) string {
	tag = strings.ToLower(strings.TrimSpace(tag))
	if len(tag) < 2 || (len(tag) > 2 && tag[2] != '_' && tag[2] != '-' && tag[2] != '.' && tag[2] != '@') {
		return ""
	}
	for _, l := range langOrder {
		if tag[:2] == l {
			return l
		}
	}
	return ""
}

func setLang(tag string) bool {
	l := pickLang(tag)
	if l == "" {
		return false
	}
	langMu.Lock()
	curLang = l
	langMu.Unlock()
	return true
}

func getLang() string {
	langMu.RLock()
	defer langMu.RUnlock()
	return curLang
}

func initLang() {
	json.Unmarshal(langJSON, &langTab)
	if !setLang(os.Getenv("ARSENAL_SETUP_LANG")) {
		setLang(sysLang())
	}
}

// tr: the text in the language in use; the English text itself when the table has none.
func tr(s string) string {
	l := getLang()
	if l == "en" || s == "" {
		return s
	}
	if row, ok := langTab.Text[s]; ok {
		for i, c := range langOrder[1:] {
			if c == l && i < len(row) && row[i] != "" {
				return row[i]
			}
		}
	}
	return s
}

func errT(f string, a ...any) error { return fmt.Errorf(tr(f), a...) }

// pageLang: what the setup page needs, as JSON: the language in use, the list, the names, the page's own texts.
func pageLang() []byte {
	b, _ := json.Marshal(map[string]any{"cur": getLang(), "order": langOrder, "names": langTab.Names, "page": langTab.Page})
	return b
}
