//go:build !windows

package main

import (
	"os"
	"os/signal"
)

// Non-Windows diagnostic build only; it does not open a browser.
func runDesktop(url string) {
	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt)
	<-stop
}
