package main

import (
	"embed"
	"fmt"
	"io/fs"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

//go:embed dist
var assets embed.FS

func main() {
	root, err := fs.Sub(assets, "dist")
	if err != nil {
		panic(err)
	}
	if len(os.Args) == 3 && os.Args[1] == "--export" {
		target, err := filepath.Abs(os.Args[2])
		if err != nil {
			panic(err)
		}
		err = fs.WalkDir(root, ".", func(path string, d fs.DirEntry, err error) error {
			if err != nil {
				return err
			}
			dest := filepath.Join(target, filepath.FromSlash(path))
			if d.IsDir() {
				return os.MkdirAll(dest, 0755)
			}
			// Export into a new directory; never silently overwrite user files.
			data, err := fs.ReadFile(root, path)
			if err != nil {
				return err
			}
			f, err := os.OpenFile(dest, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0644)
			if err != nil {
				return err
			}
			_, writeErr := f.Write(data)
			closeErr := f.Close()
			if writeErr != nil {
				return writeErr
			}
			return closeErr
		})
		if err != nil {
			fmt.Println("Export failed:", err)
			os.Exit(1)
		}
		fmt.Println("Exported PWA assets to:", target)
		return
	}
	listener, err := net.Listen("tcp4", "127.0.0.1:0")
	if err != nil {
		fmt.Println("Unable to start local app:", err)
		return
	}
	address := listener.Addr().String()
	url := "http://" + address + "/"
	static := http.FileServer(http.FS(root))
	server := &http.Server{ReadHeaderTimeout: 10 * time.Second}
	server.Handler = http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Serve only this loopback origin, including protection against DNS rebinding.
		if r.Host != address {
			http.Error(w, "Forbidden host", 403)
			return
		}
		if origin := r.Header.Get("Origin"); origin != "" && origin != "http://"+address {
			http.Error(w, "Forbidden origin", 403)
			return
		}
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cross-Origin-Opener-Policy", "same-origin")
		w.Header().Set("Cross-Origin-Embedder-Policy", "require-corp")
		w.Header().Set("Referrer-Policy", "no-referrer")
		w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; img-src 'self' blob: data:; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; frame-ancestors 'none'; base-uri 'self'")
		if r.URL.Path == "/worker.js" {
			w.Header().Set("Content-Security-Policy", "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'")
		}
		if r.Method != "GET" && r.Method != "HEAD" {
			http.Error(w, "Read only", 405)
			return
		}
		if strings.HasSuffix(r.URL.Path, ".wasm") {
			w.Header().Set("Content-Type", "application/wasm")
		}
		if strings.HasSuffix(r.URL.Path, ".mjs") {
			w.Header().Set("Content-Type", "text/javascript")
		}
		static.ServeHTTP(w, r)
	})
	fmt.Println("Whetstone 1.1.0 - Desktop AI denoiser")
	fmt.Println("Open:", url)
	go func() {
		if err := server.Serve(listener); err != nil && err != http.ErrServerClosed {
			fmt.Println(err)
		}
	}()
	runDesktop(url)
	_ = server.Close()
}
