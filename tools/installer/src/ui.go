// The setup page: a server on the loopback address only, opened in the user's web browser. Every request must carry the
// random token of this run and name this server as its host.
// Author: Imperator_Aug (ARSENAL)
package main

import (
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"os"
	"sync"
	"time"
)

func (in *inst) serve() error {
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		return err
	}
	tb := make([]byte, 16)
	if _, err := rand.Read(tb); err != nil {
		return err
	}
	token, addr := hex.EncodeToString(tb), ln.Addr().String()
	done := make(chan struct{})
	var once sync.Once
	finish := func() { once.Do(func() { close(done) }) }
	var pm sync.Mutex
	lastPoll := time.Now()

	ok := func(w http.ResponseWriter, r *http.Request, method string) bool {
		if r.Host != addr || r.URL.Query().Get("t") != token || r.Method != method {
			http.Error(w, "refused", http.StatusForbidden)
			return false
		}
		w.Header().Set("Cache-Control", "no-store")
		return true
	}
	nodePath, nodeVer, nodeOld := in.findNode()
	histURL, _ := in.histSource()
	info := map[string]any{
		"version": in.cfg.Version, "system": sysName() + " " + archName(), "dir": in.dir,
		"nodeFound": nodePath != "", "nodeVersion": nodeVer, "nodeOld": nodeOld, "nodePin": in.cfg.Node.Version,
		"historical": histURL != "", "historicalBytes": in.cfg.Historical.Bytes,
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" || !ok(w, r, "GET") {
			return
		}
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		w.Header().Set("Content-Security-Policy", "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; connect-src 'self'; img-src data:")
		w.Write(pageHTML)
	})
	mux.HandleFunc("/state", func(w http.ResponseWriter, r *http.Request) {
		if !ok(w, r, "GET") {
			return
		}
		pm.Lock()
		lastPoll = time.Now()
		pm.Unlock()
		in.mu.Lock()
		st := map[string]any{"phase": in.phase, "lines": in.lines, "progress": in.prog, "problems": in.problems, "info": info}
		b, _ := json.Marshal(st)
		in.mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Write(b)
	})
	mux.HandleFunc("/install", func(w http.ResponseWriter, r *http.Request) {
		if !ok(w, r, "POST") {
			return
		}
		var o options
		if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, 4096)).Decode(&o); err != nil {
			http.Error(w, "bad request", http.StatusBadRequest)
			return
		}
		in.mu.Lock()
		if in.phase != "ask" {
			in.mu.Unlock()
			http.Error(w, "already started", http.StatusConflict)
			return
		}
		in.phase = "run"
		o.Node, o.Dry = in.opt.Node, in.opt.Dry
		in.opt = o
		in.mu.Unlock()
		go func() {
			err := in.run()
			if err != nil {
				in.say("no", "%v. Nothing more was done", err)
			}
			in.mu.Lock()
			if err != nil {
				in.phase = "fail"
			} else {
				in.phase = "done"
			}
			in.mu.Unlock()
		}()
		w.Write([]byte("{}"))
	})
	mux.HandleFunc("/close", func(w http.ResponseWriter, r *http.Request) {
		if !ok(w, r, "POST") {
			return
		}
		w.Write([]byte("{}"))
		in.mu.Lock()
		running := in.phase == "run"
		in.mu.Unlock()
		if !running {
			go func() { time.Sleep(300 * time.Millisecond); finish() }()
		}
	})
	srv := &http.Server{Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go srv.Serve(ln)
	url := "http://" + addr + "/?t=" + token
	if os.Getenv("ARSENAL_SETUP_NO_BROWSER") != "" { // tests: the address is printed, no browser is started
	} else if err := openBrowser(url); err != nil {
		srv.Close()
		return err
	}
	fmt.Println("The setup page is open in your web browser. Keep this window open until the install is finished.")
	fmt.Println("If the page did not open, go to: " + url)
	// the page is gone: stop waiting (never while the install runs)
	go func() {
		for {
			time.Sleep(5 * time.Second)
			pm.Lock()
			idle := time.Since(lastPoll)
			pm.Unlock()
			in.mu.Lock()
			ph := in.phase
			in.mu.Unlock()
			if (ph == "ask" && idle > 10*time.Minute) || ((ph == "done" || ph == "fail") && idle > 3*time.Minute) {
				finish()
				return
			}
		}
	}()
	<-done
	srv.Close()
	return nil
}
