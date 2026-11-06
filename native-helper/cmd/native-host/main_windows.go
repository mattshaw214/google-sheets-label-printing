//go:build windows

package main

import (
	"fmt"
	"os"

	"petesgarden/windowshelper/internal/host"
	"petesgarden/windowshelper/internal/winspool"
)

var allowedOrigin string

func main() {
	if err := host.ValidateCallerOrigin(os.Args, allowedOrigin); err != nil {
		fmt.Fprintf(os.Stderr, "Pete's Garden Zebra Helper: %v\n", err)
		os.Exit(2)
	}
	if err := host.Serve(os.Stdin, os.Stdout, winspool.Spooler{}); err != nil {
		fmt.Fprintf(os.Stderr, "Pete's Garden Zebra Helper: %v\n", err)
		os.Exit(1)
	}
}
