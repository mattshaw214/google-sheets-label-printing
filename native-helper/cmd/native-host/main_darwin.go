//go:build darwin

package main

import (
	"fmt"
	"os"

	"petesgarden/windowshelper/internal/cups"
	"petesgarden/windowshelper/internal/host"
	"petesgarden/windowshelper/internal/macinstall"
)

var allowedOrigin string
var extensionID string

func main() {
	if len(os.Args) == 2 && os.Args[1] == "--install" {
		home, err := os.UserHomeDir()
		if err == nil {
			var executable string
			executable, err = os.Executable()
			if err == nil {
				_, err = macinstall.Install(executable, home, extensionID)
			}
		}
		exitMode("Installation", err)
		return
	}
	if len(os.Args) == 2 && os.Args[1] == "--uninstall" {
		home, err := os.UserHomeDir()
		if err == nil {
			err = macinstall.Uninstall(home)
		}
		exitMode("Uninstall", err)
		return
	}
	if err := host.ValidateCallerOrigin(os.Args, allowedOrigin); err != nil {
		fmt.Fprintf(os.Stderr, "Pete's Garden Zebra Helper: %v\n", err)
		os.Exit(2)
	}
	if err := host.Serve(os.Stdin, os.Stdout, cups.NewSpooler()); err != nil {
		fmt.Fprintf(os.Stderr, "Pete's Garden Zebra Helper: %v\n", err)
		os.Exit(1)
	}
}

func exitMode(label string, err error) {
	if err != nil {
		fmt.Fprintf(os.Stderr, "%s failed: %v\n", label, err)
		os.Exit(1)
	}
	fmt.Printf("%s complete. Quit and reopen Chrome before printing.\n", label)
}
